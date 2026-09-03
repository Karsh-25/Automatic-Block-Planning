"""
constraint_engine.py

PHASE 2 — Constraint Engine.

Responsibility (and ONLY this responsibility):
    "Given a candidate maintenance window (from candidate_generator.py),
     is it feasible, and if not, why?"

This module does NOT:
    - Generate candidate windows (that's candidate_generator.py)
    - Choose/optimize which window to use (that's block_optimizer.py, Phase 3)
    - Train or consume any ML model directly (asset risk comes from Developer 1's
      output and is not used for feasibility — only for optimization later)

Every candidate is evaluated independently against six checks and returns a
structured result — never a bare True/False — so the frontend's "Explain
Recommendation" screen can show *why* a candidate was rejected.

--------------------------------------------------------------------------
IMPORTANT PROTOTYPE-LEVEL LIMITATIONS (read before using this module)
--------------------------------------------------------------------------

1. STATION-CODE CONFLICT MAPPING IS AN APPROXIMATION.
   Train conflicts are detected by matching `station_code` between the
   block request and the train timetable (isl_wise_train_detail). This is
   a prototype-level proxy for "a train is near this maintenance location
   at this time." It is NOT equivalent to full railway track-section
   occupancy, block-section signalling state, or platform/line-specific
   conflict detection. A real deployment would need section-level and
   line-level occupancy data, which is not present in this dataset.

2. THE TRAIN TIMETABLE HAS NO DATE FIELD.
   isl_wise_train_detail contains only clock times (HH:MM:SS), not dates.
   This module therefore treats every train's schedule as a **recurring
   daily pattern** — i.e. "this train passes through this station at this
   clock time every day" — not a specific dated occurrence. This is a
   simplification appropriate for a hackathon prototype, not a claim about
   real operational scheduling.

3. JOURNEY-ENDPOINT TIMES ARE APPROXIMATED.
   In the timetable, a train's first stop (islno == 1) usually has
   Arrival time == '00:00:00' as a placeholder (it hasn't arrived from
   anywhere), and a train's last stop has Departure time == '00:00:00' as
   a placeholder (it goes nowhere further). This module detects those
   placeholder cases and treats the station visit as a single point-in-time
   event (departure time only at origin, arrival time only at destination)
   rather than a real zero-to-some-time dwell window. This is a data-driven
   heuristic, not an official rule, and there is a small, accepted chance
   of misclassifying a genuine midnight-departure train as a placeholder.

4. SAFETY / OPERATIONAL RULES ARE PROTOTYPE-LEVEL AND CONFIGURABLE.
   No official Indian Railways safety rules are encoded here. All
   thresholds (buffer minutes, min/max duration, etc.) live in
   `DEFAULT_CONSTRAINT_CONFIG` below and are meant to be tuned or replaced.

5. THIS ENGINE DOES NOT REPLACE THE PLANNER.
   It only labels candidates feasible/infeasible with reasons. The final
   decision remains with the railway planner/controller.
"""

from __future__ import annotations

import os
from collections import defaultdict, namedtuple
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import pandas as pd

from app.constraints.candidate_generator import BlockRequest, CandidateWindow

MINUTES_PER_DAY = 24 * 60


# ==========================================================================
# Configuration (prototype-level, explicitly NOT official IR safety rules)
# ==========================================================================

DEFAULT_CONSTRAINT_CONFIG: Dict[str, Any] = {
    # Duration validation (generic sanity bounds for a maintenance block,
    # not derived from any official rulebook).
    "min_duration_min": 5,
    "max_duration_min": 240,

    # Whether a candidate window is allowed to cross midnight.
    "allow_midnight_crossing": True,

    # Extra buffer (minutes) kept clear around EXISTING blocks at the same
    # section/station, on top of direct time overlap. 0 = disabled.
    # This is a configurable prototype safety margin, not an official rule.
    "safety_buffer_min": 0,
}


# ==========================================================================
# Data structures
# ==========================================================================

@dataclass(frozen=True)
class ExistingBlock:
    """Typed representation of one row of existing_blocks_dataset.csv."""

    existing_block_id: str
    linked_block_request_id: Optional[str]
    asset_id: str
    section_id: str
    station_code: str
    block_type: str
    start_minutes: int
    end_minutes: int
    duration_min: int
    assigned_team: str
    status: str
    operational_priority: str


# Lightweight record for a train's presence at one station (from the
# timetable). Using a namedtuple instead of a dataclass since there can be
# tens of thousands of these held in memory at once.
TrainMovement = namedtuple(
    "TrainMovement",
    ["train_id", "train_name", "start_minutes", "duration_min"],
)


@dataclass
class EvaluationContext:
    """
    Bundles all reference data needed to evaluate candidates, so it can be
    loaded once and reused across many evaluate_candidate() calls instead
    of re-reading CSVs per candidate.
    """

    existing_blocks: List[ExistingBlock]
    station_train_index: Dict[str, List[TrainMovement]]
    config: Dict[str, Any]


# ==========================================================================
# Shared interval-overlap helper (midnight-safe, recurring-daily-pattern)
# ==========================================================================

def _circular_overlap_minutes(
    start_a: int, duration_a: int, start_b: int, duration_b: int
) -> int:
    """
    Compute the overlap (in minutes) between two time-of-day intervals,
    treated as recurring daily patterns (no date dimension).

    Each interval is [start, start + duration) on a 24h clock that may
    wrap past midnight. To correctly detect overlap regardless of which
    side of midnight either interval falls on, interval B is checked
    against interval A at three relative day-offsets (previous day, same
    day, next day) in a shared linear timeline. This is sufficient because
    both durations are always far shorter than 24h in this dataset.

    Returns:
        Overlap duration in whole minutes (0 if no overlap).
    """
    end_a = start_a + duration_a
    best_overlap = 0
    for offset in (-MINUTES_PER_DAY, 0, MINUTES_PER_DAY):
        start_b_shifted = start_b + offset
        end_b_shifted = start_b_shifted + duration_b
        overlap_start = max(start_a, start_b_shifted)
        overlap_end = min(end_a, end_b_shifted)
        if overlap_start < overlap_end:
            best_overlap = max(best_overlap, overlap_end - overlap_start)
    return best_overlap


# ==========================================================================
# Loading existing_blocks_dataset.csv
# ==========================================================================

_EXISTING_BLOCK_REQUIRED_COLUMNS = [
    "existing_block_id",
    "linked_block_request_id",
    "asset_id",
    "section_id",
    "station_code",
    "block_type",
    "start_time",
    "end_time",
    "duration_min",
    "assigned_team",
    "status",
    "operational_priority",
]


def _parse_hhmm_to_minutes(hhmm: str) -> int:
    """Parse an 'HH:MM' string into minutes-since-midnight (0-1439)."""
    hhmm = hhmm.strip()
    hours_str, minutes_str = hhmm.split(":")
    hours, minutes = int(hours_str), int(minutes_str)
    if not (0 <= hours <= 23 and 0 <= minutes <= 59):
        raise ValueError(f"Invalid time value: {hhmm!r}")
    return hours * 60 + minutes


def load_existing_blocks(csv_path: str) -> List[ExistingBlock]:
    """
    Load existing_blocks_dataset.csv into a list of ExistingBlock objects.

    `linked_block_request_id` may be null in the source data (2 of 35 rows
    in the verified dataset) — those become None, representing existing
    blocks that were not raised from a tracked block request.
    """
    df = pd.read_csv(csv_path)

    missing_columns = [c for c in _EXISTING_BLOCK_REQUIRED_COLUMNS if c not in df.columns]
    if missing_columns:
        raise ValueError(
            f"existing_blocks_dataset.csv is missing required columns: "
            f"{missing_columns}. Found columns: {list(df.columns)}"
        )

    blocks: List[ExistingBlock] = []
    for _, row in df.iterrows():
        start_minutes = _parse_hhmm_to_minutes(str(row["start_time"]))
        end_minutes = _parse_hhmm_to_minutes(str(row["end_time"]))
        linked_id = row["linked_block_request_id"]
        blocks.append(
            ExistingBlock(
                existing_block_id=str(row["existing_block_id"]),
                linked_block_request_id=(
                    None if pd.isna(linked_id) else str(linked_id)
                ),
                asset_id=str(row["asset_id"]),
                section_id=str(row["section_id"]),
                station_code=str(row["station_code"]).strip(),
                block_type=str(row["block_type"]),
                start_minutes=start_minutes,
                end_minutes=end_minutes,
                duration_min=int(row["duration_min"]),
                assigned_team=str(row["assigned_team"]),
                status=str(row["status"]),
                operational_priority=str(row["operational_priority"]),
            )
        )
    return blocks


# ==========================================================================
# Loading isl_wise_train_detail_*.csv into a station -> movements index
# ==========================================================================

def build_station_train_index(csv_path: str) -> Dict[str, List[TrainMovement]]:
    """
    Load the train timetable and build a {station_code: [TrainMovement]}
    index for fast lookup during conflict checking.

    Source columns used (verified against the actual CSV):
        'Train No.', 'train Name', 'islno', 'station Code',
        'Arrival time', 'Departure time'

    Raw string fields in this CSV are wrapped in literal single-quote
    characters with padding whitespace (e.g. "'BBS '", "'00:00:00'") —
    these are stripped here, not just cosmetically but because they'd
    otherwise break station-code matching against the block-request data.

    See the module docstring (point 3) for how journey-endpoint placeholder
    times (first-stop arrival, last-stop departure, both literal '00:00:00')
    are handled.
    """
    df = pd.read_csv(csv_path)

    required_columns = [
        "Train No.", "train Name", "islno", "station Code",
        "Arrival time", "Departure time",
    ]
    missing_columns = [c for c in required_columns if c not in df.columns]
    if missing_columns:
        raise ValueError(
            f"Train timetable CSV is missing required columns: "
            f"{missing_columns}. Found columns: {list(df.columns)}"
        )

    def _clean(series: pd.Series) -> pd.Series:
        return series.astype(str).str.strip(" '")

    train_id = _clean(df["Train No."])
    train_name = _clean(df["train Name"])
    station_code = _clean(df["station Code"])
    arrival_clean = _clean(df["Arrival time"])
    departure_clean = _clean(df["Departure time"])

    arrival_min = (
        arrival_clean.str[0:2].astype(int) * 60
        + arrival_clean.str[3:5].astype(int)
    )
    departure_min = (
        departure_clean.str[0:2].astype(int) * 60
        + departure_clean.str[3:5].astype(int)
    )

    islno = df["islno"].astype(int)
    max_islno_per_train = islno.groupby(df["Train No."]).transform("max")
    is_first_stop = islno == 1
    is_last_stop = islno == max_islno_per_train

    # Default: real dwell window [arrival, departure), wraparound-safe.
    occupancy_start = arrival_min.copy()
    occupancy_duration = (departure_min - arrival_min) % MINUTES_PER_DAY

    # Origin placeholder: arrival == 00:00 AND this is the train's first
    # stop -> treat as a point event at departure time only.
    origin_placeholder = is_first_stop & (arrival_min == 0)
    occupancy_start = occupancy_start.where(~origin_placeholder, departure_min)
    occupancy_duration = occupancy_duration.where(~origin_placeholder, 0)

    # Destination placeholder: departure == 00:00 AND this is the train's
    # last stop (and it wasn't already handled as an origin placeholder,
    # covering the rare single-stop-train edge case) -> point event at
    # arrival time only.
    destination_placeholder = is_last_stop & (departure_min == 0) & (~origin_placeholder)
    occupancy_start = occupancy_start.where(~destination_placeholder, arrival_min)
    occupancy_duration = occupancy_duration.where(~destination_placeholder, 0)

    station_index: Dict[str, List[TrainMovement]] = defaultdict(list)
    for st, tid, tname, s, d in zip(
        station_code, train_id, train_name, occupancy_start, occupancy_duration
    ):
        station_index[st].append(TrainMovement(tid, tname, int(s), int(d)))

    return station_index


# ==========================================================================
# Individual constraint checks
# Each returns a List[dict] of conflicts (empty list = no conflict of that type).
# ==========================================================================

def check_duration_constraint(
    candidate: CandidateWindow, config: Dict[str, Any]
) -> List[Dict[str, Any]]:
    """Validate the candidate's duration against configurable prototype bounds."""
    conflicts: List[Dict[str, Any]] = []
    min_duration = config["min_duration_min"]
    max_duration = config["max_duration_min"]

    if candidate.duration_min < min_duration or candidate.duration_min > max_duration:
        conflicts.append({
            "type": "DURATION",
            "duration_min": candidate.duration_min,
            "allowed_min": min_duration,
            "allowed_max": max_duration,
            "overlap_minutes": 0,
        })
    return conflicts


def check_time_window_constraint(
    candidate: CandidateWindow, config: Dict[str, Any]
) -> List[Dict[str, Any]]:
    """Validate the candidate window itself is well-formed and within policy."""
    conflicts: List[Dict[str, Any]] = []

    if not (0 <= candidate.start_minutes < MINUTES_PER_DAY) or not (
        0 <= candidate.end_minutes < MINUTES_PER_DAY
    ):
        conflicts.append({
            "type": "TIME_WINDOW",
            "reason": "start_or_end_out_of_range",
            "overlap_minutes": 0,
        })

    if candidate.duration_min <= 0:
        conflicts.append({
            "type": "TIME_WINDOW",
            "reason": "non_positive_duration",
            "overlap_minutes": 0,
        })

    if candidate.crosses_midnight and not config["allow_midnight_crossing"]:
        conflicts.append({
            "type": "TIME_WINDOW",
            "reason": "midnight_crossing_disallowed",
            "overlap_minutes": 0,
        })

    return conflicts


def check_existing_block_conflict(
    candidate: CandidateWindow,
    request: BlockRequest,
    existing_blocks: List[ExistingBlock],
) -> List[Dict[str, Any]]:
    """
    Detect direct time overlap with existing/committed blocks at the SAME
    section AND station (prototype-level location matching — see module
    docstring). An existing block linked to this same block_request_id is
    excluded, since it represents the very request being re-planned, not
    an independent conflicting block.
    """
    conflicts: List[Dict[str, Any]] = []
    relevant = [
        eb for eb in existing_blocks
        if eb.section_id == request.section_id
        and eb.station_code == request.station_code
        and eb.linked_block_request_id != request.block_request_id
    ]

    for eb in relevant:
        overlap = _circular_overlap_minutes(
            candidate.start_minutes, candidate.duration_min,
            eb.start_minutes, eb.duration_min,
        )
        if overlap > 0:
            conflicts.append({
                "type": "EXISTING_BLOCK",
                "existing_block_id": eb.existing_block_id,
                "block_type": eb.block_type,
                "overlap_minutes": overlap,
            })
    return conflicts


def check_resource_conflict(
    candidate: CandidateWindow,
    request: BlockRequest,
    existing_blocks: List[ExistingBlock],
) -> List[Dict[str, Any]]:
    """
    Detect team/resource double-booking: the same `required_team` already
    committed to an overlapping window on an existing block, regardless of
    location (a team cannot be in two places at once). An existing block
    linked to this same block_request_id is excluded for the same reason
    as in check_existing_block_conflict.

    NOTE: This only checks against already-committed existing blocks, not
    against other *candidate* windows of other pending requests being
    planned in the same optimization run — that combinatorial choice
    (avoiding double-booking a team across multiple newly-accepted plans)
    is the optimizer's responsibility (Phase 3), not this per-candidate
    feasibility check.
    """
    conflicts: List[Dict[str, Any]] = []
    relevant = [
        eb for eb in existing_blocks
        if eb.assigned_team == request.required_team
        and eb.linked_block_request_id != request.block_request_id
    ]

    for eb in relevant:
        overlap = _circular_overlap_minutes(
            candidate.start_minutes, candidate.duration_min,
            eb.start_minutes, eb.duration_min,
        )
        if overlap > 0:
            conflicts.append({
                "type": "RESOURCE",
                "existing_block_id": eb.existing_block_id,
                "team": eb.assigned_team,
                "overlap_minutes": overlap,
            })
    return conflicts


def check_train_conflict(
    candidate: CandidateWindow,
    request: BlockRequest,
    station_train_index: Dict[str, List[TrainMovement]],
) -> List[Dict[str, Any]]:
    """
    Detect overlap with train movements at the same station_code
    (prototype-level proxy for track occupancy — see module docstring,
    points 1 and 2, for the important limitations of this approach).
    """
    conflicts: List[Dict[str, Any]] = []
    movements = station_train_index.get(request.station_code, [])

    for movement in movements:
        overlap = _circular_overlap_minutes(
            candidate.start_minutes, candidate.duration_min,
            movement.start_minutes, movement.duration_min,
        )
        if overlap > 0:
            conflicts.append({
                "type": "TRAIN",
                "train_id": movement.train_id,
                "train_name": movement.train_name,
                "overlap_minutes": overlap,
            })
    return conflicts


def check_operational_constraints(
    candidate: CandidateWindow,
    request: BlockRequest,
    existing_blocks: List[ExistingBlock],
    config: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """
    Generic, CONFIGURABLE prototype-level operational/safety constraints.
    These are explicitly not official Indian Railways rules (see module
    docstring, point 4).

    Currently implements:
      - Safety buffer: if `config["safety_buffer_min"] > 0`, flags
        candidates that fall within that buffer of an existing block at
        the same section/station even when they don't directly overlap
        it (a proximity/turnaround-margin check, distinct from the direct
        overlap already reported by check_existing_block_conflict — direct
        overlaps are not duplicated here).
    """
    conflicts: List[Dict[str, Any]] = []
    buffer_min = config["safety_buffer_min"]

    if buffer_min <= 0:
        return conflicts

    relevant = [
        eb for eb in existing_blocks
        if eb.section_id == request.section_id
        and eb.station_code == request.station_code
        and eb.linked_block_request_id != request.block_request_id
    ]

    for eb in relevant:
        direct_overlap = _circular_overlap_minutes(
            candidate.start_minutes, candidate.duration_min,
            eb.start_minutes, eb.duration_min,
        )
        if direct_overlap > 0:
            continue  # already reported by check_existing_block_conflict

        buffered_start = eb.start_minutes - buffer_min
        buffered_duration = eb.duration_min + 2 * buffer_min
        buffered_overlap = _circular_overlap_minutes(
            candidate.start_minutes, candidate.duration_min,
            buffered_start, buffered_duration,
        )
        if buffered_overlap > 0:
            conflicts.append({
                "type": "OPERATIONAL",
                "reason": "safety_buffer_violation",
                "existing_block_id": eb.existing_block_id,
                "buffer_min": buffer_min,
                "overlap_minutes": 0,
            })
    return conflicts


# ==========================================================================
# Top-level evaluation
# ==========================================================================

def evaluate_candidate(
    candidate: CandidateWindow,
    request: BlockRequest,
    context: EvaluationContext,
) -> Dict[str, Any]:
    """
    Evaluate a single candidate window against every constraint check.

    Returns a structured dict — never a bare bool — describing whether the
    candidate is feasible and, if not, every reason why:

        {
            "request_id": "BR-0002",
            "start_time": "10:45",
            "end_time": "11:30",
            "duration_min": 45,
            "is_preferred": False,
            "feasible": False,
            "conflicts": [
                {"type": "TRAIN", "train_id": "12951", "overlap_minutes": 5},
                ...
            ]
        }
    """
    conflicts: List[Dict[str, Any]] = []
    conflicts += check_duration_constraint(candidate, context.config)
    conflicts += check_time_window_constraint(candidate, context.config)
    conflicts += check_existing_block_conflict(candidate, request, context.existing_blocks)
    conflicts += check_resource_conflict(candidate, request, context.existing_blocks)
    conflicts += check_train_conflict(candidate, request, context.station_train_index)
    conflicts += check_operational_constraints(
        candidate, request, context.existing_blocks, context.config
    )

    return {
        "request_id": candidate.request_id,
        "start_time": candidate.start_time,
        "end_time": candidate.end_time,
        "duration_min": candidate.duration_min,
        "is_preferred": candidate.is_preferred,
        "feasible": len(conflicts) == 0,
        "conflicts": conflicts,
    }


def evaluate_candidates_for_request(
    candidates: List[CandidateWindow],
    request: BlockRequest,
    context: EvaluationContext,
) -> List[Dict[str, Any]]:
    """Evaluate every candidate window for one block request."""
    return [evaluate_candidate(c, request, context) for c in candidates]


def build_evaluation_context(
    existing_blocks_csv_path: str,
    train_timetable_csv_path: str,
    config: Optional[Dict[str, Any]] = None,
) -> EvaluationContext:
    """
    Convenience constructor: loads both reference datasets once and bundles
    them with a config into an EvaluationContext ready for repeated use
    across many evaluate_candidate() calls.
    """
    resolved_config = dict(DEFAULT_CONSTRAINT_CONFIG)
    if config:
        resolved_config.update(config)

    return EvaluationContext(
        existing_blocks=load_existing_blocks(existing_blocks_csv_path),
        station_train_index=build_station_train_index(train_timetable_csv_path),
        config=resolved_config,
    )

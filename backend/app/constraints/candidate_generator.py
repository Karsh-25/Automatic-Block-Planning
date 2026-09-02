"""
candidate_generator.py

PHASE 1 — Candidate Maintenance Window Generator.

Responsibility (and ONLY this responsibility):
    "What possible maintenance windows can be considered for a block request?"

This module does NOT:
    - Check train conflicts
    - Check existing-block conflicts
    - Check resource/team conflicts
    - Perform any optimization or scoring

Those responsibilities belong to constraint_engine.py and block_optimizer.py.
This module is a pure, deterministic generator: given one block request, it
enumerates every candidate start/end time that is worth *considering*. Nothing
here decides feasibility.

Input schema (from backend/dataset/block_request_dataset.csv), verified by
inspecting the actual CSV:

    block_request_id        e.g. "BR-0001"
    asset_id                e.g. "AST-0157"
    section_id              e.g. "SEC-014"
    station_code            e.g. "KMN"
    maintenance_type        e.g. "OHE Inspection"
    requested_duration_min  int, observed values: 30/45/60/75/90/120
    priority                one of: Low, Medium, High, Critical
    preferred_start_time    "HH:MM" 24-hour string, e.g. "18:45"
    time_flexibility        one of: "Fixed", "±15 min", "±30 min", "±60 min"
    required_team           e.g. "Bridge Inspection Team"
    request_urgency         one of: Normal, Urgent
    status                  e.g. "Pending" (not used by this module)
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field, asdict
from typing import List, Dict, Any, Iterable

import pandas as pd


# --------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------

#: Default step (in minutes) between generated candidate windows.
#: Explicitly called out as configurable in the project spec.
DEFAULT_STEP_MINUTES = 5

#: Minutes in a day, used for midnight-safe wraparound arithmetic.
MINUTES_PER_DAY = 24 * 60

#: Recognized time_flexibility values -> parsing pattern.
#: "Fixed" means zero flexibility (exactly one candidate: the preferred window).
_FLEX_FIXED_TOKEN = "fixed"
_FLEX_PATTERN = re.compile(r"^\s*±\s*(\d+)\s*min\s*$", re.IGNORECASE)


# --------------------------------------------------------------------------
# Data structures
# --------------------------------------------------------------------------

@dataclass(frozen=True)
class BlockRequest:
    """Typed representation of one row of block_request_dataset.csv."""

    block_request_id: str
    asset_id: str
    section_id: str
    station_code: str
    maintenance_type: str
    requested_duration_min: int
    priority: str
    preferred_start_time: str  # "HH:MM"
    time_flexibility: str
    required_team: str
    request_urgency: str
    status: str

    def __post_init__(self) -> None:
        if self.requested_duration_min <= 0:
            raise ValueError(
                f"[{self.block_request_id}] requested_duration_min must be "
                f"positive, got {self.requested_duration_min}"
            )
        # Will raise ValueError with a clear message if malformed.
        _parse_hhmm_to_minutes(self.preferred_start_time)
        _parse_flexibility_to_minutes(self.time_flexibility)


@dataclass(frozen=True)
class CandidateWindow:
    """
    One candidate maintenance window for a block request.

    Times are midnight-safe: `start_minutes`/`end_minutes` are always
    normalized into [0, 1440). If a window runs past midnight,
    `crosses_midnight` is True and `end_minutes` will be numerically
    smaller than `start_minutes` (e.g. start 23:50, end 00:20).
    """

    request_id: str
    start_time: str            # "HH:MM", normalized
    end_time: str               # "HH:MM", normalized
    start_minutes: int          # 0-1439
    end_minutes: int            # 0-1439
    duration_min: int
    offset_from_preferred_min: int  # signed offset vs preferred_start_time
    is_preferred: bool          # True when offset == 0 (the originally requested window)
    crosses_midnight: bool

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# --------------------------------------------------------------------------
# Time parsing / formatting helpers
# --------------------------------------------------------------------------

def _parse_hhmm_to_minutes(hhmm: str) -> int:
    """Parse an 'HH:MM' string into minutes-since-midnight (0-1439)."""
    match = re.match(r"^(\d{1,2}):(\d{2})$", hhmm.strip())
    if not match:
        raise ValueError(f"Invalid time format: {hhmm!r} (expected 'HH:MM')")
    hours, minutes = int(match.group(1)), int(match.group(2))
    if not (0 <= hours <= 23 and 0 <= minutes <= 59):
        raise ValueError(f"Invalid time value: {hhmm!r}")
    return hours * 60 + minutes


def _minutes_to_hhmm(total_minutes: int) -> str:
    """Format minutes-since-midnight into a normalized 'HH:MM' string."""
    normalized = total_minutes % MINUTES_PER_DAY
    hours, minutes = divmod(normalized, 60)
    return f"{hours:02d}:{minutes:02d}"


def _parse_flexibility_to_minutes(time_flexibility: str) -> int:
    """
    Parse the time_flexibility column into a symmetric +/- minute value.

    "Fixed"      -> 0
    "±15 min"    -> 15
    "±30 min"    -> 30
    "±60 min"    -> 60

    Raises ValueError on any unrecognized value instead of guessing,
    per project instructions not to invent assumptions silently.
    """
    stripped = time_flexibility.strip()
    if stripped.lower() == _FLEX_FIXED_TOKEN:
        return 0

    match = _FLEX_PATTERN.match(stripped)
    if not match:
        raise ValueError(
            f"Unrecognized time_flexibility value: {time_flexibility!r}. "
            f"Expected 'Fixed' or '±N min'."
        )
    return int(match.group(1))


# --------------------------------------------------------------------------
# Core generation logic
# --------------------------------------------------------------------------

def generate_candidate_windows(
    request: BlockRequest,
    step_minutes: int = DEFAULT_STEP_MINUTES,
) -> List[CandidateWindow]:
    """
    Generate all candidate maintenance windows for a single block request.

    - If time_flexibility is "Fixed": returns exactly one candidate, the
      requested (preferred_start_time, preferred_start_time + duration) window.
    - Otherwise: returns every window whose start offset from
      preferred_start_time is a multiple of `step_minutes`, within
      [-flex, +flex] inclusive.

    Midnight is handled correctly: offsets may push the start before 00:00
    or the end past 24:00; all such windows are still generated and their
    times are normalized into 'HH:MM' with `crosses_midnight` flagged.

    This function performs NO feasibility checking (no train conflicts, no
    existing-block conflicts, no resource conflicts). Every window returned
    here is only a *candidate* to be evaluated later by constraint_engine.py.

    Args:
        request: A validated BlockRequest.
        step_minutes: Spacing between candidate start times, in minutes.
            Must be a positive integer. Defaults to DEFAULT_STEP_MINUTES.

    Returns:
        A list of CandidateWindow, ordered by offset ascending
        (earliest/most-negative offset first).

    Raises:
        ValueError: if step_minutes is not a positive integer.
    """
    if step_minutes <= 0:
        raise ValueError(f"step_minutes must be positive, got {step_minutes}")

    preferred_start_minutes = _parse_hhmm_to_minutes(request.preferred_start_time)
    flex_minutes = _parse_flexibility_to_minutes(request.time_flexibility)
    duration = request.requested_duration_min

    if flex_minutes == 0:
        offsets: Iterable[int] = (0,)
    else:
        # Inclusive range from -flex to +flex in steps of step_minutes.
        # If flex is not an exact multiple of step_minutes, the final
        # partial step is still included by explicitly appending +flex,
        # matching the "generate windows within that range" requirement
        # without silently dropping the boundary window.
        offsets = list(range(-flex_minutes, flex_minutes + 1, step_minutes))
        if offsets[-1] != flex_minutes:
            offsets.append(flex_minutes)

    candidates: List[CandidateWindow] = []
    for offset in offsets:
        # Raw start can be negative or >= MINUTES_PER_DAY; normalize safely.
        start_norm = (preferred_start_minutes + offset) % MINUTES_PER_DAY
        end_raw = start_norm + duration
        crosses_midnight = end_raw >= MINUTES_PER_DAY
        end_norm = end_raw % MINUTES_PER_DAY

        candidates.append(
            CandidateWindow(
                request_id=request.block_request_id,
                start_time=_minutes_to_hhmm(start_norm),
                end_time=_minutes_to_hhmm(end_norm),
                start_minutes=start_norm,
                end_minutes=end_norm,
                duration_min=duration,
                offset_from_preferred_min=offset,
                is_preferred=(offset == 0),
                crosses_midnight=crosses_midnight,
            )
        )

    return candidates


# --------------------------------------------------------------------------
# Loading from the dataset
# --------------------------------------------------------------------------

_REQUIRED_COLUMNS = [
    "block_request_id",
    "asset_id",
    "section_id",
    "station_code",
    "maintenance_type",
    "requested_duration_min",
    "priority",
    "preferred_start_time",
    "time_flexibility",
    "required_team",
    "request_urgency",
    "status",
]


def load_block_requests(csv_path: str) -> List[BlockRequest]:
    """
    Load block_request_dataset.csv into a list of validated BlockRequest objects.

    Raises:
        ValueError: if any required column is missing from the CSV, or if
            any row fails validation (bad time format, non-positive
            duration, unrecognized flexibility value, etc).
    """
    df = pd.read_csv(csv_path)

    missing_columns = [c for c in _REQUIRED_COLUMNS if c not in df.columns]
    if missing_columns:
        raise ValueError(
            f"block_request_dataset.csv is missing required columns: "
            f"{missing_columns}. Found columns: {list(df.columns)}"
        )

    requests: List[BlockRequest] = []
    for _, row in df.iterrows():
        requests.append(
            BlockRequest(
                block_request_id=str(row["block_request_id"]),
                asset_id=str(row["asset_id"]),
                section_id=str(row["section_id"]),
                station_code=str(row["station_code"]).strip(),
                maintenance_type=str(row["maintenance_type"]),
                requested_duration_min=int(row["requested_duration_min"]),
                priority=str(row["priority"]),
                preferred_start_time=str(row["preferred_start_time"]).strip(),
                time_flexibility=str(row["time_flexibility"]).strip(),
                required_team=str(row["required_team"]),
                request_urgency=str(row["request_urgency"]),
                status=str(row["status"]),
            )
        )
    return requests


def generate_candidates_for_all_requests(
    requests: List[BlockRequest],
    step_minutes: int = DEFAULT_STEP_MINUTES,
) -> Dict[str, List[CandidateWindow]]:
    """
    Generate candidate windows for a batch of block requests.

    Returns:
        Dict mapping block_request_id -> list of CandidateWindow.
    """
    return {
        request.block_request_id: generate_candidate_windows(request, step_minutes)
        for request in requests
    }

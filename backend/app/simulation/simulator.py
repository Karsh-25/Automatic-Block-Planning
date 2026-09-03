"""
simulator.py

PHASE 4 -- Simulation / Validation of the Optimized Plan.

Responsibility (and ONLY this responsibility):
    "If the AI-generated maintenance block plan (Phase 3's output) is
     executed, what is its expected operational impact, and does the plan
     actually hold up under independent re-checking?"

This module does NOT:
    - Generate candidate windows (candidate_generator.py, Phase 1)
    - Decide per-candidate feasibility (constraint_engine.py, Phase 2)
    - Choose which window to recommend (block_optimizer.py, Phase 3)
    - Replace the railway planner/controller. This is a decision-support
      simulation of a prototype's own plan, not an official Indian
      Railways signalling/operations simulator.

--------------------------------------------------------------------------
HOW THIS CONNECTS TO THE REST OF THE PIPELINE
--------------------------------------------------------------------------

    Block Requests
          |
          v
    candidate_generator.generate_candidate_windows()      (Phase 1)
          |
          v
    constraint_engine.evaluate_candidates_for_request()    (Phase 2)
          |
          v
    block_optimizer.optimize_block_plan()                  (Phase 3)
          |
          v
    OptimizationResult (one BlockPlanEntry per request)
          |
          v
    THIS MODULE: simulate_optimization_result() -> SimulationReport

This module imports and reuses Phase 2's own conflict-check functions
(`check_train_conflict`, `check_existing_block_conflict`,
`check_resource_conflict`) instead of re-implementing conflict detection,
and reuses Phase 3's `OptimizationResult` / `BlockPlanEntry` /
`ScoredCandidate` dataclasses instead of re-deriving "why wasn't this
scheduled" from scratch.

--------------------------------------------------------------------------
KEY DESIGN FACT (read before extending this module)
--------------------------------------------------------------------------

A window that Phase 3 *selected* for a request was, by construction,
already labelled `feasible=True` by Phase 2 -- i.e. it already has ZERO
train / existing-block / resource conflicts under the constraint engine's
rules. Re-running those same three checks against a selected window is
therefore an INDEPENDENT VERIFICATION step (it guards against future
drift between Phase 2 and Phase 3, e.g. if the constraint config used at
optimization time and simulation time were ever to differ), not a source
of new conflicts for a correctly functioning plan. On the real project
dataset, every scheduled block is expected to re-verify as conflict-free.
That is a validation result, not an uninteresting one: it is the
simulator's job to prove it, not assume it.

--------------------------------------------------------------------------
WHAT "SIMULATED DELAY" MEANS HERE (and what it does NOT mean)
--------------------------------------------------------------------------

There is no real train-delay-propagation model in this project's data or
code (no headway rules, no signalling state, no dispatch logic), and this
module does NOT invent one. "Simulated delay" is defined narrowly and
transparently as:

    the sum, over any TRAIN conflicts detected during independent
    re-verification of the block's EXECUTED window, of that conflict's
    `overlap_minutes` (the same overlap-minutes value
    constraint_engine.check_train_conflict already computes).

For a scheduled block this is expected to be 0 (see above). It is
reported per block and aggregated, and is explicitly NOT a claim about
real-world train lateness -- see LIMITATIONS in the generated report.

Unscheduled requests are, by definition, not executed: nothing runs, so
they have no operational impact and `simulated_delay_min` is left as
None rather than fabricated as 0. Their non-scheduling reason is
carried over as-is from Phase 3 (`feasible_count`,
`rejected_conflict_counts`) rather than recomputed.

--------------------------------------------------------------------------
IMPORTANT PROTOTYPE-LEVEL LIMITATIONS
--------------------------------------------------------------------------

1. All the prototype-level limitations already documented in
   constraint_engine.py (station-code as a proxy for track occupancy, no
   date field / recurring-daily-pattern trains, placeholder journey-
   endpoint times) apply identically here, since this module reuses those
   same checks and the same station_train_index.

2. "Simulated delay" is an overlap-minutes proxy, not a validated
   real-world delay-propagation estimate (see above).

3. This module does not model cascading effects (one delayed train
   causing knock-on delays to others); no data supports that.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from app.constraints.candidate_generator import BlockRequest, CandidateWindow
from app.constraints.constraint_engine import (
    EvaluationContext,
    check_train_conflict,
    check_existing_block_conflict,
    check_resource_conflict,
)
from app.optimization.block_optimizer import BlockPlanEntry, OptimizationResult

#: Fixed, documented limitations surfaced verbatim in every report so
#: nothing here is silently taken as more authoritative than it is.
SIMULATION_LIMITATIONS: List[str] = [
    "This is an SIH prototype decision-support simulation, not an "
    "official Indian Railways signalling/operations simulator.",
    "Train/section conflicts are detected via the same station-code "
    "proxy and recurring-daily-pattern assumption used by the "
    "constraint engine (Phase 2) -- see constraint_engine.py's module "
    "docstring for the exact limitations.",
    "'Simulated delay' is defined as train-conflict overlap minutes "
    "detected on the executed window during independent "
    "re-verification. It is not a validated real-world "
    "delay-propagation estimate; no such model exists in this "
    "project's data or code.",
    "A scheduled block's window was already required to be conflict-"
    "free by Phase 2/3, so 0 remaining conflicts / 0 simulated delay "
    "on scheduled blocks is an expected validation result, not a "
    "sign the simulator did nothing.",
    "Unscheduled requests are not executed and therefore have no "
    "operational impact; their simulated_delay_min is left unset "
    "(None) rather than fabricated as 0.",
    "Cascading/knock-on delay effects across trains are not modeled; "
    "no data in this project supports that.",
]


# ==========================================================================
# Data structures
# ==========================================================================

@dataclass(frozen=True)
class TrainImpact:
    """One train movement whose window overlaps a maintenance block."""
    train_id: str
    train_name: str
    overlap_minutes: int

    def to_dict(self) -> Dict[str, Any]:
        return {
            "train_id": self.train_id,
            "train_name": self.train_name,
            "overlap_minutes": self.overlap_minutes,
        }


@dataclass
class BlockSimulationResult:
    """
    The simulated operational impact (or non-impact) of one block
    request, built from its Phase 3 BlockPlanEntry.
    """
    block_request_id: str
    asset_id: str
    section_id: str
    station_code: str
    maintenance_type: str
    required_team: str
    scheduled: bool
    status: str  # see _STATUS_* constants below
    window: Optional[Dict[str, Any]]  # start_time/end_time/duration if scheduled
    affected_trains: List[TrainImpact]
    simulated_delay_min: Optional[int]  # None when not executed (unscheduled)
    remaining_conflicts: List[Dict[str, Any]]
    feasible_candidates_considered: int
    total_candidates_generated: int
    reason: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "block_request_id": self.block_request_id,
            "asset_id": self.asset_id,
            "section_id": self.section_id,
            "station_code": self.station_code,
            "maintenance_type": self.maintenance_type,
            "required_team": self.required_team,
            "scheduled": self.scheduled,
            "status": self.status,
            "window": self.window,
            "affected_trains": [t.to_dict() for t in self.affected_trains],
            "simulated_delay_min": self.simulated_delay_min,
            "remaining_conflicts": self.remaining_conflicts,
            "feasible_candidates_considered": self.feasible_candidates_considered,
            "total_candidates_generated": self.total_candidates_generated,
            "reason": self.reason,
        }


@dataclass
class SimulationReport:
    """Full, JSON-serializable output of one simulate_optimization_result() run."""
    total_block_requests: int
    scheduled_blocks: int
    unscheduled_requests: int
    affected_trains: List[str]              # unique train IDs, across scheduled blocks
    total_simulated_delay_min: int
    average_simulated_delay_min: float
    maximum_simulated_delay_min: int
    remaining_conflicts_count: int
    affected_assets: List[str]              # unique asset IDs, across scheduled blocks
    block_results: List[BlockSimulationResult] = field(default_factory=list)
    limitations: List[str] = field(default_factory=lambda: list(SIMULATION_LIMITATIONS))

    def to_dict(self) -> Dict[str, Any]:
        return {
            "total_block_requests": self.total_block_requests,
            "scheduled_blocks": self.scheduled_blocks,
            "unscheduled_requests": self.unscheduled_requests,
            "affected_trains": self.affected_trains,
            "total_simulated_delay_min": self.total_simulated_delay_min,
            "average_simulated_delay_min": self.average_simulated_delay_min,
            "maximum_simulated_delay_min": self.maximum_simulated_delay_min,
            "remaining_conflicts_count": self.remaining_conflicts_count,
            "affected_assets": self.affected_assets,
            "block_results": [b.to_dict() for b in self.block_results],
            "limitations": self.limitations,
        }


# ==========================================================================
# Status labels
# ==========================================================================

_STATUS_SCHEDULED_CLEAR = "SCHEDULED_NO_REMAINING_CONFLICT"
_STATUS_SCHEDULED_CONFLICT = "SCHEDULED_CONFLICT_DETECTED"  # should not occur; see docstring
_STATUS_NOT_SCHEDULED_NO_FEASIBLE = "NOT_SCHEDULED_NO_FEASIBLE_WINDOW"
_STATUS_NOT_SCHEDULED_DISPLACED = "NOT_SCHEDULED_DISPLACED_BY_PLAN"


# ==========================================================================
# Per-block simulation
# ==========================================================================

def _simulate_scheduled_entry(
    entry: BlockPlanEntry,
    context: EvaluationContext,
) -> BlockSimulationResult:
    """
    Independently re-verify an executed (scheduled) window against the
    same three conflict checks Phase 2 already ran, and report the
    resulting operational impact.
    """
    request: BlockRequest = entry.request
    scored = entry.selected_candidate
    candidate: CandidateWindow = scored.candidate

    train_conflicts = check_train_conflict(candidate, request, context.station_train_index)
    existing_block_conflicts = check_existing_block_conflict(
        candidate, request, context.existing_blocks
    )
    resource_conflicts = check_resource_conflict(candidate, request, context.existing_blocks)
    remaining_conflicts = train_conflicts + existing_block_conflicts + resource_conflicts

    affected_trains = [
        TrainImpact(
            train_id=c["train_id"],
            train_name=c["train_name"],
            overlap_minutes=c["overlap_minutes"],
        )
        for c in train_conflicts
    ]
    simulated_delay = sum(c["overlap_minutes"] for c in train_conflicts)

    status = _STATUS_SCHEDULED_CONFLICT if remaining_conflicts else _STATUS_SCHEDULED_CLEAR
    reason = (
        "Executed window re-verified independently and confirmed free of "
        "train, existing-block, and resource conflicts."
        if not remaining_conflicts else
        "Executed window has conflicts under independent re-verification "
        "-- this indicates the constraint config used at simulation time "
        "differs from the one used at optimization time, since a "
        "genuinely feasible window cannot have conflicts under the same "
        "config."
    )

    return BlockSimulationResult(
        block_request_id=request.block_request_id,
        asset_id=request.asset_id,
        section_id=request.section_id,
        station_code=request.station_code,
        maintenance_type=request.maintenance_type,
        required_team=request.required_team,
        scheduled=True,
        status=status,
        window={
            "start_time": candidate.start_time,
            "end_time": candidate.end_time,
            "duration_min": candidate.duration_min,
        },
        affected_trains=affected_trains,
        simulated_delay_min=simulated_delay,
        remaining_conflicts=remaining_conflicts,
        feasible_candidates_considered=entry.feasible_count,
        total_candidates_generated=entry.total_candidates,
        reason=reason,
    )


def _simulate_unscheduled_entry(entry: BlockPlanEntry) -> BlockSimulationResult:
    """
    An unscheduled request was never executed, so it has no operational
    impact to simulate. Its non-scheduling reason is carried over as-is
    from Phase 3's own bookkeeping rather than recomputed here.
    """
    request = entry.request

    if entry.feasible_count == 0:
        status = _STATUS_NOT_SCHEDULED_NO_FEASIBLE
        if entry.rejected_conflict_counts:
            breakdown = ", ".join(
                f"{count}x {conflict_type}"
                for conflict_type, count in sorted(entry.rejected_conflict_counts.items())
            )
            reason = (
                f"None of the {entry.total_candidates} generated candidate "
                f"windows were feasible ({breakdown})."
            )
        else:
            reason = (
                f"None of the {entry.total_candidates} generated candidate "
                f"windows were feasible."
            )
    else:
        status = _STATUS_NOT_SCHEDULED_DISPLACED
        reason = (
            f"{entry.feasible_count} feasible candidate window(s) existed, "
            "but this request was not selected in the optimal plan -- "
            "likely displaced by a higher-scoring, resource-conflicting "
            "request elsewhere in the same plan."
        )

    return BlockSimulationResult(
        block_request_id=request.block_request_id,
        asset_id=request.asset_id,
        section_id=request.section_id,
        station_code=request.station_code,
        maintenance_type=request.maintenance_type,
        required_team=request.required_team,
        scheduled=False,
        status=status,
        window=None,
        affected_trains=[],
        simulated_delay_min=None,
        remaining_conflicts=[],
        feasible_candidates_considered=entry.feasible_count,
        total_candidates_generated=entry.total_candidates,
        reason=reason,
    )


def simulate_entry(
    entry: BlockPlanEntry,
    context: EvaluationContext,
) -> BlockSimulationResult:
    """Simulate the operational impact of one BlockPlanEntry."""
    if entry.scheduled and entry.selected_candidate is not None:
        return _simulate_scheduled_entry(entry, context)
    return _simulate_unscheduled_entry(entry)


# ==========================================================================
# Full-plan simulation
# ==========================================================================

def simulate_optimization_result(
    result: OptimizationResult,
    context: EvaluationContext,
) -> SimulationReport:
    """
    Simulate the operational impact of an entire OptimizationResult
    (Phase 3's output), producing one BlockSimulationResult per request
    plus aggregate metrics.

    Deterministic: given the same OptimizationResult and EvaluationContext,
    always produces the same report.

    Args:
        result: The OptimizationResult produced by
            block_optimizer.optimize_block_plan().
        context: The SAME EvaluationContext (existing blocks + train index
            + config) used to build `result`, so re-verification checks
            candidates under identical rules to the ones that produced them.

    Returns:
        A JSON-serializable SimulationReport.
    """
    block_results = [simulate_entry(entry, context) for entry in result.entries]

    scheduled_results = [b for b in block_results if b.scheduled]

    unique_train_ids: List[str] = sorted({
        t.train_id for b in scheduled_results for t in b.affected_trains
    })
    unique_asset_ids: List[str] = sorted({b.asset_id for b in scheduled_results})

    delays = [b.simulated_delay_min for b in scheduled_results if b.simulated_delay_min is not None]
    total_delay = sum(delays) if delays else 0
    average_delay = (total_delay / len(delays)) if delays else 0.0
    max_delay = max(delays) if delays else 0

    remaining_conflicts_count = sum(len(b.remaining_conflicts) for b in scheduled_results)

    return SimulationReport(
        total_block_requests=len(block_results),
        scheduled_blocks=len(scheduled_results),
        unscheduled_requests=len(block_results) - len(scheduled_results),
        affected_trains=unique_train_ids,
        total_simulated_delay_min=total_delay,
        average_simulated_delay_min=round(average_delay, 2),
        maximum_simulated_delay_min=max_delay,
        remaining_conflicts_count=remaining_conflicts_count,
        affected_assets=unique_asset_ids,
        block_results=block_results,
    )


# ==========================================================================
# Human-readable report formatting
# ==========================================================================

def format_simulation_report(report: SimulationReport) -> str:
    """
    Render a SimulationReport as the human-readable text report described
    in the project spec, suitable for console/demo output. The frontend
    should consume `report.to_dict()` / this module's dataclasses
    directly rather than parsing this string.
    """
    lines: List[str] = []
    lines.append("=" * 70)
    lines.append("PHASE 4 -- OPTIMIZED PLAN SIMULATION REPORT")
    lines.append("=" * 70)
    lines.append(f"Total block requests:     {report.total_block_requests}")
    lines.append(f"Scheduled blocks:         {report.scheduled_blocks}")
    lines.append(f"Unscheduled requests:     {report.unscheduled_requests}")
    lines.append("")
    lines.append(f"Affected trains:          {len(report.affected_trains)}")
    lines.append(f"Total simulated delay:    {report.total_simulated_delay_min} min")
    lines.append(f"Average simulated delay:  {report.average_simulated_delay_min} min")
    lines.append(f"Maximum simulated delay:  {report.maximum_simulated_delay_min} min")
    lines.append(f"Remaining conflicts:      {report.remaining_conflicts_count}")
    lines.append(f"Affected assets:          {len(report.affected_assets)}")
    lines.append("-" * 70)
    lines.append("BLOCK IMPACT")
    lines.append("-" * 70)
    for b in report.block_results:
        lines.append(b.block_request_id)
        lines.append(f"  Asset:            {b.asset_id}")
        lines.append(f"  Section:          {b.section_id} ({b.station_code})")
        if b.window:
            lines.append(f"  Window:           {b.window['start_time']}-{b.window['end_time']}")
        else:
            lines.append("  Window:           (not scheduled)")
        if b.affected_trains:
            trains_str = ", ".join(f"{t.train_id} ({t.overlap_minutes}min)" for t in b.affected_trains)
        else:
            trains_str = "None"
        lines.append(f"  Affected trains:  {trains_str}")
        delay_str = "N/A (not executed)" if b.simulated_delay_min is None else f"{b.simulated_delay_min} min"
        lines.append(f"  Simulated delay:  {delay_str}")
        lines.append(f"  Status:           {b.status}")
        lines.append(f"  Reason:           {b.reason}")
        lines.append("")
    lines.append("=" * 70)
    lines.append("LIMITATIONS / ASSUMPTIONS")
    lines.append("-" * 70)
    for limitation in report.limitations:
        lines.append(f"- {limitation}")
    lines.append("=" * 70)
    return "\n".join(lines)

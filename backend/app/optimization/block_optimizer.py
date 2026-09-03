"""
block_optimizer.py

PHASE 3 — OR-Tools Based Optimization Engine.

Responsibility (and ONLY this responsibility):
    "Given, for every block request, the set of candidate windows already
     generated (Phase 1 / candidate_generator.py) and already evaluated for
     feasibility (Phase 2 / constraint_engine.py), plus an asset-risk score
     from Developer 1's ML model, which single window (if any) should be
     recommended for each request — and why?"

This module does NOT:
    - Generate candidate windows (candidate_generator.py, Phase 1)
    - Decide feasibility / detect train, existing-block, resource,
      duration, time-window or operational conflicts (constraint_engine.py,
      Phase 2). This module NEVER re-implements those checks; it only
      consumes their already-computed `feasible` flag.
    - Train or re-implement the asset-risk model (ml/inference.py,
      Developer 1). This module only calls `predict_risk()`.
    - Replace the railway planner/controller. Every recommendation produced
      here is a decision-support suggestion, subject to human review and
      approval, not an automated, binding action.

--------------------------------------------------------------------------
HOW THIS CONNECTS TO THE REST OF THE PIPELINE
--------------------------------------------------------------------------

    Block Request
          |
          v
    candidate_generator.generate_candidate_windows()      (Phase 1, Dev 2)
          |
          v
    constraint_engine.evaluate_candidates_for_request()    (Phase 2, Dev 2)
          |
          v
    Feasible Candidates  ---------------------+
                                               |
    ml.inference.predict_risk()  (Dev 1)  <----+---  asset_id -> asset row
          |                                    |     (asset_health dataset)
          v                                    |
    Asset Risk Score / Priority  --------------+
          |
          v
    THIS MODULE: compute_score() -> CP-SAT model -> Optimal Block Plan

Nothing in Phase 1 or Phase 2 is re-implemented or duplicated here — this
module only imports and reuses their public functions/data structures
(`BlockRequest`, `CandidateWindow`, `EvaluationContext`,
`evaluate_candidates_for_request`, `_circular_overlap_minutes`) and Dev 1's
`predict_risk` / `predict_risk_batch`.

--------------------------------------------------------------------------
WHY CP-SAT
--------------------------------------------------------------------------

Selecting "at most one window per block request, maximizing a weighted
score, subject to a small number of pairwise resource constraints between
newly-selected windows" is a weighted set-packing / assignment problem with
linear boolean constraints. OR-Tools' CP-SAT solver is a natural fit: it
handles boolean decision variables, linear constraints, and a linear
objective directly and exactly (no gradient/relaxation issues), and scales
comfortably to the problem sizes seen here (tens of requests, at most a few
hundred feasible candidates in total). A MIP solver (e.g. via the OR-Tools
`pywraplp` linear solver) would also work, but CP-SAT was chosen because
the model is naturally boolean/combinatorial rather than continuous, and
CP-SAT ships with OR-Tools' Python package without needing an external
MIP backend.

--------------------------------------------------------------------------
IMPORTANT PROTOTYPE-LEVEL LIMITATIONS (read before using this module)
--------------------------------------------------------------------------

1. This optimizer does NOT guarantee real-world railway safety. It selects
   among candidates that constraint_engine.py has already labeled
   feasible under its prototype-level rules (see that module's docstring
   for the exact limitations of those rules). The final plan is a
   recommendation for the planner/controller, not an authorization.

2. CROSS-REQUEST RESOURCE CONFLICTS ARE HANDLED ONLY FOR NEWLY-SELECTED
   WINDOWS. constraint_engine.check_resource_conflict() only checks a
   candidate against already-committed *existing* blocks, not against
   other requests being planned in the same optimization run (its
   docstring says this explicitly is Phase 3's job). This module adds
   that missing check: no two requests selected in the same plan may
   double-book the same `required_team` at overlapping times. Everything
   else (train conflicts, existing-block conflicts, duration, time-window,
   operational buffer) is already fully resolved by the time a candidate
   reaches this module, because only `feasible=True` candidates are
   scored/selectable.

3. SCORING WEIGHTS ARE CONFIGURABLE, PROTOTYPE-LEVEL DEFAULTS, not derived
   from any official Indian Railways policy. See DEFAULT_SCORING_WEIGHTS.

4. Two different block requests referencing the SAME asset_id are not
   prevented from both being scheduled at overlapping times (there is no
   "one maintenance action per asset at a time" constraint here) — this is
   a reasonable extension for a future phase but out of scope here, since
   it did not appear in the Phase 1/2 spec or real dataset conflicts.
"""

from __future__ import annotations

import os
from collections import Counter
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd
from ortools.sat.python import cp_model

from app.constraints.candidate_generator import (
    BlockRequest,
    CandidateWindow,
    generate_candidate_windows,
)
from app.constraints.constraint_engine import (
    EvaluationContext,
    evaluate_candidates_for_request,
    _circular_overlap_minutes,
)
from app.ml.inference import predict_risk

MINUTES_PER_DAY = 24 * 60


# ==========================================================================
# Scoring configuration (prototype-level, explicitly NOT an official
# Indian Railways priority policy — meant to be tuned or replaced).
# ==========================================================================

#: Relative importance of each scoring component. Must sum to 1.0 so the
#: resulting composite score stays on an intuitive 0-100 scale.
DEFAULT_SCORING_WEIGHTS: Dict[str, float] = {
    "asset_risk": 0.35,        # Dev 1's predicted_risk_score (0-100)
    "priority": 0.30,          # the block request's own declared priority
    "urgency": 0.10,           # request_urgency (Normal / Urgent)
    "preference_closeness": 0.25,  # how close the window is to the planner's
                                    # preferred_start_time, within the
                                    # requested flexibility
}

#: Maps the block request's declared `priority` column to a 0-100 score.
PRIORITY_SCORE: Dict[str, float] = {
    "Low": 25.0,
    "Medium": 50.0,
    "High": 75.0,
    "Critical": 100.0,
}

#: Maps `request_urgency` to a 0-100 score.
URGENCY_SCORE: Dict[str, float] = {
    "Normal": 0.0,
    "Urgent": 100.0,
}

#: Score points lost per minute a candidate's start time is offset from the
#: planner's preferred_start_time (clipped at 0). A candidate exactly on
#: the preferred time scores 100 on this component; a candidate 60 minutes
#: away (the largest flexibility value in the dataset, "±60 min") scores 40.
PREFERENCE_PENALTY_PER_MINUTE: float = 1.0

#: Multiplier used to convert the 0-100 composite score into an integer
#: suitable for CP-SAT's integer-only linear objective, without losing the
#: two decimal places already used elsewhere in this project (e.g.
#: predicted_risk_score is rounded to 2 decimals).
SCORE_SCALE: int = 100


# ==========================================================================
# Data structures
# ==========================================================================

@dataclass(frozen=True)
class AssetRiskInfo:
    """
    Wraps Dev 1's predict_risk() output for one asset, plus provenance so
    callers (and the explanation layer) can tell a real model prediction
    from a safe fallback.
    """
    asset_id: str
    predicted_risk_score: float
    predicted_priority: str
    borderline: bool
    source: str  # "ml_model" or "fallback_default"


@dataclass(frozen=True)
class ScoredCandidate:
    """One feasible CandidateWindow, plus its full score breakdown."""
    candidate: CandidateWindow
    asset_risk: AssetRiskInfo
    score_components: Dict[str, float]  # already weighted, i.e. sums to total_score
    total_score: float                  # 0-100 composite score
    scaled_score: int                   # int(round(total_score * SCORE_SCALE)), for CP-SAT


@dataclass
class BlockPlanEntry:
    """The optimizer's recommendation (or non-recommendation) for one request."""
    request: BlockRequest
    scheduled: bool
    selected_candidate: Optional[ScoredCandidate]
    all_scored_candidates: List[ScoredCandidate]  # feasible only, sorted best-first
    total_candidates: int
    feasible_count: int
    rejected_conflict_counts: Dict[str, int]  # conflict type -> count among infeasible


@dataclass
class OptimizationResult:
    """The full output of one optimize_block_plan() run."""
    entries: List[BlockPlanEntry]
    solver_status: str
    objective_value: Optional[float]
    scheduled_count: int
    unscheduled_count: int


# ==========================================================================
# Connecting to Dev 1: asset lookup + risk scoring
# ==========================================================================

#: Exact field set required by ml.inference.predict_risk()'s contract
#: (see ml/ml_documentation/asset_risk_prediction_contract.md).
_ASSET_RISK_INPUT_FIELDS = [
    "age_years", "condition_score", "failure_count_24m",
    "days_since_last_maintenance", "usage_percent",
    "criticality", "asset_type",
]


def load_asset_lookup(asset_health_csv_path: str) -> Dict[str, Dict[str, Any]]:
    """
    Load the asset health dataset into {asset_id: asset_dict}, where each
    asset_dict has exactly the fields predict_risk() requires.

    This is the join key between Dev 2's block requests (which carry an
    `asset_id`) and Dev 1's per-asset risk model.
    """
    df = pd.read_csv(asset_health_csv_path)

    missing = [c for c in ["asset_id"] + _ASSET_RISK_INPUT_FIELDS if c not in df.columns]
    if missing:
        raise ValueError(
            f"Asset health CSV is missing required columns: {missing}. "
            f"Found columns: {list(df.columns)}"
        )

    lookup: Dict[str, Dict[str, Any]] = {}
    for _, row in df.iterrows():
        lookup[str(row["asset_id"])] = {
            field_name: row[field_name] for field_name in _ASSET_RISK_INPUT_FIELDS
        }
    return lookup


def get_asset_risk(
    asset_id: str,
    asset_lookup: Dict[str, Dict[str, Any]],
    cache: Dict[str, AssetRiskInfo],
) -> AssetRiskInfo:
    """
    Return the (cached) asset-risk prediction for one asset, calling Dev 1's
    predict_risk() at most once per unique asset_id per optimization run.

    Falls back to a safe, clearly-flagged neutral score (50.0 / "Medium",
    source="fallback_default") if the asset is not present in the asset
    health dataset, instead of crashing the whole optimization run over one
    missing/unmapped asset. In the real dataset used for this project, no
    block request's asset_id is actually missing from asset_health — this
    fallback exists purely as defensive handling for future/unclean data.
    """
    if asset_id in cache:
        return cache[asset_id]

    asset_row = asset_lookup.get(asset_id)
    if asset_row is None:
        result = AssetRiskInfo(
            asset_id=asset_id,
            predicted_risk_score=50.0,
            predicted_priority="Medium",
            borderline=True,
            source="fallback_default",
        )
    else:
        prediction = predict_risk(asset_row)
        result = AssetRiskInfo(
            asset_id=asset_id,
            predicted_risk_score=prediction["predicted_risk_score"],
            predicted_priority=prediction["predicted_priority"],
            borderline=prediction["borderline"],
            source="ml_model",
        )

    cache[asset_id] = result
    return result


# ==========================================================================
# Scoring
# ==========================================================================

def compute_score(
    request: BlockRequest,
    candidate: CandidateWindow,
    asset_risk: AssetRiskInfo,
    weights: Dict[str, float] = DEFAULT_SCORING_WEIGHTS,
) -> ScoredCandidate:
    """
    Compute the explainable, weighted score for one (already feasible)
    candidate window. Every component is on a common 0-100 scale before
    weighting, so `score_components` can be shown to the planner/jury
    as a transparent breakdown of "why this window was recommended."

    Components:
      - asset_risk:             Dev 1's predicted_risk_score (0-100 as-is).
      - priority:                request.priority mapped via PRIORITY_SCORE.
      - urgency:                  request.request_urgency mapped via URGENCY_SCORE.
      - preference_closeness:    100 minus PREFERENCE_PENALTY_PER_MINUTE for
                                   every minute the candidate's start time is
                                   offset from preferred_start_time, floored
                                   at 0. Encodes "respect requested duration
                                   and preferred time/flexibility" — duration
                                   itself is already fixed and unchanged from
                                   the request, so it needs no scoring term.
    """
    priority_component = PRIORITY_SCORE.get(request.priority, 50.0)
    urgency_component = URGENCY_SCORE.get(request.request_urgency, 0.0)
    preference_component = max(
        0.0,
        100.0 - PREFERENCE_PENALTY_PER_MINUTE * abs(candidate.offset_from_preferred_min),
    )
    risk_component = asset_risk.predicted_risk_score

    weighted_components = {
        "asset_risk": weights["asset_risk"] * risk_component,
        "priority": weights["priority"] * priority_component,
        "urgency": weights["urgency"] * urgency_component,
        "preference_closeness": weights["preference_closeness"] * preference_component,
    }
    total_score = sum(weighted_components.values())

    return ScoredCandidate(
        candidate=candidate,
        asset_risk=asset_risk,
        score_components=weighted_components,
        total_score=total_score,
        scaled_score=int(round(total_score * SCORE_SCALE)),
    )


# ==========================================================================
# CP-SAT optimization
# ==========================================================================

def optimize_block_plan(
    requests: List[BlockRequest],
    context: EvaluationContext,
    asset_lookup: Dict[str, Dict[str, Any]],
    weights: Dict[str, float] = DEFAULT_SCORING_WEIGHTS,
    step_minutes: int = 5,
    enforce_cross_request_resource_conflicts: bool = True,
    max_time_in_seconds: float = 10.0,
) -> OptimizationResult:
    """
    Build and solve the CP-SAT model that selects at most one recommended
    window per block request, maximizing total weighted score, subject to:

      1. At most one candidate selected per request
         (sum of that request's decision variables <= 1).
      2. No two SELECTED candidates from DIFFERENT requests may use the
         same `required_team` at an overlapping time (see module docstring,
         limitation #2, for why this specific cross-request check is added
         here rather than in constraint_engine.py).

    Only candidates constraint_engine.py has already marked feasible are
    given a decision variable at all — an infeasible candidate structurally
    cannot be selected, it never enters the model.

    Args:
        requests: Block requests to plan for (e.g. all 60 from the real
            dataset, or a single request for a targeted demo/what-if run).
        context: Pre-built EvaluationContext (existing blocks + train index
            + constraint config) — see constraint_engine.build_evaluation_context.
        asset_lookup: {asset_id: predict_risk()-ready dict}, from
            load_asset_lookup().
        weights: Scoring weights, see DEFAULT_SCORING_WEIGHTS.
        step_minutes: Candidate-generation granularity, passed through to
            candidate_generator.generate_candidate_windows.
        enforce_cross_request_resource_conflicts: See limitation #2 above.
            Exposed as a flag mainly so tests can isolate behavior.
        max_time_in_seconds: CP-SAT time budget. The problem sizes in this
            project (<=60 requests, <=~70 feasible candidates total in the
            real dataset) solve to proven optimality in well under a
            second; this budget is a generous safety margin, not a tuned
            production value.

    Returns:
        OptimizationResult with one BlockPlanEntry per input request.
    """
    model = cp_model.CpModel()
    asset_risk_cache: Dict[str, AssetRiskInfo] = {}

    # Per-request bookkeeping, built once, then wired into the CP-SAT model.
    entries_build: List[Dict[str, Any]] = []
    # Flat list of every (request, ScoredCandidate, BoolVar) triple, used
    # below to add the cross-request resource-conflict constraints and the
    # objective.
    flat_vars: List[Tuple[BlockRequest, ScoredCandidate, cp_model.IntVar]] = []

    for request in requests:
        candidates = generate_candidate_windows(request, step_minutes)
        eval_results = evaluate_candidates_for_request(candidates, request, context)

        asset_risk = get_asset_risk(request.asset_id, asset_lookup, asset_risk_cache)

        scored: List[ScoredCandidate] = []
        conflict_counts: Counter = Counter()
        for candidate, result in zip(candidates, eval_results):
            if result["feasible"]:
                scored.append(compute_score(request, candidate, asset_risk, weights))
            else:
                for conflict in result["conflicts"]:
                    conflict_counts[conflict["type"]] += 1
        # Best-first ordering makes downstream explanation/printing trivial;
        # it has no effect on the CP-SAT solve itself.
        scored.sort(key=lambda sc: sc.total_score, reverse=True)

        request_vars: List[cp_model.IntVar] = []
        for i, sc in enumerate(scored):
            var = model.NewBoolVar(f"select_{request.block_request_id}_{i}")
            request_vars.append(var)
            flat_vars.append((request, sc, var))

        # Constraint 1: at most one window recommended per request.
        if request_vars:
            model.Add(sum(request_vars) <= 1)

        entries_build.append({
            "request": request,
            "scored": scored,
            "vars": request_vars,
            "total_candidates": len(eval_results),
            "conflict_counts": dict(conflict_counts),
        })

    # Constraint 2: no team double-booked across two different requests'
    # newly-selected windows. O(n^2) over the FEASIBLE candidates only
    # (typically a few dozen to a couple hundred in this project), which is
    # cheap even though the underlying candidate count is much larger.
    if enforce_cross_request_resource_conflicts:
        for i in range(len(flat_vars)):
            req_i, sc_i, var_i = flat_vars[i]
            for j in range(i + 1, len(flat_vars)):
                req_j, sc_j, var_j = flat_vars[j]
                if req_i.block_request_id == req_j.block_request_id:
                    continue  # already covered by constraint 1
                if req_i.required_team != req_j.required_team:
                    continue
                overlap = _circular_overlap_minutes(
                    sc_i.candidate.start_minutes, sc_i.candidate.duration_min,
                    sc_j.candidate.start_minutes, sc_j.candidate.duration_min,
                )
                if overlap > 0:
                    model.Add(var_i + var_j <= 1)

    # Objective: maximize total weighted score across every selected window.
    if flat_vars:
        model.Maximize(sum(sc.scaled_score * var for _, sc, var in flat_vars))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = max_time_in_seconds
    status = solver.Solve(model)
    status_name = solver.StatusName(status)
    solved = status in (cp_model.OPTIMAL, cp_model.FEASIBLE)

    entries: List[BlockPlanEntry] = []
    scheduled_count = 0
    for build in entries_build:
        selected: Optional[ScoredCandidate] = None
        if solved:
            for sc, var in zip(build["scored"], build["vars"]):
                if solver.Value(var) == 1:
                    selected = sc
                    scheduled_count += 1
                    break
        entries.append(BlockPlanEntry(
            request=build["request"],
            scheduled=selected is not None,
            selected_candidate=selected,
            all_scored_candidates=build["scored"],
            total_candidates=build["total_candidates"],
            feasible_count=len(build["scored"]),
            rejected_conflict_counts=build["conflict_counts"],
        ))

    objective_value = solver.ObjectiveValue() / SCORE_SCALE if solved and flat_vars else None

    return OptimizationResult(
        entries=entries,
        solver_status=status_name,
        objective_value=objective_value,
        scheduled_count=scheduled_count,
        unscheduled_count=len(entries) - scheduled_count,
    )


def select_best_window(
    request: BlockRequest,
    context: EvaluationContext,
    asset_lookup: Dict[str, Dict[str, Any]],
    weights: Dict[str, float] = DEFAULT_SCORING_WEIGHTS,
    step_minutes: int = 5,
) -> BlockPlanEntry:
    """
    Convenience wrapper for the single-request case (e.g. the "planner
    creates one new block request" demo flow described in the project
    spec). Cross-request resource conflicts are meaningless for a single
    request, so that constraint is skipped.
    """
    result = optimize_block_plan(
        requests=[request],
        context=context,
        asset_lookup=asset_lookup,
        weights=weights,
        step_minutes=step_minutes,
        enforce_cross_request_resource_conflicts=False,
    )
    return result.entries[0]


# ==========================================================================
# Explainability
# ==========================================================================

def explain_entry(entry: BlockPlanEntry, top_n_alternatives: int = 3) -> Dict[str, Any]:
    """
    Turn one BlockPlanEntry into a JSON-serializable explanation suitable
    for the frontend's "Explain Recommendation" screen: what was selected
    (or why nothing was), its score breakdown, the next-best alternatives
    that were considered but not chosen, and a summary of why the
    infeasible candidates were rejected.
    """
    request = entry.request
    base: Dict[str, Any] = {
        "request_id": request.block_request_id,
        "maintenance_type": request.maintenance_type,
        "section_id": request.section_id,
        "station_code": request.station_code,
        "priority": request.priority,
        "urgency": request.request_urgency,
        "preferred_start_time": request.preferred_start_time,
        "time_flexibility": request.time_flexibility,
        "total_candidates_generated": entry.total_candidates,
        "feasible_candidates": entry.feasible_count,
        "infeasible_candidates": entry.total_candidates - entry.feasible_count,
        "rejected_conflict_breakdown": entry.rejected_conflict_counts,
    }

    if not entry.scheduled or entry.selected_candidate is None:
        base["scheduled"] = False
        base["reason"] = (
            "No feasible candidate window was available for this request "
            "under the current constraints."
            if entry.feasible_count == 0 else
            "A feasible candidate existed but was not selected in this "
            "plan (likely displaced by a higher-scoring, resource-conflicting "
            "request elsewhere in the same plan)."
        )
        return base

    selected = entry.selected_candidate
    base["scheduled"] = True
    base["selected_window"] = {
        "start_time": selected.candidate.start_time,
        "end_time": selected.candidate.end_time,
        "duration_min": selected.candidate.duration_min,
        "is_preferred_time": selected.candidate.is_preferred,
        "offset_from_preferred_min": selected.candidate.offset_from_preferred_min,
    }
    base["asset_risk"] = {
        "asset_id": selected.asset_risk.asset_id,
        "predicted_risk_score": selected.asset_risk.predicted_risk_score,
        "predicted_priority": selected.asset_risk.predicted_priority,
        "borderline": selected.asset_risk.borderline,
        "source": selected.asset_risk.source,
    }
    base["score"] = {
        "total_score": round(selected.total_score, 2),
        "components": {k: round(v, 2) for k, v in selected.score_components.items()},
    }

    alternatives = [
        sc for sc in entry.all_scored_candidates
        if sc is not selected
    ][:top_n_alternatives]
    base["next_best_alternatives"] = [
        {
            "start_time": alt.candidate.start_time,
            "end_time": alt.candidate.end_time,
            "total_score": round(alt.total_score, 2),
        }
        for alt in alternatives
    ]
    return base


# ==========================================================================
# Convenience loaders (mirrors constraint_engine.build_evaluation_context)
# ==========================================================================

def load_asset_lookup_from_dataset_dir(dataset_dir: str) -> Dict[str, Dict[str, Any]]:
    """
    Locate and load the asset health CSV from a dataset directory that may
    either be `dataset/` (with asset_health_dataset.csv directly inside) or
    `dataset/raw/` — mirrors the structure-agnostic lookup already used by
    the Phase 1/2 test suites.
    """
    direct = os.path.join(dataset_dir, "asset_health_dataset.csv")
    if os.path.isfile(direct):
        return load_asset_lookup(direct)
    raw = os.path.join(dataset_dir, "raw", "asset_health_dataset.csv")
    if os.path.isfile(raw):
        return load_asset_lookup(raw)
    raise FileNotFoundError(
        f"Could not find asset_health_dataset.csv in {direct} or {raw}"
    )

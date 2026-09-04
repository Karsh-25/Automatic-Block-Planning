"""
main.py

FastAPI entrypoint. Currently exposes one endpoint:

    POST /api/analyze

which is the Step 3 ("AI Analyses the Network") pre-optimization baseline
consumed by frontend/src/screens/AiAnalysis/AiAnalysis.jsx. For every block
request in the payload, it:

    1. Builds the exact preferred-time candidate window
       (candidate_generator.generate_candidate_windows, offset == 0)
    2. Runs it through every feasibility check, unchanged
       (constraint_engine.evaluate_candidate)
    3. Looks up the asset's ML-predicted risk/priority, unchanged
       (block_optimizer.get_asset_risk -> ml.inference.predict_risk)

No optimization (block_optimizer.optimize_block_plan) runs here — that is
Step 4's job, not Step 3's. This endpoint only reuses Phase 1/2 (candidate
generation + feasibility) and Dev 1's risk model, never re-implementing any
of their logic.

Run with:
    uvicorn app.main:app --reload --port 8000
(from the `backend/` directory, so `dataset/` resolves relative to CWD --
see DATASET_DIR below if your working directory differs.)
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.constraints.candidate_generator import (
    BlockRequest,
    generate_candidate_windows,
)
from app.constraints.constraint_engine import (
    EvaluationContext,
    build_evaluation_context,
    evaluate_candidate,
)
from app.optimization.block_optimizer import (
    load_asset_lookup,
    get_asset_risk,
    optimize_block_plan,
    explain_entry,
)
from app.simulation.simulator import simulate_optimization_result

# ==========================================================================
# Dataset paths
# ==========================================================================

# Resolves backend/dataset regardless of CWD, as long as this file stays at
# backend/app/main.py.
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATASET_DIR = os.path.join(BACKEND_DIR, "dataset")

EXISTING_BLOCKS_CSV = os.path.join(DATASET_DIR, "raw", "existing_blocks_dataset.csv")
# The cleaned/filtered timetable loads far faster than the 8MB raw file and
# has identical columns (see dataset/scripts/prepare_train_timetable.py).
TRAIN_TIMETABLE_CSV = os.path.join(DATASET_DIR, "processed", "relevant_timetable_clean.csv")
ASSET_HEALTH_CSV = os.path.join(DATASET_DIR, "raw", "asset_health_dataset.csv")

# ==========================================================================
# App + CORS
# ==========================================================================

app = FastAPI(title="Automatic Block Planning API")

app.add_middleware(
    CORSMiddleware,
    # Vite dev server also proxies /api -> this app directly, but CORS is
    # kept permissive for local dev in case the frontend is opened without
    # the proxy (e.g. a different port).
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================================================
# Loaded once at startup, reused across requests
# ==========================================================================

_evaluation_context: Optional[EvaluationContext] = None
_asset_lookup: Optional[Dict[str, Dict[str, Any]]] = None
_asset_risk_cache: Dict[str, Any] = {}


@app.on_event("startup")
def _load_reference_data() -> None:
    global _evaluation_context, _asset_lookup

    for path in (EXISTING_BLOCKS_CSV, TRAIN_TIMETABLE_CSV, ASSET_HEALTH_CSV):
        if not os.path.isfile(path):
            raise RuntimeError(f"Required dataset file not found: {path}")

    _evaluation_context = build_evaluation_context(
        existing_blocks_csv_path=EXISTING_BLOCKS_CSV,
        train_timetable_csv_path=TRAIN_TIMETABLE_CSV,
    )
    _asset_lookup = load_asset_lookup(ASSET_HEALTH_CSV)


# ==========================================================================
# Request / response models
# ==========================================================================

class BlockRequestIn(BaseModel):
    """
    Mirrors what BlockRequest.jsx stores per row. Field names match the
    frontend's request object exactly (camelCase where the frontend uses
    camelCase, snake_case for section_id/station_code since those were
    already added backend-named).
    """

    id: str
    activity: str
    assetId: str
    section_id: str
    station_code: str
    duration: int
    priority: str
    preferredStartTime: str  # "HH:MM"
    flexibility: str
    requiredTeam: str
    urgency: str
    status: str = "Pending"


class AnalyzeRequest(BaseModel):
    requests: List[BlockRequestIn] = Field(default_factory=list)


# ==========================================================================
# Frontend <-> backend field mapping
# ==========================================================================

def _to_domain_block_request(item: BlockRequestIn) -> BlockRequest:
    """Map one frontend request object onto candidate_generator.BlockRequest."""
    try:
        return BlockRequest(
            block_request_id=item.id,
            asset_id=item.assetId,
            section_id=item.section_id,
            station_code=item.station_code,
            maintenance_type=item.activity,
            requested_duration_min=item.duration,
            priority=item.priority,
            preferred_start_time=item.preferredStartTime,
            time_flexibility=item.flexibility,
            required_team=item.requiredTeam,
            request_urgency=item.urgency,
            status=item.status,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid block request '{item.id}': {exc}",
        ) from exc


def _evaluate_one(item: BlockRequestIn) -> Dict[str, Any]:
    request = _to_domain_block_request(item)

    candidates = generate_candidate_windows(request)
    preferred = next(c for c in candidates if c.is_preferred)

    evaluation = evaluate_candidate(preferred, request, _evaluation_context)

    asset_risk = get_asset_risk(request.asset_id, _asset_lookup, _asset_risk_cache)

    return {
        "block_request_id": request.block_request_id,
        "asset_id": request.asset_id,
        "section_id": request.section_id,
        "station_code": request.station_code,
        "maintenance_type": request.maintenance_type,
        "required_team": request.required_team,
        "priority": request.priority,
        "preferred_start_time": request.preferred_start_time,
        "feasible": evaluation["feasible"],
        "conflicts": evaluation["conflicts"],
        "asset_risk": {
            "predicted_risk_score": asset_risk.predicted_risk_score,
            "predicted_priority": asset_risk.predicted_priority,
            "borderline": asset_risk.borderline,
        },
    }


# ==========================================================================
# Routes
# ==========================================================================

@app.post("/api/analyze")
def analyze(payload: AnalyzeRequest) -> Dict[str, Any]:
    """
    Step 3 pre-optimization baseline. Returns:

        { "evaluations": [ {...}, ... ] }

    matching exactly what AiAnalysis.jsx's deriveStats/deriveTopSections/
    deriveTopConflicts/deriveSummary expect.
    """
    if _evaluation_context is None or _asset_lookup is None:
        raise HTTPException(status_code=503, detail="Reference data not loaded yet.")

    evaluations = [_evaluate_one(item) for item in payload.requests]
    return {"evaluations": evaluations}


@app.post("/api/optimize")
def optimize(payload: AnalyzeRequest) -> Dict[str, Any]:
    """
    Step 4 ("Generate Optimal Plan"). Wraps the existing, already-tested
    Phase 3 OR-Tools optimizer (block_optimizer.optimize_block_plan) --
    no optimization logic is re-implemented here.

    Unlike /api/analyze (which only checks each request's *preferred*
    time), this runs the full pipeline for every request in the payload:

        candidate_generator.generate_candidate_windows   (Phase 1, all offsets)
        constraint_engine.evaluate_candidates_for_request (Phase 2, every candidate)
        block_optimizer.compute_score + CP-SAT solve      (Phase 3)

    Returns:
        {
          "solver_status": "OPTIMAL" | "INFEASIBLE" | ... ,
          "objective_value": float | null,
          "scheduled_count": int,
          "unscheduled_count": int,
          "plans": [ block_optimizer.explain_entry(entry), ... ]
        }

    Each entry of "plans" is exactly block_optimizer.explain_entry()'s
    output (request context, scheduled/selected_window/score/
    next_best_alternatives when scheduled, or a reason when not) --
    see that function's docstring for the full field list. The only
    addition made here is `asset_id`, and `asset_risk` for requests
    that were NOT scheduled: explain_entry() only attaches asset_risk
    when a candidate was actually selected, but the frontend still
    needs to show "how risky is this asset" even when nothing could be
    scheduled. Both are pulled from the same already-loaded asset
    lookup / predict_risk() cache /api/analyze already uses, not
    recomputed or invented.
    """
    if _evaluation_context is None or _asset_lookup is None:
        raise HTTPException(status_code=503, detail="Reference data not loaded yet.")

    if not payload.requests:
        raise HTTPException(status_code=422, detail="No block requests provided.")

    domain_requests = [_to_domain_block_request(item) for item in payload.requests]

    result = optimize_block_plan(
        requests=domain_requests,
        context=_evaluation_context,
        asset_lookup=_asset_lookup,
    )

    plans: List[Dict[str, Any]] = []
    for entry in result.entries:
        explanation = explain_entry(entry)
        explanation["asset_id"] = entry.request.asset_id
        if "asset_risk" not in explanation:
            asset_risk = get_asset_risk(entry.request.asset_id, _asset_lookup, _asset_risk_cache)
            explanation["asset_risk"] = {
                "predicted_risk_score": asset_risk.predicted_risk_score,
                "predicted_priority": asset_risk.predicted_priority,
                "borderline": asset_risk.borderline,
                "source": asset_risk.source,
            }
        plans.append(explanation)

    return {
        "solver_status": result.solver_status,
        "objective_value": result.objective_value,
        "scheduled_count": result.scheduled_count,
        "unscheduled_count": result.unscheduled_count,
        "plans": plans,
    }


@app.post("/api/simulate")
def simulate(payload: AnalyzeRequest) -> Dict[str, Any]:
    """
    Step 5 ("Simulate & Validate Plan"). Wraps the existing, already-tested
    Phase 4 simulator (simulator.simulate_optimization_result) -- no
    simulation logic is re-implemented here.

    There is no separate "load a previously computed plan" step: CP-SAT is
    deterministic, so re-running optimize_block_plan() on the exact same
    requests payload Page 4 sent reproduces the identical plan Page 4
    showed, byte for byte. That real OptimizationResult object (with its
    actual BlockPlanEntry/ScoredCandidate dataclasses) is then handed
    directly to simulate_optimization_result() -- never serialized to
    JSON and reconstructed by hand, so nothing about Phase 3's output is
    duplicated or approximated here. This mirrors simulator.py's own
    documented pipeline:

        candidate_generator -> constraint_engine -> block_optimizer (Phase 3)
        -> simulator.simulate_optimization_result() (Phase 4)

    Returns simulator.SimulationReport.to_dict() completely unchanged --
    see simulator.py for the exact field list. In particular:
      - block_results[i].simulated_delay_min is the project's own narrow
        definition (train-conflict overlap minutes on the executed
        window during independent re-verification) -- NOT a real-world
        delay prediction. See block_results[i].reason and the top-level
        "limitations" list, which is returned as-is from
        simulator.SIMULATION_LIMITATIONS.
      - Unscheduled requests get simulated_delay_min = null (never a
        fabricated 0), exactly as simulator.py defines.
    """
    if _evaluation_context is None or _asset_lookup is None:
        raise HTTPException(status_code=503, detail="Reference data not loaded yet.")

    if not payload.requests:
        raise HTTPException(status_code=422, detail="No block requests provided.")

    domain_requests = [_to_domain_block_request(item) for item in payload.requests]

    result = optimize_block_plan(
        requests=domain_requests,
        context=_evaluation_context,
        asset_lookup=_asset_lookup,
    )

    report = simulate_optimization_result(result, _evaluation_context)
    return report.to_dict()


@app.get("/api/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}

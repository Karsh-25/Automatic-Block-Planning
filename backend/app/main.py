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
from app.optimization.block_optimizer import load_asset_lookup, get_asset_risk

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


@app.get("/api/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}

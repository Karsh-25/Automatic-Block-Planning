"""
main.py

FastAPI entrypoint for TrackSquad.

Includes:
    - Authentication
        POST /api/auth/signup
        POST /api/auth/login
        GET  /api/auth/me

    - Railway block planning
        POST /api/analyze
        POST /api/optimize
        POST /api/simulate

    - Health check
        GET /api/health
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

# ==========================================================================
# Authentication / Database
# ==========================================================================

from app.database import Base, engine, get_db
from app.models import User
from app.schemas import (
    SignupRequest,
    LoginRequest,
    UserResponse,
    AuthResponse,
)
from app.auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
)

# ==========================================================================
# Railway planning imports
# ==========================================================================

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

from app.simulation.simulator import (
    simulate_optimization_result,
)


# ==========================================================================
# Database initialization
# ==========================================================================

# Creates the users table in Supabase PostgreSQL if it does not already exist.
#
# Existing tables are not deleted or modified.
Base.metadata.create_all(bind=engine)


# ==========================================================================
# Dataset paths
# ==========================================================================

# Resolves backend/dataset regardless of the current working directory,
# as long as this file remains at:
#
# backend/app/main.py
#
BACKEND_DIR = os.path.dirname(
    os.path.dirname(
        os.path.abspath(__file__)
    )
)

DATASET_DIR = os.path.join(
    BACKEND_DIR,
    "dataset",
)

EXISTING_BLOCKS_CSV = os.path.join(
    DATASET_DIR,
    "raw",
    "existing_blocks_dataset.csv",
)

TRAIN_TIMETABLE_CSV = os.path.join(
    DATASET_DIR,
    "processed",
    "relevant_timetable_clean.csv",
)

ASSET_HEALTH_CSV = os.path.join(
    DATASET_DIR,
    "raw",
    "asset_health_dataset.csv",
)


# ==========================================================================
# FastAPI application
# ==========================================================================

app = FastAPI(
    title="TrackSquad AI Block Planning API"
)


# ==========================================================================
# CORS
# ==========================================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==========================================================================
# Loaded reference data
# ==========================================================================

_evaluation_context: Optional[EvaluationContext] = None

_asset_lookup: Optional[
    Dict[str, Dict[str, Any]]
] = None

_asset_risk_cache: Dict[str, Any] = {}


# ==========================================================================
# Startup
# ==========================================================================

@app.on_event("startup")
def _load_reference_data() -> None:
    """
    Load railway datasets once when FastAPI starts.

    These are reused across requests rather than being loaded for every
    /api/analyze, /api/optimize or /api/simulate call.
    """

    global _evaluation_context
    global _asset_lookup

    for path in (
        EXISTING_BLOCKS_CSV,
        TRAIN_TIMETABLE_CSV,
        ASSET_HEALTH_CSV,
    ):
        if not os.path.isfile(path):
            raise RuntimeError(
                f"Required dataset file not found: {path}"
            )

    _evaluation_context = build_evaluation_context(
        existing_blocks_csv_path=EXISTING_BLOCKS_CSV,
        train_timetable_csv_path=TRAIN_TIMETABLE_CSV,
    )

    _asset_lookup = load_asset_lookup(
        ASSET_HEALTH_CSV
    )


# ==========================================================================
# Authentication routes
# ==========================================================================

@app.post(
    "/api/auth/signup",
    response_model=AuthResponse,
)
def signup(
    payload: SignupRequest,
    db: Session = Depends(get_db),
):
    """
    Create a new TrackSquad user.

    Passwords are never stored directly.
    They are hashed using bcrypt in auth.py.
    """

    # Check whether email already exists
    existing_user = (
        db.query(User)
        .filter(
            User.email == payload.email
        )
        .first()
    )

    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="An account with this email already exists.",
        )

    # Create user
    user = User(
        name=payload.name,
        email=payload.email,
        password_hash=hash_password(
            payload.password
        ),
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    # Generate JWT token
    token = create_access_token(
        user.id
    )

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": user,
    }


@app.post(
    "/api/auth/login",
    response_model=AuthResponse,
)
def login(
    payload: LoginRequest,
    db: Session = Depends(get_db),
):
    """
    Authenticate an existing user.
    """

    user = (
        db.query(User)
        .filter(
            User.email == payload.email
        )
        .first()
    )

    # Don't reveal whether the email exists.
    if (
        not user
        or not verify_password(
            payload.password,
            user.password_hash,
        )
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password.",
            headers={
                "WWW-Authenticate": "Bearer"
            },
        )

    # Create JWT
    token = create_access_token(
        user.id
    )

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": user,
    }


@app.get(
    "/api/auth/me",
    response_model=UserResponse,
)
def get_me(
    current_user: User = Depends(
        get_current_user
    ),
):
    """
    Return the currently authenticated user.

    The frontend can call this endpoint when the application loads
    to restore the logged-in user's information.
    """

    return current_user


# ==========================================================================
# Railway request / response models
# ==========================================================================

class BlockRequestIn(BaseModel):
    """
    Mirrors what BlockRequest.jsx stores per row.

    Field names intentionally match the existing frontend/backend
    contract.
    """

    id: str
    activity: str
    assetId: str
    section_id: str
    station_code: str
    duration: int
    priority: str
    preferredStartTime: str
    flexibility: str
    requiredTeam: str
    urgency: str
    status: str = "Pending"


class AnalyzeRequest(BaseModel):
    requests: List[
        BlockRequestIn
    ] = Field(
        default_factory=list
    )


# ==========================================================================
# Frontend -> backend field mapping
# ==========================================================================

def _to_domain_block_request(
    item: BlockRequestIn,
) -> BlockRequest:

    """
    Convert the frontend request object into the project's
    domain BlockRequest object.
    """

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
            detail=(
                f"Invalid block request "
                f"'{item.id}': {exc}"
            ),
        ) from exc


# ==========================================================================
# Analyze helper
# ==========================================================================

def _evaluate_one(
    item: BlockRequestIn,
) -> Dict[str, Any]:

    request = _to_domain_block_request(
        item
    )

    candidates = generate_candidate_windows(
        request
    )

    preferred = next(
        c
        for c in candidates
        if c.is_preferred
    )

    evaluation = evaluate_candidate(
        preferred,
        request,
        _evaluation_context,
    )

    asset_risk = get_asset_risk(
        request.asset_id,
        _asset_lookup,
        _asset_risk_cache,
    )

    return {
        "block_request_id":
            request.block_request_id,

        "asset_id":
            request.asset_id,

        "section_id":
            request.section_id,

        "station_code":
            request.station_code,

        "maintenance_type":
            request.maintenance_type,

        "required_team":
            request.required_team,

        "priority":
            request.priority,

        "preferred_start_time":
            request.preferred_start_time,

        "feasible":
            evaluation["feasible"],

        "conflicts":
            evaluation["conflicts"],

        "asset_risk": {
            "predicted_risk_score":
                asset_risk.predicted_risk_score,

            "predicted_priority":
                asset_risk.predicted_priority,

            "borderline":
                asset_risk.borderline,
        },
    }


# ==========================================================================
# Step 3 — AI Analysis
# ==========================================================================

@app.post(
    "/api/analyze"
)
def analyze(
    payload: AnalyzeRequest,
) -> Dict[str, Any]:

    """
    Step 3:
    AI Analyses the Network.

    Checks each request's preferred time against the railway
    constraints and asset-risk model.
    """

    if (
        _evaluation_context is None
        or _asset_lookup is None
    ):
        raise HTTPException(
            status_code=503,
            detail=(
                "Reference data not loaded yet."
            ),
        )

    evaluations = [
        _evaluate_one(item)
        for item in payload.requests
    ]

    return {
        "evaluations": evaluations
    }


# ==========================================================================
# Step 4 — Generate Optimal Plan
# ==========================================================================

@app.post(
    "/api/optimize"
)
def optimize(
    payload: AnalyzeRequest,
) -> Dict[str, Any]:

    """
    Step 4:
    Generate Optimal Plan.

    Uses the existing OR-Tools optimizer.
    """

    if (
        _evaluation_context is None
        or _asset_lookup is None
    ):
        raise HTTPException(
            status_code=503,
            detail=(
                "Reference data not loaded yet."
            ),
        )

    if not payload.requests:
        raise HTTPException(
            status_code=422,
            detail=(
                "No block requests provided."
            ),
        )

    domain_requests = [
        _to_domain_block_request(item)
        for item in payload.requests
    ]

    result = optimize_block_plan(
        requests=domain_requests,
        context=_evaluation_context,
        asset_lookup=_asset_lookup,
    )

    plans: List[
        Dict[str, Any]
    ] = []

    for entry in result.entries:

        explanation = explain_entry(
            entry
        )

        explanation["asset_id"] = (
            entry.request.asset_id
        )

        if "asset_risk" not in explanation:

            asset_risk = get_asset_risk(
                entry.request.asset_id,
                _asset_lookup,
                _asset_risk_cache,
            )

            explanation[
                "asset_risk"
            ] = {
                "predicted_risk_score":
                    asset_risk.predicted_risk_score,

                "predicted_priority":
                    asset_risk.predicted_priority,

                "borderline":
                    asset_risk.borderline,

                "source":
                    asset_risk.source,
            }

        plans.append(
            explanation
        )

    return {
        "solver_status":
            result.solver_status,

        "objective_value":
            result.objective_value,

        "scheduled_count":
            result.scheduled_count,

        "unscheduled_count":
            result.unscheduled_count,

        "plans":
            plans,
    }


# ==========================================================================
# Step 5 — Simulate & Validate
# ==========================================================================

@app.post(
    "/api/simulate"
)
def simulate(
    payload: AnalyzeRequest,
) -> Dict[str, Any]:

    """
    Step 5:
    Simulate & Validate Plan.

    Re-runs the deterministic optimizer and passes the resulting
    OptimizationResult directly into the existing simulator.
    """

    if (
        _evaluation_context is None
        or _asset_lookup is None
    ):
        raise HTTPException(
            status_code=503,
            detail=(
                "Reference data not loaded yet."
            ),
        )

    if not payload.requests:
        raise HTTPException(
            status_code=422,
            detail=(
                "No block requests provided."
            ),
        )

    domain_requests = [
        _to_domain_block_request(item)
        for item in payload.requests
    ]

    result = optimize_block_plan(
        requests=domain_requests,
        context=_evaluation_context,
        asset_lookup=_asset_lookup,
    )

    report = simulate_optimization_result(
        result,
        _evaluation_context,
    )

    return report.to_dict()


# ==========================================================================
# Health check
# ==========================================================================

@app.get(
    "/api/health"
)
def health() -> Dict[str, str]:

    return {
        "status": "ok"
    }
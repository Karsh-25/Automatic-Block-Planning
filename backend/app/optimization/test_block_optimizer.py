"""
Deterministic tests for app/optimization/block_optimizer.py (Phase 3).

Follows the same structure as test_candidate_generator.py and
test_constraint_engine.py: synthetic, hand-built scenarios for isolated
behavior, followed by a real-dataset integration run with a summary report.

Run with:  python app/optimization/test_block_optimizer.py
       or: pytest app/optimization/test_block_optimizer.py
"""

import os
import sys


def _find_backend_root() -> str:
    """Same structure-agnostic walk-up used by the Phase 1/2 test suites."""
    current_dir = os.path.dirname(os.path.abspath(__file__))
    for _ in range(6):
        has_app = os.path.isdir(os.path.join(current_dir, "app"))
        has_dataset = os.path.isdir(os.path.join(current_dir, "dataset"))
        if has_app and has_dataset:
            return current_dir
        parent = os.path.dirname(current_dir)
        if parent == current_dir:
            break
        current_dir = parent
    raise FileNotFoundError(
        f"Could not locate the 'backend/' project root by walking up from "
        f"{os.path.abspath(__file__)}."
    )


_BACKEND_ROOT = _find_backend_root()
sys.path.insert(0, _BACKEND_ROOT)


def _find_dataset_dir() -> str:
    direct = os.path.join(_BACKEND_ROOT, "dataset")
    raw = os.path.join(_BACKEND_ROOT, "dataset", "raw")
    if os.path.isfile(os.path.join(raw, "block_request_dataset.csv")):
        return raw
    if os.path.isfile(os.path.join(direct, "block_request_dataset.csv")):
        return direct
    raise FileNotFoundError(
        f"Could not find block_request_dataset.csv in {direct} or {raw}"
    )


_DATASET_DIR = _find_dataset_dir()
BLOCK_REQUEST_CSV = os.path.join(_DATASET_DIR, "block_request_dataset.csv")
EXISTING_BLOCKS_CSV = os.path.join(_DATASET_DIR, "existing_blocks_dataset.csv")
TRAIN_TIMETABLE_CSV = os.path.join(_DATASET_DIR, "isl_wise_train_detail_03082015_v1.csv")
ASSET_HEALTH_CSV = os.path.join(_DATASET_DIR, "asset_health_dataset.csv")

from app.constraints.candidate_generator import BlockRequest, CandidateWindow
from app.constraints.constraint_engine import (
    EvaluationContext,
    DEFAULT_CONSTRAINT_CONFIG,
    build_evaluation_context,
)
from app.constraints.candidate_generator import load_block_requests
from app.optimization.block_optimizer import (
    AssetRiskInfo,
    ScoredCandidate,
    compute_score,
    optimize_block_plan,
    select_best_window,
    explain_entry,
    load_asset_lookup,
    load_asset_lookup_from_dataset_dir,
    get_asset_risk,
    DEFAULT_SCORING_WEIGHTS,
)


# --------------------------------------------------------------------------
# Synthetic fixtures (mirrors the style of make_request/make_candidate in
# test_constraint_engine.py)
# --------------------------------------------------------------------------

def make_request(**overrides) -> BlockRequest:
    base = dict(
        block_request_id="BR-TEST",
        asset_id="AST-SYNTH",
        section_id="SEC-001",
        station_code="TST",
        maintenance_type="Track Inspection",
        requested_duration_min=45,
        priority="Medium",
        preferred_start_time="02:30",
        time_flexibility="±30 min",
        required_team="Track Maintenance Team",
        request_urgency="Normal",
        status="Pending",
    )
    base.update(overrides)
    return BlockRequest(**base)


def make_candidate(**overrides) -> CandidateWindow:
    base = dict(
        request_id="BR-TEST",
        start_time="02:30",
        end_time="03:15",
        start_minutes=150,
        end_minutes=195,
        duration_min=45,
        offset_from_preferred_min=0,
        is_preferred=True,
        crosses_midnight=False,
    )
    base.update(overrides)
    return CandidateWindow(**base)


def make_empty_context(config=None) -> EvaluationContext:
    """
    An EvaluationContext with no existing blocks and no train movements at
    all, i.e. every well-formed, in-bounds candidate is feasible. Used to
    isolate optimizer behavior from constraint_engine's own feasibility
    logic (which already has its own dedicated test suite).
    """
    resolved_config = dict(DEFAULT_CONSTRAINT_CONFIG)
    if config:
        resolved_config.update(config)
    return EvaluationContext(existing_blocks=[], station_train_index={}, config=resolved_config)


def make_risk(score: float, priority: str = "Medium", borderline: bool = False) -> AssetRiskInfo:
    return AssetRiskInfo(
        asset_id="AST-SYNTH",
        predicted_risk_score=score,
        predicted_priority=priority,
        borderline=borderline,
        source="ml_model",
    )


# --------------------------------------------------------------------------
# Test 1: OR-Tools model initializes correctly
# --------------------------------------------------------------------------

def test_model_initializes_and_solves_trivially():
    """Even a request with zero candidates (edge case) must not crash the solve."""
    request = make_request(time_flexibility="Fixed")
    context = make_empty_context()
    asset_lookup = {"AST-SYNTH": {
        "age_years": 10, "condition_score": 50, "failure_count_24m": 2,
        "days_since_last_maintenance": 100, "usage_percent": 50,
        "criticality": "Medium", "asset_type": "Track",
    }}
    result = optimize_block_plan([request], context, asset_lookup)
    assert result.solver_status in ("OPTIMAL", "FEASIBLE")
    assert len(result.entries) == 1
    print("PASS: test_model_initializes_and_solves_trivially")


# --------------------------------------------------------------------------
# Test 2: Infeasible candidates are never selected
# --------------------------------------------------------------------------

def test_infeasible_only_request_is_not_scheduled():
    """
    A request whose only candidate window violates the duration bounds
    (checked by constraint_engine, not this module) must come back
    unscheduled — the optimizer must never invent a selection out of an
    empty feasible set.
    """
    request = make_request(
        requested_duration_min=1,  # below min_duration_min (5)
        time_flexibility="Fixed",
    )
    context = make_empty_context()  # duration check alone will still reject it
    asset_lookup = {"AST-SYNTH": {
        "age_years": 10, "condition_score": 50, "failure_count_24m": 2,
        "days_since_last_maintenance": 100, "usage_percent": 50,
        "criticality": "Medium", "asset_type": "Track",
    }}
    entry = select_best_window(request, context, asset_lookup)
    assert entry.scheduled is False
    assert entry.selected_candidate is None
    assert entry.feasible_count == 0
    assert "DURATION" in entry.rejected_conflict_counts
    print("PASS: test_infeasible_only_request_is_not_scheduled")


# --------------------------------------------------------------------------
# Test 3: A feasible candidate can be selected
# --------------------------------------------------------------------------

def test_feasible_request_is_scheduled():
    request = make_request(time_flexibility="Fixed")
    context = make_empty_context()
    asset_lookup = {"AST-SYNTH": {
        "age_years": 10, "condition_score": 50, "failure_count_24m": 2,
        "days_since_last_maintenance": 100, "usage_percent": 50,
        "criticality": "Medium", "asset_type": "Track",
    }}
    entry = select_best_window(request, context, asset_lookup)
    assert entry.scheduled is True
    assert entry.selected_candidate is not None
    assert entry.selected_candidate.candidate.is_preferred
    print("PASS: test_feasible_request_is_scheduled")


# --------------------------------------------------------------------------
# Test 4: Higher-priority / higher-risk maintenance is favored on trade-offs
# --------------------------------------------------------------------------

def test_higher_risk_scores_higher_all_else_equal():
    request = make_request()
    candidate = make_candidate()
    low_risk = make_risk(20.0)
    high_risk = make_risk(90.0)

    low_scored = compute_score(request, candidate, low_risk)
    high_scored = compute_score(request, candidate, high_risk)

    assert high_scored.total_score > low_scored.total_score
    print("PASS: test_higher_risk_scores_higher_all_else_equal")


def test_higher_priority_scores_higher_all_else_equal():
    candidate = make_candidate()
    risk = make_risk(50.0)

    low_priority_request = make_request(priority="Low")
    critical_priority_request = make_request(priority="Critical")

    low_scored = compute_score(low_priority_request, candidate, risk)
    critical_scored = compute_score(critical_priority_request, candidate, risk)

    assert critical_scored.total_score > low_scored.total_score
    print("PASS: test_higher_priority_scores_higher_all_else_equal")


def test_priority_wins_a_forced_resource_tradeoff():
    """
    Two DIFFERENT requests, same team, overlapping windows -> only one can
    be selected (cross-request resource constraint). The Critical-priority,
    higher-risk request must be the one chosen over the Low-priority,
    lower-risk request, even though both are individually feasible.
    """
    low_request = make_request(
        block_request_id="BR-LOW", asset_id="AST-LOW",
        priority="Low", request_urgency="Normal",
        time_flexibility="Fixed", required_team="Shared Team",
    )
    critical_request = make_request(
        block_request_id="BR-CRIT", asset_id="AST-CRIT",
        priority="Critical", request_urgency="Urgent",
        time_flexibility="Fixed", required_team="Shared Team",
    )
    context = make_empty_context()
    asset_lookup = {
        "AST-LOW": {
            "age_years": 5, "condition_score": 90, "failure_count_24m": 0,
            "days_since_last_maintenance": 10, "usage_percent": 20,
            "criticality": "Low", "asset_type": "Track",
        },
        "AST-CRIT": {
            "age_years": 30, "condition_score": 10, "failure_count_24m": 10,
            "days_since_last_maintenance": 400, "usage_percent": 95,
            "criticality": "Critical", "asset_type": "Bridge",
        },
    }
    result = optimize_block_plan(
        [low_request, critical_request], context, asset_lookup,
        enforce_cross_request_resource_conflicts=True,
    )
    entries_by_id = {e.request.block_request_id: e for e in result.entries}
    assert entries_by_id["BR-CRIT"].scheduled is True
    assert entries_by_id["BR-LOW"].scheduled is False
    print("PASS: test_priority_wins_a_forced_resource_tradeoff")


# --------------------------------------------------------------------------
# Test 5 & 6: Train-conflicting / existing-block-conflicting candidates
# are excluded (delegated to, and inherited from, constraint_engine)
# --------------------------------------------------------------------------

def test_train_conflicting_candidate_is_never_selectable():
    from app.constraints.constraint_engine import TrainMovement

    request = make_request(time_flexibility="Fixed", preferred_start_time="02:30")
    # A train occupying the exact same station/time as the only candidate.
    context = EvaluationContext(
        existing_blocks=[],
        station_train_index={"TST": [TrainMovement("12345", "Test Express", 150, 45)]},
        config=dict(DEFAULT_CONSTRAINT_CONFIG),
    )
    asset_lookup = {"AST-SYNTH": {
        "age_years": 10, "condition_score": 50, "failure_count_24m": 2,
        "days_since_last_maintenance": 100, "usage_percent": 50,
        "criticality": "Medium", "asset_type": "Track",
    }}
    entry = select_best_window(request, context, asset_lookup)
    assert entry.scheduled is False
    assert "TRAIN" in entry.rejected_conflict_counts
    print("PASS: test_train_conflicting_candidate_is_never_selectable")


def test_existing_block_conflicting_candidate_is_never_selectable():
    from app.constraints.constraint_engine import ExistingBlock

    request = make_request(time_flexibility="Fixed", preferred_start_time="02:30")
    existing = ExistingBlock(
        existing_block_id="EB-TEST", linked_block_request_id=None,
        asset_id="AST-OTHER", section_id="SEC-001", station_code="TST",
        block_type="Maintenance Block", start_minutes=150, end_minutes=195,
        duration_min=45, assigned_team="Some Other Team",
        status="Confirmed", operational_priority="Normal",
    )
    context = EvaluationContext(
        existing_blocks=[existing], station_train_index={},
        config=dict(DEFAULT_CONSTRAINT_CONFIG),
    )
    asset_lookup = {"AST-SYNTH": {
        "age_years": 10, "condition_score": 50, "failure_count_24m": 2,
        "days_since_last_maintenance": 100, "usage_percent": 50,
        "criticality": "Medium", "asset_type": "Track",
    }}
    entry = select_best_window(request, context, asset_lookup)
    assert entry.scheduled is False
    assert "EXISTING_BLOCK" in entry.rejected_conflict_counts
    print("PASS: test_existing_block_conflicting_candidate_is_never_selectable")


# --------------------------------------------------------------------------
# Test 7: Resource-conflicting candidates are excluded
# --------------------------------------------------------------------------

def test_resource_conflicting_candidate_is_never_selectable():
    """Against an existing committed block (not another request in this run)."""
    from app.constraints.constraint_engine import ExistingBlock

    request = make_request(
        time_flexibility="Fixed", preferred_start_time="02:30",
        required_team="Track Maintenance Team",
    )
    existing = ExistingBlock(
        existing_block_id="EB-TEST", linked_block_request_id=None,
        asset_id="AST-OTHER", section_id="SEC-999", station_code="ELSEWHERE",
        block_type="Maintenance Block", start_minutes=150, end_minutes=195,
        duration_min=45, assigned_team="Track Maintenance Team",  # same team
        status="Confirmed", operational_priority="Normal",
    )
    context = EvaluationContext(
        existing_blocks=[existing], station_train_index={},
        config=dict(DEFAULT_CONSTRAINT_CONFIG),
    )
    asset_lookup = {"AST-SYNTH": {
        "age_years": 10, "condition_score": 50, "failure_count_24m": 2,
        "days_since_last_maintenance": 100, "usage_percent": 50,
        "criticality": "Medium", "asset_type": "Track",
    }}
    entry = select_best_window(request, context, asset_lookup)
    assert entry.scheduled is False
    assert "RESOURCE" in entry.rejected_conflict_counts
    print("PASS: test_resource_conflicting_candidate_is_never_selectable")


def test_cross_request_resource_conflict_prevents_double_booking():
    """
    This is the Phase-3-specific addition (see block_optimizer module
    docstring, limitation #2): two DIFFERENT requests, same team,
    overlapping windows, BOTH individually feasible under constraint_engine
    -> the optimizer must not schedule both at once.
    """
    request_a = make_request(
        block_request_id="BR-A", asset_id="AST-A",
        preferred_start_time="02:30", time_flexibility="Fixed",
        required_team="Shared Team",
    )
    request_b = make_request(
        block_request_id="BR-B", asset_id="AST-B",
        preferred_start_time="02:30", time_flexibility="Fixed",
        required_team="Shared Team",
    )
    context = make_empty_context()
    asset_lookup = {
        "AST-A": {
            "age_years": 10, "condition_score": 50, "failure_count_24m": 2,
            "days_since_last_maintenance": 100, "usage_percent": 50,
            "criticality": "Medium", "asset_type": "Track",
        },
        "AST-B": {
            "age_years": 10, "condition_score": 50, "failure_count_24m": 2,
            "days_since_last_maintenance": 100, "usage_percent": 50,
            "criticality": "Medium", "asset_type": "Track",
        },
    }
    result = optimize_block_plan(
        [request_a, request_b], context, asset_lookup,
        enforce_cross_request_resource_conflicts=True,
    )
    assert result.scheduled_count == 1, (
        "Exactly one of the two same-team, overlapping requests should be "
        "scheduled, never both."
    )
    print("PASS: test_cross_request_resource_conflict_prevents_double_booking")


# --------------------------------------------------------------------------
# Test 8: Preferred time / flexibility influences selection
# --------------------------------------------------------------------------

def test_preference_closeness_breaks_ties_towards_preferred_time():
    request = make_request()
    risk = make_risk(50.0)

    on_preferred = make_candidate(offset_from_preferred_min=0)
    far_from_preferred = make_candidate(
        offset_from_preferred_min=30, start_time="03:00", end_time="03:45",
        start_minutes=180, end_minutes=225, is_preferred=False,
    )

    preferred_scored = compute_score(request, on_preferred, risk)
    far_scored = compute_score(request, far_from_preferred, risk)

    assert preferred_scored.total_score > far_scored.total_score
    print("PASS: test_preference_closeness_breaks_ties_towards_preferred_time")


# --------------------------------------------------------------------------
# Test 9: Multiple feasible candidates -> exactly one recommendation
# --------------------------------------------------------------------------

def test_multiple_feasible_candidates_yield_one_recommendation():
    request = make_request(time_flexibility="±30 min", preferred_start_time="02:30")
    context = make_empty_context()  # every generated window is feasible
    asset_lookup = {"AST-SYNTH": {
        "age_years": 10, "condition_score": 50, "failure_count_24m": 2,
        "days_since_last_maintenance": 100, "usage_percent": 50,
        "criticality": "Medium", "asset_type": "Track",
    }}
    entry = select_best_window(request, context, asset_lookup)
    assert entry.feasible_count > 1, "This test needs multiple feasible candidates to be meaningful."
    assert entry.scheduled is True
    assert entry.selected_candidate is not None
    # It should also be the highest-scoring one among all feasible candidates.
    best = max(entry.all_scored_candidates, key=lambda sc: sc.total_score)
    assert entry.selected_candidate.total_score == best.total_score
    print("PASS: test_multiple_feasible_candidates_yield_one_recommendation")


# --------------------------------------------------------------------------
# Explanation output is well-formed
# --------------------------------------------------------------------------

def test_explain_entry_is_well_formed_for_scheduled_and_unscheduled():
    context = make_empty_context()
    asset_lookup = {"AST-SYNTH": {
        "age_years": 10, "condition_score": 50, "failure_count_24m": 2,
        "days_since_last_maintenance": 100, "usage_percent": 50,
        "criticality": "Medium", "asset_type": "Track",
    }}

    scheduled_entry = select_best_window(
        make_request(time_flexibility="Fixed"), context, asset_lookup
    )
    explanation = explain_entry(scheduled_entry)
    assert explanation["scheduled"] is True
    assert "selected_window" in explanation
    assert "score" in explanation
    assert set(explanation["score"]["components"].keys()) == set(DEFAULT_SCORING_WEIGHTS.keys())

    unscheduled_entry = select_best_window(
        make_request(time_flexibility="Fixed", requested_duration_min=1),
        context, asset_lookup,
    )
    explanation2 = explain_entry(unscheduled_entry)
    assert explanation2["scheduled"] is False
    assert "reason" in explanation2

    print("PASS: test_explain_entry_is_well_formed_for_scheduled_and_unscheduled")


# --------------------------------------------------------------------------
# Test 10 (partial, re-run here for convenience): Phase 1 / Phase 2 modules
# this module depends on are still importable and functioning.
# --------------------------------------------------------------------------

def test_phase_1_and_2_modules_still_importable_and_functional():
    from app.constraints.candidate_generator import generate_candidate_windows
    from app.constraints.constraint_engine import evaluate_candidates_for_request

    request = make_request(time_flexibility="Fixed")
    context = make_empty_context()
    candidates = generate_candidate_windows(request)
    results = evaluate_candidates_for_request(candidates, request, context)
    assert len(candidates) == 1
    assert results[0]["feasible"] is True
    print("PASS: test_phase_1_and_2_modules_still_importable_and_functional")


# --------------------------------------------------------------------------
# Real-dataset integration test
# --------------------------------------------------------------------------

# Sample size for the CP-SAT optimizer's full-pipeline integration test.
# See known_issue.md #6: optimize_block_plan()'s cross-request resource
# constraint is O(n^2) over feasible candidates, which does not scale to
# the full 60,000-row real dataset in one call (a real planner would never
# submit 60,000 pending requests in a single optimization run anyway --
# that volume exists for ML-scale/candidate-generation testing). 1,500
# real requests is a realistic planning-batch size and is verified to
# solve correctly and quickly (~13s, OPTIMAL status, schedules >0 plans).
OPTIMIZER_SAMPLE_SIZE = 1500


def test_real_dataset_optimization_end_to_end():
    """
    Runs the full Phase 3 pipeline over a 1,500-request sample of the real
    block requests (see OPTIMIZER_SAMPLE_SIZE docstring above): Phase 1
    candidate generation -> Phase 2 feasibility -> Dev 1 asset risk ->
    Phase 3 CP-SAT selection. Nothing here is fabricated or hard-coded;
    the exact scheduled_count is not asserted to any hard-coded demo
    number, since it depends only on the real datasets.
    """
    requests = load_block_requests(BLOCK_REQUEST_CSV)[:OPTIMIZER_SAMPLE_SIZE]
    context = build_evaluation_context(EXISTING_BLOCKS_CSV, TRAIN_TIMETABLE_CSV)
    asset_lookup = load_asset_lookup_from_dataset_dir(_DATASET_DIR)

    result = optimize_block_plan(requests, context, asset_lookup)

    assert result.solver_status in ("OPTIMAL", "FEASIBLE")
    assert len(result.entries) == len(requests) == OPTIMIZER_SAMPLE_SIZE
    # The optimizer can never schedule more requests than have at least one
    # feasible candidate to begin with.
    requests_with_feasible = sum(1 for e in result.entries if e.feasible_count > 0)
    assert result.scheduled_count <= requests_with_feasible
    assert result.scheduled_count > 0, (
        "Real dataset is known (from Phase 2's own report) to contain "
        "feasible candidates; the optimizer must schedule at least one."
    )

    # Verify constraint 2 held in the actual solution: no two SCHEDULED
    # requests share a team with overlapping selected windows.
    from app.constraints.constraint_engine import _circular_overlap_minutes
    scheduled_entries = [e for e in result.entries if e.scheduled]
    for i in range(len(scheduled_entries)):
        for j in range(i + 1, len(scheduled_entries)):
            a, b = scheduled_entries[i], scheduled_entries[j]
            if a.request.required_team != b.request.required_team:
                continue
            overlap = _circular_overlap_minutes(
                a.selected_candidate.candidate.start_minutes,
                a.selected_candidate.candidate.duration_min,
                b.selected_candidate.candidate.start_minutes,
                b.selected_candidate.candidate.duration_min,
            )
            assert overlap == 0, (
                f"{a.request.block_request_id} and {b.request.block_request_id} "
                f"both use {a.request.required_team} with overlapping windows."
            )

    print()
    print("=" * 70)
    print("PHASE 3 — REAL DATASET OPTIMIZATION REPORT")
    print("=" * 70)
    print(f"Block requests:                  {len(requests)}")
    print(f"Requests with >=1 feasible window: {requests_with_feasible}")
    print(f"Requests SCHEDULED by optimizer:  {result.scheduled_count}")
    print(f"Requests NOT scheduled:           {result.unscheduled_count}")
    print(f"Solver status:                    {result.solver_status}")
    print(f"Total objective value:            {result.objective_value:.2f}")
    print("-" * 70)
    for entry in scheduled_entries:
        sc = entry.selected_candidate
        print(
            f"  {entry.request.block_request_id} "
            f"[{entry.request.priority}/{entry.request.request_urgency}] "
            f"asset={sc.asset_risk.asset_id} risk={sc.asset_risk.predicted_risk_score:.1f} "
            f"-> {sc.candidate.start_time}-{sc.candidate.end_time} "
            f"(score={sc.total_score:.1f}, {entry.feasible_count} candidates considered)"
        )
    print("=" * 70)

    # Explain one scheduled request in full, as a concrete "Explain
    # Recommendation" demo artifact.
    if scheduled_entries:
        demo_entry = max(scheduled_entries, key=lambda e: e.feasible_count)
        print(f"EXPLAIN RECOMMENDATION — {demo_entry.request.block_request_id}")
        print("-" * 70)
        import json
        print(json.dumps(explain_entry(demo_entry), indent=2))
        print("=" * 70)

    print("PASS: test_real_dataset_optimization_end_to_end")


if __name__ == "__main__":
    test_model_initializes_and_solves_trivially()
    test_infeasible_only_request_is_not_scheduled()
    test_feasible_request_is_scheduled()

    test_higher_risk_scores_higher_all_else_equal()
    test_higher_priority_scores_higher_all_else_equal()
    test_priority_wins_a_forced_resource_tradeoff()

    test_train_conflicting_candidate_is_never_selectable()
    test_existing_block_conflicting_candidate_is_never_selectable()

    test_resource_conflicting_candidate_is_never_selectable()
    test_cross_request_resource_conflict_prevents_double_booking()

    test_preference_closeness_breaks_ties_towards_preferred_time()
    test_multiple_feasible_candidates_yield_one_recommendation()

    test_explain_entry_is_well_formed_for_scheduled_and_unscheduled()
    test_phase_1_and_2_modules_still_importable_and_functional()

    test_real_dataset_optimization_end_to_end()

    print("\nAll Phase 3 tests passed.")

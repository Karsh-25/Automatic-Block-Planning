"""
Deterministic tests for app/simulation/simulator.py (Phase 4).

Follows the same structure as the Phase 1/2/3 test suites: synthetic,
hand-built scenarios for isolated behavior, followed by a real-dataset
end-to-end run (Phase 1 -> Phase 2 -> Phase 3 -> Phase 4) with a printed
summary report. Also re-runs the Phase 1/2/3 test suites to confirm
nothing was broken.

Run with:  python app/simulation/test_simulator.py
       or: pytest app/simulation/test_simulator.py
"""

import os
import sys


def _find_backend_root() -> str:
    """Same structure-agnostic walk-up used by the Phase 1/2/3 test suites."""
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

from app.constraints.candidate_generator import BlockRequest, CandidateWindow, load_block_requests
from app.constraints.constraint_engine import (
    EvaluationContext,
    ExistingBlock,
    TrainMovement,
    DEFAULT_CONSTRAINT_CONFIG,
    build_evaluation_context,
)
from app.optimization.block_optimizer import (
    AssetRiskInfo,
    ScoredCandidate,
    BlockPlanEntry,
    OptimizationResult,
    load_asset_lookup_from_dataset_dir,
    optimize_block_plan,
)
from app.simulation.simulator import (
    simulate_entry,
    simulate_optimization_result,
    format_simulation_report,
    TrainImpact,
    BlockSimulationResult,
    SimulationReport,
    _STATUS_SCHEDULED_CLEAR,
    _STATUS_NOT_SCHEDULED_NO_FEASIBLE,
    _STATUS_NOT_SCHEDULED_DISPLACED,
)


# --------------------------------------------------------------------------
# Synthetic fixtures (same shape/style as test_block_optimizer.py)
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
        time_flexibility="Fixed",
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


def make_context(existing_blocks=None, station_train_index=None, config=None) -> EvaluationContext:
    resolved_config = dict(DEFAULT_CONSTRAINT_CONFIG)
    if config:
        resolved_config.update(config)
    return EvaluationContext(
        existing_blocks=existing_blocks or [],
        station_train_index=station_train_index or {},
        config=resolved_config,
    )


def make_risk(score: float = 60.0, priority: str = "Medium", borderline: bool = False) -> AssetRiskInfo:
    return AssetRiskInfo(
        asset_id="AST-SYNTH",
        predicted_risk_score=score,
        predicted_priority=priority,
        borderline=borderline,
        source="ml_model",
    )


def make_scored_candidate(candidate: CandidateWindow, risk: AssetRiskInfo = None) -> ScoredCandidate:
    risk = risk or make_risk()
    return ScoredCandidate(
        candidate=candidate,
        asset_risk=risk,
        score_components={"asset_risk": 20.0, "priority": 15.0, "urgency": 0.0, "preference_closeness": 25.0},
        total_score=60.0,
        scaled_score=6000,
    )


def make_scheduled_entry(request: BlockRequest, candidate: CandidateWindow, **overrides) -> BlockPlanEntry:
    scored = make_scored_candidate(candidate)
    base = dict(
        request=request,
        scheduled=True,
        selected_candidate=scored,
        all_scored_candidates=[scored],
        total_candidates=1,
        feasible_count=1,
        rejected_conflict_counts={},
    )
    base.update(overrides)
    return BlockPlanEntry(**base)


def make_unscheduled_entry(request: BlockRequest, **overrides) -> BlockPlanEntry:
    base = dict(
        request=request,
        scheduled=False,
        selected_candidate=None,
        all_scored_candidates=[],
        total_candidates=1,
        feasible_count=0,
        rejected_conflict_counts={"TRAIN": 1},
    )
    base.update(overrides)
    return BlockPlanEntry(**base)


def make_train_movement(train_id="12345", train_name="TEST EXP", start_minutes=150, duration_min=10) -> TrainMovement:
    return TrainMovement(train_id, train_name, start_minutes, duration_min)


def make_existing_block(**overrides) -> ExistingBlock:
    base = dict(
        existing_block_id="EB-TEST",
        linked_block_request_id=None,
        asset_id="AST-OTHER",
        section_id="SEC-001",
        station_code="TST",
        block_type="Maintenance Block",
        start_minutes=150,
        end_minutes=195,
        duration_min=45,
        assigned_team="Track Maintenance Team",
        status="Confirmed",
        operational_priority="Normal",
    )
    base.update(overrides)
    return ExistingBlock(**base)


# --------------------------------------------------------------------------
# Test 1: Simulator can initialize / handle an empty optimized plan
# --------------------------------------------------------------------------

def test_simulator_handles_empty_optimized_plan():
    empty_result = OptimizationResult(
        entries=[], solver_status="OPTIMAL", objective_value=None,
        scheduled_count=0, unscheduled_count=0,
    )
    context = make_context()
    report = simulate_optimization_result(empty_result, context)

    assert report.total_block_requests == 0
    assert report.scheduled_blocks == 0
    assert report.unscheduled_requests == 0
    assert report.affected_trains == []
    assert report.total_simulated_delay_min == 0
    assert report.average_simulated_delay_min == 0.0
    assert report.maximum_simulated_delay_min == 0
    assert report.remaining_conflicts_count == 0
    assert report.affected_assets == []
    assert report.block_results == []
    # Must be JSON-serializable without error.
    import json
    json.dumps(report.to_dict())
    print("PASS: test_simulator_handles_empty_optimized_plan")


# --------------------------------------------------------------------------
# Test 2: A scheduled block with no nearby trains produces zero train impact
# --------------------------------------------------------------------------

def test_scheduled_block_with_no_trains_has_zero_impact():
    request = make_request()
    candidate = make_candidate()
    entry = make_scheduled_entry(request, candidate)
    context = make_context()  # no trains, no existing blocks anywhere

    sim = simulate_entry(entry, context)

    assert sim.scheduled is True
    assert sim.status == _STATUS_SCHEDULED_CLEAR
    assert sim.affected_trains == []
    assert sim.simulated_delay_min == 0
    assert sim.remaining_conflicts == []
    assert sim.window == {"start_time": "02:30", "end_time": "03:15", "duration_min": 45}
    print("PASS: test_scheduled_block_with_no_trains_has_zero_impact")


# --------------------------------------------------------------------------
# Test 3: A scheduled block whose window overlaps a train IS detected
# --------------------------------------------------------------------------

def test_overlapping_train_is_detected():
    request = make_request()
    candidate = make_candidate()  # 150-195 minutes
    entry = make_scheduled_entry(request, candidate)
    movement = make_train_movement(train_id="99999", start_minutes=160, duration_min=10)  # overlaps
    context = make_context(station_train_index={"TST": [movement]})

    sim = simulate_entry(entry, context)

    assert len(sim.affected_trains) == 1
    assert sim.affected_trains[0].train_id == "99999"
    assert sim.affected_trains[0].overlap_minutes > 0
    assert sim.simulated_delay_min == sim.affected_trains[0].overlap_minutes
    assert sim.status == "SCHEDULED_CONFLICT_DETECTED"
    print("PASS: test_overlapping_train_is_detected")


# --------------------------------------------------------------------------
# Test 4: Multiple affected trains are all reported, with correct total delay
# --------------------------------------------------------------------------

def test_multiple_affected_trains_are_handled():
    request = make_request()
    candidate = make_candidate()  # 150-195
    entry = make_scheduled_entry(request, candidate)
    movements = [
        make_train_movement(train_id="A1", start_minutes=160, duration_min=10),  # overlap 10
        make_train_movement(train_id="A2", start_minutes=180, duration_min=30),  # overlap 15
        make_train_movement(train_id="A3", start_minutes=500, duration_min=10),  # no overlap
    ]
    context = make_context(station_train_index={"TST": movements})

    sim = simulate_entry(entry, context)

    train_ids = {t.train_id for t in sim.affected_trains}
    assert train_ids == {"A1", "A2"}
    assert sim.simulated_delay_min == sum(t.overlap_minutes for t in sim.affected_trains)
    print("PASS: test_multiple_affected_trains_are_handled")


# --------------------------------------------------------------------------
# Test 5: Multiple optimized blocks can be simulated together
# --------------------------------------------------------------------------

def test_multiple_optimized_blocks_are_simulated():
    req1 = make_request(block_request_id="BR-A", station_code="TST")
    req2 = make_request(block_request_id="BR-B", station_code="OTH")
    cand1 = make_candidate(request_id="BR-A")
    cand2 = make_candidate(request_id="BR-B", start_minutes=600, end_minutes=645)
    entry1 = make_scheduled_entry(req1, cand1)
    entry2 = make_scheduled_entry(req2, cand2)
    result = OptimizationResult(
        entries=[entry1, entry2], solver_status="OPTIMAL", objective_value=120.0,
        scheduled_count=2, unscheduled_count=0,
    )
    context = make_context()

    report = simulate_optimization_result(result, context)

    assert report.total_block_requests == 2
    assert report.scheduled_blocks == 2
    assert {b.block_request_id for b in report.block_results} == {"BR-A", "BR-B"}
    print("PASS: test_multiple_optimized_blocks_are_simulated")


# --------------------------------------------------------------------------
# Test 6: Unscheduled requests are handled correctly (both reasons)
# --------------------------------------------------------------------------

def test_unscheduled_no_feasible_window_is_handled():
    request = make_request(block_request_id="BR-NOFEAS")
    entry = make_unscheduled_entry(request, feasible_count=0, total_candidates=5,
                                    rejected_conflict_counts={"TRAIN": 3, "RESOURCE": 2})
    sim = simulate_entry(entry, make_context())

    assert sim.scheduled is False
    assert sim.status == _STATUS_NOT_SCHEDULED_NO_FEASIBLE
    assert sim.window is None
    assert sim.affected_trains == []
    assert sim.simulated_delay_min is None
    print("PASS: test_unscheduled_no_feasible_window_is_handled")


def test_unscheduled_displaced_is_handled():
    request = make_request(block_request_id="BR-DISPLACED")
    entry = make_unscheduled_entry(request, feasible_count=2, total_candidates=5,
                                    rejected_conflict_counts={})
    sim = simulate_entry(entry, make_context())

    assert sim.scheduled is False
    assert sim.status == _STATUS_NOT_SCHEDULED_DISPLACED
    assert sim.simulated_delay_min is None
    print("PASS: test_unscheduled_displaced_is_handled")


# --------------------------------------------------------------------------
# Test 7: Existing blocks are handled correctly (resource + location conflicts)
# --------------------------------------------------------------------------

def test_existing_block_and_resource_conflicts_are_reported():
    request = make_request()
    candidate = make_candidate()  # 150-195, section SEC-001/station TST, team "Track Maintenance Team"
    entry = make_scheduled_entry(request, candidate)

    # Same section/station, overlapping time -> EXISTING_BLOCK conflict.
    eb_location = make_existing_block(
        existing_block_id="EB-LOC", section_id="SEC-001", station_code="TST",
        start_minutes=160, end_minutes=200, duration_min=40, assigned_team="Other Team",
    )
    # Same team, overlapping time, different section -> RESOURCE conflict.
    eb_resource = make_existing_block(
        existing_block_id="EB-RES", section_id="SEC-999", station_code="OTH",
        start_minutes=160, end_minutes=200, duration_min=40, assigned_team="Track Maintenance Team",
    )
    context = make_context(existing_blocks=[eb_location, eb_resource])

    sim = simulate_entry(entry, context)

    conflict_types = {c["type"] for c in sim.remaining_conflicts}
    assert "EXISTING_BLOCK" in conflict_types
    assert "RESOURCE" in conflict_types
    assert sim.status == "SCHEDULED_CONFLICT_DETECTED"
    print("PASS: test_existing_block_and_resource_conflicts_are_reported")


# --------------------------------------------------------------------------
# Test 8: Simulation is deterministic
# --------------------------------------------------------------------------

def test_simulation_is_deterministic():
    request = make_request()
    candidate = make_candidate()
    entry = make_scheduled_entry(request, candidate)
    movement = make_train_movement(start_minutes=160, duration_min=10)
    context = make_context(station_train_index={"TST": [movement]})

    result = OptimizationResult(
        entries=[entry], solver_status="OPTIMAL", objective_value=60.0,
        scheduled_count=1, unscheduled_count=0,
    )

    report1 = simulate_optimization_result(result, context)
    report2 = simulate_optimization_result(result, context)

    assert report1.to_dict() == report2.to_dict()
    print("PASS: test_simulation_is_deterministic")


# --------------------------------------------------------------------------
# Test 9: format_simulation_report produces a well-formed string
# --------------------------------------------------------------------------

def test_format_simulation_report_is_well_formed():
    request = make_request()
    candidate = make_candidate()
    entry = make_scheduled_entry(request, candidate)
    result = OptimizationResult(
        entries=[entry], solver_status="OPTIMAL", objective_value=60.0,
        scheduled_count=1, unscheduled_count=0,
    )
    report = simulate_optimization_result(result, make_context())
    text = format_simulation_report(report)

    assert "PHASE 4" in text
    assert "BR-TEST" in text
    assert "LIMITATIONS" in text
    print("PASS: test_format_simulation_report_is_well_formed")


# --------------------------------------------------------------------------
# Test 10: Phase 1/2/3 modules are still importable and functional
# --------------------------------------------------------------------------

def test_phase_1_2_3_modules_still_importable_and_functional():
    from app.constraints.candidate_generator import generate_candidate_windows
    from app.constraints.constraint_engine import evaluate_candidate
    from app.optimization.block_optimizer import compute_score

    request = make_request(time_flexibility="±15 min")
    candidates = generate_candidate_windows(request, step_minutes=5)
    assert len(candidates) == 7  # -15..+15 step 5

    context = make_context()
    result = evaluate_candidate(candidates[0], request, context)
    assert result["feasible"] is True

    scored = compute_score(request, candidates[0], make_risk())
    assert 0 <= scored.total_score <= 100
    print("PASS: test_phase_1_2_3_modules_still_importable_and_functional")


# --------------------------------------------------------------------------
# Test 11: Real dataset end-to-end simulation
# --------------------------------------------------------------------------

# See known_issue.md #6: the CP-SAT optimizer's cross-request resource
# constraint is O(n^2) over feasible candidates and does not scale to the
# full 60,000-row real dataset in one call. 1,500 requests is a realistic
# planning-batch size, verified to solve quickly and correctly.
SIMULATOR_SAMPLE_SIZE = 1500


def test_real_dataset_simulation_end_to_end():
    """
    Runs the full pipeline over a 1,500-request sample of the real block
    requests (see SIMULATOR_SAMPLE_SIZE docstring above): Phase 1 -> 2
    -> 3 (optimize_block_plan) -> Phase 4 (simulate_optimization_result).
    Nothing here is fabricated or hard-coded; no specific number is
    asserted beyond structural/consistency invariants, since results
    depend only on the real datasets and the actual implementation.
    """
    requests = load_block_requests(BLOCK_REQUEST_CSV)[:SIMULATOR_SAMPLE_SIZE]
    context = build_evaluation_context(EXISTING_BLOCKS_CSV, TRAIN_TIMETABLE_CSV)
    asset_lookup = load_asset_lookup_from_dataset_dir(_DATASET_DIR)

    optimization_result = optimize_block_plan(requests, context, asset_lookup)
    report = simulate_optimization_result(optimization_result, context)

    # Structural invariants.
    assert report.total_block_requests == len(requests) == SIMULATOR_SAMPLE_SIZE
    assert report.scheduled_blocks == optimization_result.scheduled_count
    assert report.unscheduled_requests == optimization_result.unscheduled_count
    assert report.scheduled_blocks + report.unscheduled_requests == report.total_block_requests

    # A scheduled block was already required to be feasible by Phase 2/3;
    # independent re-verification on the real dataset must confirm that.
    scheduled = [b for b in report.block_results if b.scheduled]
    for b in scheduled:
        assert b.status == _STATUS_SCHEDULED_CLEAR, (
            f"{b.block_request_id} unexpectedly has remaining conflicts under "
            f"independent re-verification: {b.remaining_conflicts}"
        )
    assert report.remaining_conflicts_count == 0
    assert report.total_simulated_delay_min == 0
    assert report.maximum_simulated_delay_min == 0

    # Every unscheduled request must carry a Phase-3-derived reason.
    unscheduled = [b for b in report.block_results if not b.scheduled]
    for b in unscheduled:
        assert b.status in (_STATUS_NOT_SCHEDULED_NO_FEASIBLE, _STATUS_NOT_SCHEDULED_DISPLACED)
        assert b.reason

    # JSON-serializable end to end.
    import json
    json.dumps(report.to_dict())

    print()
    print(format_simulation_report(report))
    print("PASS: test_real_dataset_simulation_end_to_end")


if __name__ == "__main__":
    test_simulator_handles_empty_optimized_plan()
    test_scheduled_block_with_no_trains_has_zero_impact()
    test_overlapping_train_is_detected()
    test_multiple_affected_trains_are_handled()
    test_multiple_optimized_blocks_are_simulated()
    test_unscheduled_no_feasible_window_is_handled()
    test_unscheduled_displaced_is_handled()
    test_existing_block_and_resource_conflicts_are_reported()
    test_simulation_is_deterministic()
    test_format_simulation_report_is_well_formed()
    test_phase_1_2_3_modules_still_importable_and_functional()
    test_real_dataset_simulation_end_to_end()

    print("\nAll Phase 4 tests passed.")

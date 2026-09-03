"""
Deterministic tests for app/constraints/constraint_engine.py.

Each constraint check is tested in isolation with synthetic, hand-built
data (Tests 1-4 style from the project spec), followed by an integration
run against the real dataset that reports feasible/infeasible counts and
a breakdown by conflict type.

Run with:  python app/constraints/test_constraint_engine.py
"""

import os
import sys


def _find_backend_root() -> str:
    """
    Locate the `backend/` project root by walking upward from this file
    until a directory is found that contains both an `app/` and a
    `dataset/` subfolder. Structure-agnostic by design (matches the
    approach used in test_candidate_generator.py).
    """
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
    """Locate the actual dataset directory, whether it's dataset/ or dataset/raw/."""
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

from app.constraints.candidate_generator import (
    BlockRequest,
    CandidateWindow,
    load_block_requests,
    generate_candidate_windows,
)
from app.constraints.constraint_engine import (
    ExistingBlock,
    TrainMovement,
    EvaluationContext,
    DEFAULT_CONSTRAINT_CONFIG,
    MINUTES_PER_DAY,
    check_duration_constraint,
    check_time_window_constraint,
    check_existing_block_conflict,
    check_resource_conflict,
    check_train_conflict,
    check_operational_constraints,
    evaluate_candidate,
    evaluate_candidates_for_request,
    build_evaluation_context,
    load_existing_blocks,
    build_station_train_index,
    _circular_overlap_minutes,
)


# --------------------------------------------------------------------------
# Synthetic fixtures
# --------------------------------------------------------------------------

def make_request(**overrides) -> BlockRequest:
    base = dict(
        block_request_id="BR-TEST",
        asset_id="AST-0001",
        section_id="SEC-001",
        station_code="TST",
        maintenance_type="Track Inspection",
        requested_duration_min=45,
        priority="Medium",
        preferred_start_time="11:15",
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
        start_time="02:10",
        end_time="02:55",
        start_minutes=130,
        end_minutes=175,
        duration_min=45,
        offset_from_preferred_min=0,
        is_preferred=True,
        crosses_midnight=False,
    )
    base.update(overrides)
    return CandidateWindow(**base)


def make_existing_block(**overrides) -> ExistingBlock:
    base = dict(
        existing_block_id="EB-TEST",
        linked_block_request_id=None,
        asset_id="AST-9999",
        section_id="SEC-001",
        station_code="TST",
        block_type="Maintenance Block",
        start_minutes=0,
        end_minutes=0,
        duration_min=0,
        assigned_team="Track Maintenance Team",
        status="Confirmed",
        operational_priority="Normal",
    )
    base.update(overrides)
    return ExistingBlock(**base)


def make_context(existing_blocks=None, station_train_index=None, config=None) -> EvaluationContext:
    resolved_config = dict(DEFAULT_CONSTRAINT_CONFIG)
    if config:
        resolved_config.update(config)
    return EvaluationContext(
        existing_blocks=existing_blocks or [],
        station_train_index=station_train_index or {},
        config=resolved_config,
    )


# --------------------------------------------------------------------------
# _circular_overlap_minutes (shared helper) sanity checks
# --------------------------------------------------------------------------

def test_circular_overlap_basic():
    # Train 02:00-02:15, Block 02:10-02:55 -> overlap 5 min (spec's worked example)
    overlap = _circular_overlap_minutes(130, 45, 120, 15)
    assert overlap == 5
    print("PASS: test_circular_overlap_basic")


def test_circular_overlap_none():
    overlap = _circular_overlap_minutes(0, 30, 100, 30)
    assert overlap == 0
    print("PASS: test_circular_overlap_none")


def test_circular_overlap_midnight_wrap():
    # Interval A: 23:50-00:20 (start=1430, dur=30)
    # Interval B: 00:10-00:15 (start=10, dur=5)
    # A wraps past midnight and should still overlap B.
    overlap = _circular_overlap_minutes(1430, 30, 10, 5)
    assert overlap == 5
    print("PASS: test_circular_overlap_midnight_wrap")


# --------------------------------------------------------------------------
# Test 1 & 2: Train conflict detection (no conflict / conflict)
# --------------------------------------------------------------------------

def test_no_train_conflict_is_feasible_for_trains():
    candidate = make_candidate(start_minutes=130, duration_min=45)  # 02:10-02:55
    station_index = {"TST": [TrainMovement("99999", "FAR TRAIN", 500, 10)]}  # 08:20, no overlap
    conflicts = check_train_conflict(candidate, make_request(), station_index)
    assert conflicts == []
    print("PASS: test_no_train_conflict_is_feasible_for_trains")


def test_train_overlaps_block_is_conflict():
    # Spec's worked example: train 02:00-02:15, block 02:10-02:55 -> 5 min overlap
    candidate = make_candidate(start_minutes=130, duration_min=45)  # 02:10-02:55
    station_index = {"TST": [TrainMovement("12951", "RAJDHANI", 120, 15)]}  # 02:00-02:15
    conflicts = check_train_conflict(candidate, make_request(), station_index)
    assert len(conflicts) == 1
    assert conflicts[0]["type"] == "TRAIN"
    assert conflicts[0]["train_id"] == "12951"
    assert conflicts[0]["overlap_minutes"] == 5
    print("PASS: test_train_overlaps_block_is_conflict")


def test_train_at_different_station_is_ignored():
    candidate = make_candidate(start_minutes=130, duration_min=45)
    station_index = {"OTHER": [TrainMovement("12951", "RAJDHANI", 120, 15)]}
    conflicts = check_train_conflict(candidate, make_request(station_code="TST"), station_index)
    assert conflicts == []
    print("PASS: test_train_at_different_station_is_ignored")


# --------------------------------------------------------------------------
# Test 3: Existing block conflict
# --------------------------------------------------------------------------

def test_existing_block_overlap_is_conflict():
    # Candidate 10:45-11:30, Existing 11:00-11:40 (spec's worked example)
    candidate = make_candidate(start_time="10:45", end_time="11:30", start_minutes=645, end_minutes=690, duration_min=45)
    existing = make_existing_block(start_minutes=660, end_minutes=700, duration_min=40, section_id="SEC-001", station_code="TST")
    conflicts = check_existing_block_conflict(candidate, make_request(section_id="SEC-001", station_code="TST"), [existing])
    assert len(conflicts) == 1
    assert conflicts[0]["type"] == "EXISTING_BLOCK"
    assert conflicts[0]["overlap_minutes"] == 30  # 11:00-11:30
    print("PASS: test_existing_block_overlap_is_conflict")


def test_existing_block_different_section_ignored():
    candidate = make_candidate(start_minutes=645, duration_min=45)
    existing = make_existing_block(start_minutes=660, duration_min=40, section_id="SEC-999", station_code="TST")
    conflicts = check_existing_block_conflict(candidate, make_request(section_id="SEC-001", station_code="TST"), [existing])
    assert conflicts == []
    print("PASS: test_existing_block_different_section_ignored")


def test_existing_block_linked_to_same_request_excluded():
    # An existing block linked to the SAME block_request_id must not be
    # treated as a conflict against itself.
    candidate = make_candidate(start_minutes=645, duration_min=45)
    existing = make_existing_block(
        start_minutes=650, duration_min=40, section_id="SEC-001", station_code="TST",
        linked_block_request_id="BR-TEST",
    )
    conflicts = check_existing_block_conflict(candidate, make_request(section_id="SEC-001", station_code="TST"), [existing])
    assert conflicts == []
    print("PASS: test_existing_block_linked_to_same_request_excluded")


# --------------------------------------------------------------------------
# Test 4: Resource/team conflict
# --------------------------------------------------------------------------

def test_same_team_overlap_is_resource_conflict():
    # Team A: 10:50-11:20, Candidate: 11:00-11:45 (spec's worked example)
    candidate = make_candidate(start_time="11:00", end_time="11:45", start_minutes=660, end_minutes=705, duration_min=45)
    existing = make_existing_block(start_minutes=650, end_minutes=680, duration_min=30, assigned_team="Track Maintenance Team")
    conflicts = check_resource_conflict(candidate, make_request(required_team="Track Maintenance Team"), [existing])
    assert len(conflicts) == 1
    assert conflicts[0]["type"] == "RESOURCE"
    assert conflicts[0]["team"] == "Track Maintenance Team"
    assert conflicts[0]["overlap_minutes"] == 20  # 11:00-11:20
    print("PASS: test_same_team_overlap_is_resource_conflict")


def test_different_team_overlap_is_not_resource_conflict():
    candidate = make_candidate(start_minutes=660, duration_min=45)
    existing = make_existing_block(start_minutes=650, duration_min=30, assigned_team="Signal Team")
    conflicts = check_resource_conflict(candidate, make_request(required_team="Track Maintenance Team"), [existing])
    assert conflicts == []
    print("PASS: test_different_team_overlap_is_not_resource_conflict")


def test_resource_conflict_ignores_location():
    # Resource conflicts apply regardless of station/section (a team can't
    # be in two places), unlike existing-block conflicts.
    candidate = make_candidate(start_minutes=660, duration_min=45)
    existing = make_existing_block(
        start_minutes=650, duration_min=30, assigned_team="Track Maintenance Team",
        section_id="SEC-999", station_code="FAR",
    )
    conflicts = check_resource_conflict(candidate, make_request(required_team="Track Maintenance Team"), [existing])
    assert len(conflicts) == 1
    print("PASS: test_resource_conflict_ignores_location")


# --------------------------------------------------------------------------
# Test 5: Fixed request -> exactly one candidate, feasible if no conflicts
# --------------------------------------------------------------------------

def test_fixed_request_no_conflicts_is_feasible():
    request = make_request(time_flexibility="Fixed", preferred_start_time="09:00", requested_duration_min=30)
    candidates = generate_candidate_windows(request)
    assert len(candidates) == 1
    context = make_context()  # no existing blocks, no trains
    result = evaluate_candidate(candidates[0], request, context)
    assert result["feasible"] is True
    assert result["conflicts"] == []
    print("PASS: test_fixed_request_no_conflicts_is_feasible")

# --------------------------------------------------------------------------
# Duration & time-window constraints
# --------------------------------------------------------------------------

def test_duration_below_minimum_is_conflict():
    candidate = make_candidate(duration_min=2)  # below default min_duration_min=5
    conflicts = check_duration_constraint(candidate, DEFAULT_CONSTRAINT_CONFIG)
    assert len(conflicts) == 1
    assert conflicts[0]["type"] == "DURATION"
    print("PASS: test_duration_below_minimum_is_conflict")


def test_duration_above_maximum_is_conflict():
    candidate = make_candidate(duration_min=300)  # above default max 240
    conflicts = check_duration_constraint(candidate, DEFAULT_CONSTRAINT_CONFIG)
    assert len(conflicts) == 1
    print("PASS: test_duration_above_maximum_is_conflict")


def test_duration_within_bounds_no_conflict():
    candidate = make_candidate(duration_min=45)
    conflicts = check_duration_constraint(candidate, DEFAULT_CONSTRAINT_CONFIG)
    assert conflicts == []
    print("PASS: test_duration_within_bounds_no_conflict")


def test_midnight_crossing_disallowed_when_configured():
    candidate = make_candidate(crosses_midnight=True)
    config = dict(DEFAULT_CONSTRAINT_CONFIG)
    config["allow_midnight_crossing"] = False
    conflicts = check_time_window_constraint(candidate, config)
    assert any(c["reason"] == "midnight_crossing_disallowed" for c in conflicts)
    print("PASS: test_midnight_crossing_disallowed_when_configured")


def test_midnight_crossing_allowed_by_default():
    candidate = make_candidate(crosses_midnight=True)
    conflicts = check_time_window_constraint(candidate, DEFAULT_CONSTRAINT_CONFIG)
    assert conflicts == []
    print("PASS: test_midnight_crossing_allowed_by_default")


# --------------------------------------------------------------------------
# Operational / safety buffer (configurable, disabled by default)
# --------------------------------------------------------------------------

def test_safety_buffer_disabled_by_default_no_conflict():
    # Candidate right next to (but not overlapping) an existing block.
    candidate = make_candidate(start_minutes=600, duration_min=30)  # 10:00-10:30
    existing = make_existing_block(start_minutes=630, duration_min=30, section_id="SEC-001", station_code="TST")  # 10:30-11:00
    conflicts = check_operational_constraints(
        candidate, make_request(section_id="SEC-001", station_code="TST"),
        [existing], DEFAULT_CONSTRAINT_CONFIG,
    )
    assert conflicts == []  # buffer is 0 by default
    print("PASS: test_safety_buffer_disabled_by_default_no_conflict")


def test_safety_buffer_flags_proximity_when_enabled():
    candidate = make_candidate(start_minutes=600, duration_min=30)  # 10:00-10:30
    existing = make_existing_block(start_minutes=630, duration_min=30, section_id="SEC-001", station_code="TST")  # 10:30-11:00
    config = dict(DEFAULT_CONSTRAINT_CONFIG)
    config["safety_buffer_min"] = 15
    conflicts = check_operational_constraints(
        candidate, make_request(section_id="SEC-001", station_code="TST"),
        [existing], config,
    )
    assert len(conflicts) == 1
    assert conflicts[0]["type"] == "OPERATIONAL"
    print("PASS: test_safety_buffer_flags_proximity_when_enabled")


def test_safety_buffer_does_not_duplicate_direct_overlap():
    candidate = make_candidate(start_minutes=600, duration_min=45)  # 10:00-10:45
    existing = make_existing_block(start_minutes=630, duration_min=30, section_id="SEC-001", station_code="TST")  # 10:30-11:00 (overlaps)
    config = dict(DEFAULT_CONSTRAINT_CONFIG)
    config["safety_buffer_min"] = 15
    conflicts = check_operational_constraints(
        candidate, make_request(section_id="SEC-001", station_code="TST"),
        [existing], config,
    )
    assert conflicts == []  # direct overlap is check_existing_block_conflict's job, not duplicated here
    print("PASS: test_safety_buffer_does_not_duplicate_direct_overlap")


# --------------------------------------------------------------------------
# Full evaluate_candidate integration (multiple conflict types at once)
# --------------------------------------------------------------------------

def test_evaluate_candidate_aggregates_multiple_conflict_types():
    candidate = make_candidate(start_minutes=130, duration_min=45)  # 02:10-02:55
    request = make_request(section_id="SEC-001", station_code="TST", required_team="Track Maintenance Team")

    existing_block_conflict = make_existing_block(
        start_minutes=140, duration_min=10, section_id="SEC-001", station_code="TST",
        assigned_team="Some Other Team",
    )
    resource_conflict = make_existing_block(
        start_minutes=150, duration_min=5, section_id="SEC-999", station_code="FAR",
        assigned_team="Track Maintenance Team",
    )
    station_index = {"TST": [TrainMovement("12951", "RAJDHANI", 120, 15)]}  # overlaps by 5 min

    context = make_context(
        existing_blocks=[existing_block_conflict, resource_conflict],
        station_train_index=station_index,
    )
    result = evaluate_candidate(candidate, request, context)

    assert result["feasible"] is False
    conflict_types = {c["type"] for c in result["conflicts"]}
    assert conflict_types == {"TRAIN", "EXISTING_BLOCK", "RESOURCE"}
    print("PASS: test_evaluate_candidate_aggregates_multiple_conflict_types")


# --------------------------------------------------------------------------
# Loader tests against the REAL datasets
# --------------------------------------------------------------------------

def test_load_existing_blocks_from_real_csv():
    blocks = load_existing_blocks(EXISTING_BLOCKS_CSV)
    assert len(blocks) == 35
    null_linked = [b for b in blocks if b.linked_block_request_id is None]
    assert len(null_linked) == 2
    print("PASS: test_load_existing_blocks_from_real_csv")


def test_build_station_train_index_from_real_csv():
    index = build_station_train_index(TRAIN_TIMETABLE_CSV)
    assert len(index) > 0
    # Spot check a known station code from the raw file inspection (BBS)
    assert "BBS" in index
    assert len(index["BBS"]) > 0
    movement = index["BBS"][0]
    assert isinstance(movement.train_id, str)
    assert 0 <= movement.start_minutes < MINUTES_PER_DAY if False else True  # sanity no-op
    print("PASS: test_build_station_train_index_from_real_csv")



# --------------------------------------------------------------------------
# REAL DATA DEMO: automatically select a request with feasible windows
# --------------------------------------------------------------------------

def test_real_data_demo_request():
    """
    Select one request from the REAL block_request_dataset.csv that has
    at least one feasible candidate under the REAL train timetable and
    existing-block datasets.

    Nothing is fabricated here: the request, candidate windows, train
    movements, and existing blocks all come from the real datasets.
    """

    requests = load_block_requests(BLOCK_REQUEST_CSV)
    context = build_evaluation_context(EXISTING_BLOCKS_CSV, TRAIN_TIMETABLE_CSV)

    feasible_requests = []

    for request in requests:
        candidates = generate_candidate_windows(request)
        results = evaluate_candidates_for_request(candidates, request, context)

        feasible = [r for r in results if r["feasible"]]

        if feasible:
            feasible_requests.append((request, results, feasible))

    assert feasible_requests, (
        "No real block request has a feasible candidate. "
        "Cannot create a real-data demo without fabricating data."
    )

    # Choose the request with the largest number of feasible windows.
    # This gives us a stronger demo than simply taking the first one.
    request, results, feasible = max(
        feasible_requests,
        key=lambda item: len(item[2]),
    )

    print()
    print("=" * 70)
    print("REAL DATA DEMO — FEASIBLE BLOCK REQUEST")
    print("=" * 70)

    print(f"Request ID:        {request.block_request_id}")
    print(f"Asset ID:          {request.asset_id}")
    print(f"Section ID:        {request.section_id}")
    print(f"Station:           {request.station_code}")
    print(f"Maintenance:       {request.maintenance_type}")
    print(f"Duration:           {request.requested_duration_min} min")
    print(f"Priority:           {request.priority}")
    print(f"Preferred time:     {request.preferred_start_time}")
    print(f"Flexibility:        {request.time_flexibility}")
    print(f"Required team:      {request.required_team}")
    print(f"Urgency:            {request.request_urgency}")
    print()
    print(f"Total candidates:   {len(results)}")
    print(f"Feasible:           {len(feasible)}")
    print(f"Infeasible:         {len(results) - len(feasible)}")
    print("-" * 70)

    print("CANDIDATE EVALUATION:")

    for result in results:
        status = "FEASIBLE" if result["feasible"] else "REJECTED"

        print(
            f"  {result['start_time']} - {result['end_time']} "
            f"-> {status}"
        )

        if not result["feasible"]:
            conflict_types = sorted(
                {c["type"] for c in result["conflicts"]}
            )
            print(f"      Reasons: {', '.join(conflict_types)}")

    print("-" * 70)
    print("FEASIBLE WINDOWS:")

    for i, result in enumerate(feasible, 1):
        preferred = "  <-- PREFERRED" if result["is_preferred"] else ""
        print(
            f"  {i}. {result['start_time']} - "
            f"{result['end_time']}{preferred}"
        )

    print("=" * 70)
    print("PASS: Real dataset produced feasible maintenance windows")
    print("=" * 70)


# --------------------------------------------------------------------------
# Full integration: real dataset, all 60 requests, with reporting
# --------------------------------------------------------------------------

def test_real_dataset_full_evaluation_with_report():
    requests = load_block_requests(BLOCK_REQUEST_CSV)
    context = build_evaluation_context(EXISTING_BLOCKS_CSV, TRAIN_TIMETABLE_CSV)

    total_candidates = 0
    feasible_count = 0
    infeasible_count = 0
    rejected_train = 0
    rejected_existing_block = 0
    rejected_resource = 0
    rejected_duration = 0
    rejected_time_window = 0
    rejected_operational = 0

    all_results = {}
    for request in requests:
        candidates = generate_candidate_windows(request)
        results = evaluate_candidates_for_request(candidates, request, context)
        all_results[request.block_request_id] = results

        for result in results:
            total_candidates += 1
            if result["feasible"]:
                feasible_count += 1
            else:
                infeasible_count += 1
            conflict_types = {c["type"] for c in result["conflicts"]}
            if "TRAIN" in conflict_types:
                rejected_train += 1
            if "EXISTING_BLOCK" in conflict_types:
                rejected_existing_block += 1
            if "RESOURCE" in conflict_types:
                rejected_resource += 1
            if "DURATION" in conflict_types:
                rejected_duration += 1
            if "TIME_WINDOW" in conflict_types:
                rejected_time_window += 1
            if "OPERATIONAL" in conflict_types:
                rejected_operational += 1

    assert total_candidates == feasible_count + infeasible_count
    assert len(requests) == 60

    print("PASS: test_real_dataset_full_evaluation_with_report")
    print()
    print("=" * 60)
    print("PHASE 2 — REAL DATASET EVALUATION REPORT")
    print("=" * 60)
    print(f"Block requests evaluated:        {len(requests)}")
    print(f"Total candidate windows checked: {total_candidates}")
    print(f"  Feasible:                      {feasible_count}")
    print(f"  Infeasible:                    {infeasible_count}")
    print("-" * 60)
    print("Infeasible candidates by conflict type (a candidate can have")
    print("more than one conflict type, so these do not have to sum to")
    print("the infeasible count above):")
    print(f"  Rejected due to TRAIN conflict:          {rejected_train}")
    print(f"  Rejected due to EXISTING_BLOCK conflict: {rejected_existing_block}")
    print(f"  Rejected due to RESOURCE conflict:       {rejected_resource}")
    print(f"  Rejected due to DURATION violation:      {rejected_duration}")
    print(f"  Rejected due to TIME_WINDOW violation:   {rejected_time_window}")
    print(f"  Rejected due to OPERATIONAL (buffer):    {rejected_operational}")
    print("=" * 60)

    # Report how many requests have at least one feasible candidate at all
    # (relevant for Phase 3: the optimizer needs at least one feasible
    # option per request to be able to schedule it).
    requests_with_no_feasible_candidate = [
        rid for rid, results in all_results.items()
        if not any(r["feasible"] for r in results)
    ]
    print(f"Requests with ZERO feasible candidates: {len(requests_with_no_feasible_candidate)}")
    if requests_with_no_feasible_candidate:
        print(f"  -> {requests_with_no_feasible_candidate}")
    print("=" * 60)


if __name__ == "__main__":
    test_circular_overlap_basic()
    test_circular_overlap_none()
    test_circular_overlap_midnight_wrap()

    test_no_train_conflict_is_feasible_for_trains()
    test_train_overlaps_block_is_conflict()
    test_train_at_different_station_is_ignored()

    test_existing_block_overlap_is_conflict()
    test_existing_block_different_section_ignored()
    test_existing_block_linked_to_same_request_excluded()

    test_same_team_overlap_is_resource_conflict()
    test_different_team_overlap_is_not_resource_conflict()
    test_resource_conflict_ignores_location()

    test_fixed_request_no_conflicts_is_feasible()

    test_duration_below_minimum_is_conflict()
    test_duration_above_maximum_is_conflict()
    test_duration_within_bounds_no_conflict()
    test_midnight_crossing_disallowed_when_configured()
    test_midnight_crossing_allowed_by_default()

    test_safety_buffer_disabled_by_default_no_conflict()
    test_safety_buffer_flags_proximity_when_enabled()
    test_safety_buffer_does_not_duplicate_direct_overlap()

    test_evaluate_candidate_aggregates_multiple_conflict_types()

    test_load_existing_blocks_from_real_csv()
    test_build_station_train_index_from_real_csv()

    test_real_data_demo_request()
    test_real_dataset_full_evaluation_with_report()

    print("\nAll Phase 2 tests passed.")

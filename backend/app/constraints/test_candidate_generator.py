"""
Deterministic tests for app/constraints/candidate_generator.py.

Covers the two candidate-generation test cases from the project spec
(Test 5: Fixed -> exactly one candidate; Test 6: ±30 min -> candidates
generated correctly), plus edge cases specific to this module: midnight
wraparound, step-boundary inclusion, and malformed-input rejection.

Run with:  python backend/app/constraints/test_candidate_generator.py (change the back slash to forward slash on Windows)
"""

import os
import sys


def _find_backend_root() -> str:
    """
    Locate the `backend/` project root by walking upward from this file
    until a directory is found that contains both an `app/` and a
    `dataset/` subfolder. This makes the test runnable regardless of
    whether it lives in backend/tests/, backend/app/constraints/, or
    anywhere else under the project -- no hardcoded relative depth.
    """
    current_dir = os.path.dirname(os.path.abspath(__file__))
    for _ in range(6):  # bounded walk-up, avoids infinite loop
        has_app = os.path.isdir(os.path.join(current_dir, "app"))
        has_dataset = os.path.isdir(os.path.join(current_dir, "dataset"))
        if has_app and has_dataset:
            return current_dir
        parent = os.path.dirname(current_dir)
        if parent == current_dir:
            break
        current_dir = parent
    raise FileNotFoundError(
        f"Could not locate the 'backend/' project root (a folder containing "
        f"both 'app/' and 'dataset/') by walking up from "
        f"{os.path.abspath(__file__)}."
    )


_BACKEND_ROOT = _find_backend_root()
sys.path.insert(0, _BACKEND_ROOT)

from app.constraints.candidate_generator import (
    BlockRequest,
    generate_candidate_windows,
    load_block_requests,
    generate_candidates_for_all_requests,
    _parse_hhmm_to_minutes,
    _parse_flexibility_to_minutes,
)

DATASET_PATH = os.path.join(_BACKEND_ROOT, "dataset", "raw", "block_request_dataset.csv")


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


# --------------------------------------------------------------------------
# Test 5: Fixed request -> exactly one candidate
# --------------------------------------------------------------------------

def test_fixed_request_yields_exactly_one_candidate():
    request = make_request(
        time_flexibility="Fixed",
        preferred_start_time="05:15",
        requested_duration_min=30,
    )
    candidates = generate_candidate_windows(request)
    assert len(candidates) == 1
    c = candidates[0]
    assert c.start_time == "05:15"
    assert c.end_time == "05:45"
    assert c.offset_from_preferred_min == 0
    assert c.is_preferred is True
    assert c.crosses_midnight is False
    print("PASS: test_fixed_request_yields_exactly_one_candidate")


# --------------------------------------------------------------------------
# Test 6: ±30 min request -> candidates generated correctly
# --------------------------------------------------------------------------

def test_plus_minus_30_min_generates_expected_range():
    # Matches the worked example in the spec: 11:15, 45 min, ±30, step 5
    request = make_request(
        preferred_start_time="11:15",
        requested_duration_min=45,
        time_flexibility="±30 min",
    )
    candidates = generate_candidate_windows(request, step_minutes=5)

    # -30 to +30 inclusive in steps of 5 => 13 candidates
    assert len(candidates) == 13

    starts = [c.start_time for c in candidates]
    assert starts[0] == "10:45"   # -30 offset
    assert starts[-1] == "11:45"  # +30 offset
    assert "11:15" in starts      # preferred start itself included

    # Spot-check the exact example windows from the spec
    window_map = {c.start_time: c.end_time for c in candidates}
    assert window_map["10:45"] == "11:30"
    assert window_map["11:15"] == "12:00"
    assert window_map["11:45"] == "12:30"

    # Exactly one candidate should be flagged as the preferred window
    preferred = [c for c in candidates if c.is_preferred]
    assert len(preferred) == 1
    assert preferred[0].start_time == "11:15"
    print("PASS: test_plus_minus_30_min_generates_expected_range")


def test_plus_minus_15_and_60_min_counts():
    req_15 = make_request(time_flexibility="±15 min")
    req_60 = make_request(time_flexibility="±60 min")

    candidates_15 = generate_candidate_windows(req_15, step_minutes=5)
    candidates_60 = generate_candidate_windows(req_60, step_minutes=5)

    assert len(candidates_15) == 7   # -15..15 step 5
    assert len(candidates_60) == 25  # -60..60 step 5
    print("PASS: test_plus_minus_15_and_60_min_counts")


# --------------------------------------------------------------------------
# Midnight wraparound
# --------------------------------------------------------------------------

def test_midnight_wraparound_end_time():
    # 23:45 start, 30 min duration, Fixed -> should cross into next day
    request = make_request(
        preferred_start_time="23:45",
        requested_duration_min=30,
        time_flexibility="Fixed",
    )
    candidates = generate_candidate_windows(request)
    c = candidates[0]
    assert c.start_time == "23:45"
    assert c.end_time == "00:15"
    assert c.crosses_midnight is True
    print("PASS: test_midnight_wraparound_end_time")


def test_midnight_wraparound_start_time_via_negative_offset():
    # 00:10 preferred start, ±30 min flexibility -> some offsets go negative,
    # i.e. into the previous day. Must normalize into 23:xx, not crash.
    request = make_request(
        preferred_start_time="00:10",
        requested_duration_min=20,
        time_flexibility="±30 min",
    )
    candidates = generate_candidate_windows(request, step_minutes=5)
    starts = [c.start_time for c in candidates]
    # offset -30 => 00:10 - 30 = -20 min => wraps to 23:40
    assert "23:40" in starts
    print("PASS: test_midnight_wraparound_start_time_via_negative_offset")


# --------------------------------------------------------------------------
# Input validation
# --------------------------------------------------------------------------

def test_invalid_duration_raises():
    try:
        make_request(requested_duration_min=0)
        assert False, "expected ValueError"
    except ValueError:
        print("PASS: test_invalid_duration_raises")


def test_invalid_time_format_raises():
    try:
        make_request(preferred_start_time="9:5")  # not zero-padded MM
        assert False, "expected ValueError"
    except ValueError:
        print("PASS: test_invalid_time_format_raises")


def test_invalid_flexibility_raises():
    try:
        make_request(time_flexibility="sometimes")
        assert False, "expected ValueError"
    except ValueError:
        print("PASS: test_invalid_flexibility_raises")


def test_helper_parsers_directly():
    assert _parse_hhmm_to_minutes("00:00") == 0
    assert _parse_hhmm_to_minutes("23:59") == 1439
    assert _parse_flexibility_to_minutes("Fixed") == 0
    assert _parse_flexibility_to_minutes("±15 min") == 15
    assert _parse_flexibility_to_minutes("±60 min") == 60
    print("PASS: test_helper_parsers_directly")


# --------------------------------------------------------------------------
# Integration test against the REAL dataset (2026 refresh: 60,000 rows)
# --------------------------------------------------------------------------

def test_real_dataset_all_60000_requests_generate_without_error():
    requests = load_block_requests(DATASET_PATH)
    assert len(requests) == 60000

    all_candidates = generate_candidates_for_all_requests(requests)
    assert len(all_candidates) == 60000

    # Every request must produce at least 1 candidate window
    for request_id, candidates in all_candidates.items():
        assert len(candidates) >= 1, f"{request_id} produced zero candidates"

    # Spot-check BR-0001: Fixed, 18:45, 75 min -> exactly 1 candidate
    # (the new 60,000-row dataset preserves the original first 60 rows
    # unchanged, so this legacy spot-check still holds)
    br_0001 = all_candidates["BR-0001"]
    assert len(br_0001) == 1
    assert br_0001[0].start_time == "18:45"
    assert br_0001[0].end_time == "20:00"

    # Spot-check BR-0002: ±30 min, 11:15, 45 min -> 13 candidates
    br_0002 = all_candidates["BR-0002"]
    assert len(br_0002) == 13
    assert br_0002[0].start_time == "10:45"
    assert br_0002[-1].start_time == "11:45"

    print("PASS: test_real_dataset_all_60000_requests_generate_without_error")

    # Print a small summary for manual sanity-checking
    total_candidates = sum(len(c) for c in all_candidates.values())
    print(f"    -> {len(requests)} requests produced {total_candidates} "
          f"total candidate windows (avg {total_candidates/len(requests):.1f} per request)")


if __name__ == "__main__":
    test_fixed_request_yields_exactly_one_candidate()
    test_plus_minus_30_min_generates_expected_range()
    test_plus_minus_15_and_60_min_counts()
    test_midnight_wraparound_end_time()
    test_midnight_wraparound_start_time_via_negative_offset()
    test_invalid_duration_raises()
    test_invalid_time_format_raises()
    test_invalid_flexibility_raises()
    test_helper_parsers_directly()
    test_real_dataset_all_60_requests_generate_without_error()
    print("\nAll Phase 1 tests passed.")
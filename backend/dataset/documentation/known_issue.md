# Known Issues — Dev 1 Data Pipeline

This file tracks known bugs/inconsistencies found in the Dev 1 scripts,
so they aren't rediscovered or silently reintroduced later.

## 1. BASE_DIR path resolution bug (train timetable script)

**File:** `backend/dataset/scripts/prepare_train_timetable.py`

**Issue:**
`BASE_DIR` was originally computed as:

```python
BASE_DIR = Path(__file__).resolve().parent
```

Since the script lives inside `backend/dataset/scripts/`, this made
`BASE_DIR` resolve to the `scripts/` folder itself instead of
`backend/dataset/`, causing `RAW_DIR`, `PROCESSED_DIR`, and
`DOCUMENTATION_DIR` to point one level too deep
(e.g. `scripts/raw/` instead of `dataset/raw/`).

**Fix applied (this script only):**

```python
BASE_DIR = Path(__file__).resolve().parent.parent
```

**Status:** Fixed in `prepare_train_timetable.py`.

## 2. Same BASE_DIR pattern may exist in other scripts

The following scripts use the same original one-`.parent` pattern and
have **not yet been re-verified**:

- `prepare_asset_data.py`
- `prepare_block_data.py`
- `prepare_existing_blocks.py`
- `validate_and_create_mappings.py`

These already ran successfully once (their processed CSVs exist and
are valid), so they are **not being touched right now**. This is a
heads-up only:

> If any of these scripts need to be rerun in the future and throw a
> `FileNotFoundError` for a raw file, apply the same fix:
> change `Path(__file__).resolve().parent` to
> `Path(__file__).resolve().parent.parent`.

## 3. Time parsing bug (train timetable script)

**File:** `backend/dataset/scripts/prepare_train_timetable.py`

**Issue:**
`arrival_min` and `departure_min` were 100% null due to two combined
bugs in `time_to_minutes()`:
1. Raw time values contained stray leading/trailing apostrophe
   characters (e.g. `'00:00:00'`), not stripped by `clean_strings()`.
2. `pd.to_datetime()` used `format="%H:%M"` but raw data is in
   `HH:MM:SS` format.

**Fix applied:**
- Added quote-stripping (`.str.strip("'\"")`) to `clean_strings()`.
- Changed time format to `"%H:%M:%S"` in `time_to_minutes()`.

**Status:** Fixed.

## 4. `existing_blocks_dataset.csv` `section_id`/`station_code` were unreliable at 65K scale (2026 dataset refresh)

**Files:** `backend/dataset/raw/existing_blocks_dataset.csv`,
`backend/dataset/scripts/prepare_existing_blocks.py`,
`backend/app/constraints/constraint_engine.py` (`check_existing_block_conflict`,
which filters existing blocks by `section_id == request.section_id AND
station_code == request.station_code`)

**Issue:**
When the four datasets were independently expanded to ~65K rows each, the
new `existing_blocks_dataset_65k_ref.csv` kept its own `section_id` /
`station_code` columns, but they no longer describe where the block
actually is: 99.95% of rows used a 5-digit `section_id` scheme
(`SEC-00001`..`SEC-16668`) that never appears in `asset_health` or
`block_request` (both use `SEC-001`..`SEC-500`), and cross-checking each
row's own `asset_id` against `asset_health` showed only ~0.05% agreement
on location. Left as-is, `check_existing_block_conflict`'s
section+station filter would have matched almost nothing, silently
disabling existing-block conflict detection for the new data.
`linked_block_request_id` had the same problem (only 0.7% of non-null
values happened to match a real `block_request_id`, purely from numeric
range overlap).

**Fix applied:** `section_id` and `station_code` on every
`existing_blocks` row are now derived from that row's `asset_id` via a
join against `asset_health` (the one key confirmed 100% valid across all
three datasets). The original untrustworthy values are preserved as
`raw_section_id_unreliable` / `raw_station_code_unreliable` for audit
purposes. `linked_block_request_id` is set to null throughout (existing
blocks are all `source = "Existing/Committed"`, i.e. none of them
originate from a tracked pending request in this dataset in the first
place, so nothing meaningful is lost).

**Status:** Fixed. Runtime now filters to a single "reference date" (the
most recent `block_date` present) by default, via
`build_evaluation_context(..., reference_date="latest")`.

## 5. `existing_blocks` needed a date dimension added (2026 65K-row refresh, user-requested follow-up)

**Files:** `backend/dataset/raw/existing_blocks_dataset.csv`,
`backend/app/constraints/constraint_engine.py` (`ExistingBlock`,
`load_existing_blocks`, `build_evaluation_context`)

**Issue:** Even after the section_id/station_code fix (#4 above),
`constraint_engine.py` still modeled every existing block as recurring on
a single day (no date field existed anywhere in this project -- fine for
the old 35-row dataset). At 65,000 rows split across only 4 teams
(~16,250 committed blocks/team, avg duration 67 min), treating all of them
as happening on the same single day meant each team was booked ~760x
over, simultaneously, at every minute -- confirmed empirically: 0 of 200
sampled real block requests had ANY feasible candidate window, and a
1,500-request optimizer run scheduled 0 plans.

**Fix applied:** Added a `block_date` column to `existing_blocks_dataset.csv`
(a necessary synthetic addition -- the source data has no date field at
all, so this is disclosed here rather than presented as a real field).
Dates are drawn uniformly at random (fixed seed 42, reproducible) across a
1,000-day (~2.7 year) window ending 2026-09-05, which is treated as
"today" / the reference date. `load_existing_blocks()` and
`build_evaluation_context()` now accept a `reference_date` parameter
(default `"latest"` = auto-pick the most recent date present) and filter
to ONLY that date's committed blocks before conflict-checking -- 74 rows
on the reference date (13-31 per team), comparable in scale to the old
35-row dataset. The full 1,000-day history stays in the file for
audit/documentation and any future date-aware extension. Datasets/test
fixtures with no `block_date` column are unaffected (filtering is skipped,
preserving the original single-recurring-day behavior exactly).

**Verified after fix:** 21,245 / 60,000 real block requests now have at
least one feasible candidate window (was 0); a 1,500-request optimizer run
now schedules 54 plans with `OPTIMAL` status (was 0, `OPTIMAL` but
vacuous).

**Status:** Fixed.

## 6. CP-SAT optimizer's cross-request resource constraint does not scale to tens of thousands of feasible candidates in one call

**File:** `backend/app/optimization/block_optimizer.py`
(`optimize_block_plan`'s `enforce_cross_request_resource_conflicts` loop)

**Issue:** The pairwise "no two requests double-book the same team"
constraint is built with an O(n^2) loop over every pair of feasible
candidates across ALL requests passed into one `optimize_block_plan()`
call. This was never a problem at the old dataset's scale (60 requests,
a handful of feasible candidates each). At the new 65K/60K dataset scale,
a single call with all 60,000 real block requests produces enough
feasible candidates that this loop makes CP-SAT model construction
impractically slow/memory-heavy (observed: 5,000 requests took 67s and
the solver did not converge within its time budget; a full 60,000-request
run was killed by the OOM killer).

**Not fixed in this pass** (documented here rather than silently worked
around, per project rules against hiding known limitations): a real
planner would never submit 60,000 pending requests to be optimized in one
sitting anyway -- this dataset's request volume exists for ML-scale/
candidate-generation testing, not as a literal single optimizer call.
Empirically, batches up to ~1,500 requests solve correctly and quickly
(~13s, `OPTIMAL` status). The project's tests and demo therefore use
representative samples at that scale for the optimizer specifically
(candidate generation and constraint evaluation, which have no O(n^2)
step, are still exercised against the full 60,000/65,000 real rows).
A future fix would bucket the cross-request constraint by
(team, time-window) similarly to the `narrow_by_team_time_window()`
indexing already added to `constraint_engine.py`, instead of a flat O(n^2)
scan over every feasible-candidate pair.
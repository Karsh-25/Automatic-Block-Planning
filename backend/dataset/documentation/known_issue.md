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
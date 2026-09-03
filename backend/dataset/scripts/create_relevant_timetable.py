from pathlib import Path
import pandas as pd


# ============================================================
# PROJECT PATHS
# ============================================================

# NOTE: this script lives in backend/dataset/scripts/, so we go
# up one level to reach backend/dataset/ (same fix applied to
# prepare_train_timetable.py).
BASE_DIR = Path(__file__).resolve().parent.parent

PROCESSED_DIR = BASE_DIR / "processed"
DOCUMENTATION_DIR = BASE_DIR / "documentation"

TIMETABLE_CLEAN_FILE = PROCESSED_DIR / "train_timetable_clean.csv"
BLOCK_REQUEST_CLEAN_FILE = PROCESSED_DIR / "block_request_clean.csv"
EXISTING_BLOCKS_CLEAN_FILE = PROCESSED_DIR / "existing_blocks_clean.csv"

RELEVANT_TIMETABLE_FILE = (
    PROCESSED_DIR / "relevant_timetable_clean.csv"
)

DATA_DICTIONARY_FILE = (
    DOCUMENTATION_DIR / "relevant_timetable_data_dictionary.md"
)

QUALITY_REPORT_FILE = (
    DOCUMENTATION_DIR / "relevant_timetable_quality_report.md"
)


# ============================================================
# LOAD DATA
# ============================================================

def load_timetable():

    if not TIMETABLE_CLEAN_FILE.exists():
        raise FileNotFoundError(
            f"\nClean train timetable not found:\n{TIMETABLE_CLEAN_FILE}"
            "\nRun prepare_train_timetable.py first."
        )

    df = pd.read_csv(
        TIMETABLE_CLEAN_FILE,
        dtype={
            "Train No.": "string",
            "station Code": "string",
            "Source Station Code": "string",
            "Destination station Code": "string",
        }
    )


    print("LOADED: TRAIN TIMETABLE (full, clean)")
  

    print(f"Rows    : {df.shape[0]}")
    print(f"Columns : {df.shape[1]}")

    return df


def load_block_requests():

    if not BLOCK_REQUEST_CLEAN_FILE.exists():
        raise FileNotFoundError(
            f"\nClean block request file not found:\n{BLOCK_REQUEST_CLEAN_FILE}"
        )

    df = pd.read_csv(
        BLOCK_REQUEST_CLEAN_FILE,
        dtype={"station_code": "string"}
    )

    print("LOADED: BLOCK REQUESTS")

    print(f"Rows    : {df.shape[0]}")

    return df


def load_existing_blocks():

    if not EXISTING_BLOCKS_CLEAN_FILE.exists():
        raise FileNotFoundError(
            f"\nClean existing blocks file not found:\n{EXISTING_BLOCKS_CLEAN_FILE}"
        )

    df = pd.read_csv(
        EXISTING_BLOCKS_CLEAN_FILE,
        dtype={"station_code": "string"}
    )

    print("LOADED: EXISTING BLOCKS")

    print(f"Rows    : {df.shape[0]}")

    return df


# ============================================================
# DETERMINE RELEVANT STATIONS
# ============================================================

def get_relevant_stations(block_requests_df, existing_blocks_df):

    """
    Relevant stations = union of station codes referenced by
    block requests and existing blocks.

    This is intentionally driven by real operational data
    (block requests / existing blocks), not guessed or hardcoded.
    """

    br_stations = set(
        block_requests_df["station_code"]
        .dropna()
        .astype(str)
        .str.upper()
        .unique()
    )

    eb_stations = set(
        existing_blocks_df["station_code"]
        .dropna()
        .astype(str)
        .str.upper()
        .unique()
    )

    relevant_stations = br_stations | eb_stations

    print("RELEVANT STATIONS")

    print(f"From block requests   : {len(br_stations)}")
    print(f"From existing blocks  : {len(eb_stations)}")
    print(f"Union (relevant total): {len(relevant_stations)}")

    return relevant_stations


# ============================================================
# FILTER TIMETABLE
# ============================================================

def filter_relevant_timetable(timetable_df, relevant_stations):

    mask = timetable_df["station Code"].isin(relevant_stations)

    relevant_df = timetable_df[mask].copy()

    relevant_df = relevant_df.reset_index(drop=True)

    print("FILTERING TIMETABLE")

    print(f"Rows before filtering : {len(timetable_df)}")
    print(f"Rows after filtering  : {len(relevant_df)}")

    return relevant_df


# ============================================================
# VALIDATION
# ============================================================

def validate_coverage(relevant_df, relevant_stations):

    """
    Check whether every relevant station actually has at least
    one train stop in the filtered subset. If a station is
    missing, it means no train in the timetable stops there,
    which is important for the constraint engine to know.
    """

    found_stations = set(
        relevant_df["station Code"].dropna().unique()
    )

    missing_stations = relevant_stations - found_stations

    print("COVERAGE VALIDATION")

    if missing_stations:
        print(
            f"WARNING: {len(missing_stations)} relevant station(s) "
            f"have NO train stops in the timetable:"
        )
        print(sorted(missing_stations))
    else:
        print("All relevant stations have at least one train stop.")

    return missing_stations


# ============================================================
# SUMMARY
# ============================================================

def create_summary(relevant_df):

    train_count = relevant_df["Train No."].nunique(dropna=True)
    station_count = relevant_df["station Code"].nunique(dropna=True)

    print("RELEVANT TIMETABLE SUMMARY")

    print(f"Unique trains   : {train_count}")
    print(f"Unique stations : {station_count}")

    return train_count, station_count


# ============================================================
# DATA DICTIONARY
# ============================================================

def create_data_dictionary(relevant_stations):

    stations_list = ", ".join(sorted(relevant_stations))

    text = f"""# Relevant Timetable Dataset

This dataset is a **derived subset** of `train_timetable_clean.csv`.

It is NOT a replacement for the full timetable. The full clean
timetable (69,006 rows) is preserved untouched. This file only
contains train-stop rows at stations that are operationally
relevant to our current block requests and existing blocks.

## How "relevant" is determined

A station is considered relevant if it appears as `station_code`
in either:

- `block_request_clean.csv`
- `existing_blocks_clean.csv`

## Relevant Station Codes ({len(relevant_stations)} total)

{stations_list}

## Columns

Same columns as `train_timetable_clean.csv`. See
`train_timetable_data_dictionary.md` for full column definitions.

## Intended Usage

This subset is intended for the constraint engine (Dev 2) to check
whether a proposed maintenance block window conflicts with a train
movement at the same station.

This file may need to be regenerated if:
- New block requests introduce new station codes
- New existing blocks introduce new station codes
- The underlying train_timetable_clean.csv is regenerated
"""

    DOCUMENTATION_DIR.mkdir(parents=True, exist_ok=True)

    DATA_DICTIONARY_FILE.write_text(text, encoding="utf-8")


# ============================================================
# QUALITY REPORT
# ============================================================

def create_quality_report(
    original_df,
    relevant_df,
    relevant_stations,
    missing_stations,
    train_count,
    station_count
):

    lines = []

    lines.append("# Relevant Timetable Quality Report\n")

    lines.append("## Summary\n")

    lines.append(f"- Original timetable rows: {len(original_df)}")
    lines.append(f"- Relevant timetable rows: {len(relevant_df)}")
    lines.append(f"- Relevant station codes: {len(relevant_stations)}")
    lines.append(f"- Unique trains in subset: {train_count}")
    lines.append(f"- Unique stations in subset: {station_count}")

    lines.append("\n## Coverage Validation\n")

    if missing_stations:
        lines.append(
            f"WARNING: {len(missing_stations)} relevant station(s) "
            f"have no train stops in the timetable:"
        )
        lines.append(", ".join(sorted(missing_stations)))
    else:
        lines.append(
            "All relevant stations have at least one train stop. "
            "No coverage gaps found."
        )

    lines.append("\n## Notes\n")

    lines.append(
        "- This file is a derived subset only; the full clean "
        "timetable is not modified."
    )

    lines.append(
        "- Relevant stations are derived from real data "
        "(block requests + existing blocks), not hardcoded."
    )

    lines.append(
        "- No ML or optimization is performed in this script."
    )

    DOCUMENTATION_DIR.mkdir(parents=True, exist_ok=True)

    QUALITY_REPORT_FILE.write_text(
        "\n".join(lines),
        encoding="utf-8"
    )


# ============================================================
# MAIN
# ============================================================

def main():

    # 1. Load inputs
    timetable_df = load_timetable()
    block_requests_df = load_block_requests()
    existing_blocks_df = load_existing_blocks()

    # 2. Determine relevant stations
    relevant_stations = get_relevant_stations(
        block_requests_df,
        existing_blocks_df
    )

    # 3. Filter timetable
    relevant_df = filter_relevant_timetable(
        timetable_df,
        relevant_stations
    )

    # 4. Validate coverage
    missing_stations = validate_coverage(
        relevant_df,
        relevant_stations
    )

    # 5. Summary
    train_count, station_count = create_summary(relevant_df)

    # 6. Save output
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

    relevant_df.to_csv(RELEVANT_TIMETABLE_FILE, index=False)

    # 7. Documentation
    create_data_dictionary(relevant_stations)

    create_quality_report(
        timetable_df,
        relevant_df,
        relevant_stations,
        missing_stations,
        train_count,
        station_count
    )

    # 8. Final output
    print("RELEVANT TIMETABLE EXTRACTION COMPLETE")

    print(f"\nRelevant timetable CSV:\n{RELEVANT_TIMETABLE_FILE}")
    print(f"\nData dictionary:\n{DATA_DICTIONARY_FILE}")
    print(f"\nQuality report:\n{QUALITY_REPORT_FILE}")


if __name__ == "__main__":
    main()
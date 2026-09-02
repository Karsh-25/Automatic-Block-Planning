from pathlib import Path
import pandas as pd


# ============================================================
# PROJECT PATHS
# ============================================================

BASE_DIR = Path(__file__).resolve().parent

RAW_DIR = BASE_DIR / "raw"
PROCESSED_DIR = BASE_DIR / "processed"
DOCUMENTATION_DIR = BASE_DIR / "documentation"

RAW_FILE = RAW_DIR / "existing_blocks_dataset.csv"

CLEAN_FILE = PROCESSED_DIR / "existing_blocks_clean.csv"

DATA_DICTIONARY_FILE = (
    DOCUMENTATION_DIR / "existing_blocks_data_dictionary.md"
)

QUALITY_REPORT_FILE = (
    DOCUMENTATION_DIR / "existing_blocks_quality_report.md"
)


# ============================================================
# EXPECTED COLUMNS
# ============================================================

EXPECTED_COLUMNS = [
    "existing_block_id",
    "linked_block_request_id",
    "asset_id",
    "section_id",
    "station_code",
    "block_type",
    "start_time",
    "end_time",
    "duration_min",
    "assigned_team",
    "status",
    "operational_priority",
    "source",
]


STRING_COLUMNS = [
    "existing_block_id",
    "linked_block_request_id",
    "asset_id",
    "section_id",
    "station_code",
    "block_type",
    "start_time",
    "end_time",
    "assigned_team",
    "status",
    "operational_priority",
    "source",
]


# ============================================================
# LOAD DATA
# ============================================================

def load_existing_blocks():

    if not RAW_FILE.exists():
        raise FileNotFoundError(
            f"\nExisting Blocks file not found:\n{RAW_FILE}"
        )

    df = pd.read_csv(RAW_FILE)

    print("\n" + "=" * 60)
    print("EXISTING BLOCKS DATASET")
    print("=" * 60)

    print(f"Rows    : {df.shape[0]}")
    print(f"Columns : {df.shape[1]}")

    return df


# ============================================================
# COLUMN VALIDATION
# ============================================================

def validate_columns(df):

    missing_columns = [
        column
        for column in EXPECTED_COLUMNS
        if column not in df.columns
    ]

    if missing_columns:
        raise ValueError(
            f"Missing columns: {missing_columns}"
        )

    extra_columns = [
        column
        for column in df.columns
        if column not in EXPECTED_COLUMNS
    ]

    if extra_columns:
        print(
            f"\nWARNING: Extra columns found: {extra_columns}"
        )

    return df[EXPECTED_COLUMNS].copy()


# ============================================================
# STRING CLEANING
# ============================================================

def clean_strings(df):

    for column in STRING_COLUMNS:

        df[column] = (
            df[column]
            .astype("string")
            .str.strip()
        )

        df[column] = (
            df[column]
            .str.replace(r"\s+", " ", regex=True)
        )

    # IDs / railway codes
    for column in [
        "existing_block_id",
        "linked_block_request_id",
        "asset_id",
        "section_id",
        "station_code",
    ]:

        df[column] = df[column].str.upper()

    return df


# ============================================================
# NUMERIC CLEANING
# ============================================================

def clean_numeric_columns(df):

    df["duration_min"] = pd.to_numeric(
        df["duration_min"],
        errors="coerce"
    )

    return df


# ============================================================
# TIME CONVERSION
# ============================================================

def time_to_minutes(value):

    """
    Convert HH:MM into minutes from midnight.

    Example:
        05:30 -> 330
        18:45 -> 1125
    """

    if pd.isna(value):
        return None

    value = str(value).strip()

    try:
        parsed_time = pd.to_datetime(
            value,
            format="%H:%M",
            errors="coerce"
        )

        if pd.isna(parsed_time):
            return None

        return (
            parsed_time.hour * 60
            + parsed_time.minute
        )

    except Exception:
        return None


# ============================================================
# CREATE TIME FEATURES
# ============================================================

def create_time_features(df):

    df["start_min"] = (
        df["start_time"]
        .apply(time_to_minutes)
    )

    df["end_min"] = (
        df["end_time"]
        .apply(time_to_minutes)
    )

    # Calculate duration from start/end
    calculated_duration = (
        df["end_min"] - df["start_min"]
    )

    # Handle blocks crossing midnight
    calculated_duration = calculated_duration.where(
        calculated_duration >= 0,
        calculated_duration + 1440
    )

    df["calculated_duration_min"] = (
        calculated_duration
    )

    return df


# ============================================================
# MISSING VALUE CHECK
# ============================================================

def check_missing_values(df):

    missing = df.isnull().sum()

    missing = missing[missing > 0]

    print("\n" + "=" * 60)
    print("MISSING VALUES")
    print("=" * 60)

    if missing.empty:

        print("No missing values found.")

    else:

        print(missing)

    return missing


# ============================================================
# DUPLICATE CHECK
# ============================================================

def check_duplicates(df):

    duplicate_rows = df[
        df["existing_block_id"].duplicated(
            keep=False
        )
    ]

    print("\n" + "=" * 60)
    print("DUPLICATE EXISTING BLOCK IDs")
    print("=" * 60)

    if duplicate_rows.empty:

        print("No duplicate existing block IDs found.")

    else:

        print(
            duplicate_rows[
                "existing_block_id"
            ].value_counts()
        )

    return duplicate_rows


# ============================================================
# RANGE / CONSISTENCY VALIDATION
# ============================================================

def check_ranges(df):

    invalid_counts = {}

    # Duration must be positive
    invalid_duration = (
        df["duration_min"].isna()
        |
        (df["duration_min"] <= 0)
    )

    invalid_counts["duration_min"] = int(
        invalid_duration.sum()
    )

    # Start time
    invalid_start = (
        df["start_min"].isna()
    )

    invalid_counts["start_time"] = int(
        invalid_start.sum()
    )

    # End time
    invalid_end = (
        df["end_min"].isna()
    )

    invalid_counts["end_time"] = int(
        invalid_end.sum()
    )

    # Duration consistency
    duration_difference = (
        (
            df["calculated_duration_min"]
            - df["duration_min"]
        )
        .abs()
    )

    invalid_duration_consistency = (
        duration_difference > 1
    )

    invalid_counts[
        "duration_consistency"
    ] = int(
        invalid_duration_consistency.sum()
    )

    print("\n" + "=" * 60)
    print("RANGE / CONSISTENCY VALIDATION")
    print("=" * 60)

    for column, count in invalid_counts.items():

        print(
            f"{column}: {count} invalid records"
        )

    return invalid_counts


# ============================================================
# CATEGORY REPORT
# ============================================================

def get_categories(df):

    categorical_columns = [
        "block_type",
        "assigned_team",
        "status",
        "operational_priority",
        "source",
    ]

    categories = {}

    print("\n" + "=" * 60)
    print("CATEGORIES")
    print("=" * 60)

    for column in categorical_columns:

        values = sorted(
            df[column]
            .dropna()
            .unique()
            .tolist()
        )

        categories[column] = values

        print(f"\n{column}:")

        for value in values:
            print(f"  - {value}")

    return categories


# ============================================================
# DATA DICTIONARY
# ============================================================

def create_data_dictionary():

    text = """# Existing Blocks Dataset

This dataset contains railway maintenance blocks that are already
scheduled or recorded in the system.

| Column | Type | Description | Validation |
|---|---|---|---|
| existing_block_id | string | Unique identifier of existing block | Not null, unique |
| linked_block_request_id | string | Related block request identifier | Standardized |
| asset_id | string | Asset associated with the block | Standardized uppercase |
| section_id | string | Railway section | Standardized uppercase |
| station_code | string | Railway station code | Standardized uppercase |
| block_type | categorical | Type of existing block | Standardized text |
| start_time | time | Existing block start time | HH:MM |
| end_time | time | Existing block end time | HH:MM |
| duration_min | integer | Recorded block duration in minutes | > 0 |
| assigned_team | categorical | Team assigned to the block | Standardized text |
| status | categorical | Current status of block | Standardized text |
| operational_priority | categorical | Operational importance of block | Standardized text |
| source | categorical | Source of block information | Standardized text |

## Derived Fields

| Column | Description |
|---|---|
| start_min | Start time converted to minutes from midnight |
| end_min | End time converted to minutes from midnight |
| calculated_duration_min | Duration calculated from start and end time |

## Future Constraint Engine Usage

Existing blocks are important because new maintenance requests
must not conflict with already scheduled blocks.

Useful fields include:

- section_id
- station_code
- start_min
- end_min
- duration_min
- assigned_team
- status
- operational_priority
"""

    DOCUMENTATION_DIR.mkdir(
        parents=True,
        exist_ok=True
    )

    DATA_DICTIONARY_FILE.write_text(
        text,
        encoding="utf-8"
    )


# ============================================================
# QUALITY REPORT
# ============================================================

def create_quality_report(
    df,
    missing,
    duplicate_rows,
    invalid_ranges,
    categories
):

    lines = []

    lines.append(
        "# Existing Blocks Data Quality Report\n"
    )

    # Summary
    lines.append(
        "## Dataset Summary\n"
    )

    lines.append(
        f"- Total records: {len(df)}"
    )

    lines.append(
        f"- Total columns: {len(df.columns)}"
    )

    # Missing values
    lines.append(
        "\n## Missing Values\n"
    )

    if missing.empty:

        lines.append(
            "No missing values found."
        )

    else:

        lines.append(
            "| Column | Missing Count |"
        )

        lines.append(
            "|---|---:|"
        )

        for column, count in missing.items():

            lines.append(
                f"| {column} | {count} |"
            )

    # Duplicate IDs
    lines.append(
        "\n## Duplicate Existing Block IDs\n"
    )

    lines.append(
        f"Duplicate rows: {len(duplicate_rows)}"
    )

    # Validation
    lines.append(
        "\n## Validation Results\n"
    )

    lines.append(
        "| Field | Invalid Records |"
    )

    lines.append(
        "|---|---:|"
    )

    for column, count in invalid_ranges.items():

        lines.append(
            f"| {column} | {count} |"
        )

    # Categories
    lines.append(
        "\n## Categorical Values\n"
    )

    for column, values in categories.items():

        lines.append(
            f"\n### {column}"
        )

        for value in values:

            lines.append(
                f"- {value}"
            )

    # Numeric statistics
    lines.append(
        "\n## Numeric Statistics\n"
    )

    numeric_columns = [
        "duration_min",
        "start_min",
        "end_min",
        "calculated_duration_min",
    ]

    stats = (
        df[numeric_columns]
        .describe()
        .round(2)
    )

    lines.append(
        stats.to_markdown()
    )

    # Notes
    lines.append(
        "\n## Data Preparation Notes\n"
    )

    lines.append(
        "- Raw dataset is not modified."
    )

    lines.append(
        "- Missing values are reported rather than blindly imputed."
    )

    lines.append(
        "- Duplicate block IDs are reported for review."
    )

    lines.append(
        "- Original HH:MM time fields are retained."
    )

    lines.append(
        "- Numeric time fields are added for constraint processing."
    )

    lines.append(
        "- Existing blocks will later act as constraints for new block planning."
    )

    lines.append(
        "- No ML or optimization is performed in this script."
    )

    DOCUMENTATION_DIR.mkdir(
        parents=True,
        exist_ok=True
    )

    QUALITY_REPORT_FILE.write_text(
        "\n".join(lines),
        encoding="utf-8"
    )


# ============================================================
# MAIN
# ============================================================

def main():

    # 1. Load
    df = load_existing_blocks()

    # 2. Validate columns
    df = validate_columns(df)

    # 3. Clean strings
    df = clean_strings(df)

    # 4. Clean numeric fields
    df = clean_numeric_columns(df)

    # 5. Create time features
    df = create_time_features(df)

    # 6. Quality checks
    missing = check_missing_values(df)

    duplicate_rows = check_duplicates(df)

    invalid_ranges = check_ranges(df)

    categories = get_categories(df)

    # 7. Create directories
    PROCESSED_DIR.mkdir(
        parents=True,
        exist_ok=True
    )

    DOCUMENTATION_DIR.mkdir(
        parents=True,
        exist_ok=True
    )

    # 8. Save cleaned dataset
    df.to_csv(
        CLEAN_FILE,
        index=False
    )

    # 9. Documentation
    create_data_dictionary()

    create_quality_report(
        df,
        missing,
        duplicate_rows,
        invalid_ranges,
        categories
    )

    # 10. Final output
    print("\n" + "=" * 60)
    print("EXISTING BLOCKS PROCESSING COMPLETE")
    print("=" * 60)

    print(f"Rows: {len(df)}")

    print(
        f"\nClean CSV:\n{CLEAN_FILE}"
    )

    print(
        f"\nData dictionary:\n{DATA_DICTIONARY_FILE}"
    )

    print(
        f"\nQuality report:\n{QUALITY_REPORT_FILE}"
    )


if __name__ == "__main__":
    main()
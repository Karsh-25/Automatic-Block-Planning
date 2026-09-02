from pathlib import Path
import re
import pandas as pd


# ============================================================
# PROJECT PATHS
# ============================================================

BASE_DIR = Path(__file__).resolve().parent

RAW_DIR = BASE_DIR / "raw"
PROCESSED_DIR = BASE_DIR / "processed"
DOCUMENTATION_DIR = BASE_DIR / "documentation"

RAW_FILE = RAW_DIR / "block_request_dataset.csv"

CLEAN_FILE = PROCESSED_DIR / "block_request_clean.csv"

DATA_DICTIONARY_FILE = (
    DOCUMENTATION_DIR / "block_request_data_dictionary.md"
)

QUALITY_REPORT_FILE = (
    DOCUMENTATION_DIR / "block_request_quality_report.md"
)


# ============================================================
# EXPECTED COLUMNS
# ============================================================

EXPECTED_COLUMNS = [
    "block_request_id",
    "asset_id",
    "section_id",
    "station_code",
    "maintenance_type",
    "requested_duration_min",
    "priority",
    "preferred_start_time",
    "time_flexibility",
    "required_team",
    "request_urgency",
    "status",
]


STRING_COLUMNS = [
    "block_request_id",
    "asset_id",
    "section_id",
    "station_code",
    "maintenance_type",
    "priority",
    "preferred_start_time",
    "time_flexibility",
    "required_team",
    "request_urgency",
    "status",
]


# ============================================================
# LOAD DATA
# ============================================================

def load_block_requests():

    if not RAW_FILE.exists():
        raise FileNotFoundError(
            f"\nBlock Request file not found:\n{RAW_FILE}"
        )

    df = pd.read_csv(RAW_FILE)

    print("\n" + "=" * 60)
    print("BLOCK REQUEST DATASET")
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

        # Remove multiple spaces
        df[column] = (
            df[column]
            .str.replace(r"\s+", " ", regex=True)
        )

    # IDs and railway codes
    for column in [
        "block_request_id",
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

    df["requested_duration_min"] = pd.to_numeric(
        df["requested_duration_min"],
        errors="coerce"
    )

    return df


# ============================================================
# TIME CONVERSION
# ============================================================

def time_to_minutes(time_value):

    """
    Convert HH:MM into minutes from midnight.

    Example:
        18:45 -> 1125
        05:15 -> 315
    """

    if pd.isna(time_value):
        return None

    value = str(time_value).strip()

    match = re.fullmatch(
        r"([01]\d|2[0-3]):([0-5]\d)",
        value
    )

    if not match:
        return None

    hours = int(match.group(1))
    minutes = int(match.group(2))

    return hours * 60 + minutes


# ============================================================
# FLEXIBILITY CONVERSION
# ============================================================

def flexibility_to_minutes(value):

    """
    Convert time flexibility into numeric minutes.

    Fixed      -> 0
    ±15 min    -> 15
    ±30 min    -> 30
    ±60 min    -> 60
    """

    if pd.isna(value):
        return None

    value = str(value).strip()

    if value.lower() == "fixed":
        return 0

    match = re.search(
        r"(\d+)",
        value
    )

    if match:
        return int(match.group(1))

    return None


# ============================================================
# CREATE TIME FEATURES
# ============================================================

def create_time_features(df):

    # Preferred start in minutes
    df["preferred_start_min"] = (
        df["preferred_start_time"]
        .apply(time_to_minutes)
    )

    # Flexibility in minutes
    df["flexibility_min"] = (
        df["time_flexibility"]
        .apply(flexibility_to_minutes)
    )

    # Earliest feasible start
    df["earliest_start_min"] = (
        df["preferred_start_min"]
        - df["flexibility_min"]
    )

    # Latest feasible start
    df["latest_start_min"] = (
        df["preferred_start_min"]
        + df["flexibility_min"]
    )

    # Handle midnight boundary
    df["earliest_start_min"] = (
        df["earliest_start_min"]
        .clip(lower=0)
    )

    df["latest_start_min"] = (
        df["latest_start_min"]
        .clip(upper=1439)
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
        df["block_request_id"].duplicated(
            keep=False
        )
    ]

    print("\n" + "=" * 60)
    print("DUPLICATE BLOCK REQUEST IDs")
    print("=" * 60)

    if duplicate_rows.empty:

        print("No duplicate block request IDs found.")

    else:

        print(
            duplicate_rows[
                "block_request_id"
            ].value_counts()
        )

    return duplicate_rows


# ============================================================
# RANGE VALIDATION
# ============================================================

def check_ranges(df):

    invalid_counts = {}

    # Requested duration must be positive
    invalid_duration = (
        df["requested_duration_min"].isna()
        |
        (df["requested_duration_min"] <= 0)
    )

    invalid_counts[
        "requested_duration_min"
    ] = int(invalid_duration.sum())

    # Preferred time
    invalid_preferred_time = (
        df["preferred_start_min"].isna()
    )

    invalid_counts[
        "preferred_start_time"
    ] = int(invalid_preferred_time.sum())

    # Flexibility
    invalid_flexibility = (
        df["flexibility_min"].isna()
    )

    invalid_counts[
        "time_flexibility"
    ] = int(invalid_flexibility.sum())

    print("\n" + "=" * 60)
    print("RANGE / FORMAT VALIDATION")
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
        "maintenance_type",
        "priority",
        "time_flexibility",
        "required_team",
        "request_urgency",
        "status",
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

    text = """# Block Request Dataset

This dataset contains maintenance/block requests submitted for
railway assets.

| Column | Type | Description | Validation |
|---|---|---|---|
| block_request_id | string | Unique block request identifier | Not null, unique |
| asset_id | string | Asset requiring maintenance | Standardized uppercase |
| section_id | string | Railway section | Standardized uppercase |
| station_code | string | Railway station code | Standardized uppercase |
| maintenance_type | categorical | Type of maintenance activity | Standardized text |
| requested_duration_min | integer | Required maintenance duration in minutes | > 0 |
| priority | categorical | Maintenance priority | Low/Medium/High/Critical |
| preferred_start_time | time | Preferred maintenance start time | HH:MM |
| time_flexibility | categorical | Allowed deviation from preferred start | Fixed/±15/±30/±60 min |
| required_team | categorical | Team required for maintenance | Standardized text |
| request_urgency | categorical | Urgency of request | Normal/Urgent |
| status | categorical | Current request status | Standardized text |

## Derived Fields

| Column | Description |
|---|---|
| preferred_start_min | Preferred start time converted to minutes from midnight |
| flexibility_min | Time flexibility converted to numeric minutes |
| earliest_start_min | Earliest allowed start time |
| latest_start_min | Latest allowed start time |

## Future Constraint / Optimization Usage

The following fields will be useful for the constraint engine:

- section_id
- station_code
- requested_duration_min
- preferred_start_min
- flexibility_min
- earliest_start_min
- latest_start_min
- required_team
- priority
- request_urgency
- status
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
        "# Block Request Data Quality Report\n"
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

    # Missing
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

    # Duplicate
    lines.append(
        "\n## Duplicate Block Request IDs\n"
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
        "requested_duration_min",
        "preferred_start_min",
        "flexibility_min",
        "earliest_start_min",
        "latest_start_min",
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
        "- Duplicate request IDs are reported for review."
    )

    lines.append(
        "- Time values are retained in original HH:MM format."
    )

    lines.append(
        "- Numeric time fields are added for constraint processing."
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
    df = load_block_requests()

    # 2. Validate columns
    df = validate_columns(df)

    # 3. Clean strings
    df = clean_strings(df)

    # 4. Clean numeric fields
    df = clean_numeric_columns(df)

    # 5. Create time-related fields
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

    # 10. Final message
    print("\n" + "=" * 60)
    print("BLOCK REQUEST PROCESSING COMPLETE")
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
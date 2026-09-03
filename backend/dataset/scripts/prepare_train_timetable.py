from pathlib import Path
import pandas as pd


# ============================================================
# PROJECT PATHS
# ============================================================

BASE_DIR = Path(__file__).resolve().parent.parent

RAW_DIR = BASE_DIR / "raw"
PROCESSED_DIR = BASE_DIR / "processed"
DOCUMENTATION_DIR = BASE_DIR / "documentation"

RAW_FILE = RAW_DIR / "isl_wise_train_detail_03082015_v1.csv"

CLEAN_FILE = PROCESSED_DIR / "train_timetable_clean.csv"

DATA_DICTIONARY_FILE = (
    DOCUMENTATION_DIR / "train_timetable_data_dictionary.md"
)

QUALITY_REPORT_FILE = (
    DOCUMENTATION_DIR / "train_timetable_quality_report.md"
)


# ============================================================
# EXPECTED COLUMNS
# ============================================================

EXPECTED_COLUMNS = [
    "Train No.",
    "train Name",
    "islno",
    "station Code",
    "Station Name",
    "Arrival time",
    "Departure time",
    "Distance",
    "Source Station Code",
    "source Station Name",
    "Destination station Code",
    "Destination Station Name",
]


# ============================================================
# LOAD DATA
# ============================================================

def load_train_timetable():

    if not RAW_FILE.exists():
        raise FileNotFoundError(
            f"\nTrain timetable file not found:\n{RAW_FILE}"
        )

    # IMPORTANT:
    # Train number is read as string so leading zeros are preserved.
    df = pd.read_csv(
        RAW_FILE,
        dtype={
            "Train No.": "string",
            "station Code": "string",
            "Source Station Code": "string",
            "Destination station Code": "string",
        }
    )

    print("\n" + "=" * 60)
    print("TRAIN TIMETABLE DATASET")
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

    string_columns = [
        "Train No.",
        "train Name",
        "station Code",
        "Station Name",
        "Arrival time",
        "Departure time",
        "Source Station Code",
        "source Station Name",
        "Destination station Code",
        "Destination Station Name",
    ]

    for column in string_columns:

        df[column] = (
            df[column]
            .astype("string")
            .str.strip()
        )

        df[column] = (
            df[column]
            .str.replace(
                r"\s+",
                " ",
                regex=True
            )
        )
        df[column] = (
            df[column]
            .str.strip("'\"")
        )

    # Railway station codes should be uppercase
    code_columns = [
        "station Code",
        "Source Station Code",
        "Destination station Code",
    ]

    for column in code_columns:
        df[column] = df[column].str.upper()

    return df


# ============================================================
# NUMERIC CLEANING
# ============================================================

def clean_numeric_columns(df):

    df["islno"] = pd.to_numeric(
        df["islno"],
        errors="coerce"
    )

    df["Distance"] = pd.to_numeric(
        df["Distance"],
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

    parsed = pd.to_datetime(
        value,
        format="%H:%M:%S",
        errors="coerce"
    )

    if pd.isna(parsed):
        return None

    return (
        parsed.hour * 60
        + parsed.minute
    )


# ============================================================
# CREATE TIME FEATURES
# ============================================================

def create_time_features(df):

    df["arrival_min"] = (
        df["Arrival time"]
        .apply(time_to_minutes)
    )

    df["departure_min"] = (
        df["Departure time"]
        .apply(time_to_minutes)
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

    # Exact duplicate rows
    exact_duplicates = df.duplicated().sum()

    print("\n" + "=" * 60)
    print("DUPLICATES")
    print("=" * 60)

    print(
        f"Exact duplicate rows: {exact_duplicates}"
    )

    return int(exact_duplicates)


# ============================================================
# RANGE / CONSISTENCY VALIDATION
# ============================================================

def check_ranges(df):

    invalid = {}

    # ISL sequence number should be positive
    invalid["islno"] = int(
        (
            df["islno"].isna()
            |
            (df["islno"] <= 0)
        ).sum()
    )

    # Distance should not be negative
    invalid["Distance"] = int(
        (
            df["Distance"].notna()
            &
            (df["Distance"] < 0)
        ).sum()
    )

    # Arrival time format
    invalid["Arrival time"] = int(
        df["arrival_min"].isna().sum()
    )

    # Departure time format
    invalid["Departure time"] = int(
        df["departure_min"].isna().sum()
    )

    # Same station arrival/departure consistency
    invalid["departure_before_arrival"] = int(
        (
            df["arrival_min"].notna()
            &
            df["departure_min"].notna()
            &
            (df["departure_min"] < df["arrival_min"])
        ).sum()
    )

    print("\n" + "=" * 60)
    print("RANGE / FORMAT VALIDATION")
    print("=" * 60)

    for field, count in invalid.items():

        print(
            f"{field}: {count} invalid records"
        )

    return invalid


# ============================================================
# TRAIN / STATION REPORT
# ============================================================

def create_summary(df):

    train_count = df["Train No."].nunique(
        dropna=True
    )

    station_count = df["station Code"].nunique(
        dropna=True
    )

    print("\n" + "=" * 60)
    print("TIMETABLE SUMMARY")
    print("=" * 60)

    print(
        f"Unique trains   : {train_count}"
    )

    print(
        f"Unique stations : {station_count}"
    )

    return train_count, station_count


# ============================================================
# DATA DICTIONARY
# ============================================================

def create_data_dictionary():

    text = """# Train Timetable Dataset

This dataset contains station-wise train timetable information.

| Column | Type | Description | Validation |
|---|---|---|---|
| Train No. | string | Train identifier | Preserved as string |
| train Name | string | Train name | Trimmed text |
| islno | integer | Station sequence number in train route | > 0 |
| station Code | string | Station code where train stops | Uppercase |
| Station Name | string | Station name | Trimmed text |
| Arrival time | time | Train arrival time at station | HH:MM |
| Departure time | time | Train departure time from station | HH:MM |
| Distance | numeric | Distance associated with timetable record | >= 0 |
| Source Station Code | string | Train source station code | Uppercase |
| source Station Name | string | Train source station name | Trimmed text |
| Destination station Code | string | Train destination station code | Uppercase |
| Destination Station Name | string | Train destination station name | Trimmed text |

## Derived Fields

| Column | Description |
|---|---|
| arrival_min | Arrival time converted to minutes from midnight |
| departure_min | Departure time converted to minutes from midnight |

## Important Design Decision

`Train No.` is stored as a string instead of an integer.

This prevents identifiers such as `00851` from becoming `851`.

## Future Constraint Engine Usage

The timetable will be used to determine whether a proposed
maintenance block conflicts with scheduled train movements.

Useful fields include:

- Train No.
- station Code
- islno
- Arrival time
- Departure time
- arrival_min
- departure_min
- Source Station Code
- Destination station Code
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
    duplicate_count,
    invalid_ranges,
    train_count,
    station_count
):

    lines = []

    lines.append(
        "# Train Timetable Data Quality Report\n"
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

    lines.append(
        f"- Unique trains: {train_count}"
    )

    lines.append(
        f"- Unique stations: {station_count}"
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

    # Duplicates
    lines.append(
        "\n## Duplicate Records\n"
    )

    lines.append(
        f"Exact duplicate rows: {duplicate_count}"
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

    for field, count in invalid_ranges.items():

        lines.append(
            f"| {field} | {count} |"
        )

    # Important station information
    lines.append(
        "\n## Station Information\n"
    )

    lines.append(
        f"- Unique station codes: {station_count}"
    )

    # Numeric statistics
    lines.append(
        "\n## Numeric Statistics\n"
    )

    numeric_columns = [
        "islno",
        "Distance",
        "arrival_min",
        "departure_min",
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
        "- Raw timetable file is not modified."
    )

    lines.append(
        "- Train numbers are preserved as strings."
    )

    lines.append(
        "- Station codes are normalized to uppercase."
    )

    lines.append(
        "- Original arrival and departure time fields are retained."
    )

    lines.append(
        "- Numeric time representations are added for constraint processing."
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
    df = load_train_timetable()

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

    duplicate_count = check_duplicates(df)

    invalid_ranges = check_ranges(df)

    train_count, station_count = create_summary(df)

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
        duplicate_count,
        invalid_ranges,
        train_count,
        station_count
    )

    # 10. Final output
    print("\n" + "=" * 60)
    print("TRAIN TIMETABLE PROCESSING COMPLETE")
    print("=" * 60)

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
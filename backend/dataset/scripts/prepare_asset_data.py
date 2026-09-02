from pathlib import Path
import pandas as pd



# PROJECT PATHS

BASE_DIR = Path(__file__).resolve().parent

RAW_DIR = BASE_DIR / "raw"
PROCESSED_DIR = BASE_DIR / "processed"
DOCUMENTATION_DIR = BASE_DIR / "documentation"


RAW_FILE = RAW_DIR / "asset_health_dataset.csv"

CLEAN_FILE = PROCESSED_DIR / "asset_health_clean.csv"

DATA_DICTIONARY_FILE = (
    DOCUMENTATION_DIR / "asset_health_data_dictionary.md"
)

QUALITY_REPORT_FILE = (
    DOCUMENTATION_DIR / "asset_health_quality_report.md"
)


# EXPECTED_COLUMNS

EXPECTED_COLUMNS = [
    "asset_id",
    "asset_type",
    "section_id",
    "nearest_station_code",
    "age_years",
    "condition_score",
    "failure_count_24m",
    "days_since_last_maintenance",
    "usage_percent",
    "criticality",
    "asset_risk_score",
    "maintenance_priority",
]


NUMERIC_COLUMNS = [
    "age_years",
    "condition_score",
    "failure_count_24m",
    "days_since_last_maintenance",
    "usage_percent",
    "asset_risk_score",
]


STRING_COLUMNS = [
    "asset_id",
    "asset_type",
    "section_id",
    "nearest_station_code",
    "criticality",
    "maintenance_priority",
]


# ============================================================
# LOAD DATA
# ============================================================

def load_asset_health():

    if not RAW_FILE.exists():
        raise FileNotFoundError(
            f"\nAsset Health file not found:\n{RAW_FILE}"
        )

    df = pd.read_csv(RAW_FILE)

    print("\n" + "=" * 60)
    print("ASSET HEALTH DATASET")
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

    # Railway IDs / codes
    for column in [
        "asset_id",
        "section_id",
        "nearest_station_code",
    ]:

        df[column] = df[column].str.upper()

    return df


# ============================================================
# NUMERIC CLEANING
# ============================================================

def clean_numeric_columns(df):

    for column in NUMERIC_COLUMNS:

        df[column] = pd.to_numeric(
            df[column],
            errors="coerce"
        )

    return df


# ============================================================
# MISSING VALUE REPORT
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
# DUPLICATE REPORT
# ============================================================

def check_duplicates(df):

    duplicate_rows = df[
        df["asset_id"].duplicated(keep=False)
    ]

    print("\n" + "=" * 60)
    print("DUPLICATE ASSET IDs")
    print("=" * 60)

    if duplicate_rows.empty:
        print("No duplicate asset IDs found.")
    else:
        print(duplicate_rows["asset_id"].value_counts())


# ============================================================
# RANGE VALIDATION
# ============================================================

def check_ranges(df):

    rules = {

        "age_years":
            df["age_years"] < 0,

        "condition_score":
            (df["condition_score"] < 0) |
            (df["condition_score"] > 100),

        "failure_count_24m":
            df["failure_count_24m"] < 0,

        "days_since_last_maintenance":
            df["days_since_last_maintenance"] < 0,

        "usage_percent":
            (df["usage_percent"] < 0) |
            (df["usage_percent"] > 100),

        "asset_risk_score":
            (df["asset_risk_score"] < 0) |
            (df["asset_risk_score"] > 100),
    }

    invalid_counts = {}

    print("\n" + "=" * 60)
    print("RANGE VALIDATION")
    print("=" * 60)

    for column, condition in rules.items():

        count = condition.sum()

        invalid_counts[column] = int(count)

        print(
            f"{column}: {count} invalid records"
        )

    return invalid_counts


# ============================================================
# CATEGORY REPORT
# ============================================================

def get_categories(df):

    categorical_columns = [
        "asset_type",
        "criticality",
        "maintenance_priority",
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

    text = """# Asset Health Dataset

| Column | Type | Description | Validation |
|---|---|---|---|
| asset_id | string | Unique asset identifier | Not null, unique |
| asset_type | categorical | Type of railway asset | Standardized text |
| section_id | string | Railway section | Not null |
| nearest_station_code | string | Nearest station code | Standardized uppercase |
| age_years | numeric | Age of asset in years | >= 0 |
| condition_score | numeric | Asset condition score | 0-100 |
| failure_count_24m | integer | Failures in previous 24 months | >= 0 |
| days_since_last_maintenance | integer | Days since previous maintenance | >= 0 |
| usage_percent | numeric | Asset usage percentage | 0-100 |
| criticality | categorical | Operational importance | Standardized text |
| asset_risk_score | numeric | Asset risk score | 0-100 |
| maintenance_priority | categorical | Maintenance priority | Standardized text |

## ML Usage

Initial model features:

- age_years
- condition_score
- failure_count_24m
- days_since_last_maintenance
- usage_percent
- asset_type
- criticality

Target:

- asset_risk_score

`maintenance_priority` should not initially be used as a feature if
it is derived from or strongly related to the risk score.
"""

    DOCUMENTATION_DIR.mkdir(
        parents=True,
        exist_ok=True
    )

    DATA_DICTIONARY_FILE.write_text(
        text,
        encoding="utf-8"
    )

# QUALITY REPORT


def create_quality_report(
    df,
    missing,
    invalid_ranges,
    categories
):

    lines = []

    lines.append("# Asset Health Data Quality Report\n")

    lines.append("## Dataset Summary\n")
    lines.append(f"- Total records: {len(df)}")
    lines.append(f"- Total columns: {len(df.columns)}")

    lines.append("\n## Missing Values\n")

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

    lines.append("\n## Range Validation\n")

    lines.append(
        "| Column | Invalid Records |"
    )
    lines.append(
        "|---|---:|"
    )

    for column, count in invalid_ranges.items():

        lines.append(
            f"| {column} | {count} |"
        )

    lines.append("\n## Categorical Values\n")

    for column, values in categories.items():

        lines.append(
            f"\n### {column}"
        )

        for value in values:

            lines.append(
                f"- {value}"
            )

    lines.append("\n## Numeric Statistics\n")

    stats = (
        df[NUMERIC_COLUMNS]
        .describe()
        .round(2)
    )

    lines.append(
        stats.to_markdown()
    )

    lines.append("\n## ML Notes\n")

    lines.append(
        "- Asset risk score is retained as the model target."
    )

    lines.append(
        "- Risk score is not used as an input feature."
    )

    lines.append(
        "- Maintenance priority is not initially used as an input feature."
    )

    lines.append(
        "- Missing values are reported instead of blindly imputed."
    )

    DOCUMENTATION_DIR.mkdir(
        parents=True,
        exist_ok=True
    )

    QUALITY_REPORT_FILE.write_text(
        "\n".join(lines),
        encoding="utf-8"
    )

def main():

    # 1. Load
    df = load_asset_health()

    # Keep original row count
    original_rows = len(df)

    # 2. Validate columns
    df = validate_columns(df)

    # 3. Clean strings
    df = clean_strings(df)

    # 4. Clean numeric columns
    df = clean_numeric_columns(df)

    # 5. Quality checks
    missing = check_missing_values(df)

    check_duplicates(df)

    invalid_ranges = check_ranges(df)

    categories = get_categories(df)

    # 6. Create output directories
    PROCESSED_DIR.mkdir(
        parents=True,
        exist_ok=True
    )

    # 7. Save cleaned dataset
    df.to_csv(
        CLEAN_FILE,
        index=False
    )

    # 8. Documentation
    create_data_dictionary()

    create_quality_report(
        df,
        missing,
        invalid_ranges,
        categories
    )

    # 9. Final output
    print("\n" + "=" * 60)
    print("PROCESSING COMPLETE")
    print("=" * 60)

    print(f"Original rows : {original_rows}")
    print(f"Final rows    : {len(df)}")

    print(f"\nClean CSV:")
    print(CLEAN_FILE)

    print(f"\nData dictionary:")
    print(DATA_DICTIONARY_FILE)

    print(f"\nQuality report:")
    print(QUALITY_REPORT_FILE)


if __name__ == "__main__":
    main()
from pathlib import Path
import pandas as pd


# ============================================================
# PATHS
# ============================================================

BASE_DIR = Path(__file__).resolve().parent

PROCESSED_DIR = BASE_DIR / "processed"
MAPPING_DIR = BASE_DIR / "mapping"


ASSET_FILE = PROCESSED_DIR / "asset_health_clean.csv"
REQUEST_FILE = PROCESSED_DIR / "block_request_clean.csv"
EXISTING_FILE = PROCESSED_DIR / "existing_blocks_clean.csv"
TIMETABLE_FILE = PROCESSED_DIR / "train_timetable_clean.csv"


# ============================================================
# LOAD
# ============================================================

def load_datasets():

    print("\n" + "=" * 70)
    print("LOADING PROCESSED DATASETS")
    print("=" * 70)

    asset = pd.read_csv(ASSET_FILE, dtype=str)
    request = pd.read_csv(REQUEST_FILE, dtype=str)
    existing = pd.read_csv(EXISTING_FILE, dtype=str)
    timetable = pd.read_csv(TIMETABLE_FILE, dtype=str)

    print(f"Asset Health    : {len(asset)}")
    print(f"Block Requests  : {len(request)}")
    print(f"Existing Blocks : {len(existing)}")
    print(f"Train Timetable : {len(timetable)}")

    return asset, request, existing, timetable


# ============================================================
# NORMALIZE CODES
# ============================================================

def normalize_codes(df, columns):

    for column in columns:

        if column in df.columns:

            df[column] = (
                df[column]
                .astype("string")
                .str.strip()
                .str.upper()
            )

    return df


# ============================================================
# ASSET ID VALIDATION
# ============================================================

def validate_asset_ids(asset, request, existing):

    print("\n" + "=" * 70)
    print("ASSET ID VALIDATION")
    print("=" * 70)

    asset_ids = set(
        asset["asset_id"]
        .dropna()
        .unique()
    )

    request_ids = set(
        request["asset_id"]
        .dropna()
        .unique()
    )

    existing_ids = set(
        existing["asset_id"]
        .dropna()
        .unique()
    )

    request_missing = request_ids - asset_ids
    existing_missing = existing_ids - asset_ids

    print(
        f"Block Request asset IDs not in Asset Health: "
        f"{len(request_missing)}"
    )

    print(
        f"Existing Block asset IDs not in Asset Health: "
        f"{len(existing_missing)}"
    )

    return {
        "request_missing": request_missing,
        "existing_missing": existing_missing,
    }


# ============================================================
# SECTION ID VALIDATION
# ============================================================

def validate_section_ids(asset, request, existing):

    print("\n" + "=" * 70)
    print("SECTION ID VALIDATION")
    print("=" * 70)

    asset_sections = set(
        asset["section_id"]
        .dropna()
        .unique()
    )

    request_sections = set(
        request["section_id"]
        .dropna()
        .unique()
    )

    existing_sections = set(
        existing["section_id"]
        .dropna()
        .unique()
    )

    request_missing = request_sections - asset_sections
    existing_missing = existing_sections - asset_sections

    print(
        f"Block Request sections not in Asset Health: "
        f"{len(request_missing)}"
    )

    print(
        f"Existing Block sections not in Asset Health: "
        f"{len(existing_missing)}"
    )

    return {
        "request_missing": request_missing,
        "existing_missing": existing_missing,
    }


# ============================================================
# STATION CODE VALIDATION
# ============================================================

def validate_station_codes(
    asset,
    request,
    existing,
    timetable
):

    print("\n" + "=" * 70)
    print("STATION CODE VALIDATION")
    print("=" * 70)

    timetable_stations = set(
        timetable["station Code"]
        .dropna()
        .unique()
    )

    asset_stations = set(
        asset["nearest_station_code"]
        .dropna()
        .unique()
    )

    request_stations = set(
        request["station_code"]
        .dropna()
        .unique()
    )

    existing_stations = set(
        existing["station_code"]
        .dropna()
        .unique()
    )

    asset_missing = (
        asset_stations - timetable_stations
    )

    request_missing = (
        request_stations - timetable_stations
    )

    existing_missing = (
        existing_stations - timetable_stations
    )

    print(
        f"Asset Health stations not in timetable: "
        f"{len(asset_missing)}"
    )

    print(
        f"Block Request stations not in timetable: "
        f"{len(request_missing)}"
    )

    print(
        f"Existing Block stations not in timetable: "
        f"{len(existing_missing)}"
    )

    return {
        "asset_missing": asset_missing,
        "request_missing": request_missing,
        "existing_missing": existing_missing,
    }


# ============================================================
# BLOCK REQUEST → EXISTING BLOCK LINK
# ============================================================

def validate_request_links(request, existing):

    print("\n" + "=" * 70)
    print("BLOCK REQUEST → EXISTING BLOCK VALIDATION")
    print("=" * 70)

    request_ids = set(
        request["block_request_id"]
        .dropna()
        .unique()
    )

    linked_ids = set(
        existing["linked_block_request_id"]
        .dropna()
        .unique()
    )

    missing_links = linked_ids - request_ids

    print(
        f"Existing blocks with unknown request ID: "
        f"{len(missing_links)}"
    )

    return missing_links


# ============================================================
# ASSET → STATION MAPPING
# ============================================================

def create_asset_station_mapping(asset):

    mapping = (
        asset[
            [
                "asset_id",
                "section_id",
                "nearest_station_code",
            ]
        ]
        .drop_duplicates()
        .sort_values("asset_id")
    )

    output = MAPPING_DIR / "asset_station_mapping.csv"

    mapping.to_csv(
        output,
        index=False
    )

    print(
        f"\nCreated: {output}"
    )

    return mapping


# ============================================================
# REQUEST → ASSET MAPPING
# ============================================================

def create_request_asset_mapping(
    request,
    asset
):

    mapping = request.merge(
        asset[
            [
                "asset_id",
                "asset_type",
                "section_id",
                "nearest_station_code",
                "criticality",
                "asset_risk_score",
                "maintenance_priority",
            ]
        ],
        on="asset_id",
        how="left",
        suffixes=(
            "_request",
            "_asset"
        )
    )

    output = (
        MAPPING_DIR /
        "block_request_asset_mapping.csv"
    )

    mapping.to_csv(
        output,
        index=False
    )

    print(
        f"Created: {output}"
    )

    return mapping


# ============================================================
# REQUEST → STATION → TIMETABLE MAPPING
# ============================================================

def create_request_timetable_mapping(
    request,
    timetable
):

    timetable_station_info = (
        timetable[
            [
                "station Code",
                "Station Name",
            ]
        ]
        .drop_duplicates()
    )

    mapping = request.merge(
        timetable_station_info,
        left_on="station_code",
        right_on="station Code",
        how="left"
    )

    output = (
        MAPPING_DIR /
        "block_request_station_mapping.csv"
    )

    mapping.to_csv(
        output,
        index=False
    )

    print(
        f"Created: {output}"
    )

    return mapping


# ============================================================
# EXISTING BLOCK → TIMETABLE MAPPING
# ============================================================

def create_existing_timetable_mapping(
    existing,
    timetable
):

    timetable_station_info = (
        timetable[
            [
                "station Code",
                "Station Name",
            ]
        ]
        .drop_duplicates()
    )

    mapping = existing.merge(
        timetable_station_info,
        left_on="station_code",
        right_on="station Code",
        how="left"
    )

    output = (
        MAPPING_DIR /
        "existing_block_station_mapping.csv"
    )

    mapping.to_csv(
        output,
        index=False
    )

    print(
        f"Created: {output}"
    )

    return mapping


# ============================================================
# SECTION → STATION MAPPING
# ============================================================

def create_section_station_mapping(
    asset,
    request,
    existing
):

    asset_mapping = asset[
        [
            "section_id",
            "nearest_station_code",
        ]
    ].rename(
        columns={
            "nearest_station_code":
            "station_code"
        }
    )

    request_mapping = request[
        [
            "section_id",
            "station_code",
        ]
    ]

    existing_mapping = existing[
        [
            "section_id",
            "station_code",
        ]
    ]

    mapping = pd.concat(
        [
            asset_mapping,
            request_mapping,
            existing_mapping,
        ],
        ignore_index=True
    ).drop_duplicates()

    mapping = mapping.sort_values(
        [
            "section_id",
            "station_code"
        ]
    )

    output = (
        MAPPING_DIR /
        "section_station_mapping.csv"
    )

    mapping.to_csv(
        output,
        index=False
    )

    print(
        f"Created: {output}"
    )

    return mapping


# ============================================================
# VALIDATION REPORT
# ============================================================

def create_validation_report(
    asset,
    request,
    existing,
    timetable,
    asset_validation,
    section_validation,
    station_validation,
    request_links
):

    lines = []

    lines.append(
        "# Cross-Dataset Validation Report\n"
    )

    lines.append(
        "## Dataset Sizes\n"
    )

    lines.append(
        f"- Asset Health: {len(asset)} records"
    )

    lines.append(
        f"- Block Request: {len(request)} records"
    )

    lines.append(
        f"- Existing Blocks: {len(existing)} records"
    )

    lines.append(
        f"- Train Timetable: {len(timetable)} records"
    )

    # Asset IDs
    lines.append(
        "\n## Asset ID Validation\n"
    )

    lines.append(
        f"- Request asset IDs missing in Asset Health: "
        f"{len(asset_validation['request_missing'])}"
    )

    lines.append(
        f"- Existing block asset IDs missing in Asset Health: "
        f"{len(asset_validation['existing_missing'])}"
    )

    # Sections
    lines.append(
        "\n## Section ID Validation\n"
    )

    lines.append(
        f"- Request sections missing in Asset Health: "
        f"{len(section_validation['request_missing'])}"
    )

    lines.append(
        f"- Existing block sections missing in Asset Health: "
        f"{len(section_validation['existing_missing'])}"
    )

    # Stations
    lines.append(
        "\n## Station Code Validation\n"
    )

    lines.append(
        f"- Asset stations missing in timetable: "
        f"{len(station_validation['asset_missing'])}"
    )

    lines.append(
        f"- Request stations missing in timetable: "
        f"{len(station_validation['request_missing'])}"
    )

    lines.append(
        f"- Existing block stations missing in timetable: "
        f"{len(station_validation['existing_missing'])}"
    )

    # Request links
    lines.append(
        "\n## Block Request Links\n"
    )

    lines.append(
        f"- Existing blocks with unknown request ID: "
        f"{len(request_links)}"
    )

    # Overall
    total_errors = (
        len(asset_validation["request_missing"])
        + len(asset_validation["existing_missing"])
        + len(section_validation["request_missing"])
        + len(section_validation["existing_missing"])
        + len(station_validation["asset_missing"])
        + len(station_validation["request_missing"])
        + len(station_validation["existing_missing"])
        + len(request_links)
    )

    lines.append(
        "\n## Overall Result\n"
    )

    if total_errors == 0:

        lines.append(
            "All cross-dataset references are valid."
        )

    else:

        lines.append(
            f"Validation found {total_errors} "
            "reference issues requiring review."
        )

    output = (
        MAPPING_DIR /
        "cross_dataset_validation_report.md"
    )

    output.write_text(
        "\n".join(lines),
        encoding="utf-8"
    )

    print(
        f"\nCreated: {output}"
    )


# ============================================================
# MAIN
# ============================================================

def main():

    MAPPING_DIR.mkdir(
        parents=True,
        exist_ok=True
    )

    # Load
    (
        asset,
        request,
        existing,
        timetable
    ) = load_datasets()

    # Normalize
    asset = normalize_codes(
        asset,
        [
            "asset_id",
            "section_id",
            "nearest_station_code",
        ]
    )

    request = normalize_codes(
        request,
        [
            "block_request_id",
            "asset_id",
            "section_id",
            "station_code",
        ]
    )

    existing = normalize_codes(
        existing,
        [
            "existing_block_id",
            "linked_block_request_id",
            "asset_id",
            "section_id",
            "station_code",
        ]
    )

    timetable = normalize_codes(
        timetable,
        [
            "Train No.",
            "station Code",
            "Source Station Code",
            "Destination station Code",
        ]
    )

    # Validations
    asset_validation = validate_asset_ids(
        asset,
        request,
        existing
    )

    section_validation = validate_section_ids(
        asset,
        request,
        existing
    )

    station_validation = validate_station_codes(
        asset,
        request,
        existing,
        timetable
    )

    request_links = validate_request_links(
        request,
        existing
    )

    # Mappings
    create_asset_station_mapping(
        asset
    )

    create_request_asset_mapping(
        request,
        asset
    )

    create_request_timetable_mapping(
        request,
        timetable
    )

    create_existing_timetable_mapping(
        existing,
        timetable
    )

    create_section_station_mapping(
        asset,
        request,
        existing
    )

    # Report
    create_validation_report(
        asset,
        request,
        existing,
        timetable,
        asset_validation,
        section_validation,
        station_validation,
        request_links
    )

    print("\n" + "=" * 70)
    print("CROSS-DATASET VALIDATION COMPLETE")
    print("=" * 70)

    print(
        "\nMappings saved in:"
    )

    print(MAPPING_DIR)


if __name__ == "__main__":
    main()
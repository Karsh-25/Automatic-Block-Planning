# Existing Blocks Dataset

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
| block_date | date (YYYY-MM-DD) | Calendar date this block occupies | **Added in the 2026 65K-row refresh — not present in the original source file.** The source data had no date field at all; every existing block was implicitly treated as recurring on a single day. At 65,000 rows across only 4 teams, that made every team ~760x overbooked simultaneously (see `known_issue.md` #5). Dates were assigned uniformly at random (fixed seed, reproducible) across a ~2.7-year window ending 2026-09-05. The backend (`build_evaluation_context(..., reference_date="latest")`) filters to only the most recent date's ~74 rows for conflict-checking, restoring a realistic daily density; the full multi-year history remains in this file for audit and any future date-aware extension. |

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

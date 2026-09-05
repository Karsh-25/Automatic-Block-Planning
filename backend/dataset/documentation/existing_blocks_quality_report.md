# Existing Blocks Data Quality Report

## Dataset Summary

- Total records: 65000
- Total columns: 17

## Missing Values

| Column | Missing Count |
|---|---:|
| linked_block_request_id | 65000 |

## Duplicate Existing Block IDs

Duplicate rows: 0

## Validation Results

| Field | Invalid Records |
|---|---:|
| duration_min | 0 |
| start_time | 0 |
| end_time | 0 |
| duration_consistency | 0 |

## Categorical Values


### block_type
- Engineering Block
- Maintenance Block
- Planned Block

### assigned_team
- Bridge Inspection Team
- OHE Team
- Signal Team
- Track Maintenance Team

### status
- Active
- Confirmed
- Planned

### operational_priority
- High
- Normal

### source
- Existing/Committed

## Numeric Statistics

|       |   duration_min |   start_min |   end_min |   calculated_duration_min |
|:------|---------------:|------------:|----------:|--------------------------:|
| count |       65000    |    65000    |  65000    |                  65000    |
| mean  |          67.42 |      718.89 |    718.9  |                     67.42 |
| std   |          28.26 |      414.82 |    414.52 |                     28.26 |
| min   |          30    |        0    |      0    |                     30    |
| 25%   |          45    |      360    |    360    |                     45    |
| 50%   |          60    |      718    |    720    |                     60    |
| 75%   |          90    |     1078    |   1076    |                     90    |
| max   |         120    |     1439    |   1439    |                    120    |

## Data Preparation Notes

- Raw dataset is not modified.
- Missing values are reported rather than blindly imputed.
- Duplicate block IDs are reported for review.
- Original HH:MM time fields are retained.
- Numeric time fields are added for constraint processing.
- Existing blocks will later act as constraints for new block planning.
- No ML or optimization is performed in this script.
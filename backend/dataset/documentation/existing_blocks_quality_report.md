# Existing Blocks Data Quality Report

## Dataset Summary

- Total records: 35
- Total columns: 16

## Missing Values

| Column | Missing Count |
|---|---:|
| linked_block_request_id | 2 |

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
| count |          35    |       35    |     35    |                     35    |
| mean  |          74.14 |      632.94 |    707.09 |                     74.14 |
| std   |          32.32 |      422.42 |    423.9  |                     32.32 |
| min   |          30    |        8    |     53    |                     30    |
| 25%   |          45    |      271    |    361    |                     45    |
| 50%   |          60    |      609    |    680    |                     60    |
| 75%   |         105    |     1008.5  |   1098.5  |                    105    |
| max   |         120    |     1305    |   1380    |                    120    |

## Data Preparation Notes

- Raw dataset is not modified.
- Missing values are reported rather than blindly imputed.
- Duplicate block IDs are reported for review.
- Original HH:MM time fields are retained.
- Numeric time fields are added for constraint processing.
- Existing blocks will later act as constraints for new block planning.
- No ML or optimization is performed in this script.
# Block Request Data Quality Report

## Dataset Summary

- Total records: 60000
- Total columns: 16

## Missing Values

No missing values found.

## Duplicate Block Request IDs

Duplicate rows: 0

## Validation Results

| Field | Invalid Records |
|---|---:|
| requested_duration_min | 0 |
| preferred_start_time | 0 |
| time_flexibility | 0 |

## Categorical Values


### maintenance_type
- Bridge Inspection
- OHE Inspection
- Point Machine Maintenance
- Rail Grinding
- Signal Maintenance
- Track Inspection
- Track Renewal

### priority
- Critical
- High
- Low
- Medium

### time_flexibility
- Fixed
- ±15 min
- ±30 min
- ±60 min

### required_team
- Bridge Inspection Team
- OHE Team
- Signal Team
- Track Maintenance Team

### request_urgency
- Normal
- Urgent

### status
- Pending

## Numeric Statistics

|       |   requested_duration_min |   preferred_start_min |   flexibility_min |   earliest_start_min |   latest_start_min |
|:------|-------------------------:|----------------------:|------------------:|---------------------:|-------------------:|
| count |                 60000    |              60000    |          60000    |             60000    |           60000    |
| mean  |                    50.54 |                734.11 |             24.18 |               709.93 |             758.29 |
| std   |                    25.2  |                373.77 |             16.28 |               373.96 |             374.29 |
| min   |                    30    |                 30    |              0    |                 0    |              30    |
| 25%   |                    30    |                450    |             15    |               435    |             480    |
| 50%   |                    45    |                765    |             30    |               735    |             780    |
| 75%   |                    60    |               1005    |             30    |               975    |            1035    |
| max   |                   120    |               1365    |             60    |              1365    |            1410    |

## Data Preparation Notes

- Raw dataset is not modified.
- Missing values are reported rather than blindly imputed.
- Duplicate request IDs are reported for review.
- Time values are retained in original HH:MM format.
- Numeric time fields are added for constraint processing.
- No ML or optimization is performed in this script.
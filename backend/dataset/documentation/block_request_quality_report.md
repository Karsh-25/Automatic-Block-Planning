# Block Request Data Quality Report

## Dataset Summary

- Total records: 60
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
| count |                    60    |                 60    |             60    |                60    |              60    |
| mean  |                    70.25 |                680.5  |             24.25 |               656.25 |             704.75 |
| std   |                    27.82 |                405.1  |             16.59 |               405.56 |             405.32 |
| min   |                    30    |                 90    |              0    |                30    |             120    |
| 25%   |                    45    |                326.25 |             15    |               326.25 |             330    |
| 50%   |                    75    |                682.5  |             30    |               660    |             705    |
| 75%   |                    90    |               1053.75 |             30    |              1016.25 |            1076.25 |
| max   |                   120    |               1365    |             60    |              1365    |            1395    |

## Data Preparation Notes

- Raw dataset is not modified.
- Missing values are reported rather than blindly imputed.
- Duplicate request IDs are reported for review.
- Time values are retained in original HH:MM format.
- Numeric time fields are added for constraint processing.
- No ML or optimization is performed in this script.
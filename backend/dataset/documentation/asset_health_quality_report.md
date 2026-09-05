# Asset Health Data Quality Report

## Dataset Summary

- Total records: 65000
- Total columns: 12

## Missing Values

No missing values found.

## Range Validation

| Column | Invalid Records |
|---|---:|
| age_years | 0 |
| condition_score | 0 |
| failure_count_24m | 0 |
| days_since_last_maintenance | 0 |
| usage_percent | 0 |
| asset_risk_score | 0 |

## Categorical Values


### asset_type
- Bridge
- Level Crossing
- OHE
- Point Machine
- Signal
- Track

### criticality
- Critical
- High
- Low
- Medium

### maintenance_priority
- Critical
- High
- Low
- Medium

## Numeric Statistics

|       |   age_years |   condition_score |   failure_count_24m |   days_since_last_maintenance |   usage_percent |   asset_risk_score |
|:------|------------:|------------------:|--------------------:|------------------------------:|----------------:|-------------------:|
| count |    65000    |          65000    |            65000    |                      65000    |        65000    |           65000    |
| mean  |       18.83 |             65.87 |                2.42 |                        451.15 |           58.58 |              50.03 |
| std   |        9.03 |             12.03 |                1.73 |                        225.5  |           20.51 |              14.4  |
| min   |        1    |             20    |                0    |                         13    |           20    |              10    |
| 25%   |       12    |             57.59 |                1    |                        290    |           44    |              39.86 |
| 50%   |       19    |             65.89 |                2    |                        451    |           59    |              50.33 |
| 75%   |       25    |             74.1  |                3    |                        612.25 |           73    |              60.23 |
| max   |       35    |             99    |                9    |                        888    |          100    |              99    |

## ML Notes

- Asset risk score is retained as the model target.
- Risk score is not used as an input feature.
- Maintenance priority is not initially used as an input feature.
- Missing values are reported instead of blindly imputed.
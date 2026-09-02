# Asset Health Data Quality Report

## Dataset Summary

- Total records: 200
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
| count |      200    |            200    |              200    |                        200    |          200    |             200    |
| mean  |       18.87 |             65.5  |                2.15 |                        453.22 |           58.58 |              54.46 |
| std   |       10.45 |             18.29 |                2    |                        259.95 |           23.23 |              18.75 |
| min   |        1    |             20    |                0    |                         13    |           20    |              18.15 |
| 25%   |       10    |             51.6  |                0.75 |                        234.25 |           38    |              40.9  |
| 50%   |       18    |             65.63 |                2    |                        469.5  |           62    |              53.57 |
| 75%   |       28    |             79.21 |                3.25 |                        679.25 |           79    |              66.49 |
| max   |       35    |             99    |                9    |                        888    |          100    |              98.58 |

## ML Notes

- Asset risk score is retained as the model target.
- Risk score is not used as an input feature.
- Maintenance priority is not initially used as an input feature.
- Missing values are reported instead of blindly imputed.
# Asset Health Dataset

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

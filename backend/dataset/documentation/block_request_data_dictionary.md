# Block Request Dataset

This dataset contains maintenance/block requests submitted for
railway assets.

| Column | Type | Description | Validation |
|---|---|---|---|
| block_request_id | string | Unique block request identifier | Not null, unique |
| asset_id | string | Asset requiring maintenance | Standardized uppercase |
| section_id | string | Railway section | Standardized uppercase |
| station_code | string | Railway station code | Standardized uppercase |
| maintenance_type | categorical | Type of maintenance activity | Standardized text |
| requested_duration_min | integer | Required maintenance duration in minutes | > 0 |
| priority | categorical | Maintenance priority | Low/Medium/High/Critical |
| preferred_start_time | time | Preferred maintenance start time | HH:MM |
| time_flexibility | categorical | Allowed deviation from preferred start | Fixed/±15/±30/±60 min |
| required_team | categorical | Team required for maintenance | Standardized text |
| request_urgency | categorical | Urgency of request | Normal/Urgent |
| status | categorical | Current request status | Standardized text |

## Derived Fields

| Column | Description |
|---|---|
| preferred_start_min | Preferred start time converted to minutes from midnight |
| flexibility_min | Time flexibility converted to numeric minutes |
| earliest_start_min | Earliest allowed start time |
| latest_start_min | Latest allowed start time |

## Future Constraint / Optimization Usage

The following fields will be useful for the constraint engine:

- section_id
- station_code
- requested_duration_min
- preferred_start_min
- flexibility_min
- earliest_start_min
- latest_start_min
- required_team
- priority
- request_urgency
- status

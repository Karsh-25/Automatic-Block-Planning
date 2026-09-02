# Train Timetable Data Quality Report

## Dataset Summary

- Total records: 69006
- Total columns: 14
- Unique trains: 2810
- Unique stations: 4344

## Missing Values

| Column | Missing Count |
|---|---:|
| arrival_min | 69006 |
| departure_min | 69006 |

## Duplicate Records

Exact duplicate rows: 0

## Validation Results

| Field | Invalid Records |
|---|---:|
| islno | 0 |
| Distance | 0 |
| Arrival time | 69006 |
| Departure time | 69006 |
| departure_before_arrival | 0 |

## Station Information

- Unique station codes: 4344

## Numeric Statistics

|       |    islno |   Distance |
|:------|---------:|-----------:|
| count | 69006    |   69006    |
| mean  |    18.03 |     647.8  |
| std   |    16.01 |     643.42 |
| min   |     1    |       0    |
| 25%   |     7    |     173    |
| 50%   |    14    |     432    |
| 75%   |    24    |     931    |
| max   |   120    |    4273    |

## Data Preparation Notes

- Raw timetable file is not modified.
- Train numbers are preserved as strings.
- Station codes are normalized to uppercase.
- Original arrival and departure time fields are retained.
- Numeric time representations are added for constraint processing.
- No ML or optimization is performed in this script.
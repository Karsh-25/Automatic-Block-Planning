# Train Timetable Data Quality Report

## Dataset Summary

- Total records: 69006
- Total columns: 14
- Unique trains: 2810
- Unique stations: 4344

## Missing Values

No missing values found.

## Duplicate Records

Exact duplicate rows: 0

## Validation Results

| Field | Invalid Records |
|---|---:|
| islno | 0 |
| Distance | 0 |
| Arrival time | 0 |
| Departure time | 0 |
| departure_before_arrival | 2998 |

## Station Information

- Unique station codes: 4344

## Numeric Statistics

|       |    islno |   Distance |   arrival_min |   departure_min |
|:------|---------:|-----------:|--------------:|----------------:|
| count | 69006    |   69006    |      69006    |        69006    |
| mean  |    18.03 |     647.8  |        684.23 |          691.76 |
| std   |    16.01 |     643.42 |        436.97 |          439.35 |
| min   |     1    |       0    |          0    |            0    |
| 25%   |     7    |     173    |        305    |          310    |
| 50%   |    14    |     432    |        660    |          673    |
| 75%   |    24    |     931    |       1080    |         1090    |
| max   |   120    |    4273    |       1439    |         1439    |

## Data Preparation Notes

- Raw timetable file is not modified.
- Train numbers are preserved as strings.
- Station codes are normalized to uppercase.
- Original arrival and departure time fields are retained.
- Numeric time representations are added for constraint processing.
- No ML or optimization is performed in this script.
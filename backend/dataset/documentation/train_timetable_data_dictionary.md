# Train Timetable Dataset

This dataset contains station-wise train timetable information.

| Column | Type | Description | Validation |
|---|---|---|---|
| Train No. | string | Train identifier | Preserved as string |
| train Name | string | Train name | Trimmed text |
| islno | integer | Station sequence number in train route | > 0 |
| station Code | string | Station code where train stops | Uppercase |
| Station Name | string | Station name | Trimmed text |
| Arrival time | time | Train arrival time at station | HH:MM |
| Departure time | time | Train departure time from station | HH:MM |
| Distance | numeric | Distance associated with timetable record | >= 0 |
| Source Station Code | string | Train source station code | Uppercase |
| source Station Name | string | Train source station name | Trimmed text |
| Destination station Code | string | Train destination station code | Uppercase |
| Destination Station Name | string | Train destination station name | Trimmed text |

## Derived Fields

| Column | Description |
|---|---|
| arrival_min | Arrival time converted to minutes from midnight |
| departure_min | Departure time converted to minutes from midnight |

## Important Design Decision

`Train No.` is stored as a string instead of an integer.

This prevents identifiers such as `00851` from becoming `851`.

## Future Constraint Engine Usage

The timetable will be used to determine whether a proposed
maintenance block conflicts with scheduled train movements.

Useful fields include:

- Train No.
- station Code
- islno
- Arrival time
- Departure time
- arrival_min
- departure_min
- Source Station Code
- Destination station Code

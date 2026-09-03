# Relevant Timetable Dataset

This dataset is a **derived subset** of `train_timetable_clean.csv`.

It is NOT a replacement for the full timetable. The full clean
timetable (69,006 rows) is preserved untouched. This file only
contains train-stop rows at stations that are operationally
relevant to our current block requests and existing blocks.

## How "relevant" is determined

A station is considered relevant if it appears as `station_code`
in either:

- `block_request_clean.csv`
- `existing_blocks_clean.csv`

## Relevant Station Codes (42 total)

AK, ANG, ARAG, BBS, BD, BDWD, BINA, BNC, BZA, CNB, CND, DHI, DLGN, GAR, HBD, HBJ, HD, HWH, JEUR, JL, JMD, JTJ, KGP, KMN, KSRA, KVK, LTRR, MKU, MZR, NAVI, NGP, PAU, PC, PLO, PRLI, PUNE, RPH, RU, SEG, SUR, VSKP, WR

## Columns

Same columns as `train_timetable_clean.csv`. See
`train_timetable_data_dictionary.md` for full column definitions.

## Intended Usage

This subset is intended for the constraint engine (Dev 2) to check
whether a proposed maintenance block window conflicts with a train
movement at the same station.

This file may need to be regenerated if:
- New block requests introduce new station codes
- New existing blocks introduce new station codes
- The underlying train_timetable_clean.csv is regenerated

# Cross-Dataset Validation Report

## Dataset Sizes

- Asset Health: 65000 records
- Block Request: 60000 records
- Existing Blocks: 65000 records
- Train Timetable: 69006 records

## Asset ID Validation

- Request asset IDs missing in Asset Health: 0
- Existing block asset IDs missing in Asset Health: 0

## Section ID Validation

- Request sections missing in Asset Health: 0
- Existing block sections missing in Asset Health: 0

## Station Code Validation

- Asset stations missing in timetable: 0
- Request stations missing in timetable: 0
- Existing block stations missing in timetable: 0

## Block Request Links

- Existing blocks with unknown request ID: 0

## Overall Result

All cross-dataset references are valid.

## Note on Runtime Date Filtering (2026 refresh)

Existing Blocks now carries a `block_date` column (see
`existing_blocks_data_dictionary.md`) spanning ~2.7 years of history. The
65,000-record count above is the FULL historical file. At runtime, the
backend (`build_evaluation_context(..., reference_date="latest")`) filters
this down to only the most recent date's ~74 records before checking new
block requests for conflicts -- see `known_issue.md` #5 for why this
filtering is necessary at this dataset's scale.
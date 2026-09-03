# AI-Powered Automatic Railway Block Planning System

## Dev 1 — Data Engineering & Dataset Preparation

This part of the project prepares the railway datasets for the ML, constraint, optimization, simulation, and API layers.

Dev 1 is intentionally limited to **data ingestion, cleaning, validation, documentation, and cross-dataset mapping**. ML training and block optimization are handled by later development stages.

---

## 1. Tech Stack

- Python 3.11.x (recommended)
- pandas 2.2.3
- numpy 2.1.3
- tabulate 0.9.0
- CSV for dataset exchange
- Markdown for data documentation and quality reports

> Do not add FastAPI, scikit-learn, XGBoost, OR-Tools, etc. to the Dev 1 requirements unless the team explicitly starts those modules. Keeping Dev 1 lightweight makes the shared environment reproducible.

---

## 2. Project Structure

```text
backend/
├── dataset/
│   ├── raw/
│   │   ├── asset_health_dataset.csv
│   │   ├── block_request_dataset.csv
│   │   ├── existing_blocks_dataset.csv
│   │   └── isl_wise_train_detail_03082015_v1.csv
│   │
│   ├── processed/
│   │   ├── asset_health_clean.csv
│   │   ├── block_request_clean.csv
│   │   ├── existing_blocks_clean.csv
│   │   └── train_timetable_clean.csv
│   │
│   ├── mapping/
│   │   ├── asset_station_mapping.csv
│   │   ├── block_request_asset_mapping.csv
│   │   ├── block_request_station_mapping.csv
│   │   ├── existing_block_station_mapping.csv
│   │   ├── section_station_mapping.csv
│   │   └── cross_dataset_validation_report.md
│   │
│   ├── documentation/
│   │   ├── asset_health_data_dictionary.md
│   │   ├── asset_health_quality_report.md
│   │   ├── block_request_data_dictionary.md
│   │   ├── block_request_quality_report.md
│   │   ├── existing_blocks_data_dictionary.md
│   │   ├── existing_blocks_quality_report.md
│   │   ├── train_timetable_data_dictionary.md
│   │   └── train_timetable_quality_report.md
│   │
|   ├── scripts/
│       ├── prepare_data.py
│       ├── prepare_block_request.py
│       ├── prepare_existing_blocks.py
│       ├── prepare_train_timetable.py
│       └── validate_and_create_mappings.py
│
├── requirements.txt
└── README.md
```

If the repository uses a different top-level backend README name, keep the Dev 1 content in that README or merge this document into it.

---

## 3. Environment Setup

From the `backend` directory:

### Windows PowerShell

```powershell
python --version
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

### macOS / Linux

```bash
python3 --version
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Verify the environment:

```bash
python -c "import pandas, numpy, tabulate; print('Dev 1 environment OK')"
```

All developers should use the same `requirements.txt` rather than installing packages individually.

---

## 4. Dataset Flow

```text
raw CSV files
     ↓
cleaning / type conversion / validation
     ↓
processed/*.csv
     ↓
data dictionaries + quality reports
     ↓
cross-dataset validation
     ↓
mapping/*.csv + validation report
     ↓
Ready for Dev 2 / ML / constraints / optimization
```

### Important rule

The `raw/` datasets are source data and should not be modified manually. All transformations must happen through the preparation scripts.

---

## 5. Run Order

Run the scripts from `backend/dataset/` in this order:

```bash
python prepare_data.py
python prepare_block_request.py
python prepare_existing_blocks.py
python prepare_train_timetable.py
python validate_and_create_mappings.py
```

The first four scripts create the cleaned datasets. The final script checks that references between datasets are valid and generates the mapping files.

### Expected final validation

The cross-dataset validation report should show **0 invalid references / validation errors** for the current dataset version.

If the validation count becomes non-zero after a dataset change, do not ignore it. Fix the source data or update the mapping/normalization logic before handing the data to downstream developers.

---

## 6. Cleaning Rules

### Asset Health

- IDs and station/section codes are normalized as strings and uppercased.
- Numeric fields are converted to numeric types.
- Range checks are applied to age, condition, usage, failures, days since maintenance, and risk score.
- Duplicate `asset_id` values and missing values are reported rather than silently deleted or imputed.

### Block Request

- IDs, station codes, asset IDs, and section IDs are normalized.
- `requested_duration_min` is numeric.
- `preferred_start_time` is converted to minutes from midnight.
- `time_flexibility` is converted to `flexibility_min`.
- `earliest_start_min` and `latest_start_min` are derived for scheduling.

### Existing Blocks

- IDs/codes are normalized.
- Start/end times are converted to minutes from midnight.
- Duration is checked against start/end times.
- Midnight crossover is handled by the validation logic.
- Missing or inconsistent records are reported.

### Train Timetable

- `Train No.` is read as a string so leading zeros are preserved.
- Station codes are normalized.
- `islno` and `Distance` are numeric.
- Arrival/departure times are converted to minute-of-day fields.
- Invalid sequence/time records and duplicate rows are reported.

---

## 7. Mapping & Validation

The timetable is station-based and does not contain a direct `section_id` field. Therefore, `section_station_mapping.csv` is an **MVP mapping derived from the asset/block datasets**.

It must not be treated as authoritative railway topology in a production deployment. A production system should use an actual railway section/track topology source.

The validation checks include:

- Block request → asset health (`asset_id`)
- Existing block → asset health (`asset_id`)
- Block request → asset health (`section_id`)
- Existing block → asset health (`section_id`)
- Request/existing-block station codes → timetable station codes
- Existing block → block request (`linked_block_request_id`)

---

## 8. Timetable Size — Do Not Randomly Synthesize It

The cleaned timetable may contain tens of thousands of rows. That is acceptable for pandas-based preprocessing and does **not** require replacing the timetable with fake synthetic rows.

For the optimization stage, the team may create a **relevant timetable subset or conflict representation** using the stations/sections involved in active block requests. This is different from synthesizing fake trains.

Recommended approach:

```text
Full real timetable
      ↓
filter to relevant stations / planning horizon
      ↓
relevant timetable subset
      ↓
train-block conflict detection
      ↓
optimization
```

Keep the full cleaned timetable as the source of truth.

---

## 9. Important ML Note

`asset_risk_score` is currently available in the asset-health dataset. If this value is formula-derived rather than generated from historical failure outcomes, it should **not** be treated as a true historical failure label.

For the first ML prototype, avoid using `asset_risk_score` as an input feature when the model is intended to predict risk. Otherwise the model can simply learn the existing score instead of learning independent patterns.

A production ML model should ideally be trained against historical defect/failure/maintenance-outcome labels.

---

## 10. Git / Team Rules

- Never commit `.venv/`.
- Do not modify files inside `raw/` manually.
- Do not overwrite processed data manually; regenerate it with the preparation scripts.
- Commit changes to scripts and documentation together when a schema/cleaning rule changes.
- If a column is renamed or added, update the corresponding data dictionary and inform downstream developers.
- Do not silently change categorical values; normalization rules should be explicit.
- Do not silently delete invalid rows. Report them and document the decision.

Recommended `.gitignore` entries:

```gitignore
.venv/
__pycache__/
*.pyc
.pytest_cache/
.env
```

---

## 11. Dev 1 Completion Checklist

- [x] Asset Health cleaned
- [x] Block Request cleaned
- [x] Existing Blocks cleaned
- [x] Train Timetable cleaned
- [x] Data dictionaries generated
- [x] Data quality reports generated
- [x] Cross-dataset mappings generated
- [x] Cross-dataset validation completed
- [x] Current validation result: 0 invalid references
- [x] Shared Python requirements finalized
- [x] Dev 1 README finalized

**Dev 1 status: COMPLETE.**

Next stage can consume only the files under `processed/` and `mapping/`, while `raw/` remains the original source layer.

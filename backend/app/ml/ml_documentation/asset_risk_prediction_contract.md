# Asset Risk Prediction — Output Contract

**Module:** `backend/app/ml/inference.py`
**Function:** `predict_risk(asset: dict) -> dict`
**Batch function:** `predict_risk_batch(assets: list[dict]) -> list[dict]`
**Model artifact:** `backend/app/ml/models/asset_risk_model.joblib`
**Phase:** 5 (Output Contract)
**Status:** Ready for backend/API integration

---

## Purpose

This function takes raw asset health data and returns a predicted risk score,
a priority label, and a confidence flag. It is designed to be called directly
from a backend route (e.g. FastAPI) with minimal wrapping.

It does **not** read `asset_risk_score` or `maintenance_priority` as input —
both are predicted/derived internally to avoid data leakage.

---

## Input Schema

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `age_years` | float | Yes | Age of the asset in years | `12` |
| `condition_score` | float | Yes | Physical condition score (0-100 scale, higher = better condition) | `45` |
| `failure_count_24m` | int | Yes | Number of recorded failures in the last 24 months | `6` |
| `days_since_last_maintenance` | int | Yes | Days elapsed since last maintenance | `210` |
| `usage_percent` | float | Yes | Utilization percentage of the asset | `78` |
| `criticality` | string | Yes | One of: `"Low"`, `"Medium"`, `"High"`, `"Critical"` | `"High"` |
| `asset_type` | string | Yes | One of: `"Track"`, `"Bridge"`, `"Signal"`, `"OHE"`, `"Point Machine"`, `"Level Crossing"` | `"Bridge"` |

**Example input:**
```json
{
  "age_years": 12,
  "condition_score": 45,
  "failure_count_24m": 6,
  "days_since_last_maintenance": 210,
  "usage_percent": 78,
  "criticality": "High",
  "asset_type": "Bridge"
}
```

**Notes for backend team:**
- All fields listed above are required. Missing fields will raise a `ValueError`
  before the model is called (see Error Handling below).
- Field names must match exactly (case-sensitive).
- `criticality` and `asset_type` values should match categories seen in the
  training data (`asset_health_clean.csv`). Unseen categories are handled
  safely by the model (one-hot encoding ignores unknown categories) but may
  reduce prediction quality.

---

## Output Schema

| Field | Type | Description |
|---|---|---|
| `predicted_risk_score` | float | Predicted risk score, clipped to range 0-100, rounded to 2 decimals |
| `predicted_priority` | string | One of `"Low"`, `"Medium"`, `"High"`, `"Critical"` — derived from `predicted_risk_score` using fixed cutoffs |
| `borderline` | boolean | `true` if the score is within 8 points of a bucket cutoff (35, 60, 80) |
| `confidence_note` | string | Human-readable note explaining the `borderline` flag |

**Example output:**
```json
{
  "predicted_risk_score": 68.19,
  "predicted_priority": "High",
  "borderline": false,
  "confidence_note": "Confident prediction — clearly within the bucket range."
}
```

**Priority bucket cutoffs (fixed, same as source data):**
| Priority | Score Range |
|---|---|
| Low | < 35 |
| Medium | 35 – 60 |
| High | 60 – 80 |
| Critical | 80+ |

**Why `borderline` matters:**
Model evaluation showed that most misclassifications happen when the true
score is close to a cutoff line (average distance ~2.9 points in test data).
The `borderline` flag surfaces this uncertainty to the frontend/user instead
of hiding it, so cases near a cutoff can be flagged for manual review rather
than treated as a fully automated decision.

---

## Batch Usage

For multiple assets at once, use `predict_risk_batch`:

**Input:** list of asset dicts (same schema as above)
```json
[
  { "age_years": 12, "condition_score": 45, "failure_count_24m": 6, "days_since_last_maintenance": 210, "usage_percent": 78, "criticality": "High", "asset_type": "Bridge" },
  { "age_years": 5, "condition_score": 80, "failure_count_24m": 1, "days_since_last_maintenance": 30, "usage_percent": 40, "criticality": "Low", "asset_type": "Track" }
]
```

**Output:** list of result dicts, same order as input, same schema as single `predict_risk` output.

---

## Error Handling

| Condition | Behavior |
|---|---|
| Missing required field(s) | Raises `ValueError("Missing required fields: [...]")` before calling the model |
| Score outside 0-100 (rare model overshoot) | Automatically clipped to 0-100, no error raised |
| Unknown category in `criticality`/`asset_type` | Handled silently by the model (no crash), but should be flagged in logs by the backend if it happens often |

Backend integration should wrap calls to `predict_risk` / `predict_risk_batch`
in a try/except and return an appropriate HTTP 400 response on `ValueError`.

---

## Suggested API Route (for reference, not yet implemented)

```
POST /api/asset-risk/predict
Body: single asset dict (Input Schema above)
Response: single result dict (Output Schema above)

POST /api/asset-risk/predict-batch
Body: list of asset dicts
Response: list of result dicts
```

---

## Model Info (2026 refresh — 65K dataset)

- **Type:** Linear Regression (scikit-learn), selected after comparing against
  Random Forest, HistGradientBoosting, and XGBoost — it had the best
  validation RMSE of the four candidates on this dataset (added model
  complexity did not improve generalization here; `criticality` and
  `condition_score` dominate the signal and the relationship is largely
  linear once those are one-hot/passthrough encoded). See
  `backend/app/ml/reports/phase3_evaluation_report.md` for the full
  comparison table and `backend/app/ml/models/model_metadata.json` for
  machine-readable details.
- **Target:** `asset_risk_score` (regression, not classification — avoids leakage from `maintenance_priority`)
- **Test set performance:** RMSE 5.07, MAE 4.04, R² 0.874
- **Bucket accuracy:** 74.8% raw; 96.1% of the remaining misclassifications were within 8 points of a cutoff (i.e. borderline, not a genuine model error)
- **Training data size:** 65,000 rows (39,000 train / 13,000 validation / 13,000 test, stratified by criticality)
- **Data note:** `asset_health_dataset` is a simulated/synthetic railway asset dataset, not real IR sensor telemetry — this is an ML-based asset risk **estimation prototype**, not a production failure-prediction system.

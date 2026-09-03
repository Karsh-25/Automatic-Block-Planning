"""
Phase 3: Feature Engineering + Baseline Regression Model
Predicts asset_risk_score from raw asset health features (leakage-safe).
"""

import pandas as pd
import numpy as np
import joblib
from pathlib import Path
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score

# ---------- Paths ----------
# Script location: backend/app/ml/train_asset_risk_model.py
# Data location:   backend/dataset/processed/asset_health_clean.csv
BASE_DIR = Path(__file__).resolve().parents[2]   # -> backend/
DATA_PATH = BASE_DIR / "dataset" / "processed" / "asset_health_clean.csv"

MODEL_DIR = Path(__file__).resolve().parent / "models"
MODEL_DIR.mkdir(parents=True, exist_ok=True)
MODEL_PATH = MODEL_DIR / "asset_risk_model.joblib"

REPORT_DIR = Path(__file__).resolve().parent / "reports"
REPORT_DIR.mkdir(parents=True, exist_ok=True)
REPORT_PATH = REPORT_DIR / "phase3_evaluation_report.md"

# ---------- Load ----------
df = pd.read_csv(DATA_PATH)

TARGET = "asset_risk_score"
NUMERIC_FEATURES = [
    "age_years", "condition_score", "failure_count_24m",
    "days_since_last_maintenance", "usage_percent"
]
CATEGORICAL_FEATURES = ["criticality", "asset_type"]
EXCLUDE = ["asset_id", "section_id", "nearest_station_code",
           "maintenance_priority", TARGET]

X = df[NUMERIC_FEATURES + CATEGORICAL_FEATURES]
y = df[TARGET]

assert not any(col in X.columns for col in EXCLUDE if col != TARGET)

# ---------- Stratified split on criticality ----------
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.20, random_state=42, stratify=X["criticality"]
)

# ---------- Preprocessing pipeline ----------
preprocessor = ColumnTransformer(
    transformers=[
        ("num", "passthrough", NUMERIC_FEATURES),
        ("cat", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL_FEATURES),
    ]
)

model = Pipeline(steps=[
    ("preprocess", preprocessor),
    ("regressor", RandomForestRegressor(
        n_estimators=300,
        max_depth=8,
        min_samples_leaf=3,
        random_state=42,
        n_jobs=-1
    ))
])

# ---------- Train ----------
model.fit(X_train, y_train)

# ---------- Predict & Evaluate ----------
y_pred = model.predict(X_test)

rmse = np.sqrt(mean_squared_error(y_test, y_pred))
mae = mean_absolute_error(y_test, y_pred)
r2 = r2_score(y_test, y_pred)

# ---------- Downstream bucketing function (same cutoffs as original) ----------
def bucket_priority(score):
    if score < 35:
        return "Low"
    elif score < 60:
        return "Medium"
    elif score < 80:
        return "High"
    else:
        return "Critical"

pred_priority = pd.Series(y_pred, index=X_test.index).apply(bucket_priority)
true_priority = df.loc[X_test.index, "maintenance_priority"]

bucket_accuracy = (pred_priority == true_priority).mean()

# ---------- Feature importance ----------
feature_names = (
    NUMERIC_FEATURES +
    list(model.named_steps["preprocess"]
         .named_transformers_["cat"]
         .get_feature_names_out(CATEGORICAL_FEATURES))
)
importances = model.named_steps["regressor"].feature_importances_
importance_df = pd.DataFrame({
    "feature": feature_names,
    "importance": importances
}).sort_values("importance", ascending=False)

# ---------- Save model ----------
joblib.dump(model, MODEL_PATH)

# ---------- Save evaluation report ----------
report = f"""Phase 3 Evaluation Report — asset_risk_score Regression

 Data
Source: {DATA_PATH}
Train rows: {len(X_train)} | Test rows: {len(X_test)}

## Metrics (Test Set, n={len(y_test)})
- RMSE: {rmse:.3f}
- MAE: {mae:.3f}
- R2 Score: {r2:.3f}

## Downstream Bucket Accuracy (derived maintenance_priority)
- Accuracy: {bucket_accuracy:.3f} ({int(bucket_accuracy*len(y_test))}/{len(y_test)} correct)

## Feature Importances
{importance_df.to_string(index=False)}

## Model Artifact
Saved to: {MODEL_PATH}
"""

with open(REPORT_PATH, "w") as f:
    f.write(report)

print(report)
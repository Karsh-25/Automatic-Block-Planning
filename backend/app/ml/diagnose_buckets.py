"""
Diagnostic: Phase 3 me bucket misclassification kahan ho raha hai?
"""

import pandas as pd
import numpy as np
import joblib
from pathlib import Path
from sklearn.model_selection import train_test_split

BASE_DIR = Path(__file__).resolve().parents[2]
DATA_PATH = BASE_DIR / "dataset" / "processed" / "asset_health_clean.csv"
MODEL_PATH = Path(__file__).resolve().parent / "models" / "asset_risk_model.joblib"

df = pd.read_csv(DATA_PATH)

NUMERIC_FEATURES = ["age_years", "condition_score", "failure_count_24m",
                     "days_since_last_maintenance", "usage_percent"]
CATEGORICAL_FEATURES = ["criticality", "asset_type"]

X = df[NUMERIC_FEATURES + CATEGORICAL_FEATURES]
y = df["asset_risk_score"]

# NOTE: must mirror train_asset_risk_model.py's exact two-stage 60/20/20
# split (same random_state) so this diagnostic evaluates the model on the
# SAME held-out test rows it was never trained on -- a single 80/20 split
# here would silently include rows the current model WAS trained on and
# make the diagnosis meaningless.
X_train, X_temp, y_train, y_temp = train_test_split(
    X, y, test_size=0.40, random_state=42, stratify=X["criticality"]
)
X_val, X_test, y_val, y_test = train_test_split(
    X_temp, y_temp, test_size=0.50, random_state=42, stratify=X_temp["criticality"]
)

model = joblib.load(MODEL_PATH)
y_pred = model.predict(X_test)

def bucket_priority(score):
    if score < 35: return "Low"
    elif score < 60: return "Medium"
    elif score < 80: return "High"
    else: return "Critical"

result = pd.DataFrame({
    "true_score": y_test.values,
    "pred_score": y_pred,
    "error": y_pred - y_test.values,
    "true_bucket": [bucket_priority(s) for s in y_test.values],
    "pred_bucket": [bucket_priority(s) for s in y_pred],
})
result["misclassified"] = result["true_bucket"] != result["pred_bucket"]
result["dist_to_boundary"] = result["true_score"].apply(
    lambda s: min(abs(s - b) for b in [35, 60, 80])
)

mis = result[result["misclassified"]].sort_values("dist_to_boundary")

print(f"Total misclassified: {len(mis)}/{len(result)}\n")
print("Misclassified cases (sorted by distance to nearest boundary):")
print(mis[["true_score", "pred_score", "error", "true_bucket", "pred_bucket", "dist_to_boundary"]].to_string(index=False))

near_boundary = (mis["dist_to_boundary"] <= 8).sum()
print(f"\nBoundary-zone errors (within 8 pts of cutoff): {near_boundary}/{len(mis)}")
print(f"Far-from-boundary errors (genuine model miss): {len(mis) - near_boundary}/{len(mis)}")
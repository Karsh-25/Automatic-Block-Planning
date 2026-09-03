"""
Phase 4: Inference function for asset_risk_score prediction.
Includes a borderline confidence flag near bucket cutoffs.
"""

import pandas as pd
import joblib
from pathlib import Path

MODEL_PATH = Path(__file__).resolve().parent / "models" / "asset_risk_model.joblib"

BOUNDARIES = [35, 60, 80]
BORDERLINE_MARGIN = 8  # based on diagnostic: most misclassifications were within ~8 points of a cutoff

_model = None  # loaded once and reused


def _load_model():
    global _model
    if _model is None:
        _model = joblib.load(MODEL_PATH)
    return _model


def bucket_priority(score: float) -> str:
    """Convert a numeric risk score into a priority label."""
    if score < 35:
        return "Low"
    elif score < 60:
        return "Medium"
    elif score < 80:
        return "High"
    else:
        return "Critical"


def is_borderline(score: float, margin: float = BORDERLINE_MARGIN) -> bool:
    """Return True if the score is close to any cutoff line."""
    return any(abs(score - b) <= margin for b in BOUNDARIES)


def predict_risk(asset: dict) -> dict:
    """
    Predict risk score for a single asset.

    Expected input keys:
        age_years, condition_score, failure_count_24m,
        days_since_last_maintenance, usage_percent,
        criticality, asset_type

    Returns a clean, JSON-safe dict:
        {
            "predicted_risk_score": float,
            "predicted_priority": str,
            "borderline": bool,
            "confidence_note": str
        }
    """
    model = _load_model()

    required_fields = [
        "age_years", "condition_score", "failure_count_24m",
        "days_since_last_maintenance", "usage_percent",
        "criticality", "asset_type"
    ]
    missing = [f for f in required_fields if f not in asset]
    if missing:
        raise ValueError(f"Missing required fields: {missing}")

    X = pd.DataFrame([{k: asset[k] for k in required_fields}])

    raw_score = float(model.predict(X)[0])
    raw_score = max(0.0, min(100.0, raw_score))  # keep score within a valid 0-100 range

    priority = bucket_priority(raw_score)
    borderline = is_borderline(raw_score)

    confidence_note = (
        f"Score is within {BORDERLINE_MARGIN} points of a bucket cutoff — "
        "manual review recommended."
        if borderline else
        "Confident prediction — clearly within the bucket range."
    )

    return {
        "predicted_risk_score": round(raw_score, 2),
        "predicted_priority": priority,
        "borderline": borderline,
        "confidence_note": confidence_note
    }


def predict_risk_batch(assets: list[dict]) -> list[dict]:
    """Run predict_risk on a list of assets and return a list of results."""
    return [predict_risk(a) for a in assets]


# ---------- Quick manual test ----------
if __name__ == "__main__":
    sample_asset = {
        "age_years": 12,
        "condition_score": 45,
        "failure_count_24m": 6,
        "days_since_last_maintenance": 210,
        "usage_percent": 78,
        "criticality": "High",
        "asset_type": "Bridge"
    }

    result = predict_risk(sample_asset)
    print("Sample prediction:")
    print(result)
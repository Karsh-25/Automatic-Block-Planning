# Phase 3 Evaluation Report — asset_risk_score Regression

## Data
Source: C:\Users\nanda\OneDrive\Desktop\Automatic-Block-Planning\backend\dataset\processed\asset_health_clean.csv
Train rows: 160 | Test rows: 40

## Metrics (Test Set, n=40)
- RMSE: 6.295
- MAE: 5.483
- R2 Score: 0.897

## Downstream Bucket Accuracy (derived maintenance_priority)
- Accuracy: 0.675 (27/40 correct)

## Feature Importances
                    feature  importance
          failure_count_24m    0.469387
            condition_score    0.218983
days_since_last_maintenance    0.138113
                  age_years    0.134143
              usage_percent    0.018690
         criticality_Medium    0.005804
       criticality_Critical    0.005088
           criticality_High    0.002995
             asset_type_OHE    0.001993
          asset_type_Bridge    0.001705
           asset_type_Track    0.000902
          asset_type_Signal    0.000855
            criticality_Low    0.000603
  asset_type_Level Crossing    0.000445
   asset_type_Point Machine    0.000296

## Model Artifact
Saved to: C:\Users\nanda\OneDrive\Desktop\Automatic-Block-Planning\backend\app\ml\models\asset_risk_model.joblib

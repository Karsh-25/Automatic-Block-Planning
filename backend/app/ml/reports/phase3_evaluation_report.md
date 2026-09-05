# Phase 3 Evaluation Report — asset_risk_score Regression (v2, 65K dataset)

## Data
Source: `dataset/processed/asset_health_clean.csv`
Total rows: 65000
Train rows: 39000 | Validation rows: 13000 | Test rows: 13000
Split: random, stratified on `criticality` (60/20/20). Not time-series data
(no date/time column in asset_health), so a stratified random split is used
rather than a temporal split.

## Model Comparison (Validation Set, n=13000)

| model                |   rmse |    mae |     r2 |   batch_inference_ms_total |   single_prediction_latency_ms |     n |   train_time_s |
|:---------------------|-------:|-------:|-------:|---------------------------:|-------------------------------:|------:|---------------:|
| LinearRegression     | 5.0255 | 3.9886 | 0.8783 |                     9.0659 |                         2.8086 | 13000 |         0.067  |
| RandomForest         | 5.1664 | 4.0932 | 0.8714 |                   351.298  |                        15.8644 | 13000 |        22.293  |
| HistGradientBoosting | 5.0783 | 4.0331 | 0.8758 |                    67.9252 |                         3.5736 | 13000 |         0.4792 |
| XGBoost              | 5.0985 | 4.0429 | 0.8748 |                    76.2928 |                         3.5034 | 13000 |         1.1288 |

## Selected Model: LinearRegression

Lowest validation RMSE (5.026) among ['LinearRegression', 'RandomForest', 'HistGradientBoosting', 'XGBoost']; latency is sub-millisecond for all candidates so it was not a differentiator here.

## Final Test-Set Metrics (n=13000, untouched during selection)
- RMSE: 5.073
- MAE: 4.043
- R2 Score: 0.8742
- Single-prediction latency: 2.291 ms

## Downstream Bucket Accuracy (derived maintenance_priority, fixed cutoffs 35/60/80)
- Accuracy: 0.748 (9728/13000 correct)
- Share of misclassifications within 8 points of a cutoff: 0.961

## Feature Importances
                    feature  importance
       criticality_Critical   17.980377
            criticality_Low   17.062362
         criticality_Medium    6.950780
           criticality_High    6.032764
          failure_count_24m    1.115105
            condition_score    0.301987
  asset_type_Level Crossing    0.109441
                  age_years    0.074182
   asset_type_Point Machine    0.063047
              usage_percent    0.061151
          asset_type_Bridge    0.057562
           asset_type_Track    0.043236
          asset_type_Signal    0.030193
days_since_last_maintenance    0.018129
             asset_type_OHE    0.001875

## Sample Test-Set Predictions
 asset_id  true_risk_score  predicted_risk_score  abs_error
 AST-9493            39.65                 42.41       2.76
AST-61953            44.80                 44.81       0.01
AST-17005            19.90                 15.90       4.00
 AST-9560            72.54                 68.92       3.62
AST-40090            59.68                 56.78       2.90

## Model Artifact
Saved to: `app/ml/models/asset_risk_model.joblib` (complete preprocessing + model pipeline)
Metadata: `app/ml/models/model_metadata.json`

## Honesty Note
asset_health_dataset_65000.csv is a simulated/synthetic railway asset dataset (per its data dictionary), not real IR sensor telemetry. This is an ML-based asset risk estimation prototype trained on the available railway asset dataset, not a production failure-prediction system.

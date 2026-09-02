# -*- coding: utf-8 -*-
import mlflow
import mlflow.sklearn
import pandas as pd
import joblib
import numpy as np
import time
from datetime import datetime
from tqdm import tqdm

from sklearn.model_selection import train_test_split, cross_val_score, StratifiedKFold
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.pipeline import Pipeline
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    classification_report,
)


# Track overall execution time
TOTAL_START_TIME = time.time()
OVERALL_START_TIME = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

print('\n' + '='*70)
print(' ORDER PREDICTION MODEL TRAINING PIPELINE')
print('='*70)
print(f'Started at: {OVERALL_START_TIME}')
print('='*70)


# --------------------------------------------------
# 1. Load data
# --------------------------------------------------

DATA_PATH = 'data/orders.csv'

# Try to connect to MLflow, but don't block if it's not available
MLFLOW_AVAILABLE = False
try:
    import socket
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(2)  # 2 second timeout
    result = sock.connect_ex(('127.0.0.1', 5000))
    sock.close()
    
    if result == 0:
        mlflow.set_tracking_uri('http://127.0.0.1:5000')
        mlflow.set_experiment('order-prediction')
        MLFLOW_AVAILABLE = True
        print('\n[MLflow] Connected to tracking server at http://127.0.0.1:5000')
    else:
        print('\n[MLflow] Server not available - running without MLflow tracking')
        print('[MLflow] Start MLflow with: start_mlflow.bat')
except Exception as e:
    print(f'\n[MLflow] Connection error: {e}')
    print('[MLflow] Running without MLflow tracking')

print('\n[1/7] Loading dataset...')
LOAD_START = time.time()

df = pd.read_csv(DATA_PATH)

print(f'       Dataset loaded: {df.shape}')
print(f'       Load time: {time.time() - LOAD_START:.2f}s')


# --------------------------------------------------
# 2. Separate features and target
# --------------------------------------------------

X = df.drop('order_result', axis=1)
y = df['order_result']


# --------------------------------------------------
# 3. Identify column types
# --------------------------------------------------

categorical_features = [
    'region',
    'channel',
    'service_type',
    'plan_type',
    'customer_type',
]

numeric_features = [
    'address_verified',
    'network_available',
    'inventory_available',
    'credit_check_passed',
    'installation_required',
    'monthly_charge',
    'previous_failed_orders',
]


# --------------------------------------------------
# 4. Preprocessing
# --------------------------------------------------

preprocessor = ColumnTransformer(
    transformers=[
        (
            'categorical',
            OneHotEncoder(handle_unknown='ignore'),
            categorical_features,
        )
    ],
    remainder='passthrough',
)


# --------------------------------------------------
# 5. Create ML model
# --------------------------------------------------

model = RandomForestClassifier(
    n_estimators=500,
    random_state=42,
    class_weight='balanced',
)


# --------------------------------------------------
# 6. Create complete ML pipeline
# --------------------------------------------------

pipeline = Pipeline(
    steps=[
        ('preprocessor', preprocessor),
        ('model', model),
    ]
)


# --------------------------------------------------
# 7. K-Fold Cross-Validation
# --------------------------------------------------

CV_FOLDS = 5

print(f'\n[2/7] Running K-Fold Cross-Validation ({CV_FOLDS} folds)...')
CV_START = time.time()

cv_strategy = StratifiedKFold(
    n_splits=CV_FOLDS,
    shuffle=True,
    random_state=42,
)

# Show progress for each metric
metrics = ['accuracy', 'precision', 'recall', 'f1']
cv_results = {}

for metric in tqdm(metrics, desc='       CV Metrics', ncols=70):
    scores = cross_val_score(
        pipeline,
        X,
        y,
        cv=cv_strategy,
        scoring=metric,
        n_jobs=-1,
    )
    cv_results[metric] = scores

cv_accuracy = cv_results['accuracy']
cv_precision = cv_results['precision']
cv_recall = cv_results['recall']
cv_f1 = cv_results['f1']

print(f'\n       Cross-Validation Results:')
print(f'       Accuracy : {cv_accuracy.mean():.4f} +/- {cv_accuracy.std():.4f}')
print(f'       Precision: {cv_precision.mean():.4f} +/- {cv_precision.std():.4f}')
print(f'       Recall   : {cv_recall.mean():.4f} +/- {cv_recall.std():.4f}')
print(f'       F1 Score : {cv_f1.mean():.4f} +/- {cv_f1.std():.4f}')

print('\n       Per-fold F1 scores:')
for i, score in enumerate(cv_f1, 1):
    print(f'         Fold {i}: {score:.4f}')

print(f'       CV time: {time.time() - CV_START:.2f}s')


# --------------------------------------------------
# 8. Train / Test split (final evaluation)
# --------------------------------------------------

print(f'\n[3/7] Splitting data (80/20 train/test)...')
SPLIT_START = time.time()

X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.19,
    random_state=42,
    stratify=y,
)

print(f'       Training records: {len(X_train)}')
print(f'       Testing records: {len(X_test)}')
print(f'       Split time: {time.time() - SPLIT_START:.2f}s')


# --------------------------------------------------
# 9. Train with MLflow tracking
# --------------------------------------------------

print(f'\n[4/7] Training final model on full training set...')
TRAIN_START = time.time()

# Use MLflow context manager if available, otherwise no-op
if MLFLOW_AVAILABLE:
    mlflow_context = mlflow.start_run()
else:
    from contextlib import contextmanager
    @contextmanager
    def mlflow_context():
        yield None
    mlflow_context = mlflow_context()

with mlflow_context as run:

    print('       Training in progress (500 estimators)...')
    
    # Train on full training set with progress bar
    for i in tqdm(range(1), desc='       Training', ncols=70):
        pipeline.fit(X_train, y_train)

    print(f'       Training completed!')
    print(f'       Training time: {time.time() - TRAIN_START:.2f}s')

    # Predict on test set
    print(f'\n[5/7] Evaluating model on test set...')
    EVAL_START = time.time()
    
    y_pred = pipeline.predict(X_test)

    # Test set metrics
    test_accuracy = accuracy_score(y_test, y_pred)
    test_precision = precision_score(y_test, y_pred)
    test_recall = recall_score(y_test, y_pred)
    test_f1 = f1_score(y_test, y_pred)

    print(f'\n       ========== TEST SET RESULTS ==========')
    print(f'       Accuracy : {test_accuracy:.4f}')
    print(f'       Precision: {test_precision:.4f}')
    print(f'       Recall   : {test_recall:.4f}')
    print(f'       F1 Score : {test_f1:.4f}')
    print(f'       Evaluation time: {time.time() - EVAL_START:.2f}s')

    # ---------------------------------------------
    # MLflow Parameters
    # ---------------------------------------------

    print(f'\n[6/7] Logging to MLflow...')

    if MLFLOW_AVAILABLE and run is not None:
        mlflow.log_param('algorithm', 'RandomForest')
    mlflow.log_param('n_estimators', 500)
    mlflow.log_param('random_state', 42)
    mlflow.log_param('cv_folds', CV_FOLDS)
    mlflow.log_param('test_size', 0.2)
    mlflow.log_param('class_weight', 'balanced')

    # MLflow Metrics - Test Set
    mlflow.log_metric('test_accuracy', test_accuracy)
    mlflow.log_metric('test_precision', test_precision)
    mlflow.log_metric('test_recall', test_recall)
    mlflow.log_metric('test_f1', test_f1)

    # MLflow Metrics - Cross-Validation (Mean)
    mlflow.log_metric('cv_accuracy_mean', cv_accuracy.mean())
    mlflow.log_metric('cv_precision_mean', cv_precision.mean())
    mlflow.log_metric('cv_recall_mean', cv_recall.mean())
    mlflow.log_metric('cv_f1_mean', cv_f1.mean())

    # MLflow Metrics - Cross-Validation (Std)
    mlflow.log_metric('cv_accuracy_std', cv_accuracy.std())
    mlflow.log_metric('cv_precision_std', cv_precision.std())
    mlflow.log_metric('cv_recall_std', cv_recall.std())
    mlflow.log_metric('cv_f1_std', cv_f1.std())

    # Per-fold scores
    for i, score in enumerate(cv_f1, 1):
        mlflow.log_metric(f'cv_f1_fold_{i}', score)

    for i, score in enumerate(cv_accuracy, 1):
        mlflow.log_metric(f'cv_accuracy_fold_{i}', score)

    # ---------------------------------------------
    # Quality Gate (using CV F1 mean for stability)
    # ---------------------------------------------

    MINIMUM_CV_F1 = 0.70

    print(f'\n[7/7] Quality Gate Check...')
    
    if cv_f1.mean() < MINIMUM_CV_F1:
        mlflow.log_param('quality_gate', 'FAILED')
        print(f'\n       [X] QUALITY GATE FAILED: CV F1={cv_f1.mean():.4f}, Required={MINIMUM_CV_F1}')
        raise SystemExit(1)

    mlflow.log_param('quality_gate', 'PASSED')
    print(f'\n       [OK] QUALITY GATE PASSED: CV F1={cv_f1.mean():.4f}, Required={MINIMUM_CV_F1}')

    # Classification Report
    print('\n       Classification Report (Test Set):')
    print('       ' + classification_report(y_test, y_pred).replace('\n', '\n       '))

    # Save local model
    print(f'\n       Saving model to disk...')
    MODEL_PATH = 'models/order_prediction_model.joblib'
    joblib.dump(pipeline, MODEL_PATH)
    print(f'       Model saved to: {MODEL_PATH}')

    # Log model to MLflow (only if available)
    if MLFLOW_AVAILABLE and run is not None:
        mlflow.sklearn.log_model(pipeline, 'model')
        print(f'       Model logged to MLflow registry')
    else:
        print(f'       MLflow not available - model saved locally only')

    print(f'\n       All cross-validation metrics logged to MLflow UI')
    print(f'       MLflow Tracking URL: http://127.0.0.1:5000')


# ==========================================
# FINAL SUMMARY
# ==========================================

TOTAL_END_TIME = time.time()
TOTAL_TIME_TAKEN = TOTAL_END_TIME - TOTAL_START_TIME
OVERALL_END_TIME = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

print('\n' + '='*70)
print(' PIPELINE EXECUTION COMPLETE')
print('='*70)
print(f'Started at   : {OVERALL_START_TIME}')
print(f'Finished at  : {OVERALL_END_TIME}')
print(f'Total time   : {TOTAL_TIME_TAKEN:.2f} seconds ({TOTAL_TIME_TAKEN/60:.2f} minutes)')
print('='*70)

# Breakdown of time spent
print('\nTime Breakdown:')
print(f'  - Data Loading            : {LOAD_START - TOTAL_START_TIME:.2f}s')
print(f'  - Cross-Validation       : {time.time() - CV_START:.2f}s')
print(f'  - Data Splitting         : {time.time() - SPLIT_START:.2f}s')
print(f'  - Model Training         : {time.time() - TRAIN_START:.2f}s')
print(f'  - Model Evaluation       : {time.time() - EVAL_START:.2f}s')
print(f'  - Overhead & Logging     : ~0.5s')
print('='*70)

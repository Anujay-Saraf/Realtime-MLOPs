"""Train two classification models on the orders dataset.

Produces:
  - models/model_a_random_forest.joblib        (RandomForestClassifier)
  - models/model_a_random_forest.meta.json     (training metadata)
  - models/model_b_gradient_boosting.joblib    (GradientBoostingClassifier)
  - models/model_b_gradient_boosting.meta.json (training metadata)

Each model is trained on the same data with the same train/test split, so
their predictions are directly comparable. Both log to MLflow; the JSON
sidecars are the source of truth for the dashboard (works without an
MLflow server).
"""

import hashlib
import json
import os
import sys
from datetime import datetime
from pathlib import Path

import joblib
import mlflow
import mlflow.sklearn
import pandas as pd

# Suppress noisy MLflow/ALembic logs but keep errors
import logging
logging.getLogger("mlflow.store.db.utils").setLevel(logging.ERROR)
logging.getLogger("alembic").setLevel(logging.ERROR)
logging.getLogger("mlflow").setLevel(logging.ERROR)


def safe_print(msg: str) -> None:
    """Print a message, replacing characters that the current console encoding
    cannot represent. This avoids UnicodeEncodeError on Windows cp1252."""
    encoding = sys.stdout.encoding or "utf-8"
    try:
        sys.stdout.write(msg + "\n")
    except UnicodeEncodeError:
        sys.stdout.write(msg.encode(encoding, errors="replace").decode(encoding) + "\n")


def file_sha256_short(path: str, length: int = 12) -> str:
    """Return the first `length` hex chars of the file's SHA-256 hash."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()[:length]


from sklearn.model_selection import train_test_split, StratifiedKFold, cross_val_score
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.pipeline import Pipeline
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    classification_report,
)


# --------------------------------------------------
# Configuration
# --------------------------------------------------

# Load hyperparameters from params.yaml (DVC-managed)
import yaml as _yaml
with open("params.yaml") as _f:
    _params = _yaml.safe_load(_f)

DATA_PATH = "data/orders.csv"
MODEL_DIR = "models"
MINIMUM_F1 = _params["quality_gate"]["cv_f1_threshold"]
N_FOLDS = 5

MODEL_A_NAME = "model_a_random_forest"
MODEL_B_NAME = "model_b_gradient_boosting"

CATEGORICAL_FEATURES = [
    "region", "channel", "service_type", "plan_type", "customer_type",
]
NUMERIC_FEATURES = [
    "address_verified", "network_available", "inventory_available",
    "credit_check_passed", "installation_required",
    "monthly_charge", "previous_failed_orders",
]


# --------------------------------------------------
# MLflow setup
# --------------------------------------------------

if "MLFLOW_TRACKING_URI" not in os.environ:
    os.environ["MLFLOW_TRACKING_URI"] = "sqlite:///mlflow.db"
    mlflow.set_tracking_uri("sqlite:///mlflow.db")
    print("MLflow tracking URI: sqlite:///mlflow.db (SQLite backend)")
else:
    print(f"MLflow tracking URI: {os.environ['MLFLOW_TRACKING_URI']}")

# Start with a fresh DB so stale schema from a prior local run never crashes training in CI
if os.path.exists("mlflow.db"):
    try:
        os.remove("mlflow.db")
        print("Removed stale mlflow.db; will recreate fresh.")
    except Exception:
        pass

_mlflow_available = True
try:
    mlflow.set_experiment("order-prediction")
except Exception as e:
    print(f"WARNING: MLflow set_experiment failed: {e}")
    _mlflow_available = False


# --------------------------------------------------
# Load data
# --------------------------------------------------

df = pd.read_csv(DATA_PATH)
print(f"Dataset loaded: {df.shape}")

dataset_sha = file_sha256_short(DATA_PATH, length=12)
dataset_rows = len(df)
print(f"Dataset SHA: {dataset_sha}  ({dataset_rows} rows)")

X = df.drop("order_result", axis=1)
y = df["order_result"]


# --------------------------------------------------
# Shared preprocessing + train/test split
# --------------------------------------------------

preprocessor = ColumnTransformer(
    transformers=[
        ("categorical", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL_FEATURES),
    ],
    remainder="passthrough",
)

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y,
)
print(f"Training records: {len(X_train)}")
print(f"Testing records:  {len(X_test)}")


# --------------------------------------------------
# Helper: train one model, save artifacts, log to MLflow
# --------------------------------------------------

def train_and_save_model(
    algorithm_name: str,
    model_filename: str,
    classifier,
    hyperparameters: dict,
) -> dict:
    """Train, evaluate, save, and return the run summary for one model."""

    print(f"\n{'='*60}")
    print(f"  Training: {algorithm_name}")
    print(f"  Output:   models/{model_filename}")
    print(f"{'='*60}")

    pipeline = Pipeline(steps=[
        ("preprocessor", preprocessor),
        ("model", classifier),
    ])

    skf = StratifiedKFold(n_splits=N_FOLDS, shuffle=True, random_state=42)
    cv_f1_scores = cross_val_score(
        pipeline, X, y, cv=skf, scoring="f1", n_jobs=-1,
    )
    for i, score in enumerate(cv_f1_scores, start=1):
        print(f"  Fold {i} F1: {score:.4f}")

    cv_f1_mean = float(cv_f1_scores.mean())
    cv_f1_std = float(cv_f1_scores.std())
    print(f"  CV F1 Score: {cv_f1_mean:.4f} (+/- {cv_f1_std:.4f})")

    # Final fit for holdout metrics
    print("  Training final model on train split...")
    pipeline.fit(X_train, y_train)
    y_pred = pipeline.predict(X_test)

    accuracy = accuracy_score(y_test, y_pred)
    precision = precision_score(y_test, y_pred)
    recall = recall_score(y_test, y_pred)
    f1 = f1_score(y_test, y_pred)

    print(f"  Holdout — Acc: {accuracy:.4f}  Prec: {precision:.4f}  "
          f"Rec: {recall:.4f}  F1: {f1:.4f}")

    # Quality gate
    quality_gate = "PASSED" if cv_f1_mean >= MINIMUM_F1 else "FAILED"
    if quality_gate == "FAILED":
        print(f"\n[QUALITY GATE] FAILED: CV F1={cv_f1_mean:.4f}, Required={MINIMUM_F1}")

    print("\n  Classification Report:")
    for line in classification_report(y_test, y_pred).splitlines():
        print(f"  {line}")

    # Save .joblib
    os.makedirs(MODEL_DIR, exist_ok=True)
    joblib_path = os.path.join(MODEL_DIR, model_filename)
    joblib.dump(pipeline, joblib_path)
    print(f"  Saved: {joblib_path}")

    # MLflow logging (best-effort)
    mlflow_run_id = None
    if _mlflow_available:
        try:
            with mlflow.start_run(run_name=algorithm_name) as run:
                mlflow.log_param("algorithm", algorithm_name)
                for k, v in hyperparameters.items():
                    mlflow.log_param(k, v)
                mlflow.log_param("n_folds", N_FOLDS)
                mlflow.log_param("minimum_f1", MINIMUM_F1)
                mlflow.log_param("dataset_sha", dataset_sha)

                mlflow.log_metric("cv_f1_mean", cv_f1_mean)
                mlflow.log_metric("cv_f1_std", cv_f1_std)
                for i, score in enumerate(cv_f1_scores, start=1):
                    mlflow.log_metric(f"cv_f1_fold_{i}", float(score))
                mlflow.log_metric("holdout_accuracy", accuracy)
                mlflow.log_metric("holdout_precision", precision)
                mlflow.log_metric("holdout_recall", recall)
                mlflow.log_metric("holdout_f1", f1)
                mlflow.log_param("quality_gate", quality_gate)

                try:
                    mlflow.sklearn.log_model(pipeline, "model")
                except Exception as e:
                    print(f"  WARNING: mlflow.sklearn.log_model failed: {e}")
            mlflow_run_id = run.info.run_id
        except Exception as e:
            print(f"  WARNING: MLflow logging failed: {e}")
            mlflow_run_id = None

    # Save sidecar JSON metadata
    metadata = {
        "algorithm": algorithm_name,
        "training_date": datetime.now().isoformat(timespec="seconds"),
        "dataset_sha": dataset_sha,
        "dataset_rows": dataset_rows,
        "dataset_path": DATA_PATH,
        "hyperparameters": hyperparameters,
        "cv_f1_mean": round(cv_f1_mean, 4),
        "cv_f1_std": round(cv_f1_std, 4),
        "cv_f1_folds": [round(float(s), 4) for s in cv_f1_scores],
        "holdout_accuracy": round(accuracy, 4),
        "holdout_precision": round(precision, 4),
        "holdout_recall": round(recall, 4),
        "holdout_f1": round(f1, 4),
        "quality_gate": quality_gate,
        "mlflow_run_id": mlflow_run_id,
    }
    meta_path = os.path.join(MODEL_DIR, f"{model_filename}.meta.json")
    with open(meta_path, "w") as f:
        json.dump(metadata, f, indent=2)
    print(f"  Saved: {meta_path}")

    return {
        "name": algorithm_name,
        "file": model_filename,
        "cv_f1_mean": cv_f1_mean,
        "quality_gate": quality_gate,
    }


# --------------------------------------------------
# Train both models
# --------------------------------------------------

os.makedirs(MODEL_DIR, exist_ok=True)

model_a_hp = {
    "n_estimators": _params["models"]["model_a"]["n_estimators"],
    "random_state": _params["models"]["model_a"].get("random_state", 42),
    "class_weight": _params["models"]["model_a"].get("class_weight", "balanced"),
}
summary_a = train_and_save_model(
    algorithm_name="RandomForest",
    model_filename=f"{MODEL_A_NAME}.joblib",
    classifier=RandomForestClassifier(**model_a_hp),
    hyperparameters=model_a_hp,
)

model_b_hp = {
    "n_estimators": _params["models"]["model_b"]["n_estimators"],
    "learning_rate": _params["models"]["model_b"]["learning_rate"],
    "max_depth": _params["models"]["model_b"]["max_depth"],
    "random_state": _params["models"]["model_b"].get("random_state", 42),
    "min_samples_split": _params["models"]["model_b"].get("min_samples_split", 5),
}
summary_b = train_and_save_model(
    algorithm_name="GradientBoosting",
    model_filename=f"{MODEL_B_NAME}.joblib",
    classifier=GradientBoostingClassifier(**model_b_hp),
    hyperparameters=model_b_hp,
)


# --------------------------------------------------
# Final summary + quality gate enforcement
# --------------------------------------------------

print(f"\n{'='*60}")
print("  TRAINING SUMMARY")
print(f"{'='*60}")
print(f"  Model A ({summary_a['name']}): CV F1 = {summary_a['cv_f1_mean']:.4f}  "
      f"[{summary_a['quality_gate']}]")
print(f"  Model B ({summary_b['name']}): CV F1 = {summary_b['cv_f1_mean']:.4f}  "
      f"[{summary_b['quality_gate']}]")
print(f"  Dataset SHA: {dataset_sha}  ({dataset_rows} rows)")
print(f"{'='*60}")

if summary_a["quality_gate"] != "PASSED" or summary_b["quality_gate"] != "PASSED":
    safe_print("\n[QUALITY GATE] FAILED: one or more models below minimum F1")
    raise SystemExit(1)

safe_print("\n[QUALITY GATE] PASSED: both models meet minimum F1")

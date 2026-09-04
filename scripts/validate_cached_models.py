"""Validate cached model artifacts against the current dataset and configuration."""

import hashlib
import json
from pathlib import Path

import joblib
import pandas as pd
import yaml


DATA_PATH = Path("data/orders.csv")
MODEL_PATHS = [
    Path("models/model_a_random_forest.joblib"),
    Path("models/model_b_gradient_boosting.joblib"),
]
METADATA_PATHS = [Path(f"{path}.meta.json") for path in MODEL_PATHS]


data_hash = hashlib.sha256(DATA_PATH.read_bytes()).hexdigest()[:12]
threshold = yaml.safe_load(Path("params.yaml").read_text())["quality_gate"]["cv_f1_threshold"]

if not all(path.is_file() for path in [*MODEL_PATHS, *METADATA_PATHS]):
    raise SystemExit("Cached model files are incomplete")

metadata = [json.loads(path.read_text()) for path in METADATA_PATHS]
if any(item.get("dataset_sha") != data_hash for item in metadata):
    raise SystemExit("Cached models do not match the generated dataset")
if any(
    float(item.get("cv_f1_mean", 0)) < threshold
    or item.get("quality_gate") != "PASSED"
    for item in metadata
):
    raise SystemExit("Cached models do not pass the current quality gate")

# Deserialization and prediction checks catch truncated or incompatible files.
data = pd.read_csv(DATA_PATH)
features = data.drop(columns=["order_result"]).head(8)
for model_path in MODEL_PATHS:
    loaded_model = joblib.load(model_path)
    predictions = loaded_model.predict(features)
    if len(predictions) != len(features):
        raise SystemExit(f"Cached model produced an invalid prediction count: {model_path}")
    if any(int(prediction) not in (0, 1) for prediction in predictions):
        raise SystemExit(f"Cached model produced invalid prediction values: {model_path}")

for item in metadata:
    print(f"  CV F1 Score: {item['cv_f1_mean']:.4f} (+/- {item['cv_f1_std']:.4f})")
print("[QUALITY GATE] PASSED: both cached models meet minimum F1")

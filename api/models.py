"""Model registry endpoints for A/B testing.

Exposes:
  GET  /models              - list all .joblib files in models/ (with metadata)
  GET  /models/{filename}   - metadata for a single model (incl. sidecar JSON)
  POST /predict/model       - predict using a named model
  POST /predict/batch       - predict on a list of orders using two models
"""

import hashlib
import io
import json
import os
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

import joblib
import pandas as pd
from fastapi import APIRouter, HTTPException
from prometheus_client import Counter
from pydantic import BaseModel

from .schemas import OrderRequest

router = APIRouter()

# Each successful model load increments this — useful in the dashboard
model_loads = Counter(
    "model_loads_total",
    "Number of times a model file was loaded into memory",
    ["model"],
)

predictions_by_model = Counter(
    "predictions_by_model_total",
    "Total predictions broken down by which model was used",
    ["model", "result"],
)

# Resolve models dir relative to project root so the endpoint works no
# matter the cwd uvicorn was launched from.
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = Path(os.environ.get("MODELS_DIR", _PROJECT_ROOT / "models"))


def _sha256_short(path: Path, length: int = 12) -> str:
    """Return the first `length` hex chars of SHA-256 over the file."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()[:length]


def _load_sidecar(path: Path) -> Dict:
    """Read and return sidecar JSON metadata if it exists, else empty dict."""
    # Sidecar file: <name>.joblib.meta.json
    meta_path = path.with_suffix(path.suffix + ".meta.json")
    if not meta_path.exists():
        return {}
    try:
        with open(meta_path, "r") as f:
            return json.load(f)
    except Exception as e:
        return {"sidecar_error": str(e)}


def _model_base_info(path: Path) -> Dict:
    """Return the always-present file-level metadata for a model."""
    stat = path.stat()
    return {
        "name": path.name,
        "size_bytes": stat.st_size,
        "size_mb": round(stat.st_size / (1024 * 1024), 2),
        "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
        "sha": _sha256_short(path),
    }


def list_model_files() -> List[Dict]:
    """Return metadata for every .joblib file in the models directory."""
    if not MODELS_DIR.exists():
        return []

    out: List[Dict] = []
    for path in sorted(MODELS_DIR.glob("*.joblib")):
        info = _model_base_info(path)
        info.update(_load_sidecar(path))
        out.append(info)
    return out


@router.get("/models")
def get_models():
    """List all available models for A/B testing."""
    return {"models": list_model_files()}


@router.get("/models/{filename}")
def get_model(filename: str):
    """Get metadata for a single model file."""
    # Defend against path traversal
    if "/" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    path = MODELS_DIR / filename
    if not path.exists() or not path.suffix == ".joblib":
        raise HTTPException(status_code=404, detail="Model not found")

    info = _model_base_info(path)
    info.update(_load_sidecar(path))
    return info


# Cache loaded models in memory so we don't reload 200MB on every request
_model_cache: Dict[str, object] = {}


def _load_model(filename: str):
    """Load a model by filename, with simple in-memory cache."""
    if "/" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    if filename not in _model_cache:
        path = MODELS_DIR / filename
        if not path.exists():
            raise HTTPException(status_code=404, detail=f"Model {filename} not found")
        _model_cache[filename] = joblib.load(path)
        model_loads.labels(model=filename).inc()
    return _model_cache[filename]


def _predict_one(model, order: OrderRequest) -> Dict:
    """Run one prediction and return a JSON-serializable dict."""
    data = order.model_dump()
    input_df = pd.DataFrame([data])

    prediction = model.predict(input_df)[0]
    probability = model.predict_proba(input_df)[0]

    return {
        "prediction": int(prediction),
        "result": "FAIL" if prediction == 1 else "PASS",
        "pass_probability": round(float(probability[0]), 4),
        "fail_probability": round(float(probability[1]), 4),
    }


class PredictWithModelRequest(BaseModel):
    model: str
    order: OrderRequest


@router.post("/predict/model")
def predict_with_model(req: PredictWithModelRequest):
    """Run a prediction against a specific named model.

    This is what powers the A/B testing tab — the same input can be run
    against two different model files and compared side-by-side.
    """
    model = _load_model(req.model)
    result = _predict_one(model, req.order)

    predictions_by_model.labels(
        model=req.model, result=result["result"]
    ).inc()

    return {
        "model": req.model,
        **result,
    }


class BatchPredictRequest(BaseModel):
    model_config = {"protected_namespaces": ()}
    model_a: str
    model_b: str
    orders: List[OrderRequest]


@router.post("/predict/batch")
def predict_batch(req: BatchPredictRequest):
    """Run predictions on a list of orders using two named models.

    Powers the bulk batch test in the dashboard. Returns per-order results
    from each model plus aggregate statistics (match rate, average
    probability gap) so the dashboard can show real-time A/B agreement.
    """
    if not req.orders:
        raise HTTPException(status_code=400, detail="orders list is empty")

    model_a = _load_model(req.model_a)
    model_b = _load_model(req.model_b)

    results_a: List[Dict] = []
    results_b: List[Dict] = []
    matches = 0
    prob_gaps: List[float] = []

    for order in req.orders:
        r_a = _predict_one(model_a, order)
        r_b = _predict_one(model_b, order)
        results_a.append(r_a)
        results_b.append(r_b)

        if r_a["prediction"] == r_b["prediction"]:
            matches += 1
        prob_gaps.append(abs(r_a["pass_probability"] - r_b["pass_probability"]))

    n = len(req.orders)
    avg_gap = round(sum(prob_gaps) / n, 4) if n > 0 else 0.0
    match_rate = round(matches / n, 4) if n > 0 else 0.0

    return {
        "model_a": req.model_a,
        "model_b": req.model_b,
        "count": n,
        "matches": matches,
        "match_rate": match_rate,
        "avg_probability_gap": avg_gap,
        "results_a": results_a,
        "results_b": results_b,
    }

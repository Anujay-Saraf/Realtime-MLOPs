"""Model registry endpoints for A/B testing.

Exposes:
  GET  /models              - list all .joblib files in models/
  GET  /models/{filename}   - metadata for a single model
  POST /predict/model       - predict using a named model
"""

import hashlib
import io
from datetime import datetime
from pathlib import Path
from typing import Dict, List

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


MODELS_DIR = Path("models")


def _sha256_short(path: Path) -> str:
    """Return the first 12 hex chars of SHA-256 over the file."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()[:12]


def list_model_files() -> List[Dict]:
    """Return metadata for every .joblib file in the models directory."""
    if not MODELS_DIR.exists():
        return []

    out: List[Dict] = []
    for path in sorted(MODELS_DIR.glob("*.joblib")):
        stat = path.stat()
        out.append(
            {
                "name": path.name,
                "size_bytes": stat.st_size,
                "size_mb": round(stat.st_size / (1024 * 1024), 2),
                "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                "sha": _sha256_short(path),
            }
        )
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

    stat = path.stat()
    return {
        "name": path.name,
        "size_bytes": stat.st_size,
        "size_mb": round(stat.st_size / (1024 * 1024), 2),
        "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
        "sha": _sha256_short(path),
    }


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

    data = req.order.model_dump()
    input_df = pd.DataFrame([data])

    prediction = model.predict(input_df)[0]
    probability = model.predict_proba(input_df)[0]

    fail_probability = float(probability[1])
    pass_probability = float(probability[0])

    result = "FAIL" if prediction == 1 else "PASS"
    predictions_by_model.labels(model=req.model, result=result).inc()

    return {
        "model": req.model,
        "prediction": int(prediction),
        "result": result,
        "pass_probability": round(pass_probability, 4),
        "fail_probability": round(fail_probability, 4),
    }

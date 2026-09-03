"""Dataset upload endpoint.

Used by the dashboard's "Update Training Data" tab to push a new
training CSV. The uploaded file:
  1. Is validated against the required schema
  2. Saved to data/orders.csv (where src/train.py will read it)
  3. Returns row count, columns detected, and a preview
"""

import io
import os
from pathlib import Path
from typing import List

import pandas as pd
from fastapi import APIRouter, File, HTTPException, UploadFile

router = APIRouter()

REQUIRED_COLUMNS: List[str] = [
    "region",
    "channel",
    "service_type",
    "plan_type",
    "customer_type",
    "address_verified",
    "network_available",
    "inventory_available",
    "credit_check_passed",
    "installation_required",
    "monthly_charge",
    "previous_failed_orders",
    "order_result",
]

# Resolve data path relative to project root so the endpoint works no
# matter the cwd uvicorn was launched from. Override via env var for
# production deployments where data lives elsewhere (e.g. mounted volume).
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = Path(os.environ.get("DATA_DIR", _PROJECT_ROOT / "data")) / "orders.csv"
MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB


@router.post("/upload-dataset")
async def upload_dataset(file: UploadFile = File(...)):
    """Accept a new training CSV, validate it, and save to data/orders.csv."""

    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only .csv files are accepted")

    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({len(contents)} bytes). Max {MAX_UPLOAD_BYTES} bytes.",
        )

    # Try to parse as CSV
    try:
        df = pd.read_csv(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid CSV: {e}")

    if df.empty:
        raise HTTPException(status_code=400, detail="CSV is empty")

    # Validate schema
    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    extra = [c for c in df.columns if c not in REQUIRED_COLUMNS]

    if missing:
        raise HTTPException(
            status_code=422,
            detail={
                "message": f"Missing required columns: {missing}",
                "missing": missing,
                "extra": extra,
                "required": REQUIRED_COLUMNS,
            },
        )

    # Check class distribution on the target
    if "order_result" in df.columns:
        class_dist = df["order_result"].value_counts().to_dict()
    else:
        class_dist = {}

    # Save
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(str(DATA_PATH), index=False)

    return {
        "message": "Dataset uploaded successfully",
        "filename": file.filename,
        "saved_to": str(DATA_PATH),
        "rows": int(len(df)),
        "columns": list(df.columns),
        "missing_columns": [],
        "extra_columns": extra,
        "class_distribution": {str(k): int(v) for k, v in class_dist.items()},
        "preview": df.head(5).to_dict(orient="records"),
    }


@router.get("/dataset/info")
def dataset_info():
    """Return info about the currently-loaded training dataset."""
    if not DATA_PATH.exists():
        return {"exists": False, "path": str(DATA_PATH)}

    df = pd.read_csv(DATA_PATH)
    return {
        "exists": True,
        "path": str(DATA_PATH),
        "rows": int(len(df)),
        "columns": list(df.columns),
        "class_distribution": (
            df["order_result"].value_counts().to_dict()
            if "order_result" in df.columns
            else {}
        ),
    }

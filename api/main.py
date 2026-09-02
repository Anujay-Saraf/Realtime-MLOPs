"""Order Prediction API — main module.

Provides:
  GET  /              - root
  GET  /health        - health check
  POST /predict       - predict using the default model
  GET  /metrics       - prometheus metrics

Plus sub-routers from:
  api.models     - /models, /predict/model
  api.dataset    - /upload-dataset, /dataset/info
"""

import joblib
import pandas as pd
from fastapi import FastAPI
from prometheus_client import Counter
from prometheus_fastapi_instrumentator import Instrumentator

from . import dataset, models
from .schemas import OrderRequest

# --------------------------------------------------
# Application
# --------------------------------------------------

app = FastAPI(
    title="Order Prediction API",
    description="ML API to predict whether an order will PASS or FAIL",
    version="1.0",
)

Instrumentator().instrument(app).expose(app)

prediction_counter = Counter(
    "order_predictions_total",
    "Total number of order predictions",
    ["result"],
)

# --------------------------------------------------
# Sub-routers
# --------------------------------------------------

app.include_router(models.router, tags=["Models"])
app.include_router(dataset.router, tags=["Dataset"])

# --------------------------------------------------
# Load the default model
# --------------------------------------------------

MODEL_PATH = "models/order_prediction_model.joblib"

model = joblib.load(MODEL_PATH)


# --------------------------------------------------
# Root + health
# --------------------------------------------------

@app.get("/")
def root():
    return {"message": "Order Prediction API is running"}


@app.get("/health")
def health():
    return {"status": "healthy"}


# --------------------------------------------------
# Default prediction endpoint
# --------------------------------------------------

@app.post("/predict")
def predict(order: OrderRequest):
    data = order.model_dump()
    input_data = pd.DataFrame([data])

    prediction = model.predict(input_data)[0]
    probability = model.predict_proba(input_data)[0]

    fail_probability = float(probability[1])
    pass_probability = float(probability[0])

    result = "FAIL" if prediction == 1 else "PASS"
    prediction_counter.labels(result=result).inc()

    return {
        "prediction": int(prediction),
        "result": result,
        "pass_probability": round(pass_probability, 4),
        "fail_probability": round(fail_probability, 4),
    }

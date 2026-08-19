from prometheus_fastapi_instrumentator import Instrumentator
from fastapi import FastAPI
from pydantic import BaseModel
import pandas as pd
import joblib
from prometheus_client import Counter

# --------------------------------------------------
# Create FastAPI application
# --------------------------------------------------

app = FastAPI(
    title="Order Prediction API",
    description="ML API to predict whether an order will PASS or FAIL",
    version="1.0"
)

Instrumentator().instrument(app).expose(app)

prediction_counter = Counter(
    "order_predictions_total",
    "Total number of order predictions",
    ["result"]
)

# --------------------------------------------------
# Load trained model
# --------------------------------------------------

MODEL_PATH = "models/order_prediction_model.joblib"

model = joblib.load(MODEL_PATH)


# --------------------------------------------------
# Request schema
# --------------------------------------------------

class OrderRequest(BaseModel):

    region: str
    channel: str
    service_type: str
    plan_type: str
    customer_type: str

    address_verified: int
    network_available: int
    inventory_available: int
    credit_check_passed: int
    installation_required: int

    monthly_charge: float
    previous_failed_orders: int


# --------------------------------------------------
# Health check
# --------------------------------------------------

@app.get("/")
def root():

    return {
        "message": "Order Prediction API is running"
    }


@app.get("/health")
def health():

    return {
        "status": "healthy"
    }


# --------------------------------------------------
# Prediction endpoint
# --------------------------------------------------

@app.post("/predict")
def predict(order: OrderRequest):

    # Convert request to dictionary
    data = order.model_dump()

    # Convert to DataFrame
    input_data = pd.DataFrame([data])

    # Prediction
    prediction = model.predict(input_data)[0]

    # Probability
    probability = model.predict_proba(input_data)[0]

    fail_probability = float(probability[1])

    pass_probability = float(probability[0])

    # Convert prediction to business meaning
    if prediction == 1:
        result = "FAIL"
    else:
        result = "PASS"
    prediction_counter.labels(
        result=result
        ).inc()
    return {
        "prediction": int(prediction),
        "result": result,
        "pass_probability": round(pass_probability, 4),
        "fail_probability": round(fail_probability, 4)
    }
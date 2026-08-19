import joblib
import pandas as pd


MODEL_PATH = "models/order_prediction_model.joblib"


def test_model_exists():

    model = joblib.load(MODEL_PATH)

    assert model is not None


def test_model_prediction():

    model = joblib.load(MODEL_PATH)

    data = pd.DataFrame([
        {
            "region": "South",
            "channel": "Online",
            "service_type": "Fiber",
            "plan_type": "Premium",
            "customer_type": "Existing",
            "address_verified": 1,
            "network_available": 1,
            "inventory_available": 1,
            "credit_check_passed": 1,
            "installation_required": 0,
            "monthly_charge": 100,
            "previous_failed_orders": 0,
        }
    ])

    prediction = model.predict(data)

    assert prediction[0] in [0, 1]
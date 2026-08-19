import mlflow
import mlflow.sklearn
import pandas as pd
import joblib

from sklearn.model_selection import train_test_split
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


# --------------------------------------------------
# 1. Load data
# --------------------------------------------------

DATA_PATH = "data/orders.csv"
mlflow.set_tracking_uri("http://127.0.0.1:5000")

mlflow.set_experiment("order-prediction")

df = pd.read_csv(DATA_PATH)

print(f"Dataset loaded: {df.shape}")


# --------------------------------------------------
# 2. Separate features and target
# --------------------------------------------------

X = df.drop("order_result", axis=1)

y = df["order_result"]


# --------------------------------------------------
# 3. Identify column types
# --------------------------------------------------

categorical_features = [
    "region",
    "channel",
    "service_type",
    "plan_type",
    "customer_type",
]

numeric_features = [
    "address_verified",
    "network_available",
    "inventory_available",
    "credit_check_passed",
    "installation_required",
    "monthly_charge",
    "previous_failed_orders",
]


# --------------------------------------------------
# 4. Preprocessing
# --------------------------------------------------

preprocessor = ColumnTransformer(
    transformers=[
        (
            "categorical",
            OneHotEncoder(handle_unknown="ignore"),
            categorical_features,
        )
    ],
    remainder="passthrough",
)


# --------------------------------------------------
# 5. Create ML model
# --------------------------------------------------

model = RandomForestClassifier(
    n_estimators=500,
    random_state=42,
    class_weight="balanced",
)


# --------------------------------------------------
# 6. Create complete ML pipeline
# --------------------------------------------------

pipeline = Pipeline(
    steps=[
        ("preprocessor", preprocessor),
        ("model", model),
    ]
)


# --------------------------------------------------
# 7. Train / Test split
# --------------------------------------------------

X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.2,
    random_state=42,
    stratify=y,
)

print(f"Training records: {len(X_train)}")
print(f"Testing records: {len(X_test)}")


# --------------------------------------------------
# 8. Train
# --------------------------------------------------

with mlflow.start_run():

    print("\nTraining model...")

    # Train
    pipeline.fit(X_train, y_train)

    print("Training completed.")

    # Predict
    y_pred = pipeline.predict(X_test)

    # Metrics
    accuracy = accuracy_score(y_test, y_pred)
    precision = precision_score(y_test, y_pred)
    recall = recall_score(y_test, y_pred)
    f1 = f1_score(y_test, y_pred)

    print("\n========== MODEL RESULTS ==========")

    print(f"Accuracy : {accuracy:.4f}")
    print(f"Precision: {precision:.4f}")
    print(f"Recall   : {recall:.4f}")
    print(f"F1 Score : {f1:.4f}")

    # ---------------------------------------------
    # MLflow Parameters
    # ---------------------------------------------

    mlflow.log_param(
        "algorithm",
        "RandomForest"
    )

    mlflow.log_param(
        "n_estimators",
        500
    )

    mlflow.log_param(
        "random_state",
        42
    )

    # ---------------------------------------------
    # MLflow Metrics
    # ---------------------------------------------

    mlflow.log_metric("accuracy", accuracy)
    mlflow.log_metric("precision", precision)
    mlflow.log_metric("recall", recall)
    mlflow.log_metric("f1", f1)

    # ---------------------------------------------
    # Quality Gate
    # ---------------------------------------------

    MINIMUM_F1 = 0.70

    if f1 < MINIMUM_F1:

        mlflow.log_param(
            "quality_gate",
            "FAILED"
        )

        print(
            f"\n❌ QUALITY GATE FAILED: "
            f"F1={f1:.4f}, Required={MINIMUM_F1}"
        )

        raise SystemExit(1)

    mlflow.log_param(
        "quality_gate",
        "PASSED"
    )

    print(
        f"\n✅ QUALITY GATE PASSED: "
        f"F1={f1:.4f}, Required={MINIMUM_F1}"
    )

    # ---------------------------------------------
    # Classification Report
    # ---------------------------------------------

    print("\nClassification Report:")

    print(
        classification_report(
            y_test,
            y_pred
        )
    )

    # ---------------------------------------------
    # Save local model
    # ---------------------------------------------

    MODEL_PATH = "models/order_prediction_model.joblib"

    joblib.dump(
        pipeline,
        MODEL_PATH
    )

    print(
        f"\nModel saved to: {MODEL_PATH}"
    )

    # ---------------------------------------------
    # Log model to MLflow
    # ---------------------------------------------

    mlflow.sklearn.log_model(
        pipeline,
        "model"
    )

    print(
        "\nModel logged to MLflow."
    )
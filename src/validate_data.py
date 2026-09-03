import pandas as pd
import sys

DATA_PATH = "data/orders.csv"


def validate_data():

    print("Loading dataset...")
    df = pd.read_csv(DATA_PATH)

    errors = []

    # 1. Check number of rows
    if len(df) < 1000:
        errors.append("Dataset contains fewer than 1000 rows.")

    # 2. Check required columns
    required_columns = [
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

    missing_columns = [
        col for col in required_columns
        if col not in df.columns
    ]

    if missing_columns:
        errors.append(
            f"Missing columns: {missing_columns}"
        )

    # 3. Check missing values
    missing_values = df.isnull().sum()

    if missing_values.sum() > 0:
        errors.append(
            f"Missing values found:\n{missing_values[missing_values > 0]}"
        )

    # 4. Check duplicate rows
    duplicates = df.duplicated().sum()

    if duplicates > 0:
        errors.append(
            f"Found {duplicates} duplicate rows."
        )

    # 5. Check target values
    valid_targets = {0, 1}

    actual_targets = set(df["order_result"].unique())

    if not actual_targets.issubset(valid_targets):
        errors.append(
            f"Invalid target values: {actual_targets}"
        )

    # 6. Check binary columns
    binary_columns = [
        "address_verified",
        "network_available",
        "inventory_available",
        "credit_check_passed",
        "installation_required",
    ]

    for column in binary_columns:

        values = set(df[column].unique())

        if not values.issubset({0, 1}):
            errors.append(
                f"{column} contains invalid values: {values}"
            )

    # 7. Check monthly charge
    if (df["monthly_charge"] <= 0).any():
        errors.append(
            "monthly_charge contains zero or negative values."
        )

    # 8. Check previous failures
    if (df["previous_failed_orders"] < 0).any():
        errors.append(
            "previous_failed_orders contains negative values."
        )

    # Final result
    print("\n========== DATA VALIDATION ==========")

    print(f"Rows: {len(df)}")
    print(f"Columns: {len(df.columns)}")
    print(f"Duplicates: {duplicates}")
    print(f"Missing values: {missing_values.sum()}")

    print("\nTarget distribution:")
    print(df["order_result"].value_counts())

    if errors:

        print("\n❌ DATA VALIDATION FAILED")

        for error in errors:
            print(f"- {error}")

        sys.exit(1)

    print("\n✅ DATA VALIDATION PASSED")


if __name__ == "__main__":
    validate_data()

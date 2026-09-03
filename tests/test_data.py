import pandas as pd


def test_dataset_exists():

    df = pd.read_csv("data/orders.csv")

    assert len(df) > 1000


def test_required_columns():

    df = pd.read_csv("data/orders.csv")

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

    for column in required_columns:
        assert column in df.columns


def test_target_values():

    df = pd.read_csv("data/orders.csv")

    assert set(df["order_result"].unique()).issubset({0, 1})

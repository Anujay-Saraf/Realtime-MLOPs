import pandas as pd
import numpy as np

np.random.seed(42)

N = 12000

regions = ["North", "South", "East", "West"]
channels = ["Online", "Store", "Phone"]
service_types = ["Fiber", "5G", "DSL"]
plan_types = ["Basic", "Standard", "Premium"]
customer_types = ["New", "Existing"]

data = pd.DataFrame({
    "region": np.random.choice(regions, N),
    "channel": np.random.choice(channels, N),
    "service_type": np.random.choice(service_types, N),
    "plan_type": np.random.choice(plan_types, N),
    "customer_type": np.random.choice(customer_types, N),

    "address_verified": np.random.binomial(1, 0.85, N),
    "network_available": np.random.binomial(1, 0.90, N),
    "inventory_available": np.random.binomial(1, 0.85, N),
    "credit_check_passed": np.random.binomial(1, 0.92, N),
    "installation_required": np.random.binomial(1, 0.40, N),

    "monthly_charge": np.random.uniform(40, 200, N),
    "previous_failed_orders": np.random.poisson(0.7, N)
})

# Calculate failure risk
failure_score = (
    (1 - data["address_verified"]) * 2
    + (1 - data["network_available"]) * 3
    + (1 - data["inventory_available"]) * 2
    + (1 - data["credit_check_passed"]) * 3
    + (data["previous_failed_orders"] >= 2) * 2
    + (data["installation_required"]) * 0.5
)

# Add randomness
failure_score += np.random.normal(0, 1, N)

# PASS = 0, FAIL = 1
data["order_result"] = (failure_score > 3).astype(int)

# Save
data.to_csv("data/orders.csv", index=False)

print("Dataset generated successfully")
print(f"Rows: {len(data)}")
print("\nClass distribution:")
print(data["order_result"].value_counts())

print("\nDataset preview:")
print(data.head())
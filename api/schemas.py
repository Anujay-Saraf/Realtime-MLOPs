"""Shared Pydantic schemas used across API routes."""

from pydantic import BaseModel


class OrderRequest(BaseModel):
    """Order input — matches src/train.py feature columns."""

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

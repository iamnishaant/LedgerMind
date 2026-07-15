"""
Forecasts API — Phase 6 (Forecasting)
GET /api/v1/forecasts?business_id=…&horizon=3&balance=…
    → monthly history + projected next months, avg burn, trend, optional runway.
"""
from typing import Optional

from fastapi import APIRouter, Depends

from app.core.auth import get_current_user, ensure_owns_business
from app.agents.forecast_agent import build_forecast

router = APIRouter()


@router.get("")
async def get_forecast(
    business_id: str, horizon: int = 3, balance: Optional[float] = None,
    user: dict = Depends(get_current_user),
):
    ensure_owns_business(business_id, user["id"])
    result = build_forecast(business_id, horizon=max(1, min(horizon, 12)))

    # Runway = cash on hand / average monthly burn (only if a balance is supplied)
    if balance is not None and result["avg_monthly"] > 0:
        result["runway_months"] = round(balance / result["avg_monthly"], 1)
        result["balance"] = balance

    return result

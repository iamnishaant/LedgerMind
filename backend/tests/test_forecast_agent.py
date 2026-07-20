"""
Forecast trend math — DB-backed against the real (dev) Supabase project.

Inserts exactly 3 known-amount expenses in 3 known prior months, then checks
build_forecast()'s output against an INDEPENDENTLY computed numpy.polyfit —
not by re-reading the agent's own formula, but by re-deriving the expected
numbers from scratch and asserting the agent produces the same answer.
"""
from datetime import date

import numpy as np

from app.agents.forecast_agent import build_forecast


def _months_ago(n: int) -> str:
    today = date.today()
    total = today.year * 12 + (today.month - 1) - n
    return f"{total // 12:04d}-{total % 12 + 1:02d}"


def test_forecast_matches_independently_computed_trend(qa_business, supabase):
    business_id, _user_id = qa_business

    # 3 complete prior months with a clean, known-linear spend pattern.
    # Nothing inserted for the current month, so it never appears as "partial"
    # and the basis for the fit is exactly these 3 points.
    amounts = [1000.0, 2000.0, 3000.0]  # months -3, -2, -1
    for i, amount in enumerate(amounts):
        month_offset = 3 - i  # 3, 2, 1 months ago
        supabase.table("expenses").insert({
            "business_id": business_id,
            "amount": amount,
            "currency": "INR",
            "vendor_name": "Test Vendor",
            "category": "Software & Subscriptions",
            "expense_date": f"{_months_ago(month_offset)}-15",
        }).execute()

    result = build_forecast(business_id, horizon=2)

    # Exact history reconstruction
    history_totals = {h["month"]: h["total"] for h in result["history"]}
    assert history_totals[_months_ago(3)] == 1000.0
    assert history_totals[_months_ago(2)] == 2000.0
    assert history_totals[_months_ago(1)] == 3000.0

    # Independently re-derive the expected linear fit and compare.
    slope, intercept = np.polyfit([0, 1, 2], amounts, 1)
    expected_avg = round(float(np.mean(amounts)), 2)
    expected_next = round(max(0.0, slope * 3 + intercept), 2)

    assert result["avg_monthly"] == expected_avg
    assert result["trend"] == "rising"
    assert abs(result["forecast"][0]["projected"] - expected_next) < 0.01
    assert len(result["forecast"]) == 2  # horizon=2 requested


def test_forecast_with_no_expenses_returns_empty_shape(qa_business):
    business_id, _user_id = qa_business
    result = build_forecast(business_id, horizon=3)
    assert result["history"] == []
    assert result["forecast"] == []
    assert result["avg_monthly"] == 0.0
    assert result["trend"] == "stable"


def test_forecast_falling_trend(qa_business, supabase):
    business_id, _user_id = qa_business
    amounts = [3000.0, 2000.0, 1000.0]  # clearly declining
    for i, amount in enumerate(amounts):
        month_offset = 3 - i
        supabase.table("expenses").insert({
            "business_id": business_id,
            "amount": amount,
            "currency": "INR",
            "vendor_name": "Test Vendor",
            "category": "Utilities",
            "expense_date": f"{_months_ago(month_offset)}-15",
        }).execute()

    result = build_forecast(business_id, horizon=1)
    assert result["trend"] == "falling"

"""
Forecast Agent — Phase 6 (Forecasting)

Deterministic spend forecasting from historical expenses:
  - aggregate expenses into monthly buckets (gaps filled with 0)
  - fit a linear trend (least squares) over COMPLETE months
  - project the next N months + a run-rate projection for the current partial month
  - derive average monthly burn and trend direction

No LLM here — figures are math, not guesses (architecture review §8.1).
"""
from __future__ import annotations

from calendar import monthrange
from datetime import date

import numpy as np

from app.core.supabase import get_supabase


def _month_key(d: date) -> str:
    return d.strftime("%Y-%m")


def _add_months(ym: str, n: int) -> str:
    y, m = map(int, ym.split("-"))
    idx = y * 12 + (m - 1) + n
    return f"{idx // 12:04d}-{idx % 12 + 1:02d}"


def build_forecast(business_id: str, horizon: int = 3) -> dict:
    sb = get_supabase()
    rows = (
        sb.table("expenses").select("amount, expense_date")
        .eq("business_id", business_id).execute().data or []
    )

    monthly: dict[str, float] = {}
    for r in rows:
        raw = r.get("expense_date")
        if not raw:
            continue
        d = date.fromisoformat(str(raw)[:10])
        monthly[_month_key(d)] = monthly.get(_month_key(d), 0.0) + (r["amount"] or 0.0)

    if not monthly:
        return {
            "history": [], "forecast": [], "avg_monthly": 0.0, "trend": "stable",
            "next_month_projection": 0.0, "current_month_run_rate": 0.0,
        }

    # Contiguous month axis (fill gaps with 0)
    months = sorted(monthly)
    axis, cur = [], months[0]
    while cur <= months[-1]:
        axis.append(cur)
        cur = _add_months(cur, 1)

    current_ym = date.today().strftime("%Y-%m")
    history = [
        {"month": m, "total": round(monthly.get(m, 0.0), 2), "partial": m == current_ym}
        for m in axis
    ]

    # Trend basis: prefer complete months; fall back to all if too few
    complete = [h for h in history if not h["partial"]]
    basis = complete if len(complete) >= 2 else history
    ys = np.array([h["total"] for h in basis], dtype=float)

    if len(ys) >= 2:
        slope, intercept = np.polyfit(np.arange(len(ys)), ys, 1)
    else:
        slope, intercept = 0.0, float(ys[-1]) if len(ys) else 0.0

    last_x = len(basis) - 1
    last_month = axis[-1]
    forecast = [
        {"month": _add_months(last_month, i), "projected": round(max(0.0, slope * (last_x + i) + intercept), 2)}
        for i in range(1, horizon + 1)
    ]

    avg_monthly = round(float(np.mean([h["total"] for h in complete])) if complete else float(ys.mean()), 2)
    threshold = max(avg_monthly * 0.02, 1.0)
    trend = "rising" if slope > threshold else "falling" if slope < -threshold else "stable"

    # Run-rate for the in-progress month
    today = date.today()
    days_in_month = monthrange(today.year, today.month)[1]
    cur_total = monthly.get(current_ym, 0.0)
    run_rate = round(cur_total / today.day * days_in_month, 2) if today.day else round(cur_total, 2)

    return {
        "history": history,
        "forecast": forecast,
        "avg_monthly": avg_monthly,
        "trend": trend,
        "slope": round(float(slope), 2),
        "next_month_projection": forecast[0]["projected"] if forecast else 0.0,
        "current_month_run_rate": run_rate,
    }

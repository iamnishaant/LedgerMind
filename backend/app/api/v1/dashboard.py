"""
Dashboard API — aggregated overview for the main dashboard page.

GET /api/v1/dashboard/summary?business_id=…&month=YYYY-MM

One authenticated round-trip returning everything the dashboard renders — KPI
tiles, spend-by-category, recent expenses, and agent-activity counts — all
computed from the business's REAL data. Reuses build_gst_summary() so the
"GST recoverable" figure matches the GST page exactly, and month_bounds() so the
spend window matches the expenses/summary endpoint. No mock data, ever: an empty
business simply returns zeros and empty lists, which the frontend renders as a
proper empty state.
"""
from __future__ import annotations

import asyncio
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends

from app.core.auth import ensure_owns_business, get_current_user
from app.core.dates import month_bounds
from app.core.supabase import get_supabase
from app.agents.gst_agent import build_gst_summary

router = APIRouter()


@router.get("/summary")
async def dashboard_summary(
    business_id: str,
    month: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    """Real-data overview for the signed-in user's active business.

    The four reads are independent, so they run concurrently on worker threads
    (asyncio.gather + to_thread) rather than sequentially — cutting latency to
    the slowest single query AND keeping the sync supabase-py calls off the
    event loop so they don't block other requests.
    """
    ensure_owns_business(business_id, user["id"])
    sb = get_supabase()

    month = month or date.today().strftime("%Y-%m")
    start, end = month_bounds(month)

    def _month_expenses():
        return (
            sb.table("expenses").select("amount, category")
            .eq("business_id", business_id)
            .gte("expense_date", start).lt("expense_date", end)
            .execute().data or []
        )

    def _recent():
        return (
            sb.table("expenses").select("id, vendor_name, amount, category, expense_date")
            .eq("business_id", business_id)
            .order("expense_date", desc=True).limit(5)
            .execute().data or []
        )

    def _needs_review():
        return (
            sb.table("receipts").select("id", count="exact")
            .eq("business_id", business_id).eq("status", "needs_review")
            .execute().count or 0
        )

    month_expenses, recent, needs_review, gst = await asyncio.gather(
        asyncio.to_thread(_month_expenses),
        asyncio.to_thread(_recent),
        asyncio.to_thread(_needs_review),
        asyncio.to_thread(build_gst_summary, business_id, month),
    )

    total_spend = round(sum(float(e["amount"]) for e in month_expenses if e.get("amount")), 2)
    by_category: dict[str, float] = {}
    for e in month_expenses:
        cat = e.get("category") or "Uncategorized"
        by_category[cat] = round(by_category.get(cat, 0.0) + float(e["amount"] or 0), 2)
    by_category_list = [
        {"category": k, "amount": v}
        for k, v in sorted(by_category.items(), key=lambda kv: -kv[1])
    ]

    return {
        "month": month,
        "kpis": {
            "total_spend": total_spend,
            "receipt_count": len(month_expenses),
            "gst_recoverable": gst["itc_recoverable"],
            "needs_review": needs_review,
        },
        "by_category": by_category_list,
        "recent_expenses": recent,
        "agent_activity": {
            "needs_review": needs_review,
            "expenses_categorized": len(month_expenses),
            "gst_recoverable": gst["itc_recoverable"],
            "missing_gstin": gst["missing_gstin_count"],
        },
    }

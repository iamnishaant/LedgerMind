"""
Budget Monitor — Phase 9

Lightweight, per-receipt companion to the Fraud agent: after an expense is
booked, check whether it pushed any budget covering its date into "at_risk"
or "over". Reuses the same deterministic status math the Budgets page uses
(app.api.v1.budgets._status_for) — no separate scoring logic to drift out of
sync, no LLM. Cheap: one query for matching budgets, one status computation
per match (same cost as loading the Budgets page for one budget).

Purely an enrichment step — it never blocks or fails expense booking itself.
"""
from __future__ import annotations

import logging

from app.core.supabase import get_supabase

logger = logging.getLogger(__name__)


def _matching_budgets(sb, business_id: str, category: str | None, expense_date: str) -> list[dict]:
    """Budgets for this business whose period covers expense_date and whose
    category is either unset (whole-business budget) or matches this expense."""
    rows = (
        sb.table("budgets").select("*")
        .eq("business_id", business_id)
        .lte("period_start", expense_date)
        .gte("period_end", expense_date)
        .execute().data or []
    )
    return [b for b in rows if not b.get("category") or b.get("category") == category]


async def run_budget_monitor(business_id: str, expense_id: str, expense: dict) -> dict:
    """Flag the expense's metadata if it pushed a matching budget over/near its limit."""
    try:
        from app.api.v1.budgets import _status_for  # reuse the existing deterministic math

        sb = get_supabase()
        budgets = _matching_budgets(sb, business_id, expense.get("category"), expense.get("expense_date"))
        if not budgets:
            return {"expense_id": expense_id, "budget_alerts": []}

        alerts = []
        for b in budgets:
            status = _status_for(sb, b)
            if status["state"] in ("at_risk", "over"):
                alerts.append({
                    "budget_id": b["id"], "budget_name": b["name"], "state": status["state"],
                    "actual": status["actual"], "amount": status["amount"], "projected": status["projected"],
                })

        if alerts:
            meta = dict(expense.get("metadata") or {})
            meta["budget_alerts"] = alerts
            sb.table("expenses").update({"metadata": meta}).eq("id", expense_id).execute()

        return {"expense_id": expense_id, "budget_alerts": alerts}
    except Exception:
        logger.exception("Budget monitor failed for expense_id=%r — skipping", expense_id)
        return {"expense_id": expense_id, "budget_alerts": [], "error": True}

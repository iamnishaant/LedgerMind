"""
Fraud Agent — Phase 9

Deterministic anomaly scoring for a just-booked expense. No LLM calls — money
and risk decisions are computed, not guessed by a model (same discipline as
gst_agent.py and budgets.py's status math).

Four signals, combined into fraud_risk: 'low' | 'medium' | 'high':
  1. Vendor amount outlier    — amount vs this vendor's own history (z-score)
  2. Category amount outlier  — amount vs this category's typical spend
  3. Same-day, same-vendor    — possible split-invoice pattern
  4. New vendor + large amount — first-ever spend from vendor, unusually high

`score_fraud_risk` is pure aside from the Supabase reads it issues to gather
comparison history, so it's testable by pre-seeding that history and calling
it directly (see tests/test_fraud_agent.py).
"""
from __future__ import annotations

import logging
import statistics
from typing import Optional

from app.core.supabase import get_supabase

logger = logging.getLogger(__name__)

_MIN_HISTORY_FOR_STATS = 3           # need at least this many prior expenses to trust a mean/stdev
_OUTLIER_Z_SCORE = 2.5               # flag when amount is this many std-devs above the mean
_LARGE_MULTIPLIER = 4.0              # "unusually large" = 4x a reference average
_SPLIT_INVOICE_MULTIPLIER = 1.5      # combined same-day same-vendor spend vs the largest single one


def _zscore_outlier(amount: float, history: list[float]) -> Optional[str]:
    """Reason string if `amount` is a statistical outlier vs `history`, else None."""
    if len(history) < _MIN_HISTORY_FOR_STATS:
        return None
    mean = statistics.mean(history)
    stdev = statistics.pstdev(history)
    if stdev == 0:
        # No variance in history (e.g. same subscription amount every time) — z-score
        # is undefined, so fall back to a flat multiplier check instead of skipping.
        if mean > 0 and amount >= mean * _LARGE_MULTIPLIER:
            return f"{amount / mean:.1f}x a previously-constant amount (₹{mean:,.0f} every time)"
        return None
    z = (amount - mean) / stdev
    if z >= _OUTLIER_Z_SCORE:
        return f"{z:.1f}σ above typical amount (avg ₹{mean:,.0f})"
    return None


def score_fraud_risk(
    business_id: str,
    vendor_name: str,
    category: str,
    amount: Optional[float],
    expense_date: Optional[str],
    exclude_expense_id: Optional[str] = None,
) -> tuple[str, list[str]]:
    """Compute a fraud_risk level + human-readable reasons for one expense."""
    if not amount or amount <= 0 or not expense_date:
        return "low", []

    supabase = get_supabase()
    reasons: list[str] = []

    vendor_q = (
        supabase.table("expenses").select("amount, expense_date")
        .eq("business_id", business_id).eq("vendor_name", vendor_name)
    )
    if exclude_expense_id:
        vendor_q = vendor_q.neq("id", exclude_expense_id)
    vendor_rows = vendor_q.execute().data or []
    vendor_amounts = [r["amount"] for r in vendor_rows if r["amount"]]

    vendor_reason = _zscore_outlier(amount, vendor_amounts)
    if vendor_reason:
        reasons.append(f"Unusual amount for {vendor_name}: {vendor_reason}")

    cat_q = (
        supabase.table("expenses").select("amount")
        .eq("business_id", business_id).eq("category", category)
    )
    if exclude_expense_id:
        cat_q = cat_q.neq("id", exclude_expense_id)
    cat_rows = cat_q.execute().data or []
    cat_amounts = [r["amount"] for r in cat_rows if r["amount"]]

    cat_reason = _zscore_outlier(amount, cat_amounts)
    if cat_reason:
        reasons.append(f"Unusual amount for category '{category}': {cat_reason}")

    same_day = [r for r in vendor_rows if r["expense_date"] == expense_date]
    if same_day:
        same_day_amounts = [r["amount"] for r in same_day if r["amount"]]
        combined = amount + sum(same_day_amounts)
        largest_single = max([amount, *same_day_amounts])
        if combined > largest_single * _SPLIT_INVOICE_MULTIPLIER:
            reasons.append(
                f"{len(same_day) + 1} expenses from {vendor_name} booked on {expense_date} "
                f"(combined ₹{combined:,.0f}) — possible split invoice"
            )

    if not vendor_amounts:
        biz_q = supabase.table("expenses").select("amount").eq("business_id", business_id)
        if exclude_expense_id:
            biz_q = biz_q.neq("id", exclude_expense_id)
        biz_amounts = [r["amount"] for r in biz_q.execute().data or [] if r["amount"]]
        if len(biz_amounts) >= _MIN_HISTORY_FOR_STATS:
            biz_avg = statistics.mean(biz_amounts)
            if biz_avg > 0 and amount >= biz_avg * _LARGE_MULTIPLIER:
                reasons.append(
                    f"First expense from {vendor_name}, ₹{amount:,.0f} is "
                    f"{amount / biz_avg:.1f}x this business's average expense"
                )

    if not reasons:
        return "low", []
    if len(reasons) >= 2:
        return "high", reasons
    return "medium", reasons


async def run_fraud_agent(business_id: str, expense_id: str, expense: dict) -> dict:
    """
    Score a just-booked expense and persist fraud_risk (+ reasons, if any).
    Never raises — a scoring bug must not roll back or block an already-booked
    expense; caller (orchestrator) also isolates this node independently.
    """
    try:
        risk, reasons = score_fraud_risk(
            business_id=business_id,
            vendor_name=expense.get("vendor_name") or "Unknown Vendor",
            category=expense.get("category") or "Other",
            amount=expense.get("amount"),
            expense_date=expense.get("expense_date"),
            exclude_expense_id=expense_id,
        )

        update: dict = {"fraud_risk": risk}
        if reasons:
            existing_tags = expense.get("agent_tags") or []
            update["agent_tags"] = list(dict.fromkeys([*existing_tags, "fraud_flagged"]))
            meta = dict(expense.get("metadata") or {})
            meta["fraud_reasons"] = reasons
            update["metadata"] = meta
        # High-risk expenses need an owner's sign-off (Phase 10 Approvals) —
        # only flip into 'pending' from the default 'not_required'; never
        # overwrite an approval decision a human already made.
        if risk == "high" and expense.get("approval_status", "not_required") == "not_required":
            update["approval_status"] = "pending"

        supabase = get_supabase()
        supabase.table("expenses").update(update).eq("id", expense_id).execute()

        return {"expense_id": expense_id, "fraud_risk": risk, "reasons": reasons,
                "approval_status": update.get("approval_status", expense.get("approval_status", "not_required"))}
    except Exception:
        logger.exception("Fraud agent failed for expense_id=%r — leaving fraud_risk unset", expense_id)
        return {"expense_id": expense_id, "fraud_risk": None, "reasons": [], "error": True}

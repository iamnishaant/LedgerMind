"""
Budgets API — Phase 5 (Budget Intelligence)
GET    /api/v1/budgets           → list budgets WITH live status + overspend projection
POST   /api/v1/budgets           → create a budget
DELETE /api/v1/budgets/{id}      → delete a budget

Status math is deterministic (SQL aggregation + run-rate projection) — no LLM in the
money path (architecture review §8.1).
"""
from datetime import date, timedelta
from calendar import monthrange
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from app.core.supabase import get_supabase
from app.core.auth import get_current_user, ensure_owns_business, ensure_owns_budget

router = APIRouter()


def _month_bounds(today: date) -> tuple[str, str]:
    start = today.replace(day=1)
    end = today.replace(day=monthrange(today.year, today.month)[1])
    return start.isoformat(), end.isoformat()


class BudgetIn(BaseModel):
    business_id: str
    name: str
    category: Optional[str] = None          # None = whole-business budget
    amount: float
    period_type: str = "monthly"            # monthly|quarterly|annual|project
    period_start: Optional[str] = None      # defaults to current month
    period_end: Optional[str] = None


def _status_for(sb, budget: dict) -> dict:
    """Compute actual spend, % used and a run-rate projection for one budget."""
    q = (
        sb.table("expenses").select("amount")
        .eq("business_id", budget["business_id"])
        .gte("expense_date", budget["period_start"])
        .lte("expense_date", budget["period_end"])
    )
    if budget.get("category"):
        q = q.eq("category", budget["category"])
    rows = q.execute().data or []
    actual = round(sum(r["amount"] or 0 for r in rows), 2)

    amount = float(budget["amount"] or 0)
    p_start = date.fromisoformat(budget["period_start"])
    p_end = date.fromisoformat(budget["period_end"])
    today = date.today()

    total_days = max((p_end - p_start).days + 1, 1)
    elapsed = min(max((today - p_start).days + 1, 1), total_days)
    # run-rate: extrapolate current spend across the whole period
    projected = round(actual / elapsed * total_days, 2) if elapsed else actual

    pct = round(actual / amount * 100, 1) if amount else 0.0
    if actual > amount:
        state = "over"
    elif projected > amount:
        state = "at_risk"
    else:
        state = "on_track"

    return {
        **budget,
        "actual": actual,
        "remaining": round(amount - actual, 2),
        "pct_used": pct,
        "projected": projected,
        "state": state,
        "days_elapsed": elapsed,
        "days_total": total_days,
    }


@router.get("")
async def list_budgets(business_id: str, user: dict = Depends(get_current_user)):
    ensure_owns_business(business_id, user["id"])
    sb = get_supabase()
    budgets = (
        sb.table("budgets").select("*")
        .eq("business_id", business_id)
        .order("created_at", desc=True)
        .execute().data or []
    )
    return {"budgets": [_status_for(sb, b) for b in budgets]}


@router.post("")
async def create_budget(payload: BudgetIn, user: dict = Depends(get_current_user)):
    ensure_owns_business(payload.business_id, user["id"])
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    start, end = payload.period_start, payload.period_end
    if not start or not end:
        start, end = _month_bounds(date.today())

    sb = get_supabase()
    res = sb.table("budgets").insert({
        "business_id": payload.business_id,
        "name": payload.name,
        "category": payload.category,
        "amount": payload.amount,
        "period_type": payload.period_type,
        "period_start": start,
        "period_end": end,
    }).execute()
    return _status_for(sb, res.data[0])


@router.delete("/{budget_id}")
async def delete_budget(budget_id: str, user: dict = Depends(get_current_user)):
    ensure_owns_budget(budget_id, user["id"])
    sb = get_supabase()
    sb.table("budgets").delete().eq("id", budget_id).execute()
    return {"deleted": budget_id}

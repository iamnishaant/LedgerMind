"""
Expenses API — Phase 1 (+ correction-feedback loop)
GET   /api/v1/expenses          → list expenses with filters
GET   /api/v1/expenses/summary  → monthly analytics summary
PATCH /api/v1/expenses/{id}     → correct an expense; records a learning signal
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.core.supabase import get_supabase
from app.core.auth import get_current_user, ensure_owns_business
from app.core.dates import month_bounds
from app.agents.vendor_memory import record_correction

router = APIRouter()


@router.get("")
async def list_expenses(
    business_id: str,
    category: Optional[str] = None,
    month: Optional[str] = None,   # YYYY-MM format
    page: int = 1,
    limit: int = 50,
    user: dict = Depends(get_current_user),
):
    """List expenses with optional category and month filters."""
    ensure_owns_business(business_id, user["id"])
    supabase = get_supabase()
    offset = (page - 1) * limit

    query = supabase.table("expenses").select("*").eq("business_id", business_id)

    if category:
        query = query.eq("category", category)
    if month:
        start, end = month_bounds(month)
        query = query.gte("expense_date", start).lt("expense_date", end)

    result = query.order("expense_date", desc=True).range(offset, offset + limit - 1).execute()
    return {"expenses": result.data, "page": page, "limit": limit}


class ExpenseUpdate(BaseModel):
    category: Optional[str] = None
    vendor_name: Optional[str] = None
    description: Optional[str] = None


@router.patch("/{expense_id}")
async def update_expense(
    expense_id: str, payload: ExpenseUpdate, user: dict = Depends(get_current_user),
):
    """Correct an expense. When the category changes, record an
    `expense_corrections` row so categorization learns for this business
    (see app/agents/vendor_memory.py). Any member may correct."""
    supabase = get_supabase()
    rows = supabase.table("expenses").select("*").eq("id", expense_id).limit(1).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Expense not found")
    expense = rows[0]
    ensure_owns_business(expense["business_id"], user["id"])

    updates: dict = {}
    if payload.vendor_name is not None:
        updates["vendor_name"] = payload.vendor_name
    if payload.description is not None:
        updates["description"] = payload.description

    category_changed = payload.category is not None and payload.category != expense.get("category")
    if payload.category is not None:
        updates["category"] = payload.category

    if not updates:
        return {"expense": expense, "corrected": False}

    # A category fix is the learning signal — record it before the update so the
    # "before" value is still the stored one. New vendor name (if any) wins.
    if category_changed:
        raw_excerpt = None
        if expense.get("receipt_id"):
            rc = supabase.table("receipts").select("raw_text").eq(
                "id", expense["receipt_id"]).limit(1).execute().data
            if rc and rc[0].get("raw_text"):
                raw_excerpt = rc[0]["raw_text"]
        record_correction(
            expense["business_id"],
            vendor_name=payload.vendor_name or expense.get("vendor_name"),
            original_category=expense.get("category"),
            corrected_category=payload.category,
            expense_id=expense_id,
            raw_text_excerpt=raw_excerpt,
            corrected_by=user["id"],
        )
        tags = list(expense.get("agent_tags") or [])
        if "user_corrected" not in tags:
            tags.append("user_corrected")
        updates["agent_tags"] = tags

    updated = supabase.table("expenses").update(updates).eq("id", expense_id).execute().data
    return {"expense": updated[0] if updated else None, "corrected": category_changed}


@router.get("/summary")
async def get_monthly_summary(business_id: str, month: str, user: dict = Depends(get_current_user)):
    """
    Monthly analytics summary for dashboard.
    Returns total spend, spend by category, and receipt count.
    """
    ensure_owns_business(business_id, user["id"])
    supabase = get_supabase()

    start, end = month_bounds(month)
    result = supabase.table("expenses").select(
        "amount, category, is_duplicate, gst_amount"
    ).eq("business_id", business_id).gte(
        "expense_date", start
    ).lt("expense_date", end).execute()

    expenses = result.data
    total = sum(e["amount"] for e in expenses if e["amount"])
    total_gst = sum(e["gst_amount"] for e in expenses if e.get("gst_amount"))
    by_category: dict = {}
    for e in expenses:
        cat = e.get("category", "Other")
        by_category[cat] = by_category.get(cat, 0) + (e["amount"] or 0)

    return {
        "month": month,
        "total_spend": round(total, 2),
        "total_gst_recoverable": round(total_gst, 2),
        "receipt_count": len(expenses),
        "duplicate_count": sum(1 for e in expenses if e.get("is_duplicate")),
        "by_category": {k: round(v, 2) for k, v in sorted(by_category.items(), key=lambda x: -x[1])},
    }

"""
Expenses API — Phase 1
GET  /api/v1/expenses          → list expenses with filters
GET  /api/v1/expenses/summary  → monthly analytics summary
"""
from fastapi import APIRouter, Depends
from typing import Optional

from app.core.supabase import get_supabase
from app.core.auth import get_current_user, ensure_owns_business

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
        query = query.gte("expense_date", f"{month}-01").lt("expense_date", f"{month}-32")

    result = query.order("expense_date", desc=True).range(offset, offset + limit - 1).execute()
    return {"expenses": result.data, "page": page, "limit": limit}


@router.get("/summary")
async def get_monthly_summary(business_id: str, month: str, user: dict = Depends(get_current_user)):
    """
    Monthly analytics summary for dashboard.
    Returns total spend, spend by category, and receipt count.
    """
    ensure_owns_business(business_id, user["id"])
    supabase = get_supabase()

    result = supabase.table("expenses").select(
        "amount, category, is_duplicate, gst_amount"
    ).eq("business_id", business_id).gte(
        "expense_date", f"{month}-01"
    ).lt("expense_date", f"{month}-32").execute()

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

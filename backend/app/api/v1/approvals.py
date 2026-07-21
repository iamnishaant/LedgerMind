"""
Approvals API — Phase 10 (Enterprise: Approvals workflow)
GET  /api/v1/approvals                → expenses awaiting sign-off for a business
POST /api/v1/approvals/{expense_id}/decide → owner-only; approve or reject

The Fraud agent (fraud_agent.py) is what actually puts an expense into
approval_status='pending' — only expenses it scores 'high' risk. This API is
just the queue + the decision, deliberately owner-only: a plain member can
upload receipts and see the queue, but can't clear their own flagged
expenses (see app/api/v1/team.py for the role model).
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from app.core.supabase import get_supabase
from app.core.auth import get_current_user, ensure_owns_business, ensure_is_owner

router = APIRouter()


@router.get("")
async def list_pending_approvals(business_id: str, user: dict = Depends(get_current_user)):
    ensure_owns_business(business_id, user["id"])
    sb = get_supabase()
    rows = (
        sb.table("expenses").select("*")
        .eq("business_id", business_id).eq("approval_status", "pending")
        .order("expense_date", desc=True).execute().data or []
    )
    return {"pending": rows}


class DecisionIn(BaseModel):
    decision: str  # 'approved' | 'rejected'
    reason: str | None = None


@router.post("/{expense_id}/decide")
async def decide(expense_id: str, payload: DecisionIn, user: dict = Depends(get_current_user)):
    if payload.decision not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="decision must be 'approved' or 'rejected'")

    sb = get_supabase()
    rows = sb.table("expenses").select("*").eq("id", expense_id).limit(1).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Expense not found")
    expense = rows[0]

    ensure_is_owner(expense["business_id"], user["id"])

    if expense["approval_status"] != "pending":
        raise HTTPException(
            status_code=400,
            detail=f"This expense isn't awaiting approval (status: {expense['approval_status']})",
        )

    update = {
        "approval_status": payload.decision,
        "approved_by": user["id"],
        "approved_at": datetime.now(timezone.utc).isoformat(),
    }
    if payload.decision == "rejected":
        update["rejection_reason"] = payload.reason

    sb.table("expenses").update(update).eq("id", expense_id).execute()
    return {"expense_id": expense_id, "approval_status": payload.decision}

"""
Auth — Phase 0

Verifies the Supabase access token sent by the frontend and enforces that the
caller actually owns whatever business_id they're operating on. Without the
ownership check, a login page is theater: the backend runs on the service-role
key (bypasses RLS), so anything short of an explicit check here would let an
authenticated user read/write ANY business by just changing a query param.
"""
from __future__ import annotations

from fastapi import Header, HTTPException

from app.core.supabase import get_supabase, get_supabase_anon


async def get_current_user(authorization: str | None = Header(default=None)) -> dict:
    """FastAPI dependency: extract + verify the Bearer token, return {'id', 'email'}."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header")

    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing bearer token")

    try:
        resp = get_supabase_anon().auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    if not resp or not resp.user:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    return {"id": resp.user.id, "email": resp.user.email}


def ensure_owns_business(business_id: str, user_id: str) -> None:
    """Raise 403 unless `user_id` is the owner_id of `business_id`."""
    sb = get_supabase()
    row = (
        sb.table("businesses").select("id")
        .eq("id", business_id).eq("owner_id", user_id)
        .limit(1).execute().data
    )
    if not row:
        raise HTTPException(status_code=403, detail="You don't have access to this business")


def ensure_owns_receipt(receipt_id: str, user_id: str) -> dict:
    """Raise 403/404 unless the receipt's business is owned by `user_id`. Returns the receipt row."""
    sb = get_supabase()
    receipt = sb.table("receipts").select("*").eq("id", receipt_id).limit(1).execute().data
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")
    ensure_owns_business(receipt[0]["business_id"], user_id)
    return receipt[0]


def ensure_owns_budget(budget_id: str, user_id: str) -> dict:
    """Raise 403/404 unless the budget's business is owned by `user_id`. Returns the budget row."""
    sb = get_supabase()
    budget = sb.table("budgets").select("*").eq("id", budget_id).limit(1).execute().data
    if not budget:
        raise HTTPException(status_code=404, detail="Budget not found")
    ensure_owns_business(budget[0]["business_id"], user_id)
    return budget[0]

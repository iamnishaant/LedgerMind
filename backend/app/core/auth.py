"""
Auth — Phase 0 (+ Phase 10 teams/roles)

Verifies the Supabase access token sent by the frontend and enforces that the
caller actually has access to whatever business_id they're operating on.
Without this check, a login page is theater: the backend runs on the
service-role key (bypasses RLS), so anything short of an explicit check here
would let an authenticated user read/write ANY business by just changing a
query param.

Since Phase 10, "access" means membership in `business_members` (any role),
not literal `businesses.owner_id` equality — a business can now have more
than one user. The owner is always a member too (auto-inserted by the
`on_business_created` trigger — see supabase/schema.sql), so this is a
strict widening: nothing that used to pass still fails.
"""
from __future__ import annotations

from typing import Optional

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
    """Raise 403 unless `user_id` is a member (any role) of `business_id`."""
    if get_member_role(business_id, user_id) is None:
        raise HTTPException(status_code=403, detail="You don't have access to this business")


def get_member_role(business_id: str, user_id: str) -> Optional[str]:
    """Return 'owner'/'member' if `user_id` belongs to `business_id`, else None."""
    sb = get_supabase()
    row = (
        sb.table("business_members").select("role")
        .eq("business_id", business_id).eq("user_id", user_id)
        .limit(1).execute().data
    )
    return row[0]["role"] if row else None


def ensure_is_owner(business_id: str, user_id: str) -> None:
    """Raise 403 unless `user_id` has the 'owner' role on `business_id`."""
    if get_member_role(business_id, user_id) != "owner":
        raise HTTPException(status_code=403, detail="Only the business owner can do this")


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

"""
Audit Log API — Phase 10 (Enterprise)
GET /api/v1/audit          → paginated agent_runs, filterable by agent_name/status/receipt_id
GET /api/v1/audit/summary  → total/failed/success-rate + breakdown by agent and status

Read-only view over data every agent already writes to `agent_runs` — no new
tables, no new write path, no LLM calls (same reasoning as budgets/expenses'
own summary endpoints: aggregate in Python over rows the caller already owns).
"""
from typing import Optional

from fastapi import APIRouter, Depends

from app.core.supabase import get_supabase
from app.core.auth import get_current_user, ensure_owns_business

router = APIRouter()


@router.get("")
async def list_audit_log(
    business_id: str,
    agent_name: Optional[str] = None,
    status: Optional[str] = None,
    receipt_id: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
    user: dict = Depends(get_current_user),
):
    ensure_owns_business(business_id, user["id"])
    supabase = get_supabase()
    offset = (page - 1) * limit

    query = supabase.table("agent_runs").select("*").eq("business_id", business_id)
    if agent_name:
        query = query.eq("agent_name", agent_name)
    if status:
        query = query.eq("status", status)
    if receipt_id:
        query = query.eq("receipt_id", receipt_id)

    result = query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
    return {"runs": result.data, "page": page, "limit": limit}


@router.get("/summary")
async def audit_summary(business_id: str, user: dict = Depends(get_current_user)):
    ensure_owns_business(business_id, user["id"])
    supabase = get_supabase()
    rows = (
        supabase.table("agent_runs").select("agent_name, status")
        .eq("business_id", business_id).execute().data or []
    )

    by_agent: dict[str, int] = {}
    by_status: dict[str, int] = {}
    for r in rows:
        by_agent[r["agent_name"]] = by_agent.get(r["agent_name"], 0) + 1
        by_status[r["status"]] = by_status.get(r["status"], 0) + 1

    total = len(rows)
    failed = by_status.get("failed", 0)
    return {
        "total_runs": total,
        "failed_runs": failed,
        "success_rate": round((total - failed) / total * 100, 1) if total else 100.0,
        "by_agent": dict(sorted(by_agent.items(), key=lambda x: -x[1])),
        "by_status": by_status,
    }

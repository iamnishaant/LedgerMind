from fastapi import APIRouter, Depends
from app.core.supabase import get_supabase
from app.core.auth import get_current_user, ensure_owns_business
router = APIRouter()

@router.get("/runs")
async def get_agent_runs(business_id: str, receipt_id: str | None = None, user: dict = Depends(get_current_user)):
    """Get agent run logs for a business (audit trail)."""
    ensure_owns_business(business_id, user["id"])
    supabase = get_supabase()
    query = supabase.table("agent_runs").select("*").eq("business_id", business_id)
    if receipt_id:
        query = query.eq("receipt_id", receipt_id)
    result = query.order("created_at", desc=True).limit(100).execute()
    return {"runs": result.data}

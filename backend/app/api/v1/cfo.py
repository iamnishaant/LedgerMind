"""
CFO API — Phase 7 (AI CFO)
GET /api/v1/cfo/brief?business_id=… → narrative brief (headline/risks/opportunities/actions)
                                        + the underlying deterministic metrics.
"""
from fastapi import APIRouter, Depends, Request

from app.core.auth import get_current_user, ensure_owns_business
from app.core.limiter import limiter
from app.agents.cfo_agent import run_cfo_agent

router = APIRouter()


@router.get("/brief")
@limiter.limit("6/minute")
async def get_cfo_brief(request: Request, business_id: str, user: dict = Depends(get_current_user)):
    ensure_owns_business(business_id, user["id"])
    return await run_cfo_agent(business_id)

"""
GST API — Phase 3 (GST Intelligence)
GET /api/v1/gst/summary?business_id=…&month=YYYY-MM  → ITC recoverable/blocked, by-rate breakdown,
                                                         expenses missing a GSTIN.
"""
from typing import Optional

from fastapi import APIRouter, Depends

from app.core.auth import get_current_user, ensure_owns_business
from app.agents.gst_agent import build_gst_summary

router = APIRouter()


@router.get("/summary")
async def get_gst_summary(business_id: str, month: Optional[str] = None, user: dict = Depends(get_current_user)):
    ensure_owns_business(business_id, user["id"])
    return build_gst_summary(business_id, month=month)

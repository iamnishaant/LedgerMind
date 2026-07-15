"""
Receipts API — Phase 1
POST /api/v1/receipts/upload   → upload receipt, trigger agent pipeline
GET  /api/v1/receipts          → list receipts for a business
GET  /api/v1/receipts/{id}     → receipt detail + OCR result
POST /api/v1/receipts/{id}/approve → resume graph after human review
"""
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks, Depends
from pydantic import BaseModel
from typing import Optional

from app.core.supabase import get_supabase
from app.core.auth import get_current_user, ensure_owns_business, ensure_owns_receipt
from app.core.ingest import ingest_receipt, run_ingest_pipeline
from app.agents.orchestrator import get_graph

router = APIRouter()


# ── Upload Receipt ────────────────────────────────────────────

@router.post("/upload")
async def upload_receipt(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    business_id: str = Form(...),
    user: dict = Depends(get_current_user),
):
    """Thin wrapper over the shared ingest path (see app/core/ingest.py)."""
    ensure_owns_business(business_id, user["id"])
    uploaded_by = user["id"]  # never trust a client-supplied uploader identity

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Empty file")

    receipt_id = await ingest_receipt(
        business_id=business_id,
        uploaded_by=uploaded_by,
        file_bytes=file_bytes,
        filename=file.filename or "receipt",
        content_type=file.content_type,
        source="manual",
    )

    background_tasks.add_task(
        run_ingest_pipeline,
        receipt_id=receipt_id,
        business_id=business_id,
        uploaded_by=uploaded_by,
        image_bytes=file_bytes,
    )

    return {"receipt_id": receipt_id, "status": "pending", "message": "Receipt uploaded. Processing started."}


# ── List Receipts ─────────────────────────────────────────────

@router.get("")
async def list_receipts(business_id: str, page: int = 1, limit: int = 20, user: dict = Depends(get_current_user)):
    ensure_owns_business(business_id, user["id"])
    supabase = get_supabase()
    offset = (page - 1) * limit
    result = supabase.table("receipts").select("*").eq("business_id", business_id)\
        .order("created_at", desc=True).range(offset, offset + limit - 1).execute()
    return {"receipts": result.data, "page": page, "limit": limit}


# ── Receipt Detail ────────────────────────────────────────────

@router.get("/{receipt_id}")
async def get_receipt(receipt_id: str, user: dict = Depends(get_current_user)):
    return ensure_owns_receipt(receipt_id, user["id"])


# ── Human Approval (resume graph after review) ────────────────

class ApprovalPayload(BaseModel):
    corrected_amount: Optional[float] = None
    corrected_vendor: Optional[str] = None
    corrected_date: Optional[str] = None
    corrected_category: Optional[str] = None


@router.post("/{receipt_id}/approve")
async def approve_receipt(
    receipt_id: str, payload: ApprovalPayload, background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
):
    """
    Resume the LangGraph graph after human correction.
    Updates state with corrected OCR values and continues to accounting.
    """
    ensure_owns_receipt(receipt_id, user["id"])
    graph = await get_graph()
    config = {"configurable": {"thread_id": receipt_id}}

    current_state = await graph.aget_state(config)
    if not current_state:
        raise HTTPException(status_code=404, detail="Graph state not found for this receipt")

    # Merge corrections into OCR result
    ocr_update = current_state.values.get("ocr_result", {})
    if payload.corrected_amount is not None:
        ocr_update["amount"] = payload.corrected_amount
    if payload.corrected_vendor:
        ocr_update["vendor_name"] = payload.corrected_vendor
    if payload.corrected_date:
        ocr_update["expense_date"] = payload.corrected_date

    await graph.aupdate_state(config, {"ocr_result": ocr_update, "needs_human_review": False, "status": "processing"})

    background_tasks.add_task(_resume_pipeline, graph, config)
    return {"message": "Receipt approved. Continuing processing.", "receipt_id": receipt_id}


async def _resume_pipeline(graph, config):
    await graph.ainvoke(None, config=config)

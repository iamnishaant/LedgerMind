"""
Receipts API — Phase 1
POST /api/v1/receipts/upload   → upload receipt, trigger agent pipeline
GET  /api/v1/receipts          → list receipts for a business
GET  /api/v1/receipts/{id}     → receipt detail + OCR result
POST /api/v1/receipts/{id}/approve → resume graph after human review
"""
import asyncio
import logging

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks, Depends, Request
from pydantic import BaseModel
from typing import Optional

from app.core.config import settings
from app.core.supabase import get_supabase
from app.core.auth import get_current_user, ensure_owns_business, ensure_owns_receipt
from app.core.ingest import ingest_receipt, run_ingest_pipeline, mark_receipt_failed
from app.core.limiter import limiter
from app.agents.orchestrator import get_graph

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Upload Receipt ────────────────────────────────────────────

@router.post("/upload")
@limiter.limit("30/minute")
async def upload_receipt(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    business_id: str = Form(...),
    user: dict = Depends(get_current_user),
):
    """Thin wrapper over the shared ingest path (see app/core/ingest.py).

    Rate-limited because each upload kicks off the full OCR + LLM pipeline — an
    expensive, abusable path if left uncapped (30/min per client is generous for
    a human uploading receipts, but blocks a flood)."""
    ensure_owns_business(business_id, user["id"])
    uploaded_by = user["id"]  # never trust a client-supplied uploader identity

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        receipt_id = await ingest_receipt(
            business_id=business_id,
            uploaded_by=uploaded_by,
            file_bytes=file_bytes,
            filename=file.filename or "receipt",
            content_type=file.content_type,
            source="manual",
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

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
    # Returns the receipt row — reuse it for business_id rather than re-querying
    # (it's needed to attribute a failure to the right business on resume).
    receipt = ensure_owns_receipt(receipt_id, user["id"])
    business_id = receipt["business_id"]

    graph = await get_graph()
    config = {"configurable": {"thread_id": receipt_id}}

    current_state = await graph.aget_state(config)
    if not current_state:
        raise HTTPException(status_code=404, detail="Graph state not found for this receipt")

    # Merge corrections into OCR result
    ocr_update = current_state.values.get("ocr_result") or {}
    if payload.corrected_amount is not None:
        ocr_update["amount"] = payload.corrected_amount
    if payload.corrected_vendor:
        ocr_update["vendor_name"] = payload.corrected_vendor
    if payload.corrected_date:
        ocr_update["expense_date"] = payload.corrected_date

    # The most common reason a receipt lands in review is that no total could be
    # read. Resuming without one would fail downstream on the NOT NULL amount
    # column, so reject it here with a message the UI can show against the field.
    if ocr_update.get("amount") is None:
        raise HTTPException(
            status_code=422,
            detail="This receipt has no amount. Enter the total (corrected_amount) to approve it.",
        )
    if float(ocr_update["amount"]) <= 0:
        raise HTTPException(status_code=422, detail="Amount must be greater than zero.")

    await graph.aupdate_state(config, {"ocr_result": ocr_update, "needs_human_review": False, "status": "processing"})

    # Move the DB row off 'needs_review' BEFORE resuming. That column is what the
    # UI polls; leaving it on a terminal state means the client sees "still needs
    # review" and stops polling the moment it checks, so the receipt appears
    # frozen even though the pipeline is running.
    get_supabase().table("receipts").update({"status": "processing"}).eq("id", receipt_id).execute()

    background_tasks.add_task(_resume_pipeline, graph, config, receipt_id, business_id)
    return {"message": "Receipt approved. Continuing processing.", "receipt_id": receipt_id}


async def _resume_pipeline(graph, config, receipt_id: str, business_id: str) -> None:
    """Resume the graph after human review.

    Mirrors run_ingest_pipeline's guarantees: bounded, and every failure path
    persists a terminal status. Without this the receipt would sit on
    'processing' forever if the resumed run raised or stalled — the exact
    stuck-spinner failure the ingest path was already hardened against.
    """
    try:
        await asyncio.wait_for(
            graph.ainvoke(None, config=config),
            timeout=settings.INGEST_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        logger.error("Resume timed out for receipt_id=%r", receipt_id)
        mark_receipt_failed(get_supabase(), business_id, receipt_id,
              f"Processing timed out after {settings.INGEST_TIMEOUT_SECONDS:.0f}s")
    except Exception as e:
        logger.exception("Resume failed for receipt_id=%r", receipt_id)
        mark_receipt_failed(get_supabase(), business_id, receipt_id, str(e))

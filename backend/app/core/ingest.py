"""
Shared receipt ingestion — the single entry point into the OCR pipeline.

Both the manual upload route (/api/v1/receipts/upload) and automation
connectors (Gmail, later Drive/Dropbox/Outlook) call these two functions, so
there is exactly ONE implementation of storage-upload → receipt-record →
LangGraph pipeline. Do not duplicate this logic in routes or connectors.
"""
from __future__ import annotations

import asyncio
import logging
import uuid

from app.core.config import settings
from app.core.supabase import get_supabase
from app.agents.orchestrator import get_graph

logger = logging.getLogger(__name__)


async def ingest_receipt(
    business_id: str,
    uploaded_by: str,
    file_bytes: bytes,
    filename: str,
    content_type: str | None = None,
    source: str = "manual",           # "manual" | "gmail" | future connectors
) -> str:
    """
    Store the file in Supabase Storage and create the pending receipt record.
    Returns the new receipt_id. Does NOT run the pipeline — callers decide
    whether that happens in a background task (manual upload) or inline
    (automation sync, which is already off the request path).

    Enforces MAX_UPLOAD_SIZE_BYTES here (not just in the frontend) so every
    ingest path — manual upload AND automation connectors — is protected
    uniformly; a connector could otherwise pull an oversized attachment
    straight into the OCR/vision pipeline before anything would reject it.
    """
    if not file_bytes:
        raise ValueError("Empty file")
    if len(file_bytes) > settings.MAX_UPLOAD_SIZE_BYTES:
        raise ValueError(
            f"File too large ({len(file_bytes) / 1024 / 1024:.1f} MB) — "
            f"max {settings.MAX_UPLOAD_SIZE_BYTES / 1024 / 1024:.0f} MB"
        )

    supabase = get_supabase()
    receipt_id = str(uuid.uuid4())
    storage_path = f"{business_id}/{receipt_id}/{filename}"

    # supabase-py is synchronous; these are network round-trips sitting directly
    # in the upload request path. Run them on a worker thread so a slow storage
    # write doesn't pin the event loop and stall every other in-flight request.
    def _store() -> None:
        supabase.storage.from_("receipts").upload(
            storage_path, file_bytes, {"content-type": content_type or "application/octet-stream"}
        )
        supabase.table("receipts").insert({
            "id": receipt_id,
            "business_id": business_id,
            "uploaded_by": uploaded_by,
            "storage_path": storage_path,
            "file_name": filename,
            "file_type": content_type,
            "status": "pending",
            "metadata": {"source": source},
        }).execute()

    await asyncio.to_thread(_store)
    return receipt_id


async def run_ingest_pipeline(receipt_id: str, business_id: str, uploaded_by: str, image_bytes: bytes) -> None:
    """Run the LangGraph agent pipeline for an ingested receipt (OCR → review? → accounting).

    Wrapped in an outer watchdog: every step already has its own timeout, but this
    guarantees the receipt reaches a terminal state no matter what stalls. A
    receipt left on 'pending' is the worst outcome — the UI polls it forever and
    the user gets no signal at all.
    """
    supabase = get_supabase()
    try:
        graph = await get_graph()
        config = {"configurable": {"thread_id": receipt_id}}
        initial_state = {
            "receipt_id": receipt_id,
            "business_id": business_id,
            "uploaded_by": uploaded_by,
            "image_bytes": image_bytes,
            "ocr_result": None,
            "accounting_result": None,
            "needs_human_review": False,
            "error": None,
            "status": "processing",
        }
        await asyncio.wait_for(
            graph.ainvoke(initial_state, config=config),
            timeout=settings.INGEST_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        logger.error(
            "Ingest pipeline timed out after %ss for receipt_id=%r business_id=%r",
            settings.INGEST_TIMEOUT_SECONDS, receipt_id, business_id,
        )
        mark_receipt_failed(supabase, business_id, receipt_id,
              f"Processing timed out after {settings.INGEST_TIMEOUT_SECONDS:.0f}s")
    except Exception as e:
        # This runs as a background task — a client never sees this exception,
        # so without logging it a pipeline failure would be completely invisible.
        logger.exception("Ingest pipeline failed for receipt_id=%r business_id=%r", receipt_id, business_id)
        mark_receipt_failed(supabase, business_id, receipt_id, str(e))
    else:
        # Safety net: if the graph finished but left the row non-terminal (e.g. a
        # node returned a failed state without persisting it), don't strand it.
        try:
            rows = supabase.table("receipts").select("status").eq("id", receipt_id).execute().data
            if rows and rows[0].get("status") in (None, "pending", "processing"):
                logger.warning(
                    "Receipt %r left non-terminal (%s) after pipeline completion — marking failed",
                    receipt_id, rows[0].get("status"),
                )
                mark_receipt_failed(supabase, business_id, receipt_id,
                      "Pipeline finished without reaching a terminal state")
        except Exception:
            logger.exception("Terminal-state check failed for receipt_id=%r", receipt_id)


def mark_receipt_failed(supabase, business_id: str, receipt_id: str, error: str) -> None:
    """Mark a receipt failed and record why (agent_runs carries the message —
    the receipts table has no error column; see supabase/schema.sql)."""
    try:
        supabase.table("receipts").update({"status": "failed"}).eq("id", receipt_id).execute()
        supabase.table("agent_runs").insert({
            "business_id": business_id,
            "receipt_id": receipt_id,
            "agent_name": "ingest_pipeline",
            "status": "failed",
            "error_message": error[:500],
        }).execute()
    except Exception:
        logger.exception("Could not persist failure for receipt_id=%r", receipt_id)

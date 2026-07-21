"""
LangGraph Orchestrator — Phase 1 + Phase 2 + Phase 9 ready
Graph: receipt uploaded → OCR → (human review?) → Accounting → Fraud → Budget Monitor

Fraud + Budget Monitor (Phase 9) are per-receipt enrichment agents: both operate
on the single expense that was just booked, so they belong in this graph. Forecast
and CFO deliberately do NOT — they're business-level aggregates computed on page
load, and re-running them (an LLM call, in the CFO's case) on every single receipt
upload would be wasteful and semantically wrong.

State passes only references (receipt_id, business_id, expense_id) + compact JSON
payload to keep graph state lean as agent count grows.
"""
from __future__ import annotations

import logging
from typing import TypedDict, Optional
from langgraph.graph import StateGraph, END

from app.agents.ocr_agent import run_ocr_agent, OCRResult
from app.agents.accounting_agent import run_accounting_agent
from app.agents.fraud_agent import run_fraud_agent
from app.agents.budget_monitor import run_budget_monitor
from app.core.supabase import get_supabase
from app.core.config import settings

logger = logging.getLogger(__name__)


# ── Graph State ──────────────────────────────────────────────

class ReceiptState(TypedDict):
    # References only (keep state lean)
    receipt_id: str
    business_id: str
    uploaded_by: str
    expense_id: Optional[str]

    # Compact payload from each agent
    image_bytes: Optional[bytes]          # passed only during OCR step, then cleared
    ocr_result: Optional[dict]
    accounting_result: Optional[dict]
    fraud_result: Optional[dict]
    budget_result: Optional[dict]

    # Control flow
    needs_human_review: bool
    error: Optional[str]
    status: str                            # 'processing' | 'needs_review' | 'completed' | 'failed'


# ── Node: OCR ────────────────────────────────────────────────

async def ocr_node(state: ReceiptState) -> ReceiptState:
    """Run PaddleOCR + LLM classification on the uploaded receipt."""
    try:
        image_bytes = state.get("image_bytes")
        if not image_bytes:
            # Fetch from Supabase Storage if not in state.
            # NOTE: plain .execute() + length check, not .single() — .single()
            # raises on zero OR more-than-one matching rows (e.g. a receipt
            # insert that hasn't committed yet), which would surface as an
            # opaque PostgREST error instead of a clear "not found".
            supabase = get_supabase()
            rows = supabase.table("receipts").select("storage_path").eq("id", state["receipt_id"]).execute().data
            if not rows:
                raise ValueError(f"Receipt {state['receipt_id']} not found")
            storage_path = rows[0]["storage_path"]
            response = supabase.storage.from_("receipts").download(storage_path)
            image_bytes = response

        result: OCRResult = await run_ocr_agent(image_bytes)

        # Update receipt status in DB
        supabase = get_supabase()
        supabase.table("receipts").update({
            "status": "needs_review" if result.needs_human_review else "processing",
            "confidence": result.confidence,
            "raw_text": result.raw_text,
        }).eq("id", state["receipt_id"]).execute()

        # Log agent run
        supabase.table("agent_runs").insert({
            "business_id": state["business_id"],
            "receipt_id": state["receipt_id"],
            "agent_name": "ocr_agent",
            "status": "completed",
            "output_payload": result.model_dump(),
        }).execute()

        return {
            **state,
            "image_bytes": None,           # clear bytes from state after OCR
            "ocr_result": result.model_dump(),
            "needs_human_review": result.needs_human_review,
            "status": "needs_review" if result.needs_human_review else "processing",
        }
    except Exception as e:
        logger.exception("OCR node failed for receipt_id=%r", state.get("receipt_id"))
        return {**state, "error": str(e), "status": "failed"}


# ── Node: Human Review (breakpoint) ─────────────────────────

async def human_review_node(state: ReceiptState) -> ReceiptState:
    """
    LangGraph breakpoint — graph execution pauses here when confidence < threshold.
    Frontend polls receipt status; user corrects data and resumes via API.
    This node itself is a no-op; the interrupt() mechanism halts graph here.
    """
    # This will be interrupted by LangGraph's interrupt mechanism
    # Resumed via: graph.update_state(config, corrected_data) + graph.invoke(...)
    return {**state, "status": "awaiting_human"}


# ── Node: Accounting Agent ───────────────────────────────────

async def accounting_node(state: ReceiptState) -> ReceiptState:
    """Categorize, book the expense, and detect duplicates."""
    try:
        result = await run_accounting_agent(
            receipt_id=state["receipt_id"],
            business_id=state["business_id"],
            ocr_result=state.get("ocr_result", {}),
        )

        supabase = get_supabase()
        supabase.table("agent_runs").insert({
            "business_id": state["business_id"],
            "receipt_id": state["receipt_id"],
            "agent_name": "accounting_agent",
            "status": "completed",
            "output_payload": result,
        }).execute()

        supabase.table("receipts").update({"status": "completed"}).eq("id", state["receipt_id"]).execute()

        return {
            **state,
            "accounting_result": result,
            "expense_id": result.get("expense_id"),
            "status": "completed",
        }
    except Exception as e:
        logger.exception("Accounting node failed for receipt_id=%r", state.get("receipt_id"))
        return {**state, "error": str(e), "status": "failed"}


# ── Node: Fraud Agent (Phase 9) ──────────────────────────────

async def fraud_node(state: ReceiptState) -> ReceiptState:
    """
    Score the just-booked expense for fraud risk. Pure enrichment: the expense
    already exists and `receipts.status` is already 'completed' — a failure
    here must never undo that, so this node swallows its own errors.
    """
    expense_id = state.get("expense_id")
    if not expense_id:
        return state
    try:
        supabase = get_supabase()
        rows = supabase.table("expenses").select("*").eq("id", expense_id).execute().data
        if not rows:
            return state

        result = await run_fraud_agent(state["business_id"], expense_id, rows[0])
        supabase.table("agent_runs").insert({
            "business_id": state["business_id"],
            "receipt_id": state["receipt_id"],
            "agent_name": "fraud_agent",
            "status": "failed" if result.get("error") else "completed",
            "output_payload": result,
        }).execute()

        return {**state, "fraud_result": result}
    except Exception:
        logger.exception("Fraud node failed for expense_id=%r", expense_id)
        return state


# ── Node: Budget Monitor (Phase 9) ───────────────────────────

async def budget_monitor_node(state: ReceiptState) -> ReceiptState:
    """Flag the expense if it pushed a matching budget into at_risk/over. Enrichment only."""
    expense_id = state.get("expense_id")
    if not expense_id:
        return state
    try:
        supabase = get_supabase()
        rows = supabase.table("expenses").select("*").eq("id", expense_id).execute().data
        if not rows:
            return state

        result = await run_budget_monitor(state["business_id"], expense_id, rows[0])
        supabase.table("agent_runs").insert({
            "business_id": state["business_id"],
            "receipt_id": state["receipt_id"],
            "agent_name": "budget_monitor",
            "status": "failed" if result.get("error") else "completed",
            "output_payload": result,
        }).execute()

        return {**state, "budget_result": result}
    except Exception:
        logger.exception("Budget monitor node failed for expense_id=%r", expense_id)
        return state


# ── Routing ──────────────────────────────────────────────────

def route_after_ocr(state: ReceiptState) -> str:
    if state["status"] == "failed":
        return "end"
    if state["needs_human_review"]:
        return "human_review"
    return "accounting"


def route_after_accounting(state: ReceiptState) -> str:
    if state["status"] == "failed" or not state.get("expense_id"):
        return "end"
    return "fraud"


# ── Build Graph ──────────────────────────────────────────────

def build_orchestrator() -> StateGraph:
    graph = StateGraph(ReceiptState)

    graph.add_node("ocr", ocr_node)
    graph.add_node("human_review", human_review_node)
    graph.add_node("accounting", accounting_node)
    graph.add_node("fraud", fraud_node)
    graph.add_node("budget_monitor", budget_monitor_node)

    graph.set_entry_point("ocr")

    graph.add_conditional_edges("ocr", route_after_ocr, {
        "human_review": "human_review",
        "accounting": "accounting",
        "end": END,
    })

    # After human review → accounting
    graph.add_edge("human_review", "accounting")

    graph.add_conditional_edges("accounting", route_after_accounting, {
        "fraud": "fraud",
        "end": END,
    })
    graph.add_edge("fraud", "budget_monitor")
    graph.add_edge("budget_monitor", END)

    return graph


# ── Checkpointer + compiled graph (singleton) ────────────────
#
# A checkpointer is REQUIRED for the human-in-the-loop breakpoint to work:
# it persists graph state at `interrupt_before=["human_review"]` so the
# /approve endpoint can later resume the same thread.
#
# Production: shared Postgres checkpointer (DATABASE_URL) → durable across
# restarts, matching the architecture review's "durable execution" goal.
# Dev fallback: in-memory saver (state lives only in this process).

_compiled_graph = None
_checkpointer_cm = None   # kept alive so the connection pool isn't GC'd


async def _init_checkpointer():
    """Postgres checkpointer if DATABASE_URL is set, else in-memory fallback."""
    global _checkpointer_cm
    if settings.DATABASE_URL:
        try:
            from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
            _checkpointer_cm = AsyncPostgresSaver.from_conn_string(settings.DATABASE_URL)
            saver = await _checkpointer_cm.__aenter__()
            await saver.setup()
            print("🗄️  LangGraph checkpointer: Postgres (durable)")
            return saver
        except Exception:  # missing psycopg / bad URL → don't crash the app
            # logger.exception (not print) so this failure has a real traceback —
            # a silent fallback to in-memory here means HITL state quietly stops
            # surviving restarts, with no signal beyond an easily-missed log line.
            logger.exception("Postgres checkpointer unavailable — falling back to in-memory (NOT durable)")

    from langgraph.checkpoint.memory import MemorySaver
    print("🗄️  LangGraph checkpointer: in-memory (dev only — not durable)")
    return MemorySaver()


async def get_graph():
    """Return the shared compiled orchestrator graph (built once)."""
    global _compiled_graph
    if _compiled_graph is None:
        checkpointer = await _init_checkpointer()
        _compiled_graph = build_orchestrator().compile(
            checkpointer=checkpointer,
            interrupt_before=["human_review"],   # pause before human_review node
        )
    return _compiled_graph

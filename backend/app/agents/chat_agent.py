"""
Chat Agent — Phase 4 (AI Chat)

A tool-calling assistant that answers finance questions from REAL data — never by
guessing numbers.

Latency design (2026-07):
    The old flow cost TWO sequential LLM round-trips for almost every question —
    round 1 to pick a tool (streamed no visible tokens, ~30s on NVIDIA's free
    tier), then round 2 to write the answer (~30s). ~60s with a dead, empty
    bubble for the first half.

    Now we PREFETCH a compact financial snapshot (this month's totals, top
    categories/vendors, GST position, recent expenses) with a few parallel
    deterministic queries and inject it straight into the system prompt. The
    common questions ("what did I spend this month?", "top vendors?", "how much
    GST can I recover?") are answerable from that snapshot in a SINGLE streamed
    call — first token arrives after ~1 inference instead of 2. Tools remain
    bound as a fallback for anything the snapshot doesn't cover (other months,
    all-time totals, a specific category/vendor), so correctness is unchanged.

    There is deliberately no embedding/vector RAG here: the "retrieval" is fast
    deterministic SQL aggregation, so a vector store would add latency, not remove
    it (architecture review §8.1 — the model reasons; the tools/snapshot own the
    math).
"""
from __future__ import annotations

import asyncio
import contextvars
import json
import logging
import time
from datetime import date
from typing import AsyncIterator

from langchain_core.messages import (
    AIMessage, AIMessageChunk, HumanMessage, SystemMessage, ToolMessage, BaseMessage,
)

from app.core.dates import month_bounds
from app.core.llm import get_chat_model_fast
from app.core.supabase import get_supabase
from app.agents.gst_agent import build_gst_summary

logger = logging.getLogger(__name__)

# business_id for the current request — read by the tools (async-safe).
_business_ctx: contextvars.ContextVar[str] = contextvars.ContextVar("business_id")

MAX_TOOL_ROUNDS = 4
HISTORY_TURNS = 6          # cap prior turns fed back to the model
HISTORY_CHAR_CAP = 600     # truncate any single long stored message
SNAPSHOT_TTL_SECONDS = 45  # reuse a business's snapshot across rapid follow-ups

# Tiny in-process TTL cache: {business_id: (fetched_at, snapshot)}. Short TTL so a
# fresh receipt upload shows up quickly; long enough to skip re-querying within a
# back-and-forth conversation.
_snapshot_cache: dict[str, tuple[float, dict]] = {}


def _rows(month: str | None):
    """Fetch expense rows for the active business, optionally filtered to a month (YYYY-MM)."""
    sb = get_supabase()
    q = sb.table("expenses").select(
        "amount, category, vendor_name, expense_date, gst_amount, is_duplicate"
    ).eq("business_id", _business_ctx.get())
    if month:
        start, end = month_bounds(month)
        q = q.gte("expense_date", start).lt("expense_date", end)
    return q.execute().data or []


# ── Tools (plain functions; schema is inferred from signature + docstring) ──

def get_monthly_summary(month: str) -> str:
    """Total spend, spend-by-category, GST recoverable and receipt count for a month.
    month: the month to summarize, formatted as YYYY-MM (e.g. '2026-07')."""
    rows = _rows(month)
    total = round(sum(r["amount"] or 0 for r in rows), 2)
    gst = round(sum(r.get("gst_amount") or 0 for r in rows), 2)
    by_cat: dict[str, float] = {}
    for r in rows:
        c = r.get("category") or "Other"
        by_cat[c] = round(by_cat.get(c, 0) + (r["amount"] or 0), 2)
    return json.dumps({
        "month": month, "total_spend": total, "gst_recoverable": gst,
        "receipt_count": len(rows),
        "by_category": dict(sorted(by_cat.items(), key=lambda x: -x[1])),
    })


def top_vendors(month: str = "", limit: int = 5) -> str:
    """The vendors you spent the most with. month: YYYY-MM, or '' for all time. limit: how many."""
    rows = _rows(month or None)
    agg: dict[str, float] = {}
    for r in rows:
        v = r.get("vendor_name") or "Unknown"
        agg[v] = round(agg.get(v, 0) + (r["amount"] or 0), 2)
    top = sorted(agg.items(), key=lambda x: -x[1])[: max(1, limit)]
    return json.dumps({"top_vendors": [{"vendor": v, "amount": a} for v, a in top]})


def category_spend(category: str, month: str = "") -> str:
    """Total spend in a single category. category: e.g. 'Software & Subscriptions'. month: YYYY-MM or ''."""
    rows = _rows(month or None)
    cat_l = category.lower()
    total = round(sum(r["amount"] or 0 for r in rows if (r.get("category") or "").lower() == cat_l), 2)
    return json.dumps({"category": category, "month": month or "all_time", "total_spend": total})


def recent_expenses(limit: int = 10) -> str:
    """The most recent expenses (vendor, amount, category, date). limit: how many to return."""
    sb = get_supabase()
    rows = (
        sb.table("expenses")
        .select("vendor_name, amount, category, expense_date")
        .eq("business_id", _business_ctx.get())
        .order("expense_date", desc=True)
        .limit(max(1, min(limit, 25)))
        .execute().data or []
    )
    return json.dumps({"recent": rows})


_TOOLS = [get_monthly_summary, top_vendors, category_spend, recent_expenses]
_TOOL_MAP = {f.__name__: f for f in _TOOLS}


# ── Snapshot prefetch (the latency win) ─────────────────────────────────────

def _month_expense_rows(business_id: str, month: str) -> list[dict]:
    sb = get_supabase()
    start, end = month_bounds(month)
    return (
        sb.table("expenses")
        .select("amount, category, vendor_name")
        .eq("business_id", business_id)
        .gte("expense_date", start).lt("expense_date", end)
        .execute().data or []
    )


def _recent_expense_rows(business_id: str) -> list[dict]:
    sb = get_supabase()
    return (
        sb.table("expenses")
        .select("vendor_name, amount, category, expense_date")
        .eq("business_id", business_id)
        .order("expense_date", desc=True).limit(5)
        .execute().data or []
    )


def _build_snapshot(month: str, month_rows: list[dict], recent: list[dict], gst: dict) -> dict:
    total = round(sum(float(r["amount"]) for r in month_rows if r.get("amount")), 2)
    by_cat: dict[str, float] = {}
    vendors: dict[str, float] = {}
    for r in month_rows:
        amt = float(r["amount"] or 0)
        by_cat[r.get("category") or "Uncategorized"] = round(by_cat.get(r.get("category") or "Uncategorized", 0) + amt, 2)
        v = r.get("vendor_name") or "Unknown"
        vendors[v] = round(vendors.get(v, 0) + amt, 2)
    top_cat = dict(sorted(by_cat.items(), key=lambda x: -x[1])[:6])
    top_vend = [{"vendor": v, "spent": a} for v, a in sorted(vendors.items(), key=lambda x: -x[1])[:5]]
    return {
        "as_of": date.today().isoformat(),
        "current_month": month,
        "this_month": {
            "total_spend": total,
            "expense_count": len(month_rows),
            "spend_by_category": top_cat,
            "top_vendors": top_vend,
            "gst_recoverable": gst.get("itc_recoverable", 0),
            "gst_blocked": gst.get("itc_blocked", 0),
            "missing_gstin_count": gst.get("missing_gstin_count", 0),
        },
        "recent_expenses": [
            {"vendor": r.get("vendor_name") or "Unknown", "amount": r.get("amount"),
             "category": r.get("category"), "date": r.get("expense_date")}
            for r in recent
        ],
    }


async def gather_snapshot(business_id: str) -> dict:
    """Compact current-month financial snapshot, fetched with parallel queries and
    cached briefly. Returns {} on failure so chat degrades to the tool-only path
    (never breaks). Safe to call on every message."""
    now = time.time()
    cached = _snapshot_cache.get(business_id)
    if cached and now - cached[0] < SNAPSHOT_TTL_SECONDS:
        return cached[1]

    month = date.today().strftime("%Y-%m")
    try:
        # supabase-py is synchronous → fan the three reads out across threads so
        # they run concurrently instead of serially.
        month_rows, recent, gst = await asyncio.gather(
            asyncio.to_thread(_month_expense_rows, business_id, month),
            asyncio.to_thread(_recent_expense_rows, business_id),
            asyncio.to_thread(build_gst_summary, business_id, month),
        )
    except Exception:
        logger.exception("chat snapshot prefetch failed; falling back to tool-only path")
        return {}

    snapshot = _build_snapshot(month, month_rows, recent, gst)
    _snapshot_cache[business_id] = (now, snapshot)
    return snapshot


def invalidate_snapshot(business_id: str) -> None:
    """Drop a business's cached snapshot (e.g. right after a new receipt is booked)."""
    _snapshot_cache.pop(business_id, None)


# ── Prompt + message construction (shared by both entry points) ─────────────

_BASE_PROMPT = (
    "You are the AI finance assistant for a small business using AI FinanceOS. "
    "Today is {today}. All amounts are in Indian Rupees (INR, ₹). "
    "Keep answers concise and practical; format money like ₹12,400. If a question "
    "is not about the business's finances, answer briefly without calling tools."
)


def _system_prompt(snapshot: dict) -> str:
    base = _BASE_PROMPT.format(today=date.today().isoformat())
    if snapshot:
        return (
            base
            + "\n\nCURRENT FINANCIAL SNAPSHOT (already fetched for you — answer directly "
            "from these exact figures and do NOT call a tool when the answer is here):\n"
            + json.dumps(snapshot, separators=(",", ":"))
            + "\n\nFor ANY question (financial or not): if the answer is in the snapshot above, "
            "answer directly WITHOUT calling a tool. Only call a tool when the question needs "
            "data NOT in this snapshot — a different month, all-time totals, or a specific "
            "category/vendor not listed. For non-financial questions (greetings, general advice, "
            "etc.), answer from your general knowledge WITHOUT tools. Never invent or estimate "
            "financial numbers."
        )
    # No snapshot (prefetch failed): behave like the original tool-first agent.
    return base + (
        " ALWAYS use the provided tools to fetch real figures from the business's books "
        "before stating any number — never invent or estimate amounts. If the tools "
        "return no data, say so."
    )


def _trim_history(history: list[BaseMessage] | None) -> list[BaseMessage]:
    """Keep only the last few turns and cap any single long message — bounds the
    prompt's token count so history growth doesn't slow every request."""
    if not history:
        return []
    trimmed: list[BaseMessage] = []
    for m in history[-HISTORY_TURNS:]:
        content = m.content if isinstance(m.content, str) else str(m.content)
        if len(content) > HISTORY_CHAR_CAP:
            content = content[:HISTORY_CHAR_CAP] + "…"
        trimmed.append(HumanMessage(content) if isinstance(m, HumanMessage) else AIMessage(content))
    return trimmed


def _build_messages(snapshot: dict, message: str, history: list[BaseMessage] | None) -> list[BaseMessage]:
    messages: list[BaseMessage] = [SystemMessage(_system_prompt(snapshot))]
    messages.extend(_trim_history(history))
    messages.append(HumanMessage(message))
    return messages


# ── Entry points ────────────────────────────────────────────────────────────

async def run_chat_agent(
    business_id: str, message: str, history: list[BaseMessage] | None = None
) -> tuple[str, list[str]]:
    """Run the tool-calling loop (non-streaming). Returns (answer_text, tool_names_used)."""
    _business_ctx.set(business_id)
    snapshot = await gather_snapshot(business_id)
    llm = get_chat_model_fast().bind_tools(_TOOLS)

    messages = _build_messages(snapshot, message, history)
    used: list[str] = []
    ai: AIMessage | None = None
    for _ in range(MAX_TOOL_ROUNDS):
        ai = await llm.ainvoke(messages)
        messages.append(ai)
        tool_calls = getattr(ai, "tool_calls", None) or []
        if not tool_calls:
            break
        for tc in tool_calls:
            fn = _TOOL_MAP.get(tc["name"])
            used.append(tc["name"])
            try:
                result = fn(**tc["args"]) if fn else json.dumps({"error": f"unknown tool {tc['name']}"})
            except Exception as e:  # keep the loop alive on a bad tool call
                result = json.dumps({"error": str(e)})
            messages.append(ToolMessage(content=str(result), tool_call_id=tc["id"]))

    answer = (ai.content if ai else "") or "I couldn't produce an answer — please try rephrasing."
    return answer, used


async def stream_chat_agent(
    business_id: str, message: str, history: list[BaseMessage] | None = None
) -> AsyncIterator[dict]:
    """Streaming variant. Yields event dicts as they happen:

        {"type": "tool",  "name": <tool>}          a tool is being invoked (fallback path)
        {"type": "token", "text": <delta>}         each answer token as it streams
        {"type": "done",  "answer": <full>,        once, at the end — includes tools_used
                          "tools_used": [...],      and a per-stage timing breakdown
                          "timings": {...}}

    Common questions answer from the injected snapshot in a single call, so the
    first token streams after one inference instead of two.
    """
    t0 = time.perf_counter()
    _business_ctx.set(business_id)

    snapshot = await gather_snapshot(business_id)
    t_snapshot = time.perf_counter()

    llm = get_chat_model_fast().bind_tools(_TOOLS)
    messages = _build_messages(snapshot, message, history)

    used: list[str] = []
    answer_parts: list[str] = []
    first_token_at: float | None = None
    rounds = 0

    for _ in range(MAX_TOOL_ROUNDS):
        rounds += 1
        gathered: AIMessageChunk | None = None
        async for chunk in llm.astream(messages):
            gathered = chunk if gathered is None else gathered + chunk
            text = chunk.content if isinstance(chunk.content, str) else ""
            if text:
                if first_token_at is None:
                    first_token_at = time.perf_counter()
                answer_parts.append(text)
                yield {"type": "token", "text": text}
        if gathered is None:
            break
        messages.append(gathered)

        tool_calls = getattr(gathered, "tool_calls", None) or []
        if not tool_calls:
            break
        for tc in tool_calls:
            fn = _TOOL_MAP.get(tc["name"])
            used.append(tc["name"])
            yield {"type": "tool", "name": tc["name"]}
            try:
                result = fn(**tc["args"]) if fn else json.dumps({"error": f"unknown tool {tc['name']}"})
            except Exception as e:
                result = json.dumps({"error": str(e)})
            messages.append(ToolMessage(content=str(result), tool_call_id=tc["id"]))

    answer = "".join(answer_parts) or "I couldn't produce an answer — please try rephrasing."
    now = time.perf_counter()
    timings = {
        "snapshot_ms": round((t_snapshot - t0) * 1000),
        "first_token_ms": round((first_token_at - t0) * 1000) if first_token_at else None,
        "total_ms": round((now - t0) * 1000),
        "rounds": rounds,
        "used_snapshot": bool(snapshot),
        "used_tools": bool(used),
    }
    logger.info(
        "chat stream business=%s snapshot=%dms first_token=%sms total=%dms rounds=%d tools=%s",
        business_id, timings["snapshot_ms"],
        timings["first_token_ms"], timings["total_ms"], rounds, used or "none",
    )
    yield {"type": "done", "answer": answer, "tools_used": used, "timings": timings}

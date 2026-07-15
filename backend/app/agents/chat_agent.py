"""
Chat Agent — Phase 4 (AI Chat)

A tool-calling assistant that answers finance questions by running REAL queries
against Supabase — never by guessing numbers. The LLM decides which tool to call;
the tools do deterministic SQL-style aggregation and hand back facts to explain.

Design (architecture review §8.1): the model reasons/explains; the tools own the math.
"""
from __future__ import annotations

import contextvars
import json
from datetime import date

from langchain_core.messages import (
    AIMessage, HumanMessage, SystemMessage, ToolMessage, BaseMessage,
)

from app.core.llm import get_chat_model
from app.core.supabase import get_supabase

# business_id for the current request — read by the tools (async-safe).
_business_ctx: contextvars.ContextVar[str] = contextvars.ContextVar("business_id")


def _rows(month: str | None):
    """Fetch expense rows for the active business, optionally filtered to a month (YYYY-MM)."""
    sb = get_supabase()
    q = sb.table("expenses").select(
        "amount, category, vendor_name, expense_date, gst_amount, is_duplicate"
    ).eq("business_id", _business_ctx.get())
    if month:
        q = q.gte("expense_date", f"{month}-01").lte("expense_date", f"{month}-31")
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


def _system_prompt() -> str:
    return (
        "You are the AI finance assistant for a small business using AI FinanceOS. "
        f"Today is {date.today().isoformat()}. All amounts are in Indian Rupees (INR, ₹).\n\n"
        "ALWAYS use the provided tools to fetch real figures from the business's books before "
        "stating any number — never invent or estimate amounts. If the tools return no data, say so. "
        "Keep answers concise and practical; format money like ₹12,400. If a question is not about the "
        "business's finances, answer briefly without calling tools."
    )


async def run_chat_agent(
    business_id: str, message: str, history: list[BaseMessage] | None = None
) -> tuple[str, list[str]]:
    """Run the tool-calling loop. Returns (answer_text, tool_names_used)."""
    _business_ctx.set(business_id)
    llm = get_chat_model().bind_tools(_TOOLS)

    messages: list[BaseMessage] = [SystemMessage(_system_prompt())]
    if history:
        messages.extend(history)
    messages.append(HumanMessage(message))

    used: list[str] = []
    ai: AIMessage | None = None
    for _ in range(4):  # cap tool rounds
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

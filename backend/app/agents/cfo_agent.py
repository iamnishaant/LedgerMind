"""
CFO Agent — Phase 7 (AI CFO)

Synthesizes budgets + forecasts + GST + this month's expenses into a
prioritized, narrative financial brief. Every number the LLM sees comes from
the existing deterministic agents (forecast_agent, gst_agent, budgets) — the
LLM only reasons over precomputed figures, it never computes one itself
(architecture review §8.1). Structured JSON out, not freeform markdown, so
the frontend can render it as real UI instead of parsing prose.
"""
from __future__ import annotations

import json
import logging
from calendar import monthrange
from datetime import date

from langchain_core.prompts import ChatPromptTemplate

from app.core.llm import get_chat_model
from app.core.supabase import get_supabase
from app.agents.forecast_agent import build_forecast
from app.agents.gst_agent import build_gst_summary

logger = logging.getLogger(__name__)


def _current_month_summary(business_id: str) -> dict:
    sb = get_supabase()
    today = date.today()
    start = today.replace(day=1).isoformat()
    end = today.replace(day=monthrange(today.year, today.month)[1]).isoformat()
    rows = (
        sb.table("expenses").select("amount, category, is_duplicate")
        .eq("business_id", business_id)
        .gte("expense_date", start).lte("expense_date", end)
        .execute().data or []
    )
    total = round(sum(r["amount"] or 0 for r in rows), 2)
    by_cat: dict[str, float] = {}
    for r in rows:
        cat = r.get("category") or "Other"
        by_cat[cat] = round(by_cat.get(cat, 0) + (r["amount"] or 0), 2)
    return {
        "month": start[:7],
        "total_spend": total,
        "receipt_count": len(rows),
        "duplicate_count": sum(1 for r in rows if r.get("is_duplicate")),
        "by_category": dict(sorted(by_cat.items(), key=lambda x: -x[1])),
    }


def _budget_statuses(business_id: str) -> list[dict]:
    from app.api.v1.budgets import _status_for  # reuse the existing deterministic math

    sb = get_supabase()
    budgets = sb.table("budgets").select("*").eq("business_id", business_id).execute().data or []
    return [_status_for(sb, b) for b in budgets]


def gather_metrics(business_id: str) -> dict:
    """Collect every deterministic figure the brief will reason over. Pure data, no LLM."""
    return {
        "expenses_this_month": _current_month_summary(business_id),
        "budgets": _budget_statuses(business_id),
        "forecast": build_forecast(business_id, horizon=3),
        "gst": build_gst_summary(business_id),
    }


_CFO_PROMPT = ChatPromptTemplate.from_messages([
    ("system", """You are the AI CFO for a small business using AI FinanceOS. You are given REAL,
precomputed financial metrics as JSON. NEVER invent, adjust, or estimate any number — only reason
over what's given, and cite the exact figures from the data.

Respond with STRICT JSON only, no markdown fences, matching exactly this shape:
{{
  "headline": "one sentence: the single most important thing to know right now",
  "risks": [{{"title": "short label", "detail": "one sentence citing a specific number"}}],
  "opportunities": [{{"title": "short label", "detail": "one sentence citing a specific number"}}],
  "actions": ["concrete prioritized next step", "..."]
}}

At most 3 risks, 3 opportunities, 3 actions, ordered by priority (most important first). If a
section has nothing meaningful (e.g. no budgets set yet), return fewer items rather than inventing
content. Use ₹ for all amounts. Be concrete and specific, never generic advice."""),
    ("human", "Current metrics:\n\n{metrics_json}"),
])


def _parse_json(content: str) -> dict:
    """Tolerant JSON parse — strips markdown fences and any prose around the object."""
    text = content.strip()
    if text.startswith("```"):
        text = text.split("```", 2)[1] if text.count("```") >= 2 else text
        text = text.removeprefix("json").strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end != -1 and end > start:
            return json.loads(text[start:end + 1])
        raise


async def run_cfo_agent(business_id: str) -> dict:
    metrics = gather_metrics(business_id)
    llm = get_chat_model()
    chain = _CFO_PROMPT | llm
    result = await chain.ainvoke({"metrics_json": json.dumps(metrics, indent=2, default=str)})
    try:
        brief = _parse_json(result.content)
    except Exception:
        logger.exception("CFO brief JSON parse failed for business_id=%r — raw content: %.500r",
                          business_id, result.content)
        brief = {"headline": "Couldn't generate a structured brief this time — try again.",
                  "risks": [], "opportunities": [], "actions": []}
    return {"brief": brief, "metrics": metrics}

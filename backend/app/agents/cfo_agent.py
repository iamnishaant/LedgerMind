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

import asyncio
import json
import logging
import time
from calendar import monthrange
from datetime import date

from langchain_core.prompts import ChatPromptTemplate

from app.core.config import settings
from app.core.llm import get_chat_model
from app.core.supabase import get_supabase
from app.agents.forecast_agent import build_forecast
from app.agents.gst_agent import build_gst_summary

logger = logging.getLogger(__name__)

# A brief summarizes a whole month — it does not change second to second, and
# regenerating it costs a full 70B call. Cache so navigating back to the page is
# instant; "Refresh brief" bypasses this.
BRIEF_TTL_SECONDS = 300
# Below the 6/minute rate limit's window, and short enough that a stalled
# provider degrades to metrics-only rather than hanging the page.
CFO_LLM_TIMEOUT_SECONDS = 90.0

# {business_id: (built_at, payload)}
_brief_cache: dict[str, tuple[float, dict]] = {}


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
    return [_with_variance(_status_for(sb, b)) for b in budgets]


def _with_variance(status: dict) -> dict:
    """Normalize one budget into an unambiguous, LLM-safe shape.

    Two failure modes, both observed against the real model:
      1. Given only limit and spend it did the subtraction itself and got it
         wrong (₹12,300 vs ₹10,000 reported as "₹1,300 over") — so `over_by`
         and `remaining` are precomputed here (architecture review §8.1: the
         LLM never computes a figure).
      2. The raw column names are ambiguous — `amount` is the LIMIT and
         `actual` is the SPEND — and it cited the spend as though it were the
         overage. Field names here say exactly what each number means.
    """
    limit = float(status.get("amount") or status.get("limit") or 0)
    spent = float(status.get("actual") or status.get("spent") or 0)
    diff = round(spent - limit, 2)
    return {
        "category": status.get("category") or "All categories",
        "budget_limit": limit,
        "amount_spent": spent,
        "amount_over_budget": diff if diff > 0 else 0.0,
        "amount_still_available": round(limit - spent, 2) if diff < 0 else 0.0,
        "percent_of_budget_used": status.get("percent_used", status.get("pct")),
        "projected_end_of_period_spend": status.get("projected"),
        "status": status.get("state") or status.get("status"),
    }


def gather_metrics(business_id: str) -> dict:
    """Collect every deterministic figure the brief will reason over. Pure data, no LLM.

    Synchronous entry point, kept for tests and any caller already on a thread.
    Async callers should use gather_metrics_async() — see the note there.
    """
    return {
        "expenses_this_month": _current_month_summary(business_id),
        "budgets": _budget_statuses(business_id),
        "forecast": build_forecast(business_id, horizon=3),
        "gst": build_gst_summary(business_id),
    }


async def gather_metrics_async(business_id: str) -> dict:
    """Same four metric groups, gathered CONCURRENTLY on worker threads.

    They're independent, and supabase-py is synchronous — run sequentially in an
    `async def` they blocked the event loop for the sum of all four (budgets
    alone issues one query per budget), stalling every other request while the
    CFO page loaded.
    """
    month, budgets, forecast, gst = await asyncio.gather(
        asyncio.to_thread(_current_month_summary, business_id),
        asyncio.to_thread(_budget_statuses, business_id),
        asyncio.to_thread(build_forecast, business_id, 3),
        asyncio.to_thread(build_gst_summary, business_id),
    )
    return {
        "expenses_this_month": month,
        "budgets": budgets,
        "forecast": forecast,
        "gst": gst,
    }


_CFO_PROMPT = ChatPromptTemplate.from_messages([
    ("system", """You are the AI CFO for a small business using AI FinanceOS. You are given REAL,
precomputed financial metrics as JSON. NEVER invent, adjust, or estimate any number — only reason
over what's given, and cite the exact figures from the data.

ARITHMETIC IS FORBIDDEN. Every number you write must appear VERBATIM in the JSON. Never add,
subtract, total, or otherwise derive a figure. If a number you want is not in the data, do not
state it.

Field names say exactly what they mean — use the right one. For a budget:
`amount_spent` is what was spent, `budget_limit` is the cap, and
`amount_over_budget` is how far OVER the cap it went. To say a budget is over,
quote `amount_over_budget` — never `amount_spent`, which is the total spend, not
the overage.

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


async def run_cfo_agent(business_id: str, refresh: bool = False) -> dict:
    """Build the CFO brief. Cached briefly — see BRIEF_TTL_SECONDS.

    The brief is a full 70B synthesis (kept deliberately: this is the flagship
    reasoning surface, and a smaller model produced noticeably weaker analysis).
    That costs real seconds on the free tier, so the result is cached — revisiting
    the page is instant, and "Refresh brief" forces a rebuild.
    """
    now = time.time()
    if not refresh:
        cached = _brief_cache.get(business_id)
        if cached and now - cached[0] < BRIEF_TTL_SECONDS:
            return {**cached[1], "cached": True}

    t0 = time.perf_counter()
    metrics = await gather_metrics_async(business_id)
    t_metrics = time.perf_counter()

    prompt_input = {"metrics_json": json.dumps(metrics, indent=2, default=str)}
    fast_model = settings.CHAT_MODEL or None
    primary = settings.CFO_MODEL or fast_model

    async def _ask(model: str | None):
        chain = _CFO_PROMPT | get_chat_model(model=model)
        return await asyncio.wait_for(chain.ainvoke(prompt_input), timeout=CFO_LLM_TIMEOUT_SECONDS)

    try:
        try:
            result = await _ask(primary)
        except asyncio.TimeoutError:
            # A bigger, better analyst is worth trying — but not worth hanging on.
            # If the configured model stalls, fall back to the fast one rather
            # than showing the user nothing.
            if primary == fast_model:
                raise
            logger.warning("CFO model %r timed out — falling back to %r", primary, fast_model)
            result = await _ask(fast_model)
    except asyncio.TimeoutError:
        # Never leave the page spinning: return the deterministic metrics with an
        # honest headline. Every figure the UI charts is already in `metrics`.
        logger.error("CFO brief timed out after %ss for business_id=%r",
                     CFO_LLM_TIMEOUT_SECONDS, business_id)
        return {
            "brief": {
                "headline": "The analysis is taking longer than usual — your figures below are up to date.",
                "risks": [], "opportunities": [],
                "actions": ["Try 'Refresh brief' in a moment."],
            },
            "metrics": metrics,
            "degraded": True,
        }

    try:
        brief = _parse_json(result.content)
    except Exception:
        logger.exception("CFO brief JSON parse failed for business_id=%r — raw content: %.500r",
                          business_id, result.content)
        brief = {"headline": "Couldn't generate a structured brief this time — try again.",
                  "risks": [], "opportunities": [], "actions": []}

    payload = {"brief": brief, "metrics": metrics}
    _brief_cache[business_id] = (now, payload)
    logger.info("CFO brief business=%s metrics=%dms llm=%dms",
                business_id,
                round((t_metrics - t0) * 1000),
                round((time.perf_counter() - t_metrics) * 1000))
    return payload


def invalidate_brief(business_id: str) -> None:
    """Drop a cached brief (e.g. after new expenses are booked)."""
    _brief_cache.pop(business_id, None)

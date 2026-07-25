"""
Accounting Agent — Phase 2
Categorizes expenses, detects duplicates, and creates expense records in Supabase.
"""
from __future__ import annotations
import json
import logging
from datetime import date, datetime, timedelta
from typing import Optional

from langchain_core.prompts import ChatPromptTemplate

from app.core.config import settings
from app.core.llm import get_chat_model
from app.core.supabase import get_supabase
from app.agents.gst_agent import evaluate_itc
from app.agents.vendor_memory import learned_category, recent_correction_examples

logger = logging.getLogger(__name__)


# ── Date normalization ───────────────────────────────────────

_DATE_FORMATS = (
    "%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y",
    "%d %B %Y", "%d %b %Y", "%Y/%m/%d",
)


def _coerce_date(raw: Optional[str]) -> Optional[date]:
    """Normalize a raw OCR date string (many formats) into a real date, or None."""
    if not raw:
        return None
    raw = raw.strip()
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return None


EXPENSE_CATEGORIES = [
    "Food & Dining", "Travel & Transport", "Office Supplies", "Software & Subscriptions",
    "Utilities", "Medical & Health", "Marketing & Advertising", "Rent & Facilities",
    "Professional Services", "Equipment", "Other",
]

_accounting_prompt = ChatPromptTemplate.from_messages([
    ("system", f"""You are a professional bookkeeper for Indian small businesses.
Given extracted receipt data, return a JSON with:
- category: one of {EXPENSE_CATEGORIES}
- description: short 1-line description of the expense
- is_business_expense: boolean

Respond with valid JSON only."""),
    ("human", """{business_examples}Vendor: {vendor_name}
Amount: {amount} {currency}
Date: {expense_date}
Raw text excerpt: {raw_text_excerpt}
"""),
])


def _format_examples(examples: list[tuple[str, str]]) -> str:
    """Render Tier-2 few-shot pairs as a prompt preamble, or '' if there are none.
    Steers the model toward THIS business's conventions without a hard rule."""
    if not examples:
        return ""
    lines = "\n".join(f'- "{vendor}" -> {category}' for vendor, category in examples)
    return f"This business categorizes similar expenses like this:\n{lines}\n\nNow classify:\n"


def _parse_json(content: str) -> dict:
    """Tolerant JSON parse — strips markdown fences and any prose around the object."""
    text = content.strip()
    if text.startswith("```"):
        text = text.split("```", 2)[1] if text.count("```") >= 2 else text
        text = text.removeprefix("json").strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Fall back to the outermost {...} block (smaller models add prose).
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end != -1 and end > start:
            return json.loads(text[start:end + 1])
        raise


async def _classify_expense(ocr_result: dict, business_id: Optional[str] = None) -> dict:
    """Classify an expense, informed by this business's past corrections.

    Tier 1 — if the business has a confident prior for this vendor, apply it
             deterministically (no LLM call at all).
    Tier 2 — otherwise, inject the business's recent corrections as few-shot
             examples and let the LLM classify.
    With no correction history (or no business_id) both tiers are inert and this
    behaves exactly as the original static-prompt classifier."""
    vendor_name = ocr_result.get("vendor_name")

    # Tier 1: deterministic vendor→category memory.
    if business_id:
        learned = learned_category(business_id, vendor_name)
        if learned:
            logger.info("Categorized %r as %r from correction memory (no LLM)", vendor_name, learned)
            return {
                "category": learned,
                "description": ocr_result.get("description", ""),
                "is_business_expense": True,
                "_source": "learned_from_correction",
            }

    # Tier 2: few-shot-nudged LLM.
    examples = recent_correction_examples(business_id) if business_id else []
    try:
        llm = get_chat_model()
        chain = _accounting_prompt | llm
        result = await chain.ainvoke({
            "business_examples": _format_examples(examples),
            "vendor_name": vendor_name or "Unknown",
            "amount": ocr_result.get("amount", 0),
            "currency": ocr_result.get("currency", "INR"),
            "expense_date": ocr_result.get("expense_date", ""),
            "raw_text_excerpt": (ocr_result.get("raw_text", ""))[:500],
        })
        return _parse_json(result.content)
    except Exception:
        logger.exception("Expense classification failed for vendor=%r — falling back to 'Other'",
                          vendor_name)
        return {"category": "Other", "description": "", "is_business_expense": True}


def _detect_duplicate(business_id: str, amount: float, vendor_name: str, expense_date: str) -> bool:
    """
    Check if a near-identical expense already exists for this business:
    same vendor + same amount within a ±3 day window of the expense date.
    """
    if not amount or not expense_date:
        return False
    try:
        parsed = _coerce_date(expense_date)
        supabase = get_supabase()
        query = (
            supabase.table("expenses")
            .select("id")
            .eq("business_id", business_id)
            .eq("amount", amount)
            .eq("vendor_name", vendor_name)
        )
        if parsed:
            low = (parsed - timedelta(days=3)).isoformat()
            high = (parsed + timedelta(days=3)).isoformat()
            query = query.gte("expense_date", low).lte("expense_date", high)
        result = query.limit(1).execute()
        return len(result.data) > 0
    except Exception:
        logger.exception("Duplicate check failed for business_id=%r vendor=%r — assuming not a duplicate",
                          business_id, vendor_name)
        return False


async def run_accounting_agent(receipt_id: str, business_id: str, ocr_result: dict) -> dict:
    """
    Full accounting pipeline:
    1. Classify expense category via LLM
    2. Detect duplicates
    3. Write expense record to Supabase
    """
    # Step 1: Classify (informed by this business's past corrections)
    classification = await _classify_expense(ocr_result, business_id)

    amount = ocr_result.get("amount")
    vendor_name = ocr_result.get("vendor_name", "Unknown Vendor")
    currency = ocr_result.get("currency", "INR")

    # Normalize the OCR date string → real ISO date for the `date` column.
    parsed_date = _coerce_date(ocr_result.get("expense_date"))
    expense_date = parsed_date.isoformat() if parsed_date else date.today().isoformat()

    # Step 2: Duplicate detection
    is_duplicate = _detect_duplicate(business_id, amount, vendor_name, expense_date)

    # Step 3: GST / ITC eligibility (Phase 3 — deterministic, see gst_agent.py)
    category = classification.get("category", "Other")
    gst_number = ocr_result.get("gst_number")
    gst_amount = ocr_result.get("gst_amount")
    gst_rate = ocr_result.get("gst_rate")
    itc_eligible, itc_reason = evaluate_itc(category, gst_amount, gst_rate, gst_number)

    # Step 4: Insert expense record
    supabase = get_supabase()
    expense_data = {
        "business_id": business_id,
        "receipt_id": receipt_id,
        "amount": amount,
        "currency": currency,
        "vendor_name": vendor_name,
        "description": classification.get("description", ""),
        "category": category,
        "expense_date": expense_date,
        "gst_number": gst_number,
        "gst_amount": gst_amount,
        "gst_rate": gst_rate,
        "itc_eligible": itc_eligible,
        "is_duplicate": is_duplicate,
        "agent_tags": (
            ["auto_categorized", "learned_from_correction"]
            if classification.get("_source") == "learned_from_correction"
            else ["auto_categorized"]
        ),
        "metadata": {
            "ocr_confidence": ocr_result.get("confidence"),
            "is_business_expense": classification.get("is_business_expense", True),
            "itc_reason": itc_reason,
        },
    }

    res = supabase.table("expenses").insert(expense_data).execute()

    return {
        "expense_id": res.data[0]["id"] if res.data else None,
        "category": category,
        "is_duplicate": is_duplicate,
        "description": classification.get("description"),
        "itc_eligible": itc_eligible,
    }

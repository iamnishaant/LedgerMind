"""
Vendor memory — the Correction-Feedback Loop's read/write layer (Phase 2 follow-up).

Every human category fix is recorded in `expense_corrections`; this module turns
that history into two signals the accounting agent consumes:

  Tier 1  learned_category()          — a confident vendor→category prior (no LLM)
  Tier 2  recent_correction_examples()— recent (vendor → category) pairs for few-shot

Every query is explicitly scoped by business_id. The backend runs on the
service-role key (bypasses RLS), so tenancy is enforced HERE, in code — the same
discipline as app/core/auth.py. Cross-tenant leakage on financial data is
non-negotiable, so there is a dedicated tenancy test for it.

Cold start (a business with no corrections yet): Tier 1 returns None and Tier 2
returns [], so classification behaves exactly as it did before this existed.
"""
from __future__ import annotations

import logging
from typing import Optional

from app.core.supabase import get_supabase

logger = logging.getLogger(__name__)

# How many of a vendor's most-recent corrections must agree for Tier 1 to fire.
# A later correction overrides an earlier one, so a mistake self-heals on the
# next real edit rather than poisoning memory permanently.
_TIER1_LOOKBACK = 3


def record_correction(
    business_id: str,
    *,
    vendor_name: Optional[str],
    original_category: Optional[str],
    corrected_category: str,
    expense_id: Optional[str] = None,
    raw_text_excerpt: Optional[str] = None,
    corrected_by: Optional[str] = None,
) -> None:
    """Persist a single human category fix. Best-effort: a logging/DB failure here
    must never break the user-facing update that triggered it."""
    try:
        get_supabase().table("expense_corrections").insert({
            "business_id": business_id,
            "expense_id": expense_id,
            "vendor_name": vendor_name,
            "raw_text_excerpt": (raw_text_excerpt or None) and raw_text_excerpt[:500],
            "original_category": original_category,
            "corrected_category": corrected_category,
            "corrected_by": corrected_by,
        }).execute()
    except Exception:
        logger.exception(
            "Failed to record expense correction for business_id=%r vendor=%r",
            business_id, vendor_name,
        )


def learned_category(business_id: str, vendor_name: Optional[str]) -> Optional[str]:
    """Tier 1: the confident prior category for this vendor, or None.

    Returns the corrected_category if the vendor's last N corrections all agree;
    None on conflict, no history, or a missing vendor name."""
    if not vendor_name:
        return None
    try:
        rows = (
            get_supabase().table("expense_corrections")
            .select("corrected_category")
            .eq("business_id", business_id)
            .eq("vendor_name", vendor_name)
            .order("created_at", desc=True)
            .limit(_TIER1_LOOKBACK)
            .execute().data
        )
    except Exception:
        logger.exception("Tier-1 lookup failed for business_id=%r vendor=%r", business_id, vendor_name)
        return None

    if not rows:
        return None
    categories = {r["corrected_category"] for r in rows}
    # Unanimous across the recent window → confident prior. Any disagreement →
    # defer to the LLM (Tier 2) rather than guess between conflicting edits.
    return rows[0]["corrected_category"] if len(categories) == 1 else None


def recent_correction_examples(business_id: str, limit: int = 8) -> list[tuple[str, str]]:
    """Tier 2: recent, de-duplicated (vendor → corrected_category) pairs for few-shot.

    Most-recent-first, one row per vendor (a vendor already handled by Tier 1
    adds no signal to the prompt), capped at `limit` to bound prompt growth."""
    try:
        rows = (
            get_supabase().table("expense_corrections")
            .select("vendor_name, corrected_category")
            .eq("business_id", business_id)
            .order("created_at", desc=True)
            .limit(limit * 4)  # over-fetch, then de-dup by vendor down to `limit`
            .execute().data
        )
    except Exception:
        logger.exception("Tier-2 example fetch failed for business_id=%r", business_id)
        return []

    seen: set[str] = set()
    pairs: list[tuple[str, str]] = []
    for r in rows:
        vendor = r.get("vendor_name")
        if not vendor or vendor in seen:
            continue
        seen.add(vendor)
        pairs.append((vendor, r["corrected_category"]))
        if len(pairs) >= limit:
            break
    return pairs

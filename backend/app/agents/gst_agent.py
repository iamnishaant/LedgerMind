"""
GST Agent — Phase 3 (GST Intelligence)

Deterministic Input Tax Credit (ITC) eligibility + GST reporting. No LLM here —
ITC eligibility is a rules question, not a reasoning one (architecture review §8.1).

Ruleset is a SIMPLIFIED approximation of CGST Act Section 17(5) "blocked credit"
categories (food & beverages, health/life insurance, employee travel benefits,
club memberships, etc. are generally NOT eligible for ITC). This is a defensible
starting point for a small-business tool, not a substitute for professional tax
advice — real GST law has exceptions this doesn't model (e.g. same-line-of-business
carve-outs for food & catering).
"""
from __future__ import annotations

from app.core.supabase import get_supabase

# Categories whose ITC is generally blocked under Sec 17(5), simplified.
BLOCKED_ITC_CATEGORIES = {"Food & Dining", "Medical & Health"}

# Valid non-zero GST slabs under the current rate structure.
VALID_GST_SLABS = {5, 12, 18, 28}


def evaluate_itc(
    category: str | None, gst_amount: float | None, gst_rate: float | None, gst_number: str | None,
) -> tuple[bool, str]:
    """Return (itc_eligible, reason) for one expense."""
    if not gst_amount or gst_amount <= 0:
        return False, "No GST amount on this expense"
    if not gst_number:
        return False, "No supplier GSTIN captured — a valid tax invoice is required to claim ITC"
    if gst_rate is None or round(float(gst_rate)) not in VALID_GST_SLABS:
        return False, f"GST rate {gst_rate} is not a recognized slab (5/12/18/28%)"
    if category in BLOCKED_ITC_CATEGORIES:
        return False, f"'{category}' is a blocked-credit category under Sec 17(5)"
    return True, "Eligible — valid GSTIN, recognized slab, non-blocked category"


def build_gst_summary(business_id: str, month: str | None = None) -> dict:
    """
    Aggregate GST across a business's expenses: recoverable ITC, blocked amount,
    breakdown by rate slab, and expenses missing a GSTIN (follow-up list).
    `month` is YYYY-MM; omit for all-time.
    """
    sb = get_supabase()
    q = (
        sb.table("expenses")
        .select("id, vendor_name, amount, gst_amount, gst_rate, gst_number, itc_eligible, category, expense_date")
        .eq("business_id", business_id)
    )
    if month:
        q = q.gte("expense_date", f"{month}-01").lte("expense_date", f"{month}-31")
    rows = q.execute().data or []

    itc_recoverable = 0.0
    itc_blocked = 0.0
    by_rate: dict[str, float] = {}
    missing_gstin: list[dict] = []

    for r in rows:
        gst_amt = r.get("gst_amount") or 0.0
        if not gst_amt:
            continue

        rate_key = f"{r.get('gst_rate')}%" if r.get("gst_rate") is not None else "unknown"
        by_rate[rate_key] = round(by_rate.get(rate_key, 0.0) + gst_amt, 2)

        eligible, _ = evaluate_itc(r.get("category"), gst_amt, r.get("gst_rate"), r.get("gst_number"))
        if eligible:
            itc_recoverable += gst_amt
        else:
            itc_blocked += gst_amt

        if not r.get("gst_number") and gst_amt > 0:
            missing_gstin.append({
                "id": r["id"], "vendor_name": r.get("vendor_name"),
                "amount": r.get("amount"), "gst_amount": gst_amt, "expense_date": r.get("expense_date"),
            })

    return {
        "month": month or "all_time",
        "itc_recoverable": round(itc_recoverable, 2),
        "itc_blocked": round(itc_blocked, 2),
        "total_gst": round(itc_recoverable + itc_blocked, 2),
        "by_rate": dict(sorted(by_rate.items(), key=lambda x: -x[1])),
        "missing_gstin": sorted(missing_gstin, key=lambda x: x["expense_date"] or "", reverse=True),
        "missing_gstin_count": len(missing_gstin),
    }

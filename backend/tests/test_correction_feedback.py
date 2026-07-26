"""
Correction-Feedback Loop — DB-backed against the real (dev) Supabase project.

Covers the whole loop end-to-end:
  - capture:  PATCH /expenses/{id} records exactly one correction on a category
              change, none otherwise, and 403s a non-member.
  - Tier 1:   a confident vendor prior resolves deterministically; a conflicting
              history falls back to None (→ LLM).
  - Tier 2:   recent examples are returned, and one business's corrections never
              leak into another's (tenancy — non-negotiable for financial data).
  - cold start: zero corrections behaves exactly as before.

Route functions are called directly, matching the rest of this suite.
"""
import uuid

import pytest
from fastapi import HTTPException

from app.api.v1.expenses import update_expense, ExpenseUpdate
from app.agents.vendor_memory import learned_category, recent_correction_examples


def _insert_expense(supabase, business_id, *, vendor, category, amount=1000):
    return supabase.table("expenses").insert({
        "business_id": business_id,
        "amount": amount,
        "vendor_name": vendor,
        "category": category,
        "expense_date": "2026-07-01",
    }).execute().data[0]


def _corrections(supabase, business_id):
    return supabase.table("expense_corrections").select("*").eq(
        "business_id", business_id).execute().data


# ── Capture ──────────────────────────────────────────────────

async def test_patch_category_records_exactly_one_correction(qa_business, supabase):
    business_id, user_id = qa_business
    exp = _insert_expense(supabase, business_id, vendor="AWS India", category="Utilities")

    res = await update_expense(
        exp["id"], ExpenseUpdate(category="Software & Subscriptions"), user={"id": user_id})

    assert res["corrected"] is True
    assert res["expense"]["category"] == "Software & Subscriptions"
    assert "user_corrected" in res["expense"]["agent_tags"]

    rows = _corrections(supabase, business_id)
    assert len(rows) == 1
    assert rows[0]["original_category"] == "Utilities"
    assert rows[0]["corrected_category"] == "Software & Subscriptions"
    assert rows[0]["vendor_name"] == "AWS India"
    assert rows[0]["corrected_by"] == user_id


async def test_patch_without_category_change_records_no_correction(qa_business, supabase):
    business_id, user_id = qa_business
    exp = _insert_expense(supabase, business_id, vendor="Uber", category="Travel & Transport")

    # Same category value → not a correction; a description edit is not a signal.
    res = await update_expense(
        exp["id"], ExpenseUpdate(category="Travel & Transport", description="cab to airport"),
        user={"id": user_id})

    assert res["corrected"] is False
    assert _corrections(supabase, business_id) == []


async def test_patch_by_non_member_is_403(qa_business, second_business, supabase):
    business_id, _ = qa_business
    _, outsider_id = second_business
    exp = _insert_expense(supabase, business_id, vendor="WeWork", category="Other")

    with pytest.raises(HTTPException) as ei:
        await update_expense(exp["id"], ExpenseUpdate(category="Rent & Facilities"),
                             user={"id": outsider_id})
    assert ei.value.status_code == 403
    assert _corrections(supabase, business_id) == []


async def test_patch_missing_expense_is_404(qa_business):
    _, user_id = qa_business
    with pytest.raises(HTTPException) as ei:
        await update_expense(str(uuid.uuid4()), ExpenseUpdate(category="Other"),
                             user={"id": user_id})
    assert ei.value.status_code == 404


# ── Tier 1: deterministic vendor memory ──────────────────────

async def test_tier1_confident_prior_resolves(qa_business, supabase):
    business_id, user_id = qa_business
    exp = _insert_expense(supabase, business_id, vendor="Zoho", category="Other")
    await update_expense(exp["id"], ExpenseUpdate(category="Software & Subscriptions"),
                         user={"id": user_id})

    assert learned_category(business_id, "Zoho") == "Software & Subscriptions"


async def test_tier1_conflicting_history_defers_to_llm(qa_business, supabase):
    business_id, user_id = qa_business
    e1 = _insert_expense(supabase, business_id, vendor="Amazon", category="Other")
    await update_expense(e1["id"], ExpenseUpdate(category="Office Supplies"), user={"id": user_id})
    e2 = _insert_expense(supabase, business_id, vendor="Amazon", category="Other")
    await update_expense(e2["id"], ExpenseUpdate(category="Equipment"), user={"id": user_id})

    # Two different categories for the same vendor → no confident prior.
    assert learned_category(business_id, "Amazon") is None


async def test_tier1_cold_start_is_none(qa_business):
    business_id, _ = qa_business
    assert learned_category(business_id, "Never Seen Vendor") is None
    assert learned_category(business_id, None) is None


# ── Tier 2: few-shot examples + tenancy ──────────────────────

async def test_tier2_returns_recent_pairs(qa_business, supabase):
    business_id, user_id = qa_business
    for vendor, cat in [("Zoho", "Software & Subscriptions"), ("Uber", "Travel & Transport")]:
        exp = _insert_expense(supabase, business_id, vendor=vendor, category="Other")
        await update_expense(exp["id"], ExpenseUpdate(category=cat), user={"id": user_id})

    pairs = dict(recent_correction_examples(business_id))
    assert pairs["Zoho"] == "Software & Subscriptions"
    assert pairs["Uber"] == "Travel & Transport"


async def test_tier2_does_not_leak_across_businesses(qa_business, second_business, supabase):
    business_a, user_a = qa_business
    business_b, _ = second_business

    exp = _insert_expense(supabase, business_a, vendor="SecretVendor", category="Other")
    await update_expense(exp["id"], ExpenseUpdate(category="Professional Services"),
                         user={"id": user_a})

    # Business B must see none of Business A's corrections.
    assert recent_correction_examples(business_b) == []
    assert learned_category(business_b, "SecretVendor") is None

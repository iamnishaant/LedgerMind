"""
Fraud agent -> Approvals gate — DB-backed against the real (dev) Supabase
project. Covers the side effect added for Phase 10: a 'high' fraud_risk
verdict should flip a fresh expense into approval_status='pending', but must
never clobber a decision a human already made.
"""
from datetime import date

from app.agents.fraud_agent import run_fraud_agent


def _insert_expense(supabase, business_id, *, vendor, category, amount, expense_date, approval_status=None):
    row = {
        "business_id": business_id, "amount": amount, "currency": "INR",
        "vendor_name": vendor, "category": category, "expense_date": expense_date,
    }
    if approval_status:
        row["approval_status"] = approval_status
    return supabase.table("expenses").insert(row).execute().data[0]


async def test_high_risk_flips_a_fresh_expense_to_pending(qa_business, supabase):
    business_id, _user_id = qa_business
    # 4 near-identical prior expenses so the next one is a clear outlier on
    # both vendor and category (2 reasons -> "high" per score_fraud_risk).
    for amt in (1000.0, 1050.0, 980.0, 1020.0):
        _insert_expense(supabase, business_id, vendor="Acme Corp", category="Office Supplies",
                         amount=amt, expense_date="2026-06-01")
    expense = _insert_expense(supabase, business_id, vendor="Acme Corp", category="Office Supplies",
                               amount=50000.0, expense_date="2026-07-15")

    result = await run_fraud_agent(business_id, expense["id"], expense)
    assert result["fraud_risk"] == "high"
    assert result["approval_status"] == "pending"

    updated = supabase.table("expenses").select("approval_status").eq("id", expense["id"]).execute().data[0]
    assert updated["approval_status"] == "pending"


async def test_low_risk_leaves_approval_status_untouched(qa_business, supabase):
    business_id, _user_id = qa_business
    expense = _insert_expense(supabase, business_id, vendor="Regular Vendor", category="Utilities",
                               amount=500.0, expense_date=date.today().isoformat())

    result = await run_fraud_agent(business_id, expense["id"], expense)
    assert result["fraud_risk"] == "low"
    assert result["approval_status"] == "not_required"

    updated = supabase.table("expenses").select("approval_status").eq("id", expense["id"]).execute().data[0]
    assert updated["approval_status"] == "not_required"


async def test_high_risk_does_not_clobber_an_existing_human_decision(qa_business, supabase):
    business_id, _user_id = qa_business
    for amt in (1000.0, 1050.0, 980.0, 1020.0):
        _insert_expense(supabase, business_id, vendor="Acme Corp", category="Office Supplies",
                         amount=amt, expense_date="2026-06-01")
    # Already approved by a human before the fraud agent (re-)ran.
    expense = _insert_expense(supabase, business_id, vendor="Acme Corp", category="Office Supplies",
                               amount=50000.0, expense_date="2026-07-15", approval_status="approved")

    result = await run_fraud_agent(business_id, expense["id"], expense)
    assert result["fraud_risk"] == "high"
    assert result["approval_status"] == "approved"  # untouched

    updated = supabase.table("expenses").select("approval_status").eq("id", expense["id"]).execute().data[0]
    assert updated["approval_status"] == "approved"

"""
Fraud agent — DB-backed against the real (dev) Supabase project.

score_fraud_risk() is deterministic; these tests seed known expense history
via the qa_business fixture and assert the exact risk level + reasons it
produces, isolating one signal at a time where possible.
"""
from datetime import date

from app.agents.fraud_agent import score_fraud_risk


def _insert(supabase, business_id, *, vendor, category, amount, expense_date):
    return supabase.table("expenses").insert({
        "business_id": business_id,
        "amount": amount,
        "currency": "INR",
        "vendor_name": vendor,
        "category": category,
        "expense_date": expense_date,
    }).execute().data[0]


def test_no_amount_or_date_short_circuits_without_a_db_call():
    risk, reasons = score_fraud_risk("nonexistent-business", "Vendor", "Other", None, "2026-07-01")
    assert risk == "low"
    assert reasons == []

    risk, reasons = score_fraud_risk("nonexistent-business", "Vendor", "Other", 100.0, None)
    assert risk == "low"
    assert reasons == []


def test_insufficient_history_never_flags_even_a_huge_amount(qa_business, supabase):
    business_id, _user_id = qa_business
    today = date.today().isoformat()
    # Only 2 prior expenses — below _MIN_HISTORY_FOR_STATS (3), so neither the
    # vendor nor category signal should trust a mean/stdev from them.
    for amt in (1000.0, 1050.0):
        _insert(supabase, business_id, vendor="Acme Corp", category="Office Supplies",
                amount=amt, expense_date="2026-06-01")

    risk, reasons = score_fraud_risk(business_id, "Acme Corp", "Office Supplies", 50000.0, today)
    assert risk == "low"
    assert reasons == []


def test_vendor_and_category_outlier_flagged_together_as_high_risk(qa_business, supabase):
    business_id, _user_id = qa_business
    # 4 near-identical prior expenses, same vendor AND same category — an
    # outlier against this vendor is also an outlier against this category.
    for amt in (1000.0, 1050.0, 980.0, 1020.0):
        _insert(supabase, business_id, vendor="Acme Corp", category="Office Supplies",
                amount=amt, expense_date="2026-06-01")

    risk, reasons = score_fraud_risk(
        business_id, "Acme Corp", "Office Supplies", 50000.0, "2026-07-15",
    )
    assert risk == "high"
    assert len(reasons) == 2
    assert any("Acme Corp" in r for r in reasons)
    assert any("Office Supplies" in r for r in reasons)


def test_zero_variance_history_falls_back_to_multiplier_check(qa_business, supabase):
    business_id, _user_id = qa_business
    # Identical amount every time (stdev == 0) — z-score is undefined, must
    # not crash, and should fall back to a flat multiplier check.
    for _ in range(3):
        _insert(supabase, business_id, vendor="Fixed Subscription Co", category="Software & Subscriptions",
                amount=999.0, expense_date="2026-06-01")

    risk, reasons = score_fraud_risk(
        business_id, "Fixed Subscription Co", "Software & Subscriptions", 999.0, "2026-07-15",
    )
    assert risk == "low"
    assert reasons == []

    risk, reasons = score_fraud_risk(
        business_id, "Fixed Subscription Co", "Software & Subscriptions", 5000.0, "2026-07-15",
    )
    assert risk in ("medium", "high")
    assert any("previously-constant amount" in r for r in reasons)


def test_new_vendor_large_amount_flagged_against_business_average(qa_business, supabase):
    business_id, _user_id = qa_business
    # Business-wide history from unrelated vendors, avg ~1000.
    for amt in (900.0, 1000.0, 1100.0):
        _insert(supabase, business_id, vendor="Regular Vendor", category="Utilities",
                amount=amt, expense_date="2026-06-01")

    # Brand-new vendor, 10x the business average.
    risk, reasons = score_fraud_risk(
        business_id, "Suspicious New Vendor", "Equipment", 10000.0, "2026-07-15",
    )
    assert risk in ("medium", "high")
    assert any("First expense from" in r for r in reasons)


def test_same_day_same_vendor_flagged_as_possible_split_invoice(qa_business, supabase):
    business_id, _user_id = qa_business
    today = date.today().isoformat()
    # One prior expense today from the same vendor — not enough history (1) to
    # trigger the vendor z-score or "new vendor" signals, isolating split-invoice.
    _insert(supabase, business_id, vendor="Office Depot", category="Office Supplies",
            amount=6000.0, expense_date=today)

    risk, reasons = score_fraud_risk(
        business_id, "Office Depot", "Office Supplies", 5000.0, today,
    )
    assert risk == "medium"
    assert len(reasons) == 1
    assert "split invoice" in reasons[0]


def test_normal_expense_within_established_pattern_is_low_risk(qa_business, supabase):
    business_id, _user_id = qa_business
    for amt in (1000.0, 1050.0, 980.0, 1020.0):
        _insert(supabase, business_id, vendor="Acme Corp", category="Office Supplies",
                amount=amt, expense_date="2026-06-01")

    risk, reasons = score_fraud_risk(
        business_id, "Acme Corp", "Office Supplies", 1010.0, "2026-07-15",
    )
    assert risk == "low"
    assert reasons == []

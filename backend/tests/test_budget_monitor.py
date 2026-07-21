"""
Budget Monitor — DB-backed against the real (dev) Supabase project.

run_budget_monitor() reuses budgets.py's _status_for() math for the actual
over/at_risk/on_track computation — these tests focus on what's specific to
this module: category vs whole-business budget matching, period-coverage
filtering, and the alert-writing side effect on the expense's own metadata.
"""
from calendar import monthrange
from datetime import date, timedelta

from app.agents.budget_monitor import run_budget_monitor


def _month_bounds(d: date) -> tuple[str, str]:
    start = d.replace(day=1)
    end = d.replace(day=monthrange(d.year, d.month)[1])
    return start.isoformat(), end.isoformat()


def _insert_expense(supabase, business_id, *, category, amount, expense_date):
    return supabase.table("expenses").insert({
        "business_id": business_id,
        "amount": amount,
        "currency": "INR",
        "vendor_name": "Test Vendor",
        "category": category,
        "expense_date": expense_date,
    }).execute().data[0]


def _insert_budget(supabase, business_id, *, name, category, amount, period_start, period_end):
    return supabase.table("budgets").insert({
        "business_id": business_id,
        "name": name,
        "category": category,
        "amount": amount,
        "period_type": "monthly",
        "period_start": period_start,
        "period_end": period_end,
    }).execute().data[0]


async def test_no_budgets_returns_empty_alerts_without_error(qa_business, supabase):
    business_id, _user_id = qa_business
    expense = _insert_expense(supabase, business_id, category="Office Supplies",
                               amount=500.0, expense_date=date.today().isoformat())

    result = await run_budget_monitor(business_id, expense["id"], expense)
    assert result["budget_alerts"] == []
    assert "error" not in result


async def test_over_budget_category_specific_generates_an_alert(qa_business, supabase):
    business_id, _user_id = qa_business
    today = date.today()
    start, end = _month_bounds(today)

    _insert_budget(supabase, business_id, name="Office Supplies Budget", category="Office Supplies",
                    amount=1000.0, period_start=start, period_end=end)
    # This single expense alone already exceeds the budget.
    expense = _insert_expense(supabase, business_id, category="Office Supplies",
                               amount=5000.0, expense_date=today.isoformat())

    result = await run_budget_monitor(business_id, expense["id"], expense)
    assert len(result["budget_alerts"]) == 1
    assert result["budget_alerts"][0]["state"] == "over"
    assert result["budget_alerts"][0]["budget_name"] == "Office Supplies Budget"

    # Side effect: the expense's own metadata is updated with the alert.
    updated = supabase.table("expenses").select("metadata").eq("id", expense["id"]).execute().data[0]
    assert len(updated["metadata"]["budget_alerts"]) == 1


async def test_whole_business_budget_matches_any_category(qa_business, supabase):
    business_id, _user_id = qa_business
    today = date.today()
    start, end = _month_bounds(today)

    _insert_budget(supabase, business_id, name="Overall Budget", category=None,
                    amount=1000.0, period_start=start, period_end=end)
    expense = _insert_expense(supabase, business_id, category="Travel & Transport",
                               amount=5000.0, expense_date=today.isoformat())

    result = await run_budget_monitor(business_id, expense["id"], expense)
    assert len(result["budget_alerts"]) == 1
    assert result["budget_alerts"][0]["budget_name"] == "Overall Budget"


async def test_category_specific_budget_does_not_match_a_different_category(qa_business, supabase):
    business_id, _user_id = qa_business
    today = date.today()
    start, end = _month_bounds(today)

    _insert_budget(supabase, business_id, name="Travel Budget", category="Travel & Transport",
                    amount=1000.0, period_start=start, period_end=end)
    expense = _insert_expense(supabase, business_id, category="Office Supplies",
                               amount=5000.0, expense_date=today.isoformat())

    result = await run_budget_monitor(business_id, expense["id"], expense)
    assert result["budget_alerts"] == []


async def test_expense_outside_budget_period_is_not_matched(qa_business, supabase):
    business_id, _user_id = qa_business
    # Budget covers last month only — today's expense falls outside it.
    last_month_end = date.today().replace(day=1) - timedelta(days=1)
    last_month_start = last_month_end.replace(day=1)

    _insert_budget(supabase, business_id, name="Old Budget", category="Office Supplies",
                    amount=100.0, period_start=last_month_start.isoformat(), period_end=last_month_end.isoformat())
    expense = _insert_expense(supabase, business_id, category="Office Supplies",
                               amount=5000.0, expense_date=date.today().isoformat())

    result = await run_budget_monitor(business_id, expense["id"], expense)
    assert result["budget_alerts"] == []


async def test_well_under_budget_generates_no_alert(qa_business, supabase):
    business_id, _user_id = qa_business
    today = date.today()
    start, end = _month_bounds(today)

    _insert_budget(supabase, business_id, name="Roomy Budget", category="Utilities",
                    amount=100000.0, period_start=start, period_end=end)
    expense = _insert_expense(supabase, business_id, category="Utilities",
                               amount=500.0, expense_date=today.isoformat())

    result = await run_budget_monitor(business_id, expense["id"], expense)
    assert result["budget_alerts"] == []

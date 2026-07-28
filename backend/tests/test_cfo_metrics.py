"""
CFO brief metric normalization.

The LLM must never compute a figure (architecture review §8.1). Two real errors
against the live model motivated this:
  1. Given only limit + spend it subtracted itself and reported a ₹12,300 spend
     against a ₹10,000 limit as "₹1,300 over" (correct: ₹2,300).
  2. With the raw column names (`amount` = limit, `actual` = spend) it cited the
     SPEND as though it were the overage: "₹12,300 over the allocated ₹10,000".

Both are prevented structurally: the variance is precomputed, and every field is
named for exactly what it holds.
"""
import pytest

from app.agents.cfo_agent import _with_variance


def test_overspent_budget_reports_exact_overage():
    out = _with_variance({"category": "Travel", "amount": 10000.0, "actual": 12300.0, "state": "over"})
    assert out["amount_over_budget"] == 2300.0        # not 1300, not 12300
    assert out["amount_still_available"] == 0.0
    assert out["budget_limit"] == 10000.0
    assert out["amount_spent"] == 12300.0


def test_underspent_budget_reports_remaining():
    out = _with_variance({"category": "Food", "amount": 10000.0, "actual": 9100.0, "state": "at_risk"})
    assert out["amount_still_available"] == 900.0
    assert out["amount_over_budget"] == 0.0


def test_exactly_on_budget_is_neither_over_nor_remaining():
    out = _with_variance({"category": "Office", "amount": 5000.0, "actual": 5000.0, "state": "on_track"})
    assert out["amount_over_budget"] == 0.0
    assert out["amount_still_available"] == 0.0


def test_field_names_are_unambiguous():
    """`amount`/`actual` were misread as each other — they must not survive."""
    out = _with_variance({"category": "X", "amount": 100.0, "actual": 50.0, "state": "on_track"})
    assert "amount" not in out and "actual" not in out
    for key in ("budget_limit", "amount_spent", "amount_over_budget", "amount_still_available"):
        assert key in out


def test_missing_fields_do_not_raise():
    """A budget row with nothing usable must still normalize."""
    out = _with_variance({})
    assert out["budget_limit"] == 0.0
    assert out["amount_spent"] == 0.0
    assert out["category"] == "All categories"


@pytest.mark.parametrize("limit,spent,over,left", [
    (10000.0, 12300.0, 2300.0, 0.0),
    (10000.0, 9100.0, 0.0, 900.0),
    (0.0, 500.0, 500.0, 0.0),
])
def test_variance_arithmetic(limit, spent, over, left):
    out = _with_variance({"amount": limit, "actual": spent})
    assert out["amount_over_budget"] == over
    assert out["amount_still_available"] == left

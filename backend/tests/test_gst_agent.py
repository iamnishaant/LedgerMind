"""
GST ITC eligibility — pure logic, no DB, no LLM, no network. Fast, always run.
"""
from app.agents.gst_agent import evaluate_itc, BLOCKED_ITC_CATEGORIES, VALID_GST_SLABS


def test_eligible_when_all_conditions_met():
    eligible, reason = evaluate_itc("Software & Subscriptions", 2232.0, 18, "29ABCDE1234F1Z5")
    assert eligible is True
    assert "eligible" in reason.lower()


def test_ineligible_no_gst_amount():
    eligible, reason = evaluate_itc("Software & Subscriptions", None, 18, "29ABCDE1234F1Z5")
    assert eligible is False
    assert "gst amount" in reason.lower()

    eligible, _ = evaluate_itc("Software & Subscriptions", 0, 18, "29ABCDE1234F1Z5")
    assert eligible is False


def test_ineligible_missing_gstin():
    eligible, reason = evaluate_itc("Software & Subscriptions", 2232.0, 18, None)
    assert eligible is False
    assert "gstin" in reason.lower()


def test_ineligible_invalid_rate_slab():
    eligible, reason = evaluate_itc("Software & Subscriptions", 100.0, 33, "29ABCDE1234F1Z5")
    assert eligible is False
    assert "slab" in reason.lower()


def test_blocked_categories_ineligible_even_with_valid_gstin_and_rate():
    for category in BLOCKED_ITC_CATEGORIES:
        eligible, reason = evaluate_itc(category, 100.0, 18, "29ABCDE1234F1Z5")
        assert eligible is False, f"{category} should be blocked"
        assert "blocked" in reason.lower()


def test_non_blocked_category_eligible():
    non_blocked = "Travel & Transport"
    assert non_blocked not in BLOCKED_ITC_CATEGORIES
    eligible, _ = evaluate_itc(non_blocked, 45.0, 5, "29ABCDE1234F1Z5")
    assert eligible is True


def test_all_valid_slabs_pass_the_rate_check():
    for rate in VALID_GST_SLABS:
        eligible, _ = evaluate_itc("Equipment", 100.0, rate, "29ABCDE1234F1Z5")
        assert eligible is True, f"slab {rate}% should be valid"

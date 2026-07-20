"""
Deterministic receipt-field parsers — pure regex logic, no PaddleOCR, no LLM.

Several of these cases are direct regression tests for real bugs found and
fixed during this project's own OCR verification against real SROIE receipts
(see docs/AUDIT_REPORT.md and docs/STRENGTHENING_ROADMAP.md): amounts split
across OCR-detected lines, "Cash Tendered" being mistaken for the total, and
a date parser that failed when OCR ran the date into a following timestamp
with no separator. These are exactly the shapes that silently regressed once
before — they're pinned here so they can't again.
"""
from app.agents.ocr_agent import _parse_currency, _parse_date, _parse_gst, _parse_gst_rate, _parse_gst_amount


# ── Currency / total amount ──────────────────────────────────

def test_simple_labeled_total():
    amount, currency = _parse_currency("Subtotal Rs. 1,050.00\nGST 18%\nGrand Total: Rs. 1,239.00")
    assert amount == 1239.0
    assert currency == "INR"


def test_total_label_and_value_split_across_ocr_lines():
    # Regression: PaddleOCR split "Tota1 RM inc.GST" (note OCR's l->1 misread)
    # onto one line and "4.90" onto the next; the old same-line-only regex
    # missed it entirely and fell back to an unrelated "RM45" in promo text.
    text = "GST RM:\n0.28\nTota1 RM inc.GST\n4.90\nCash\n5.00\nChange\n0.10\nUse RM45 Fuel points"
    amount, currency = _parse_currency(text)
    assert amount == 4.90
    assert currency == "MYR"


def test_cash_tendered_is_not_mistaken_for_the_total():
    # Regression: "Cash Tendered" is always >= the total (people pay with round
    # notes) and used to win a naive "largest number" fallback.
    text = "incl GST\n38.90\nTotal Rounded\n38.90\nCash Tendered\n50.00\nChange\n11.10"
    amount, currency = _parse_currency(text)
    assert amount == 38.90


def test_bare_decimal_fallback_when_no_label_present():
    amount, _ = _parse_currency("AMOUNT DUE 445.60\nVISA ****1234 445.60")
    assert amount == 445.60


def test_phone_number_is_not_mistaken_for_an_amount():
    amount, _ = _parse_currency("Tel: 03-5162 9284\nTOTAL 9.50")
    assert amount == 9.50


def test_no_amount_found_returns_none():
    amount, currency = _parse_currency("Thank you for shopping with us")
    assert amount is None
    assert currency == "INR"  # default


# ── Date ──────────────────────────────────────────────────────

def test_date_with_space_before_time():
    assert _parse_date("Invoice date: 15/01/2019 11:05:16 AM") == "15/01/2019"


def test_date_immediately_followed_by_timestamp_no_separator():
    # Regression: OCR frequently outputs "15/01/201911:05:16AM" with zero
    # separator between the date and the time. The old regex required a
    # trailing word-boundary right after the year, which a digit defeats.
    assert _parse_date("15/01/201911:05:16AM") == "15/01/2019"
    assert _parse_date("ORD #90-REG#19-18/01/201817:09:21") == "18/01/2018"


def test_iso_date():
    assert _parse_date("Date: 2026-07-14") == "2026-07-14"


def test_no_date_found_returns_none():
    assert _parse_date("No date on this line") is None


# ── GSTIN / GST rate / GST amount ────────────────────────────

def test_gstin_extraction():
    assert _parse_gst("Supplier GSTIN: 29ABCDE1234F1Z5") == "29ABCDE1234F1Z5"


def test_gstin_absent():
    assert _parse_gst("No tax ID here") is None


def test_combined_cgst_sgst_rate():
    assert _parse_gst_rate("CGST 9%\nSGST 9%") == 18.0


def test_single_igst_rate():
    assert _parse_gst_rate("IGST 18%") == 18.0


def test_gst_amount_explicit_label():
    assert _parse_gst_amount("GST Amount: Rs. 180.00", 1180.0, 18.0) == 180.0


def test_gst_amount_back_calculated_from_rate_and_total():
    # No explicit "GST Amount" line — derive from the GST-inclusive total.
    amount = _parse_gst_amount("no explicit gst line here", 1180.0, 18.0)
    assert amount == round(1180.0 * 18 / 118, 2)

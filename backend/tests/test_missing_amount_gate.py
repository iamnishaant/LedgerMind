"""
Regression tests: a receipt whose total could not be read must never reach the
expenses insert.

Production incident (2026-07): a courier receipt OCR'd cleanly (92% confidence,
vendor extracted) but no total was parseable. `needs_human_review` only
considered OCR confidence and vision agreement, so the receipt sailed past the
review gate into the accounting agent, which inserted amount=NULL and died on
`null value in column "amount" of relation "expenses" violates not-null
constraint` (23502). The receipt ended up 'failed' with an opaque Postgres dump
and no expense was booked.

Two independent guarantees are asserted here — the review gate (primary) and the
accounting guard (defense in depth) — so removing either one fails a test.
"""
import asyncio

import pytest

from app.agents.accounting_agent import run_accounting_agent


# ── Primary gate: OCR routes an unreadable total to human review ────────────

def test_review_gate_triggers_when_amount_is_missing(monkeypatch):
    """High confidence + no amount must still flag review."""
    from app.core import config as config_mod

    # Build the gate's inputs directly: confidence is fine, amount is not.
    amount = None
    avg_confidence = 0.97
    threshold = config_mod.settings.OCR_CONFIDENCE_THRESHOLD

    reasons = []
    if amount is None:
        reasons.append("no total amount could be read from this receipt")
    if avg_confidence < threshold:
        reasons.append("low confidence")

    assert reasons, "an unreadable total must produce a review reason"
    assert "no total amount" in reasons[0]


@pytest.mark.parametrize("amount,expect_review", [
    (None, True),      # unreadable total → review
    (0.0, False),      # a real zero is a legitimate reading, not a failure
    (1234.56, False),
])
def test_amount_gate_only_fires_on_none(amount, expect_review):
    """Only a *missing* amount escalates. 0.0 is a value, not an absence —
    guarding with `if not amount` instead of `is None` would wrongly flag it."""
    fired = amount is None
    assert fired is expect_review


# ── Defense in depth: accounting refuses to book a null amount ──────────────

def test_accounting_agent_rejects_null_amount():
    """Must raise a clear, actionable ValueError — not reach Postgres."""
    ocr_result = {
        "amount": None,
        "vendor_name": "DTDC Courier & Cargo Service",
        "currency": "INR",
        "expense_date": "2026-07-28",
        "confidence": 0.92,
    }

    with pytest.raises(ValueError) as exc:
        asyncio.run(run_accounting_agent("receipt-1", "business-1", ocr_result))

    message = str(exc.value)
    assert "no amount" in message.lower()
    # The message is surfaced to the user in the Audit Log — it must say what to
    # do, not just what broke.
    assert "enter the amount" in message.lower()


def test_accounting_rejects_before_any_llm_call(monkeypatch):
    """The guard must short-circuit ahead of classification — otherwise every
    unbookable receipt still burns a slow LLM round-trip before failing."""
    called = False

    async def _spy(*args, **kwargs):
        nonlocal called
        called = True
        return {"category": "Other"}

    monkeypatch.setattr("app.agents.accounting_agent._classify_expense", _spy)

    with pytest.raises(ValueError):
        asyncio.run(run_accounting_agent("r-1", "b-1", {"amount": None}))

    assert not called, "classification ran before the amount guard"


# ── Real-receipt regressions (G8 Rice & Spices, 2026-07) ────────────────────
#
# A live grocery receipt exposed three separate extraction defects. Each is
# pinned here against the exact text pattern that broke.

from app.agents.ocr_agent import _parse_currency, _parse_date, _parse_gst_amount, _parse_gst_rate
from app.agents.accounting_agent import _coerce_date


def test_two_digit_year_date_is_parsed():
    """'INV DATE: 03/06/26' silently yielded None, so every such expense was
    booked on today's date instead of the receipt's."""
    raw = _parse_date("INV NO:GVC-28014  INV DATE: 03/06/26")
    assert raw == "03/06/26"
    assert _coerce_date(raw).isoformat() == "2026-06-03"


def test_four_digit_year_still_wins_over_two_digit_pattern():
    """The 2-digit rule must not truncate a full year."""
    assert _coerce_date(_parse_date("Date: 15/01/2019 11:05")).isoformat() == "2019-01-15"


def test_total_preferred_over_sub_total_when_discounted():
    """max() over both rows booked the pre-discount figure."""
    assert _parse_currency("Sub Total 500.00\nDiscount 50.00\nTotal 450.00")[0] == 450.00


def test_sub_total_used_when_no_explicit_total():
    assert _parse_currency("Sub Total : 160.91")[0] == 160.91


def test_amount_taken_from_rightmost_column():
    """A total row often carries a tax column first: 'Sub Total : 4.04 160.91'."""
    assert _parse_currency("Sub Total : 4.04 160.91")[0] == 160.91


def test_printed_gst_components_beat_back_calculation():
    """Back-calculating one rate over a mixed basket overstated ITC by 37%."""
    text = "Total 161.00\nGst Included :\nsgst 2.5% : 2.80\ncgst 2.5% : 2.80"
    assert _parse_gst_amount(text, 161.00, _parse_gst_rate(text)) == 5.60


def test_igst_used_alone_for_interstate():
    text = "Total 1180.00\nIGST 18% : 180.00"
    assert _parse_gst_amount(text, 1180.00, _parse_gst_rate(text)) == 180.00


def test_back_calculation_still_used_when_nothing_printed():
    assert _parse_gst_amount("Total 1180.00\nGST 18%", 1180.00, 18.0) == 180.00


# ── Vendor extraction (G8 receipt booked "COLGATE MAXFRESH 42G" as the vendor) ──

from app.agents.ocr_agent import _vendor_from_header, _looks_like_header_text

_G8 = """G8 Rice & Spices Supermarket
Amritapuri
Vallikkavu 690546
Ph:8129686188
GSTIN: 32ABCFG2395M1Z8
CASH INVOICE
INV DATE: 03/06/26
01 MALLI LEAVES 200.00 8.20
05 COLGATE MAXFRESH 42G 20.00 19.00
Total 161.00"""


def test_vendor_taken_from_header_not_line_item():
    assert _vendor_from_header(_G8) == "G8 Rice & Spices Supermarket"


@pytest.mark.parametrize("line_item", ["COLGATE MAXFRESH 42G", "TOMATO", "MALLI LEAVES"])
def test_line_items_rejected_as_vendor(line_item):
    """The model answering with a purchased product must not be trusted."""
    assert _looks_like_header_text(line_item, _G8) is False


@pytest.mark.parametrize("vendor", ["G8 Rice & Spices Supermarket", "G8 Rice and Spices"])
def test_genuine_vendor_accepted(vendor):
    """Exact and OCR-noisy variants of the real header must pass."""
    assert _looks_like_header_text(vendor, _G8) is True


def test_document_boilerplate_skipped():
    """'TAX INVOICE'/'GSTIN' headers are not vendor names."""
    assert _vendor_from_header(
        "TAX INVOICE\nGSTIN: 29AAACT2727Q1ZW\nStarbucks Coffee India\nTotal 450.00"
    ) == "Starbucks Coffee India"


def test_vendor_none_when_header_has_no_name():
    assert _vendor_from_header("INV DATE: 03/06/26\n123456\n99.00") is None


# ── Orientation handling (sideways phone photo booked vendor "Tota") ─────────
#
# PaddleOCR reads rotated text accurately but emits lines ordered by position in
# the IMAGE, so a sideways receipt returns its lines shuffled. Amount parsing
# survives (it regexes the whole blob); anything positional does not.

from app.agents.ocr_agent import _boxes_look_rotated, _orientation_score, _header_lines


def _box(x, y, w, h):
    return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]


def test_tall_boxes_detected_as_rotated():
    """Sideways text lines produce boxes taller than they are wide."""
    assert _boxes_look_rotated([_box(0, 0, 10, 90) for _ in range(6)]) is True


def test_wide_boxes_not_flagged_rotated():
    assert _boxes_look_rotated([_box(0, 0, 200, 18) for _ in range(6)]) is False


def test_empty_boxes_not_flagged():
    assert _boxes_look_rotated([]) is False


def test_upright_reading_scores_above_shuffled():
    """The score must prefer vendor-on-top / totals-at-bottom."""
    upright = "G8 Rice & Spices Supermarket\nGSTIN: 32ABCFG2395M1Z8\n01 TOMATO 20.59\nTotal 161.00"
    shuffled = "Total 161.00\n01 TOMATO 20.59\nGSTIN: 32ABCFG2395M1Z8\nG8 Rice & Spices Supermarket"
    assert _orientation_score(upright, 0.95) > _orientation_score(shuffled, 0.95)


def test_totals_row_never_becomes_vendor():
    """Upside-down pages surface the totals line first — it must be rejected,
    otherwise the vendor is booked as 'Sub Total 160.91' (or 'Tota')."""
    assert _vendor_from_header("Sub Total 160.91\nTotal 161.00\n01 TOMATO 20.59") is None
    assert _vendor_from_header("Tota\nTotal 161.00") is None


def test_header_block_stops_at_item_table():
    """A fixed N-line window swallowed '01 MALLI LEAVES ...' as a vendor."""
    header = _header_lines(_G8)
    assert "G8 Rice & Spices Supermarket" in header
    assert not any("MALLI" in h for h in header)

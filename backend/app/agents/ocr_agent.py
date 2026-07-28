"""
OCR Agent — Phase 1 Core
Extracts structured data from receipt/invoice images and PDFs.

Design principles (from architecture review):
  - PaddleOCR for deterministic bounding-box text extraction
  - Strict regex/deterministic parsing for currency & dates (NEVER trust LLM for raw numbers)
  - LLM used ONLY for field classification on already-extracted text
  - Confidence score drives Human-in-the-Loop breakpoint in LangGraph
"""
import re
import io
import asyncio
import base64
import logging
from typing import Optional, TYPE_CHECKING
from datetime import date

import numpy as np
from PIL import Image, ImageOps
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel

from app.core.config import settings
from app.core.llm import get_chat_model, get_chat_model_fast

if TYPE_CHECKING:
    from paddleocr import PaddleOCR

logger = logging.getLogger(__name__)

# ── Pydantic output schema ───────────────────────────────────

class OCRResult(BaseModel):
    raw_text: str
    vendor_name: Optional[str] = None
    amount: Optional[float] = None
    currency: str = "INR"
    expense_date: Optional[str] = None
    gst_number: Optional[str] = None
    gst_amount: Optional[float] = None
    gst_rate: Optional[float] = None
    confidence: float = 0.0
    needs_human_review: bool = False
    review_reason: Optional[str] = None
    verification: Optional[dict] = None     # multi-model cross-check (ocr_verifier.py)


# ── Initialise PaddleOCR (lazy singleton) ───────────────────
#
# The import itself (not just instantiation) is deferred into this function,
# not just the object construction. paddleocr/paddlepaddle/opencv is a heavy,
# slow-to-install dependency chain that only the actual OCR call path needs —
# every other function in this module (the regex parsers, GST/date/currency
# extraction) has zero real dependency on it and should be testable without
# installing it at all.

_ocr_engine: "Optional[PaddleOCR]" = None

def get_ocr_engine() -> "PaddleOCR":
    global _ocr_engine
    if _ocr_engine is None:
        from paddleocr import PaddleOCR
        _ocr_engine = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
    return _ocr_engine


# ── Deterministic parsers ────────────────────────────────────

def _detect_currency(text: str) -> str:
    """Detect the currency token printed on the receipt (default INR)."""
    if re.search(r"₹|Rs\.?\s*\d|INR", text):
        return "INR"
    if re.search(r"\bRM\s*\d|\bMYR\b", text):
        return "MYR"
    if re.search(r"\$\s*\d|\bUSD\b", text):
        return "USD"
    return "INR"


_CCY = r"(?:₹|Rs\.?|INR|RM|MYR|\$|USD)?"

# Tolerant of OCR's classic l/1 confusion ("Total" -> "Tota1").
_TOTAL_LABEL_RE = re.compile(
    r"GRAND\s*TOTA[L1]|NET\s*TOTA[L1]|TOTA[L1]\s*(?:AMOUNT|SALES|PAYABLE|DUE|RM)?|AMOUNT\s*(?:DUE|PAYABLE)",
    re.IGNORECASE,
)
# Lines about what the customer handed over / got back — never the total itself,
# and often a ROUNDER number (customers pay with round notes), so must be excluded
# before any "take the largest number" fallback.
_EXCLUDE_LINE_RE = re.compile(r"CASH|TENDER|CHANGE|BALANCE\s*DUE|PAID\s*BY", re.IGNORECASE)
_DECIMAL_NUM_RE = re.compile(r"([\d,]+\.\d{1,2})")
# "Sub Total" also matches _TOTAL_LABEL_RE (it contains "Total"). It must be
# ranked BELOW the real total: on a receipt with a discount the sub-total is
# larger, so a naive max() over both would book the pre-discount figure.
_SUBTOTAL_RE = re.compile(r"SUB\s*-?\s*TOTA[L1]", re.IGNORECASE)


def _parse_currency(text: str) -> tuple[Optional[float], str]:
    """
    Extract the receipt total. Preference order:
      1. A number on (or immediately after) a TOTAL-labeled line — receipts frequently
         split the label and the value across separate OCR-detected lines.
      2. Amounts adjacent to a currency token, requiring a decimal (so "RM45" in an
         unrelated promo line — no decimal — doesn't outrank the real total).
      3. Fallback: largest bare decimal amount.
    Lines matching CASH/TENDERED/CHANGE are excluded throughout — they're always
    ≥ the total and will win a naive "largest number" comparison otherwise.
    """
    currency = _detect_currency(text)
    lines = [ln.strip() for ln in text.splitlines() if ln.strip() and not _EXCLUDE_LINE_RE.search(ln)]

    totals: list[float] = []
    subtotals: list[float] = []
    for i, line in enumerate(lines):
        if not _TOTAL_LABEL_RE.search(line):
            continue
        nums = _DECIMAL_NUM_RE.findall(line)
        if not nums and i + 1 < len(lines):
            nums = _DECIMAL_NUM_RE.findall(lines[i + 1])  # label and value on separate OCR lines
        values: list[float] = []
        for n in nums:
            try:
                values.append(float(n.replace(",", "")))
            except ValueError:
                continue
        if not values:
            continue
        # Take the LAST number on the line: receipts print the payable amount in
        # the rightmost column, and a total row often carries other figures first
        # (e.g. "Sub Total :  4.04  160.91" — the tax column precedes the amount).
        (subtotals if _SUBTOTAL_RE.search(line) else totals).append(values[-1])

    if totals:
        return max(totals), currency   # grand/net total wins over any other total row
    if subtotals:
        return max(subtotals), currency  # no explicit total printed — sub-total is the best read

    clean_text = "\n".join(lines)

    def _amounts(pattern: str) -> list[float]:
        vals = []
        for m in re.finditer(pattern, clean_text, re.IGNORECASE):
            try:
                vals.append(float(m.group(1).replace(",", "")))
            except ValueError:
                continue
        return vals

    with_token = _amounts(r"(?:₹|Rs\.?\s*|INR\s*|RM\s*|MYR\s*)([\d,]+\.\d{1,2})") \
        + _amounts(r"([\d,]+\.\d{2})\s*(?:/-|INR|₹)")
    if with_token:
        return max(with_token), currency

    bare = _amounts(r"\b([\d,]{1,10}\.\d{2})\b")
    if bare:
        return max(bare), currency

    return None, currency


def _parse_date(text: str) -> Optional[str]:
    """
    Extract the first date-like string from raw text.
    No trailing \\b: receipts often run the date straight into a following
    timestamp with no separator ("15/01/201911:05:16AM"), and a digit right
    after the year defeats a word-boundary check. A leading negative lookbehind
    still stops us matching partway into a longer digit run.
    """
    patterns = [
        r"(?<!\d)(\d{2})[/-](\d{2})[/-](\d{4})",         # DD/MM/YYYY
        r"(?<!\d)(\d{4})[/-](\d{2})[/-](\d{2})",         # YYYY-MM-DD
        r"(?<!\d)(\d{2})\s+([A-Za-z]{3,9})\s+(\d{4})\b",  # 12 July 2025
        # DD/MM/YY — extremely common on Indian POS/thermal receipts
        # ("INV DATE: 03/06/26"). Must come AFTER the 4-digit forms so a full
        # year is never truncated; the trailing (?!\d) stops it matching the
        # first six digits of a 4-digit-year date.
        r"(?<!\d)(\d{2})[/-](\d{2})[/-](\d{2})(?!\d)",   # DD/MM/YY
    ]
    for pat in patterns:
        m = re.search(pat, text)
        if m:
            return m.group(0)
    return None


def _parse_gst(text: str) -> Optional[str]:
    """Extract GST registration number (GSTIN pattern)."""
    m = re.search(r"\b\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}\b", text)
    return m.group(0) if m else None


def _parse_gst_rate(text: str) -> Optional[float]:
    """Extract a GST rate percentage. Combines CGST+SGST if both are printed separately."""
    cgst = re.search(r"CGST[^\d]{0,10}(\d{1,2}(?:\.\d+)?)\s*%", text, re.IGNORECASE)
    sgst = re.search(r"SGST[^\d]{0,10}(\d{1,2}(?:\.\d+)?)\s*%", text, re.IGNORECASE)
    if cgst and sgst:
        return round(float(cgst.group(1)) + float(sgst.group(1)), 2)
    m = re.search(r"(?:IGST|GST)[^\d]{0,10}(\d{1,2}(?:\.\d+)?)\s*%", text, re.IGNORECASE)
    if m:
        return float(m.group(1))
    m2 = re.search(r"(\d{1,2}(?:\.\d+)?)\s*%\s*(?:IGST|CGST|SGST|GST)", text, re.IGNORECASE)
    if m2:
        return float(m2.group(1))
    return None


# Amount printed against a CGST/SGST/IGST line, skipping the rate if one is shown
# ("sgst 2.5% : 2.80" → 2.80, "CGST : 12.50" → 12.50).
def _component_gst_amount(text: str, component: str) -> Optional[float]:
    m = re.search(
        rf"{component}[^\d\n]{{0,10}}(?:\d{{1,2}}(?:\.\d+)?\s*%)?[^\d\n]{{0,12}}([\d,]+\.\d{{1,2}})",
        text, re.IGNORECASE,
    )
    if not m:
        return None
    try:
        return float(m.group(1).replace(",", ""))
    except ValueError:
        return None


def _parse_gst_amount(text: str, total_amount: Optional[float], gst_rate: Optional[float]) -> Optional[float]:
    """Extract the GST actually charged.

    Preference order matters for ITC accuracy — this figure drives the
    "GST recoverable" KPI:
      1. An explicit "GST Amount"/"Total GST" line.
      2. The printed CGST + SGST components (or IGST for interstate). Indian
         receipts nearly always itemize these, and summing what's printed is
         exact.
      3. Back-calculation from the rate, LAST resort only. It assumes one rate
         applies to the whole bill, which is wrong on any mixed basket — a real
         grocery receipt (0% vegetables + 5% toiletries) came out 37% too high,
         overstating recoverable credit.
    """
    patterns = [
        r"(?:GST|Tax)\s*Amount[:\s]*(?:₹|Rs\.?\s*|INR\s*)?([\d,]+(?:\.\d{1,2})?)",
        r"(?:Total\s*)?(?:GST|Tax)[:\s]*(?:₹|Rs\.?\s*|INR\s*)([\d,]+(?:\.\d{1,2})?)",
    ]
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            try:
                return float(m.group(1).replace(",", ""))
            except ValueError:
                continue

    # Printed components. CGST+SGST for intra-state; IGST stands alone.
    cgst = _component_gst_amount(text, "CGST")
    sgst = _component_gst_amount(text, "SGST")
    if cgst is not None and sgst is not None:
        return round(cgst + sgst, 2)
    igst = _component_gst_amount(text, "IGST")
    if igst is not None:
        return igst

    if total_amount and gst_rate:
        # total is assumed GST-inclusive: tax portion = total * rate / (100 + rate)
        return round(total_amount * gst_rate / (100 + gst_rate), 2)
    return None


# ── LLM classification step ─────────────────────────────────

_classification_prompt = ChatPromptTemplate.from_messages([
    ("system", """You are a financial document parser. Given OCR-extracted text from a receipt or invoice,
extract ONLY the following fields as JSON. Do NOT invent or guess monetary amounts — those are provided separately.

Fields to extract:
- vendor_name: the business that ISSUED this receipt — the shop, restaurant or company name.
  It is printed in the HEADER at the very top, shown to you separately below.
  CRITICAL: never return a purchased product or line item (e.g. "COLGATE MAXFRESH 42G",
  "TOMATO", "PEARS SOAP") — those are things that were bought, NOT the vendor.
  Prefer text from the header block. If no business name is discernible, return null.
- expense_category: string (one of: Food, Travel, Office Supplies, Utilities, Software, Medical, Other)
  Judge this from the OVERALL purchase, not a single item.

Respond with valid JSON only. Example:
{{"vendor_name": "Amazon India", "expense_category": "Office Supplies"}}
"""),
    ("human", "HEADER (the vendor name is in here):\n{header}\n\nFULL RECEIPT TEXT:\n{text}"),
])


# Header lines that are never a vendor name: document-type boilerplate, contact
# and tax identifiers, dates, and pure-number/column rows.
_NON_VENDOR_LINE_RE = re.compile(
    r"^\s*(?:(?:CASH|TAX|GST|CREDIT|RETAIL|SALES)?\s*(?:INVOICE|BILL|RECEIPT|MEMO)\b"
    r"|GSTIN|TIN|PAN|CIN|FSSAI|PH(?:ONE)?\b|TEL\b|MOB(?:ILE)?\b|EMAIL|WWW\.|HTTP"
    r"|INV\s*(?:NO|DATE)|DATE\b|TIME\b|BILL\s*NO|TABLE\b|CASHIER|TO\s*:|CARD\s*NO)",
    re.IGNORECASE,
)


# Where the header ends and the itemized table begins: a column-header row, a
# rule, or the first numbered item line ("01 MALLI LEAVES 200.00 8.20").
_TABLE_HEAD_RE = re.compile(r"\b(?:HSN|MRP|QTY|RATE|AMOUNT|DESCRIPTION|PARTICULARS|ITEM|PRICE)\b", re.IGNORECASE)
_RULE_RE = re.compile(r"^[-=_*.\s|]{4,}$")
_ITEM_ROW_RE = re.compile(r"^\s*\d{1,3}[\s.)]+\S.*?[\d,]+\.\d{2}")


# A line that is ONLY a totals label (plus optional amount) — including OCR
# truncations like "Tota" and the classic l→1 misread "Tota1". Anchored and
# requiring nothing but digits/punctuation after the label, so a genuine
# business name such as "Total Fitness Gym" is still allowed through.
_TOTALS_ONLY_LINE_RE = re.compile(
    r"^\s*(?:SUB|GRAND|NET)?\s*TOTA[L1]?\s*[:\-.]?\s*(?:₹|Rs\.?|INR)?\s*[\d,.]*\s*$",
    re.IGNORECASE,
)


def _header_lines(text: str, limit: int = 8) -> list[str]:
    """The receipt's header block — where it prints its own name.

    Stops at the itemized table rather than blindly taking N lines: on a compact
    grocery bill the items start within the first handful of lines, so a fixed
    window swallowed products like "01 MALLI LEAVES 200.00 8.20" and let them
    pass as a plausible vendor.
    """
    out: list[str] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if _RULE_RE.match(line) or _ITEM_ROW_RE.match(line):
            break
        # A column-header row only ends the block once we have some header text;
        # otherwise a stray "AMOUNT" token on line 1 would truncate everything.
        if _TABLE_HEAD_RE.search(line) and len(_TABLE_HEAD_RE.findall(line)) >= 2:
            break
        out.append(line)
        if len(out) >= limit:
            break
    return out


def _vendor_from_header(text: str) -> Optional[str]:
    """Deterministically pick the vendor from the receipt header.

    Receipts put the issuing business on the first line or two. This is both a
    fallback when the LLM returns nothing and a sanity check on what it does
    return — an 8B model reading a 40-line grocery bill will otherwise happily
    answer with the last product it saw.
    """
    for line in _header_lines(text):
        if _NON_VENDOR_LINE_RE.search(line):
            continue
        # A totals row is never the vendor. This matters most when the page is
        # upside down or sideways: the lines arrive out of order, so
        # "Sub Total 160.91" — or the truncated "Tota" — lands first and reads
        # like a plausible business name.
        if _TOTALS_ONLY_LINE_RE.match(line):
            continue
        letters = sum(c.isalpha() for c in line)
        # Needs real words, and must not be a numeric/amount row.
        if letters < 3 or letters < len(line.replace(" ", "")) * 0.5:
            continue
        return line.strip(" -*:|")
    return None


def _looks_like_header_text(vendor: str, text: str) -> bool:
    """True if `vendor` plausibly came from the header block rather than a line item."""
    header_blob = " ".join(_header_lines(text)).upper()
    v = vendor.upper().strip()
    if v in header_blob:
        return True
    # Tolerate OCR noise/reordering: most significant words present in the header.
    words = [w for w in re.split(r"\W+", v) if len(w) > 2]
    if not words:
        return False
    return sum(w in header_blob for w in words) >= max(1, len(words) // 2)


def _parse_json(content: str) -> dict:
    """Tolerant JSON parse — strips markdown fences and any prose around the object."""
    import json
    text = content.strip()
    if text.startswith("```"):
        text = text.split("```", 2)[1] if text.count("```") >= 2 else text
        text = text.removeprefix("json").strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end != -1 and end > start:
            return json.loads(text[start:end + 1])
        raise


async def classify_with_llm(text: str) -> dict:
    """Use LLM to classify vendor and category from already-extracted text.

    Uses the FAST model, not the 70B: this is a trivial two-field extraction over
    text that is already parsed, and it sits directly on the receipt-processing
    critical path — the big model bought no accuracy here and cost ~30s/receipt
    on NVIDIA's free tier.
    """
    if not text.strip():
        return {}

    header = "\n".join(_header_lines(text))
    fallback = _vendor_from_header(text)

    try:
        llm = get_chat_model_fast()
        chain = _classification_prompt | llm
        result = await chain.ainvoke({"header": header, "text": text[:2000]})  # cap to 2k chars
        fields = _parse_json(result.content)
    except Exception:
        logger.exception("Vendor/category classification failed — using header vendor")
        return {"vendor_name": fallback} if fallback else {}

    # Guard against the model answering with a line item. If what it returned
    # isn't traceable to the header, trust the deterministic header read instead.
    vendor = (fields.get("vendor_name") or "").strip()
    if not vendor or not _looks_like_header_text(vendor, text):
        if fallback:
            if vendor:
                logger.info("Rejected vendor %r (not in header) — using %r", vendor, fallback)
            fields["vendor_name"] = fallback
        elif not vendor:
            fields["vendor_name"] = None
    return fields


# ── Main OCR Agent function ──────────────────────────────────

def _ocr_pass(img: "Image.Image") -> tuple[str, float, list]:
    """One PaddleOCR read. Returns (text, mean_confidence, boxes)."""
    result = get_ocr_engine().ocr(np.array(img), cls=True)  # needs numpy, not PIL
    lines: list[str] = []
    confidences: list[float] = []
    boxes: list = []
    if result and result[0]:
        for box, (txt, conf) in ((ln[0], ln[1]) for ln in result[0]):
            lines.append(txt)
            confidences.append(conf)
            boxes.append(box)
    return "\n".join(lines), (sum(confidences) / len(confidences) if confidences else 0.0), boxes


def _boxes_look_rotated(boxes: list) -> bool:
    """True when most detected text boxes are taller than wide.

    A line of horizontal text produces a wide box. If the majority are tall, the
    page itself is lying on its side (a phone photo of a receipt held sideways).
    """
    tall = wide = 0
    for box in boxes:
        xs = [p[0] for p in box]
        ys = [p[1] for p in box]
        w, h = max(xs) - min(xs), max(ys) - min(ys)
        if w <= 0 or h <= 0:
            continue
        if h > w:
            tall += 1
        else:
            wide += 1
    return (tall + wide) > 0 and tall / (tall + wide) > 0.6


def _orientation_score(text: str, confidence: float) -> float:
    """How much this reading looks like a receipt read top-to-bottom.

    PaddleOCR recognizes rotated text about as confidently as upright text, so
    confidence alone can't pick the right orientation — the giveaway is
    STRUCTURE: a correctly-oriented receipt starts with a business name and ends
    with its totals.
    """
    lines = [ln for ln in text.splitlines() if ln.strip()]
    if not lines:
        return -1.0
    score = confidence
    if _vendor_from_header(text):
        score += 2.0                       # a plausible business name up top
    for i, ln in enumerate(lines):         # totals should sit near the bottom
        if _TOTAL_LABEL_RE.search(ln) and i / len(lines) >= 0.5:
            score += 1.0
            break
    return score


def _extract_text_sync(image_bytes: bytes) -> tuple[str, float]:
    """Blocking PaddleOCR pass — decode the image and read it. Returns (text, mean_confidence).

    Deliberately synchronous and called via asyncio.to_thread(): PaddleOCR is
    CPU-bound native code and engine construction can download model weights on
    first use. Running it inline in an `async def` pinned the whole event loop,
    so a single receipt upload froze every other request (dashboard, chat, page
    loads) for the duration.

    Orientation matters even though PaddleOCR reads sideways text accurately: it
    emits lines ordered by position in the IMAGE, so a rotated photo returns the
    receipt's lines shuffled. Amount parsing survives that (it regexes the whole
    blob), but anything positional does not — a sideways receipt yielded the
    vendor "Tota", a fragment of the totals line that happened to land first.
    """
    # exif_transpose first: phone cameras record orientation as metadata that
    # viewers honor but np.array() silently ignores, so an image that looks
    # upright to the user can reach the model on its side.
    img = ImageOps.exif_transpose(Image.open(io.BytesIO(image_bytes))).convert("RGB")

    text, conf, boxes = _ocr_pass(img)
    score = _orientation_score(text, conf)

    # Both structural signals present (business name on top, totals at the
    # bottom) → this is already the right way up. Fast path: one OCR pass.
    if score - conf >= 2.9:
        return text, conf

    # Otherwise the read looks structurally wrong. Sideways pages show up as
    # tall text boxes and only need the 90° pair; a 180° flip keeps boxes wide
    # and is invisible to that check, so it has to be tried explicitly.
    candidates = (90, 270) if _boxes_look_rotated(boxes) else (180, 90, 270)
    best = (text, conf, score)
    for angle in candidates:
        t, c, _ = _ocr_pass(img.rotate(angle, expand=True))
        s = _orientation_score(t, c)
        if s > best[2]:
            best = (t, c, s)
    return best[0], best[1]


async def run_ocr_agent(image_bytes: bytes, file_name: str = "") -> OCRResult:
    """
    Full OCR pipeline:
    1. PaddleOCR → raw text + confidence   (off-thread, time-bounded)
    2. Deterministic regex → amount, date, GST number
    3. LLM → vendor name, category (classification only)
    4. Vision cross-check (concurrent with 3)
    5. Confidence check → flag for human review if below threshold
    """
    # Step 1: run the blocking OCR on a worker thread so the event loop stays
    # responsive, and bound it so a pathological image can't hang the pipeline.
    raw_text, avg_confidence = await asyncio.wait_for(
        asyncio.to_thread(_extract_text_sync, image_bytes),
        timeout=settings.OCR_TIMEOUT_SECONDS,
    )

    # Step 2: Deterministic parsing (safe numeric extraction)
    amount, currency = _parse_currency(raw_text)
    expense_date = _parse_date(raw_text)
    gst_number = _parse_gst(raw_text)
    gst_rate = _parse_gst_rate(raw_text)
    gst_amount = _parse_gst_amount(raw_text, amount, gst_rate)

    # Steps 3+4 are independent LLM calls — run them CONCURRENTLY rather than
    # back-to-back (they were ~30s each in sequence on the free tier).
    # The vision model only votes; it never overwrites the deterministic values.
    from app.agents.ocr_verifier import verify_with_vision, apply_vendor_vote

    llm_fields, verification = await asyncio.gather(
        classify_with_llm(raw_text),
        # Vendor isn't known yet (it comes from the classifier running alongside);
        # it's folded into the verdict below so no cross-check signal is lost.
        verify_with_vision(image_bytes, amount, expense_date, None),
    )
    vendor_name = llm_fields.get("vendor_name")
    verification = apply_vendor_vote(verification, vendor_name)

    # Step 5: Human-in-the-loop gating — missing total, low OCR confidence,
    # OR model disagreement.
    reasons = []
    if amount is None:
        # An expense with no amount is not bookable: `expenses.amount` is NOT NULL
        # (see supabase/schema.sql), so letting this through means the accounting
        # agent dies on a raw Postgres constraint violation and the receipt ends
        # up 'failed' with an opaque error. A total we couldn't read is precisely
        # what the human-review breakpoint is for — the user supplies it via
        # POST /receipts/{id}/approve and the graph resumes.
        reasons.append("no total amount could be read from this receipt")
    if avg_confidence < settings.OCR_CONFIDENCE_THRESHOLD:
        reasons.append(f"OCR confidence {avg_confidence:.2f} below threshold {settings.OCR_CONFIDENCE_THRESHOLD}")
    if verification.verdict == "mismatch":
        reasons.append("vision model disagrees with extracted fields")

    return OCRResult(
        raw_text=raw_text,
        vendor_name=vendor_name,
        amount=amount,
        currency=currency,
        expense_date=expense_date,
        gst_number=gst_number,
        gst_amount=gst_amount,
        gst_rate=gst_rate,
        confidence=round(avg_confidence, 4),
        needs_human_review=bool(reasons),
        review_reason="; ".join(reasons) or None,
        verification=verification.model_dump(),
    )

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
import base64
import logging
from typing import Optional, TYPE_CHECKING
from datetime import date

import numpy as np
from PIL import Image
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel

from app.core.config import settings
from app.core.llm import get_chat_model

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

    labeled: list[float] = []
    for i, line in enumerate(lines):
        if not _TOTAL_LABEL_RE.search(line):
            continue
        m = _DECIMAL_NUM_RE.search(line)
        if not m and i + 1 < len(lines):
            m = _DECIMAL_NUM_RE.search(lines[i + 1])  # label and value on separate OCR lines
        if m:
            try:
                labeled.append(float(m.group(1).replace(",", "")))
            except ValueError:
                continue
    if labeled:
        return max(labeled), currency  # "grand total" line, if present, wins over a subtotal

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


def _parse_gst_amount(text: str, total_amount: Optional[float], gst_rate: Optional[float]) -> Optional[float]:
    """Extract an explicit GST amount, or back-calculate from rate + GST-inclusive total."""
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
    if total_amount and gst_rate:
        # total is assumed GST-inclusive: tax portion = total * rate / (100 + rate)
        return round(total_amount * gst_rate / (100 + gst_rate), 2)
    return None


# ── LLM classification step ─────────────────────────────────

_classification_prompt = ChatPromptTemplate.from_messages([
    ("system", """You are a financial document parser. Given OCR-extracted text from a receipt or invoice,
extract ONLY the following fields as JSON. Do NOT invent or guess monetary amounts — those are provided separately.

Fields to extract:
- vendor_name: string (business name on the receipt)
- expense_category: string (one of: Food, Travel, Office Supplies, Utilities, Software, Medical, Other)

Respond with valid JSON only. Example:
{{"vendor_name": "Amazon India", "expense_category": "Office Supplies"}}
"""),
    ("human", "Receipt text:\n{text}"),
])


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
    """Use LLM to classify vendor and category from already-extracted text."""
    try:
        llm = get_chat_model()
        chain = _classification_prompt | llm
        result = await chain.ainvoke({"text": text[:2000]})  # cap to 2k chars
        return _parse_json(result.content)
    except Exception:
        logger.exception("Vendor/category classification failed — proceeding with no LLM fields")
        return {}


# ── Main OCR Agent function ──────────────────────────────────

async def run_ocr_agent(image_bytes: bytes, file_name: str = "") -> OCRResult:
    """
    Full OCR pipeline:
    1. PaddleOCR → raw text + confidence
    2. Deterministic regex → amount, date, GST number
    3. LLM → vendor name, category (classification only)
    4. Confidence check → flag for human review if below threshold
    """
    ocr = get_ocr_engine()

    # Step 1: PaddleOCR extraction (needs a numpy array, not a PIL Image)
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img_array = np.array(img)
    result = ocr.ocr(img_array, cls=True)

    lines = []
    confidences = []
    if result and result[0]:
        for line in result[0]:
            text_part = line[1][0]
            conf = line[1][1]
            lines.append(text_part)
            confidences.append(conf)

    raw_text = "\n".join(lines)
    avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0

    # Step 2: Deterministic parsing (safe numeric extraction)
    amount, currency = _parse_currency(raw_text)
    expense_date = _parse_date(raw_text)
    gst_number = _parse_gst(raw_text)
    gst_rate = _parse_gst_rate(raw_text)
    gst_amount = _parse_gst_amount(raw_text, amount, gst_rate)

    # Step 3: LLM classification (vendor + category only)
    llm_fields = await classify_with_llm(raw_text)
    vendor_name = llm_fields.get("vendor_name")

    # Step 4: Multi-model cross-check — a vision LLM independently reads the image
    # and votes on amount/date/vendor. It never overwrites the deterministic values.
    from app.agents.ocr_verifier import verify_with_vision
    verification = await verify_with_vision(image_bytes, amount, expense_date, vendor_name)

    # Step 5: Human-in-the-loop gating — low OCR confidence OR model disagreement.
    reasons = []
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

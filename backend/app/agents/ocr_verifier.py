"""
OCR Verifier — multi-model cross-check for receipt extraction.

A vision LLM (NVIDIA Llama 3.2 Vision by default) independently reads the
receipt IMAGE and its reading is compared against the deterministic
PaddleOCR+regex extraction:

    field agreement  → confidence in the extraction
    field mismatch   → receipt flagged for human review

Design rule (architecture review §8.1): the vision model NEVER overwrites the
deterministic numbers — it only votes. Disagreement routes to the existing
human-in-the-loop breakpoint; it does not silently "fix" values.
"""
from __future__ import annotations

import base64
import json
import re
from datetime import datetime, date
from typing import Optional

from pydantic import BaseModel

from app.core.config import settings

# Amounts within 1% or ₹1 (whichever is larger) count as agreeing — receipts
# differ on rounding lines, and OCR can drop a paisa digit.
_AMOUNT_REL_TOL = 0.01
_AMOUNT_ABS_TOL = 1.0

_VISION_PROMPT = (
    "You are reading a photo/scan of a purchase receipt. Extract ONLY what is printed.\n"
    "Return strict JSON with exactly these keys:\n"
    '  "vendor_name": string or null  (the store/company name at the top)\n'
    '  "date": string or null         (the receipt date, formatted YYYY-MM-DD)\n'
    '  "total_amount": number or null (the final grand total actually charged)\n'
    "If a field is unreadable, use null. No prose, no markdown fences — JSON only."
)


class VerificationResult(BaseModel):
    ran: bool = False
    model: Optional[str] = None
    vision_vendor: Optional[str] = None
    vision_date: Optional[str] = None
    vision_amount: Optional[float] = None
    amount_match: Optional[bool] = None     # None = one side missing, can't vote
    date_match: Optional[bool] = None
    vendor_match: Optional[bool] = None
    verdict: str = "skipped"                # confirmed | mismatch | inconclusive | skipped | error
    error: Optional[str] = None


def _parse_json_block(content: str) -> dict:
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


def _coerce_date_any(raw: Optional[str]) -> Optional[date]:
    if not raw:
        return None
    raw = str(raw).strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y", "%d %B %Y", "%d %b %Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return None


def _amounts_agree(a: Optional[float], b: Optional[float]) -> Optional[bool]:
    if a is None or b is None:
        return None
    tol = max(_AMOUNT_ABS_TOL, abs(a) * _AMOUNT_REL_TOL)
    return abs(a - b) <= tol


def _vendors_agree(a: Optional[str], b: Optional[str]) -> Optional[bool]:
    if not a or not b:
        return None
    try:
        from rapidfuzz import fuzz
        return fuzz.token_set_ratio(a.upper(), b.upper()) >= 70
    except ImportError:
        # crude fallback: shared significant word
        wa = {w for w in re.split(r"\W+", a.upper()) if len(w) > 2}
        wb = {w for w in re.split(r"\W+", b.upper()) if len(w) > 2}
        return bool(wa & wb)


async def verify_with_vision(
    image_bytes: bytes,
    extracted_amount: Optional[float],
    extracted_date: Optional[str],
    extracted_vendor: Optional[str],
) -> VerificationResult:
    """Cross-check the deterministic extraction against a vision LLM's independent read."""
    if not settings.OCR_VISION_VERIFY or not settings.NVIDIA_API_KEY:
        return VerificationResult(ran=False, verdict="skipped")

    try:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=settings.NVIDIA_API_KEY, base_url=settings.NVIDIA_BASE_URL)
        b64 = base64.b64encode(image_bytes).decode()
        resp = await client.chat.completions.create(
            model=settings.NVIDIA_VISION_MODEL,
            temperature=0,
            max_tokens=300,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": _VISION_PROMPT},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
                ],
            }],
        )
        fields = _parse_json_block(resp.choices[0].message.content or "")
    except Exception as e:
        return VerificationResult(ran=False, verdict="error", error=str(e)[:300])

    v_vendor = fields.get("vendor_name")
    v_date = fields.get("date")
    raw_amt = fields.get("total_amount")
    try:
        v_amount = float(raw_amt) if raw_amt is not None else None
    except (TypeError, ValueError):
        v_amount = None

    amount_match = _amounts_agree(extracted_amount, v_amount)
    d1, d2 = _coerce_date_any(extracted_date), _coerce_date_any(v_date)
    date_match = (d1 == d2) if (d1 and d2) else None
    vendor_match = _vendors_agree(extracted_vendor, v_vendor)

    votes = [v for v in (amount_match, date_match, vendor_match) if v is not None]
    if not votes:
        verdict = "inconclusive"
    elif amount_match is False:            # money disagreement always escalates
        verdict = "mismatch"
    elif all(votes):
        verdict = "confirmed"
    elif sum(votes) >= len(votes) - 1:     # one soft-field (date/vendor) miss tolerated
        verdict = "confirmed"
    else:
        verdict = "mismatch"

    return VerificationResult(
        ran=True,
        model=settings.NVIDIA_VISION_MODEL,
        vision_vendor=v_vendor,
        vision_date=v_date,
        vision_amount=v_amount,
        amount_match=amount_match,
        date_match=date_match,
        vendor_match=vendor_match,
        verdict=verdict,
    )

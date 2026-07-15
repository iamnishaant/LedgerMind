"""
OCR Verification Harness — scores the FULL extraction pipeline against
SROIE ground truth (real scanned receipts with labeled fields).

Per receipt it runs the production run_ocr_agent() — PaddleOCR → deterministic
parsers → LLM vendor classification → vision-LLM cross-check — then compares:

    amount  vs ground-truth total   (exact within ₹/RM 0.01)
    date    vs ground-truth date    (calendar-date equality)
    vendor  vs ground-truth company (fuzzy ≥ 70)

Prereqs:  python scripts/fetch_sample_receipts.py [N]   (downloads images + ground_truth.json)
Run:      python scripts/verify_ocr.py [--fast]
          --fast skips the two LLM calls (vendor classification + vision check)
                 to score ONLY the deterministic layer.
"""
import asyncio
import json
import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

SAMPLES = Path(__file__).resolve().parents[1] / "sample_receipts"
FAST = "--fast" in sys.argv


def _gt_date(raw):
    if not raw:
        return None
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d %b %Y", "%d %B %Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(raw.strip(), fmt).date()
        except ValueError:
            continue
    return None


def _gt_amount(raw):
    if raw is None:
        return None
    try:
        return float(str(raw).replace(",", "").replace("RM", "").replace("$", "").strip())
    except ValueError:
        return None


async def main() -> None:
    gt_path = SAMPLES / "ground_truth.json"
    if not gt_path.exists():
        sys.exit("No ground truth found. Run first:  python scripts/fetch_sample_receipts.py")

    import app.agents.ocr_agent as ocr_agent
    from app.agents.ocr_agent import run_ocr_agent
    from app.agents.ocr_verifier import _vendors_agree, _coerce_date_any

    if FAST:
        # Score only the deterministic layer: no vendor LLM, no vision check.
        from app.core.config import settings
        settings.OCR_VISION_VERIFY = False

        async def _no_llm(text: str) -> dict:
            return {}
        ocr_agent.classify_with_llm = _no_llm

    ground_truth = json.loads(gt_path.read_text(encoding="utf-8"))
    rows = []
    t0 = time.time()

    for fname, gt in ground_truth.items():
        img_path = SAMPLES / fname
        if not img_path.exists():
            continue
        print(f"→ {fname} …", flush=True)
        started = time.time()
        result = await run_ocr_agent(img_path.read_bytes(), file_name=fname)

        gt_amt, gt_dt = _gt_amount(gt.get("total")), _gt_date(gt.get("date"))
        ex_dt = _coerce_date_any(result.expense_date)

        amount_ok = (gt_amt is not None and result.amount is not None
                     and abs(result.amount - gt_amt) < 0.01)
        date_ok = gt_dt is not None and ex_dt == gt_dt
        vendor_ok = bool(_vendors_agree(result.vendor_name, gt.get("company")))

        ver = result.verification or {}
        rows.append({
            "file": fname,
            "amount_ok": amount_ok, "extracted_amount": result.amount, "gt_amount": gt_amt,
            "date_ok": date_ok, "extracted_date": result.expense_date, "gt_date": gt.get("date"),
            "vendor_ok": vendor_ok, "extracted_vendor": result.vendor_name, "gt_vendor": gt.get("company"),
            "confidence": result.confidence,
            "verdict": ver.get("verdict", "skipped"),
            "needs_review": result.needs_human_review,
            "secs": round(time.time() - started, 1),
        })

    if not rows:
        sys.exit("No receipt images found next to ground_truth.json.")

    # ── Report ────────────────────────────────────────────────
    n = len(rows)
    print("\n" + "=" * 78)
    print(f"OCR VERIFICATION REPORT — {n} real SROIE receipts"
          + ("  [FAST: deterministic layer only]" if FAST else "  [full pipeline + vision cross-check]"))
    print("=" * 78)
    hdr = f"{'receipt':<15}{'amount':<26}{'date':<14}{'vendor':<8}{'verdict':<13}{'HITL':<5}"
    print(hdr)
    print("-" * 78)
    for r in rows:
        amt = f"{'✓' if r['amount_ok'] else '✗'} {r['extracted_amount']} vs {r['gt_amount']}"
        dt = f"{'✓' if r['date_ok'] else '✗'} {r['extracted_date'] or '—'}"
        vd = "✓" if r["vendor_ok"] else "✗"
        print(f"{r['file']:<15}{amt:<26}{dt:<14}{vd:<8}{r['verdict']:<13}{'yes' if r['needs_review'] else 'no':<5}")

    def pct(key):
        return f"{sum(1 for r in rows if r[key]) / n * 100:.0f}%"

    print("-" * 78)
    print(f"Field accuracy   →  amount: {pct('amount_ok')}   date: {pct('date_ok')}   vendor: {pct('vendor_ok')}")
    flagged = sum(1 for r in rows if r["needs_review"])
    wrong_amounts = [r for r in rows if not r["amount_ok"]]
    caught = sum(1 for r in wrong_amounts if r["needs_review"])
    print(f"Human review     →  {flagged}/{n} receipts flagged")
    if wrong_amounts:
        print(f"Safety net       →  {caught}/{len(wrong_amounts)} wrong amounts were caught by review gating"
              f"  {'✅' if caught == len(wrong_amounts) else '⚠️  gaps!'}")
    else:
        print("Safety net       →  no wrong amounts to catch ✅")
    print(f"Total time: {time.time() - t0:.0f}s")


if __name__ == "__main__":
    asyncio.run(main())

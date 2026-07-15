"""
Download REAL scanned-receipt images (SROIE / ICDAR 2019) into
backend/sample_receipts/ WITH their ground-truth annotations, so the OCR
pipeline can be scored against labeled data — not just eyeballed.

SROIE = 1,000 real scanned receipts with labeled key fields
(company, date, address, total).

One-time dep:   pip install datasets
Run:            python scripts/fetch_sample_receipts.py [N]   (default 8)

Outputs:
  sample_receipts/receipt_00.jpg …          the images
  sample_receipts/ground_truth.json         {filename: {company, date, total, address}}
"""
import json
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")  # emoji-safe on the Windows console
except Exception:
    pass

OUT = Path(__file__).resolve().parents[1] / "sample_receipts"
N = int(sys.argv[1]) if len(sys.argv) > 1 else 8


def main() -> None:
    try:
        from datasets import load_dataset
    except ImportError:
        sys.exit("Install the loader first:  pip install datasets")

    OUT.mkdir(exist_ok=True)
    print(f"Streaming SROIE receipts → {OUT} (target {N}) …")

    # streaming=True so we don't pull the whole dataset
    ds = load_dataset("jsdnrs/ICDAR2019-SROIE", split="test", streaming=True)

    ground_truth: dict[str, dict] = {}
    saved = 0
    for row in ds:
        img = row.get("image")
        entities = row.get("entities") or {}
        if img is None or not hasattr(img, "save"):
            continue
        fname = f"receipt_{saved:02d}.jpg"
        img.convert("RGB").save(OUT / fname, quality=92)
        ground_truth[fname] = {
            "key": row.get("key"),
            "company": entities.get("company"),
            "date": entities.get("date"),
            "total": entities.get("total"),
            "address": entities.get("address"),
        }
        saved += 1
        if saved >= N:
            break

    (OUT / "ground_truth.json").write_text(json.dumps(ground_truth, indent=2), encoding="utf-8")

    if saved:
        print(f"✅ Saved {saved} receipts + ground_truth.json to {OUT}")
        print("   Score the pipeline with:  python scripts/verify_ocr.py")
    else:
        print("⚠️  No images found — dataset schema may have changed; try naver-clova-ix/cord-v2.")


if __name__ == "__main__":
    main()

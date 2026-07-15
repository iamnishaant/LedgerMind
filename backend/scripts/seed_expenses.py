"""
Seed ~4 months of realistic Indian small-business expenses into the demo business,
so AI Chat / Budgets / Forecasts have real data to compute on.

Run (venv active, from backend/):   python scripts/seed_expenses.py
Requires: schema.sql applied + scripts/seed_demo.py already run (creates the business).
Idempotent-ish: pass --fresh to delete existing seeded rows first.
"""
import random
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
try:
    sys.stdout.reconfigure(encoding="utf-8")  # emoji-safe on the Windows console
except Exception:
    pass
from app.core.supabase import get_supabase  # noqa: E402
from app.agents.gst_agent import evaluate_itc  # noqa: E402

random.seed(42)
DAYS = 120
BIZ_NAME = "Demo Business"

# category -> (vendors, gst_rate, (min_amount, max_amount), rough monthly frequency)
CATALOG = {
    "Software & Subscriptions": (["AWS India", "Notion Labs", "Figma", "GitHub", "Vercel", "Google Workspace", "Slack"], 18, (299, 14000), 8),
    "Travel & Transport":       (["Ola Corporate", "Uber", "IndiGo", "IRCTC", "Rapido"], 5, (120, 9500), 12),
    "Food & Dining":            (["Zomato Business", "Swiggy", "Chai Point", "Barbeque Nation"], 5, (180, 4200), 14),
    "Office Supplies":          (["Staples", "Amazon Business", "Office Depot"], 18, (400, 6800), 4),
    "Marketing & Advertising":  (["Google Ads", "Meta Ads", "LinkedIn Ads"], 18, (3000, 22000), 5),
    "Utilities":                (["BSNL Broadband", "Tata Power", "Airtel"], 18, (799, 5200), 4),
    "Professional Services":    (["Deloitte Advisory", "Local CA Firm", "LegalZoom India"], 18, (2500, 18000), 2),
    "Equipment":                (["Dell India", "Croma", "Reliance Digital"], 18, (5000, 60000), 1),
}

# Plausible, fixed-format GSTINs per vendor (valid regex shape, not real registrations).
_STATE_CODES = ["27", "29", "07", "33", "19", "06", "24", "36"]
_ALL_VENDORS = sorted({v for _, (vendors, *_rest) in CATALOG.items() for v in vendors})
GSTIN_BY_VENDOR = {
    v: f"{random.choice(_STATE_CODES)}ABCDE{1000 + i}F{random.choice('12')}Z{random.choice('0123456789')}"
    for i, v in enumerate(_ALL_VENDORS)
}
# Leave ~15% of rows without a GSTIN so the "needs a GSTIN" follow-up list has content.
MISSING_GSTIN_RATE = 0.15


def main() -> None:
    fresh = "--fresh" in sys.argv
    sb = get_supabase()

    biz = sb.table("businesses").select("id").eq("name", BIZ_NAME).limit(1).execute().data
    if not biz:
        sys.exit("❌ No 'Demo Business' found. Run scripts/seed_demo.py first.")
    business_id = biz[0]["id"]

    if fresh:
        sb.table("expenses").delete().eq("business_id", business_id).contains("agent_tags", ["seed"]).execute()
        print("🧹 Removed previously seeded expenses")

    today = date.today()
    rows = []
    for cat, (vendors, rate, (lo, hi), monthly_freq) in CATALOG.items():
        n = int(monthly_freq * (DAYS / 30))
        for _ in range(n):
            amount = round(random.uniform(lo, hi), 2)
            gst_amount = round(amount * rate / (100 + rate), 2)  # tax portion of a GST-inclusive total
            d = today - timedelta(days=random.randint(0, DAYS - 1))
            vendor = random.choice(vendors)
            gst_number = None if random.random() < MISSING_GSTIN_RATE else GSTIN_BY_VENDOR[vendor]
            itc_eligible, _reason = evaluate_itc(cat, gst_amount, rate, gst_number)
            rows.append({
                "business_id": business_id,
                "amount": amount,
                "currency": "INR",
                "vendor_name": vendor,
                "description": f"{cat} expense",
                "category": cat,
                "expense_date": d.isoformat(),
                "gst_number": gst_number,
                "gst_rate": rate,
                "gst_amount": gst_amount,
                "itc_eligible": itc_eligible,
                "is_duplicate": False,
                "agent_tags": ["seed"],
            })

    # a few duplicates to exercise duplicate detection UI
    for r in random.sample(rows, k=min(4, len(rows))):
        dup = dict(r)
        dup["is_duplicate"] = True
        rows.append(dup)

    # insert in batches
    for i in range(0, len(rows), 100):
        sb.table("expenses").insert(rows[i:i + 100]).execute()

    total = round(sum(r["amount"] for r in rows), 2)
    print(f"✅ Seeded {len(rows)} expenses across {len(CATALOG)} categories over {DAYS} days")
    print(f"   Total value ₹{total:,.2f} | business_id={business_id}")


if __name__ == "__main__":
    main()

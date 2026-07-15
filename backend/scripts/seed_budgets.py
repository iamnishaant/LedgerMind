"""
Seed a few monthly budgets for the demo business so the Budgets page is populated.
Idempotent — skips budgets that already exist by name.

Run (venv active, from backend/):  python scripts/seed_budgets.py
"""
import sys
from calendar import monthrange
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass
from app.core.supabase import get_supabase  # noqa: E402

BIZ_NAME = "Demo Business"
BUDGETS = [
    ("Software budget",  "Software & Subscriptions", 55000),
    ("Marketing budget", "Marketing & Advertising",  60000),
    ("Travel budget",    "Travel & Transport",       35000),
    ("Food & team meals", "Food & Dining",           25000),
]


def main() -> None:
    sb = get_supabase()
    biz = sb.table("businesses").select("id").eq("name", BIZ_NAME).limit(1).execute().data
    if not biz:
        sys.exit("No 'Demo Business' — run scripts/seed_demo.py first.")
    business_id = biz[0]["id"]

    today = date.today()
    start = today.replace(day=1).isoformat()
    end = today.replace(day=monthrange(today.year, today.month)[1]).isoformat()

    existing = {
        b["name"] for b in
        (sb.table("budgets").select("name").eq("business_id", business_id).execute().data or [])
    }

    created = 0
    for name, category, amount in BUDGETS:
        if name in existing:
            continue
        sb.table("budgets").insert({
            "business_id": business_id, "name": name, "category": category,
            "amount": amount, "period_type": "monthly",
            "period_start": start, "period_end": end,
        }).execute()
        created += 1

    print(f"✅ Seeded {created} budget(s) ({len(BUDGETS) - created} already existed) for {BIZ_NAME}")


if __name__ == "__main__":
    main()

"""
Seed a demo user + business + storage bucket so the Phase-1 pipeline has valid
UUIDs to write against. Idempotent — safe to run more than once.

Run from the backend/ directory with the venv active:
    python scripts/seed_demo.py

Then copy the printed NEXT_PUBLIC_DEMO_* lines into frontend/.env.local.
"""
import sys
from pathlib import Path

# Make `app` importable when run as `python scripts/seed_demo.py`
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
try:
    sys.stdout.reconfigure(encoding="utf-8")  # emoji-safe on the Windows console
except Exception:
    pass

from app.core.supabase import get_supabase  # noqa: E402
from app.core.config import settings  # noqa: E402

DEMO_EMAIL = "demo@financeos.local"
DEMO_PASSWORD = "DemoPass123!"
BIZ_NAME = "Demo Business"


def main() -> None:
    if "YOUR-PROJECT-REF" in settings.SUPABASE_URL or not settings.SUPABASE_URL:
        sys.exit("❌ Set SUPABASE_URL in backend/.env first (it still has the placeholder).")

    sb = get_supabase()

    # 1) Storage bucket ------------------------------------------------------
    try:
        sb.storage.create_bucket("receipts")
        print("✅ Created storage bucket 'receipts'")
    except Exception as e:
        print(f"ℹ️  Bucket 'receipts': {e} (assuming it already exists)")

    # 2) Auth user (get-or-create) ------------------------------------------
    uid = None
    try:
        res = sb.auth.admin.create_user(
            {"email": DEMO_EMAIL, "password": DEMO_PASSWORD, "email_confirm": True}
        )
        uid = res.user.id
        print(f"✅ Created auth user {DEMO_EMAIL}")
    except Exception as e:
        print(f"ℹ️  create_user: {e} — looking up existing user…")
        users = sb.auth.admin.list_users()
        for u in users:
            if getattr(u, "email", None) == DEMO_EMAIL:
                uid = u.id
                break
        if not uid:
            raise
        print(f"✅ Found existing auth user {DEMO_EMAIL}")

    # 3) Profile -------------------------------------------------------------
    sb.table("profiles").upsert({"id": uid, "full_name": "Demo Owner"}).execute()
    print("✅ Upserted profile")

    # 4) Business (get-or-create) -------------------------------------------
    existing = (
        sb.table("businesses").select("id")
        .eq("owner_id", uid).eq("name", BIZ_NAME).execute()
    )
    if existing.data:
        biz_id = existing.data[0]["id"]
    else:
        ins = sb.table("businesses").insert(
            {"owner_id": uid, "name": BIZ_NAME, "currency": "INR", "country": "IN"}
        ).execute()
        biz_id = ins.data[0]["id"]
    print("✅ Business ready")

    print("\n" + "=" * 60)
    print("Paste these into frontend/.env.local:")
    print(f"NEXT_PUBLIC_DEMO_BUSINESS_ID={biz_id}")
    print(f"NEXT_PUBLIC_DEMO_USER_ID={uid}")
    print("=" * 60)


if __name__ == "__main__":
    main()

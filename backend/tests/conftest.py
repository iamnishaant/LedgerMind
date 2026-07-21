"""
Shared pytest fixtures.

DB-backed tests hit the REAL (dev) Supabase project — no mocking — matching
how every feature in this project has actually been verified all along. The
`qa_business` fixture creates a genuinely throwaway user+business and tears
it down in a `finally` block, so cleanup runs even if the test fails or
raises — the earlier ad-hoc verification script in this project had exactly
this bug (a crash before its manual cleanup call left orphaned data); a
pytest fixture's finalizer doesn't have that failure mode.

In CI without real Supabase secrets, `qa_business` calls pytest.skip() the
moment the first real API call fails (e.g. against a placeholder URL) rather
than needing to pre-guess whether credentials look "real."
"""
import asyncio
import sys
import uuid

import pytest

# Same fix as backend/main.py: psycopg's async mode cannot run under Windows'
# default ProactorEventLoop. Needed here for test_checkpointer_durability.py.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

sys.path.insert(0, __file__.rsplit("tests", 1)[0])  # repo's backend/ on sys.path

from app.core.supabase import get_supabase, get_supabase_anon  # noqa: E402


@pytest.fixture
def supabase():
    return get_supabase()


def _make_qa_business(supabase, name: str):
    """Shared body for qa_business/second_business: create a throwaway auth
    user + business, yield (business_id, user_id), always clean up after."""
    email = f"pytest-qa-{uuid.uuid4().hex[:10]}@financeos.local"
    user_id = None
    business_id = None
    try:
        try:
            created = supabase.auth.admin.create_user({
                "email": email, "password": "PytestQA123!", "email_confirm": True,
            })
        except Exception as e:
            pytest.skip(f"Live Supabase not reachable — skipping DB-backed test ({e})")
        user_id = created.user.id

        biz = supabase.table("businesses").insert({
            "owner_id": user_id, "name": name, "currency": "INR",
        }).execute().data[0]
        business_id = biz["id"]

        yield business_id, user_id
    finally:
        if business_id:
            supabase.table("businesses").delete().eq("id", business_id).execute()  # cascades
        if user_id:
            try:
                supabase.auth.admin.delete_user(user_id)
            except Exception:
                pass


@pytest.fixture
def qa_business(supabase):
    """
    Creates a throwaway auth user + business, yields (business_id, user_id),
    and ALWAYS deletes both afterward — even if the test fails.
    Skips the test (not a failure) if Supabase is unreachable, e.g. CI
    running without real secrets.
    """
    yield from _make_qa_business(supabase, "Pytest QA Business")


@pytest.fixture
def second_business(supabase):
    """A second, independent throwaway user + business — for tests that need
    to prove one business can't see/touch another's data (e.g. API keys)."""
    yield from _make_qa_business(supabase, "Pytest QA Business 2")


@pytest.fixture
def qa_access_token(supabase, qa_business):
    """A real, signed-in access token for the qa_business's owner."""
    business_id, user_id = qa_business
    # We don't have the plaintext password here by construction (qa_business
    # doesn't return it) — sign in via the same fixed password it used.
    anon = get_supabase_anon()
    session = anon.auth.sign_in_with_password({
        "email": supabase.auth.admin.get_user_by_id(user_id).user.email,
        "password": "PytestQA123!",
    })
    return session.session.access_token

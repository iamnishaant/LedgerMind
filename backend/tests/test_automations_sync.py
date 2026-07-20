"""
Automation dedup ledger + batch cap — DB-backed against the real (dev)
Supabase project, with a stubbed Gmail connector (no real Google API calls,
no real OCR/LLM — those are covered separately; this isolates exactly the
dedup/cap logic, which is what a wrong implementation would silently get
wrong: matching on the wrong key, or an uncapped first-sync burst).

This is the pytest version of the manual verification run earlier in this
project (see docs/AUDIT_REPORT.md / memory) — same scenarios, now committed
and reliably cleaned up via a fixture instead of a scratchpad script.
"""
import uuid

import pytest

import app.agents.connectors.sync as sync_mod
from app.agents.connectors.base import Connector, ExternalItem
from app.core.crypto import encrypt

# A syntactically valid, tiny JPEG — content doesn't matter, only that
# Storage accepts it. OCR correctness is verified elsewhere (verify_ocr.py).
_TINY_JPEG = bytes.fromhex(
    "ffd8ffe000104a46494600010100000100010000ffdb00430003020202020203"
    "0202020303030304060404040408060605060909080a0a090809090a0c0f0c0a"
    "0b0e0b09090d110d0e0f101011100a0c12131210130f101010ffc9000b080001"
    "000101011100ffc4001f00000105010101010101000000000000000102030405"
    "060708090a0bffc400b5100002010303020403050504040000017d0102030004"
    "1105122131410613516107227114328191a1082342b1c11552d1f02433627282"
    "090a161718191a25262728292a34353637383940434445464748494a53545556"
    "5758595a636465666768696a737475767778797a828384858687888990929394"
    "95969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9c"
    "ad2d3d4d5d6d7d8d9daf1f2f3f4f5f6f7f8f9faffda0008010100003f00fbd9"
)


class FakeGmailConnector(Connector):
    provider = "gmail"

    def __init__(self, items):
        self.items = items

    async def list_new_items(self, account):
        return self.items

    async def fetch_item(self, account, item):
        return _TINY_JPEG


def _items(prefix: str, n: int) -> list[ExternalItem]:
    return [
        ExternalItem(external_id=f"{prefix}-{i}", filename=f"r{i}.jpg",
                     mime_type="image/jpeg", size_bytes=20000, fetch_ref={})
        for i in range(n)
    ]


@pytest.fixture
def connected_gmail_account(qa_business, supabase):
    business_id, _user_id = qa_business
    account = supabase.table("connected_accounts").insert({
        "business_id": business_id, "provider": "gmail",
        "encrypted_access_token": encrypt("fake-token"),
        "encrypted_refresh_token": encrypt("fake-refresh"),
        "status": "active", "scopes": ["gmail.readonly"],
    }).execute().data[0]
    return account["id"], business_id


@pytest.fixture(autouse=True)
def stub_pipeline_and_restore(monkeypatch):
    """
    Stub the expensive OCR/LLM pipeline step (already verified separately)
    so this test isolates dedup/cap logic and runs in milliseconds, not
    minutes. ingest_receipt() itself runs for real — it's cheap (Storage +
    one insert) and its row is what agent_runs.receipt_id needs to exist.
    """
    async def fake_pipeline(receipt_id, business_id, uploaded_by, image_bytes):
        return None
    monkeypatch.setattr(sync_mod, "run_ingest_pipeline", fake_pipeline)
    yield


async def test_batch_cap_limits_first_sync(connected_gmail_account, monkeypatch):
    account_id, _business_id = connected_gmail_account
    monkeypatch.setitem(sync_mod._CONNECTORS, "gmail", FakeGmailConnector(_items("batch", 25)))

    result = await sync_mod.run_sync(account_id)

    assert result["listed"] == 25
    assert result["ingested"] == 20  # SYNC_MAX_ITEMS_PER_RUN
    assert result["capped"] is True
    assert result["skipped_dedup"] == 0


async def test_dedup_skips_already_processed_items(connected_gmail_account, monkeypatch):
    account_id, _business_id = connected_gmail_account
    same_25 = _items("batch", 25)
    monkeypatch.setitem(sync_mod._CONNECTORS, "gmail", FakeGmailConnector(same_25))

    first = await sync_mod.run_sync(account_id)
    assert first["ingested"] == 20 and first["capped"] is True

    second = await sync_mod.run_sync(account_id)
    assert second["listed"] == 25
    assert second["skipped_dedup"] == 20     # the 20 already ingested
    assert second["ingested"] == 5           # the remaining 5 from the original batch
    assert second["capped"] is False


async def test_fully_synced_inbox_ingests_nothing_new(connected_gmail_account, monkeypatch):
    account_id, _business_id = connected_gmail_account
    same_25 = _items("batch", 25)
    monkeypatch.setitem(sync_mod._CONNECTORS, "gmail", FakeGmailConnector(same_25))

    await sync_mod.run_sync(account_id)  # ingests 20
    await sync_mod.run_sync(account_id)  # ingests the remaining 5

    third = await sync_mod.run_sync(account_id)
    assert third["ingested"] == 0
    assert third["skipped_dedup"] == 25


async def test_only_the_genuinely_new_item_is_processed(connected_gmail_account, monkeypatch):
    """The exact scenario this matters for: dedup must key on the message
    identity, not something looser (subject, timestamp) that a new email
    could accidentally collide with or a resend could accidentally dodge."""
    account_id, _business_id = connected_gmail_account
    original_25 = _items("batch", 25)
    monkeypatch.setitem(sync_mod._CONNECTORS, "gmail", FakeGmailConnector(original_25))
    await sync_mod.run_sync(account_id)
    await sync_mod.run_sync(account_id)

    plus_one_new = original_25 + _items("fresh-arrival", 1)
    monkeypatch.setitem(sync_mod._CONNECTORS, "gmail", FakeGmailConnector(plus_one_new))
    result = await sync_mod.run_sync(account_id)

    assert result["ingested"] == 1
    assert result["skipped_dedup"] == 25


async def test_agent_runs_audit_trail_is_correct(connected_gmail_account, monkeypatch, supabase):
    account_id, business_id = connected_gmail_account
    monkeypatch.setitem(sync_mod._CONNECTORS, "gmail", FakeGmailConnector(_items("audit", 3)))

    await sync_mod.run_sync(account_id)

    runs = supabase.table("agent_runs").select("*").eq("business_id", business_id).execute().data
    item_runs = [r for r in runs if (r.get("input_payload") or {}).get("source") == "automation"
                 and (r.get("input_payload") or {}).get("kind") != "sync_run"]
    summary_runs = [r for r in runs if (r.get("input_payload") or {}).get("kind") == "sync_run"]

    assert len(item_runs) == 3
    assert len(summary_runs) == 1
    assert all(r["agent_name"] == "gmail_connector" for r in runs)
    assert all(r["status"] == "completed" for r in runs)


async def test_sync_on_inactive_account_is_a_noop(qa_business, supabase, monkeypatch):
    business_id, _user_id = qa_business
    account = supabase.table("connected_accounts").insert({
        "business_id": business_id, "provider": "gmail",
        "encrypted_access_token": encrypt("fake"), "status": "disconnected",
    }).execute().data[0]
    monkeypatch.setitem(sync_mod._CONNECTORS, "gmail", FakeGmailConnector(_items("x", 5)))

    result = await sync_mod.run_sync(account["id"])
    assert result["ingested"] == 0
    assert "status" in result.get("error", "")

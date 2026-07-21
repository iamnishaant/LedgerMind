"""
API key generation + verification — Phase 10 (Enterprise: API keys)

Deliberately narrow in scope: API keys authenticate ONLY the export endpoint
(app/api/v1/export.py), not the whole API surface. Every other endpoint's
semantics assume a human user (team management, approvals "who decided",
chat) — a machine key doesn't map onto those cleanly, so rather than bolt a
confusing dual-auth mode onto all of them, only the one read-only,
business-scoped endpoint that actually needs machine access supports it.

Keys are prefixed 'fos_' so a caller can be routed to key-auth vs normal
Supabase-session auth without ambiguity, before ever hitting the DB.
"""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timezone

from app.core.supabase import get_supabase

KEY_PREFIX = "fos_"
_DISPLAY_PREFIX_LEN = 12  # "fos_" + 8 chars shown in the UI to identify a key


def _hash_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def generate_api_key() -> tuple[str, str, str]:
    """Return (plaintext_key, key_prefix, key_hash). Plaintext is never stored."""
    plaintext = KEY_PREFIX + secrets.token_urlsafe(32)
    return plaintext, plaintext[:_DISPLAY_PREFIX_LEN], _hash_key(plaintext)


def business_id_for_api_key(key: str) -> str | None:
    """Return the owning business_id for a valid, non-revoked key, else None.
    Updates last_used_at as a side effect on every successful lookup."""
    if not key.startswith(KEY_PREFIX):
        return None

    sb = get_supabase()
    rows = (
        sb.table("api_keys").select("id, business_id, revoked_at")
        .eq("key_hash", _hash_key(key)).limit(1).execute().data
    )
    if not rows or rows[0]["revoked_at"]:
        return None

    sb.table("api_keys").update({
        "last_used_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", rows[0]["id"]).execute()

    return rows[0]["business_id"]

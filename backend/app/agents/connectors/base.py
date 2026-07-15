"""
Connector abstraction — Phase 8.

Every ingest source (Gmail today; Drive/Dropbox/Outlook later) implements the
same small surface, so adding a provider means one new module — not changes to
the sync job, the dedup ledger, or the ingest pipeline.

`account` is the raw `connected_accounts` row (dict); connectors are
responsible for decrypting/refreshing their own tokens via app.core.crypto.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


class ReconnectRequired(Exception):
    """Raised when auth is irrecoverable (revoked/expired refresh token) —
    the sync job marks the account status='needs_reconnect' and stops."""


@dataclass
class ExternalItem:
    """One ingestable attachment discovered at the provider."""
    external_id: str        # provider-unique id used for dedup (Gmail: "<messageId>:<attachmentId>")
    filename: str
    mime_type: str
    size_bytes: int
    # opaque provider handles needed to fetch the payload later
    fetch_ref: dict


class Connector(Protocol):
    provider: str

    async def list_new_items(self, account: dict) -> list[ExternalItem]:
        """Enumerate candidate attachments (already filtered to plausible receipts).
        Dedup against processed_external_items happens in the sync job, not here."""
        ...

    async def fetch_item(self, account: dict, item: ExternalItem) -> bytes:
        """Download one attachment's raw bytes."""
        ...

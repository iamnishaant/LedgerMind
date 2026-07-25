"""
OAuth2Connector — shared OAuth2 refresh-token plumbing for cloud connectors.

Gmail (Phase 8) hand-rolled its own access-token refresh. Drive/Dropbox/Outlook
all follow the identical pattern (refresh_token → access_token, persist the new
token + expiry to connected_accounts), so that logic lives here once and each
provider only fills in its token URL, client credentials, and the two data
methods (`list_new_items` / `fetch_item`).

Providers that aren't wired yet raise NotImplementedError from their data
methods — the interface conforms, so registering one is a one-line change in
sync.py the moment its OAuth app + credentials exist.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import httpx

from app.core.crypto import encrypt, decrypt
from app.core.supabase import get_supabase
from app.agents.connectors.base import Connector, ExternalItem, ReconnectRequired


class OAuth2Connector(Connector):
    """Base class handling the common access-token lifecycle. Subclasses set
    `provider`, `token_url`, and the `client_id`/`client_secret` properties, then
    implement `list_new_items` / `fetch_item`."""

    provider: str = "oauth2"
    token_url: str = ""

    # Subclasses supply these from app.core.config.settings.
    @property
    def client_id(self) -> str | None:
        raise NotImplementedError

    @property
    def client_secret(self) -> str | None:
        raise NotImplementedError

    # Extra params some providers require on refresh (e.g. Dropbox needs none,
    # Microsoft wants the scope echoed back). Overridable.
    def _refresh_params(self) -> dict:
        return {}

    async def access_token(self, account: dict) -> str:
        """Return a valid access token, refreshing + re-persisting when near expiry.
        Identical contract to GmailConnector._access_token, generalized."""
        if not self.client_id or not self.client_secret:
            raise ReconnectRequired(
                f"{self.provider} OAuth is not configured (missing client credentials)")

        expires_at = account.get("expires_at")
        needs_refresh = True
        if expires_at:
            exp = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
            needs_refresh = exp <= datetime.now(timezone.utc) + timedelta(minutes=2)
        if not needs_refresh:
            return decrypt(account["encrypted_access_token"])

        if not account.get("encrypted_refresh_token"):
            raise ReconnectRequired("No refresh token stored")

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(self.token_url, data={
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "refresh_token": decrypt(account["encrypted_refresh_token"]),
                "grant_type": "refresh_token",
                **self._refresh_params(),
            })
        if resp.status_code != 200:
            raise ReconnectRequired(f"Token refresh failed: {resp.text[:200]}")

        data = resp.json()
        access_token = data["access_token"]
        new_exp = datetime.now(timezone.utc) + timedelta(seconds=int(data.get("expires_in", 3600)))
        get_supabase().table("connected_accounts").update({
            "encrypted_access_token": encrypt(access_token),
            "expires_at": new_exp.isoformat(),
        }).eq("id", account["id"]).execute()
        account["encrypted_access_token"] = encrypt(access_token)
        account["expires_at"] = new_exp.isoformat()
        return access_token

    # Subclasses must implement the two data methods (Connector protocol).
    async def list_new_items(self, account: dict) -> list[ExternalItem]:  # pragma: no cover
        raise NotImplementedError(f"{self.provider} connector not implemented yet")

    async def fetch_item(self, account: dict, item: ExternalItem) -> bytes:  # pragma: no cover
        raise NotImplementedError(f"{self.provider} connector not implemented yet")

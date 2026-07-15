"""
GmailConnector — read-only Gmail ingest via the REST API (scope: gmail.readonly).

Deliberately uses plain httpx against the Gmail REST endpoints instead of
google-api-python-client: the surface we need is 4 requests (token refresh,
messages.list, messages.get, attachments.get) and the official client would
add a heavy dependency tree for no gain.
"""
from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone

import httpx

from app.core.config import settings
from app.core.crypto import encrypt, decrypt
from app.core.supabase import get_supabase
from app.agents.connectors.base import Connector, ExternalItem, ReconnectRequired

GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me"
TOKEN_URL = "https://oauth2.googleapis.com/token"

# Only these look like receipts; skips inline logos/signatures via size floor too.
_ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp", "application/pdf"}
_MIN_SIZE_BYTES = 10 * 1024


class GmailConnector(Connector):
    provider = "gmail"

    # ── token handling ────────────────────────────────────────

    async def _access_token(self, account: dict) -> str:
        """Return a valid access token, refreshing (and re-persisting) if needed."""
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
            resp = await client.post(TOKEN_URL, data={
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "refresh_token": decrypt(account["encrypted_refresh_token"]),
                "grant_type": "refresh_token",
            })
        if resp.status_code != 200:
            # invalid_grant = user revoked access / refresh token expired
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

    async def _get(self, client: httpx.AsyncClient, token: str, url: str, **params) -> dict:
        resp = await client.get(url, headers={"Authorization": f"Bearer {token}"}, params=params or None)
        if resp.status_code == 401:
            raise ReconnectRequired("Gmail rejected the access token")
        resp.raise_for_status()
        return resp.json()

    # ── Connector interface ───────────────────────────────────

    async def list_new_items(self, account: dict) -> list[ExternalItem]:
        token = await self._access_token(account)
        query = f"has:attachment newer_than:{settings.GMAIL_LOOKBACK_DAYS}d"
        items: list[ExternalItem] = []

        async with httpx.AsyncClient(timeout=60) as client:
            listing = await self._get(
                client, token, f"{GMAIL_API}/messages",
                q=query, maxResults=50,
            )
            for msg_ref in listing.get("messages", []) or []:
                msg = await self._get(client, token, f"{GMAIL_API}/messages/{msg_ref['id']}", format="full")
                for part in self._walk_parts(msg.get("payload", {})):
                    body = part.get("body", {})
                    att_id = body.get("attachmentId")
                    filename = part.get("filename") or ""
                    mime = (part.get("mimeType") or "").lower()
                    size = int(body.get("size", 0))
                    if not att_id or not filename:
                        continue
                    if mime not in _ALLOWED_MIME or size < _MIN_SIZE_BYTES:
                        continue
                    items.append(ExternalItem(
                        external_id=f"{msg_ref['id']}:{att_id[:32]}",
                        filename=filename,
                        mime_type=mime,
                        size_bytes=size,
                        fetch_ref={"message_id": msg_ref["id"], "attachment_id": att_id},
                    ))
        return items

    async def fetch_item(self, account: dict, item: ExternalItem) -> bytes:
        token = await self._access_token(account)
        ref = item.fetch_ref
        async with httpx.AsyncClient(timeout=60) as client:
            data = await self._get(
                client, token,
                f"{GMAIL_API}/messages/{ref['message_id']}/attachments/{ref['attachment_id']}",
            )
        return base64.urlsafe_b64decode(data["data"])

    @staticmethod
    def _walk_parts(payload: dict):
        """Depth-first walk of a Gmail MIME tree yielding every leaf part."""
        stack = [payload]
        while stack:
            part = stack.pop()
            children = part.get("parts")
            if children:
                stack.extend(children)
            else:
                yield part

"""
OutlookConnector — Outlook / Microsoft 365 mail receipt ingest (planned).

Token handling is inherited from OAuth2Connector. Microsoft's token endpoint
wants the scope echoed on refresh, so `_refresh_params` is overridden. Remaining
work to finish this connector:

  Scopes    : Mail.Read offline_access
  Token URL : https://login.microsoftonline.com/common/oauth2/v2.0/token
  List      : GET https://graph.microsoft.com/v1.0/me/messages
              ?$filter=hasAttachments eq true&$select=id&$top=50
              then GET .../messages/{id}/attachments (fileAttachment types)
  Fetch     : the attachment's `contentBytes` (base64) from the attachments call
  Dedup id  : "<messageId>:<attachmentId>" (same shape as Gmail)

To finish: add MS_CLIENT_ID / MS_CLIENT_SECRET to settings, implement the two
methods below, and register in sync.py.
"""
from __future__ import annotations

from app.core.config import settings
from app.agents.connectors.base import ExternalItem
from app.agents.connectors.oauth_base import OAuth2Connector

_GRAPH_SCOPE = "Mail.Read offline_access"


class OutlookConnector(OAuth2Connector):
    provider = "outlook"
    token_url = "https://login.microsoftonline.com/common/oauth2/v2.0/token"

    @property
    def client_id(self) -> str | None:
        return getattr(settings, "MS_CLIENT_ID", None)

    @property
    def client_secret(self) -> str | None:
        return getattr(settings, "MS_CLIENT_SECRET", None)

    def _refresh_params(self) -> dict:
        return {"scope": _GRAPH_SCOPE}

    async def list_new_items(self, account: dict) -> list[ExternalItem]:
        raise NotImplementedError("Outlook connector is scaffolded but not implemented yet")

    async def fetch_item(self, account: dict, item: ExternalItem) -> bytes:
        raise NotImplementedError("Outlook connector is scaffolded but not implemented yet")

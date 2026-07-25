"""
DropboxConnector — Dropbox receipt ingest (planned).

Token handling is inherited from OAuth2Connector. What remains to finish this:

  Scopes    : files.metadata.read files.content.read
  Token URL : https://api.dropboxapi.com/oauth2/token
  List      : POST https://api.dropboxapi.com/2/files/list_folder
              {"path": "", "recursive": true}  (then /list_folder/continue to page)
              filter client-side to image/* + .pdf by name/extension
  Fetch     : POST https://content.dropboxapi.com/2/files/download
              header: Dropbox-API-Arg: {"path": "<file path or id>"}
  Dedup id  : the Dropbox file `id` (e.g. "id:abc123"), stable across renames

To finish: add DROPBOX_CLIENT_ID / DROPBOX_CLIENT_SECRET to settings, implement
the two methods below, and register in sync.py.
"""
from __future__ import annotations

from app.core.config import settings
from app.agents.connectors.base import ExternalItem
from app.agents.connectors.oauth_base import OAuth2Connector


class DropboxConnector(OAuth2Connector):
    provider = "dropbox"
    token_url = "https://api.dropboxapi.com/oauth2/token"

    @property
    def client_id(self) -> str | None:
        return getattr(settings, "DROPBOX_CLIENT_ID", None)

    @property
    def client_secret(self) -> str | None:
        return getattr(settings, "DROPBOX_CLIENT_SECRET", None)

    async def list_new_items(self, account: dict) -> list[ExternalItem]:
        raise NotImplementedError("Dropbox connector is scaffolded but not implemented yet")

    async def fetch_item(self, account: dict, item: ExternalItem) -> bytes:
        raise NotImplementedError("Dropbox connector is scaffolded but not implemented yet")

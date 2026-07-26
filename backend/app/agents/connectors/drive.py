"""
DriveConnector — Google Drive receipt ingest (planned).

Token handling is inherited from OAuth2Connector (Google's token endpoint is the
same one Gmail already uses). What remains to finish this connector:

  Scope     : https://www.googleapis.com/auth/drive.readonly
  List      : GET https://www.googleapis.com/drive/v3/files
              q="mimeType='application/pdf' or mimeType contains 'image/'"
              &fields=files(id,name,mimeType,size)&pageSize=50
  Fetch     : GET https://www.googleapis.com/drive/v3/files/{id}?alt=media
  Dedup id  : the Drive file id (stable, globally unique)

Add `GOOGLE_CLIENT_ID`/`SECRET` are already in settings (shared with Gmail), so
finishing this is: implement the two methods below + register in sync.py.
"""
from __future__ import annotations

from app.core.config import settings
from app.agents.connectors.base import ExternalItem
from app.agents.connectors.oauth_base import OAuth2Connector

_ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp", "application/pdf"}
_MIN_SIZE_BYTES = 10 * 1024


class DriveConnector(OAuth2Connector):
    provider = "drive"
    token_url = "https://oauth2.googleapis.com/token"

    @property
    def client_id(self) -> str | None:
        return settings.GOOGLE_CLIENT_ID  # Drive reuses the Google OAuth client

    @property
    def client_secret(self) -> str | None:
        return settings.GOOGLE_CLIENT_SECRET

    async def list_new_items(self, account: dict) -> list[ExternalItem]:
        raise NotImplementedError("Google Drive connector is scaffolded but not implemented yet")

    async def fetch_item(self, account: dict, item: ExternalItem) -> bytes:
        raise NotImplementedError("Google Drive connector is scaffolded but not implemented yet")

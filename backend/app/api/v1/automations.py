"""
Automations API — Phase 8 (Gmail auto-ingest)

GET  /connect/gmail?business_id=…   → Google consent URL (409 if already connected)
GET  /callback/gmail?code=…&state=… → OAuth callback (redirects browser to frontend)
GET  /status?business_id=…          → connection status per provider
POST /sync                          → manual "Sync now" (background)
POST /disconnect                    → remove the connection (dedup ledger is kept)

The callback arrives from Google's redirect WITHOUT our Authorization header,
so `state` must be self-authenticating: it's a Fernet-encrypted payload of
{business_id, user_id, exp} minted in the authenticated /connect call. This is
also the CSRF defense.
"""
from __future__ import annotations

import json
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode, quote

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from app.core.config import settings
from app.core.auth import get_current_user, ensure_owns_business
from app.core.crypto import encrypt, decrypt, TokenCryptoError
from app.core.supabase import get_supabase
from app.agents.connectors.sync import run_sync

router = APIRouter()

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"
STATE_TTL_SECONDS = 600

PROVIDERS = ("gmail",)   # extend as connectors land


def _require_google_config() -> None:
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        raise HTTPException(
            status_code=503,
            detail="Google OAuth is not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend/.env",
        )


def _frontend_redirect(**params) -> RedirectResponse:
    qs = urlencode(params)
    return RedirectResponse(f"{settings.FRONTEND_URL}/dashboard/automations?{qs}")


# ── Connect ───────────────────────────────────────────────────

@router.get("/connect/gmail")
async def connect_gmail(business_id: str, user: dict = Depends(get_current_user)):
    ensure_owns_business(business_id, user["id"])
    _require_google_config()

    sb = get_supabase()
    existing = (
        sb.table("connected_accounts").select("status")
        .eq("business_id", business_id).eq("provider", "gmail")
        .limit(1).execute().data
    )
    # Clean 409 instead of letting the unique constraint bubble a raw PG error.
    if existing and existing[0]["status"] == "active":
        raise HTTPException(
            status_code=409,
            detail="Gmail is already connected for this business — disconnect first",
        )
    # needs_reconnect / disconnected rows fall through: reconnecting is allowed
    # and the callback upserts over the stale row.

    state = encrypt(json.dumps({
        "business_id": business_id,
        "user_id": user["id"],
        "exp": int(time.time()) + STATE_TTL_SECONDS,
    }))

    auth_url = GOOGLE_AUTH_URL + "?" + urlencode({
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": GMAIL_SCOPE,
        "access_type": "offline",   # ask for a refresh token
        "prompt": "consent",        # force refresh-token issuance even on re-auth
        "state": state,
    })
    return {"auth_url": auth_url}


# ── Callback (browser redirect from Google — no auth header) ──

@router.get("/callback/gmail")
async def callback_gmail(state: str = "", code: str = "", error: str = ""):
    if error:
        return _frontend_redirect(error=f"Google returned: {error}")
    if not state or not code:
        return _frontend_redirect(error="Missing state or code in Google callback")

    try:
        payload = json.loads(decrypt(state))
        if int(payload.get("exp", 0)) < time.time():
            return _frontend_redirect(error="Connection link expired — try again")
        business_id = payload["business_id"]
    except (TokenCryptoError, KeyError, ValueError):
        return _frontend_redirect(error="Invalid connection state — try again")

    # Exchange the code for tokens
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(GOOGLE_TOKEN_URL, data={
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        })
    if resp.status_code != 200:
        return _frontend_redirect(error="Google token exchange failed — try again")

    tokens = resp.json()
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(tokens.get("expires_in", 3600)))

    record = {
        "business_id": business_id,
        "provider": "gmail",
        "encrypted_access_token": encrypt(tokens["access_token"]),
        "expires_at": expires_at.isoformat(),
        "scopes": (tokens.get("scope") or GMAIL_SCOPE).split(),
        "status": "active",
    }
    if tokens.get("refresh_token"):
        record["encrypted_refresh_token"] = encrypt(tokens["refresh_token"])

    # Upsert on (business_id, provider): handles reconnect AND the connect race
    # without ever surfacing a raw unique-violation.
    get_supabase().table("connected_accounts").upsert(
        record, on_conflict="business_id,provider"
    ).execute()

    return _frontend_redirect(connected="gmail")


# ── Status ────────────────────────────────────────────────────

@router.get("/status")
async def automations_status(business_id: str, user: dict = Depends(get_current_user)):
    ensure_owns_business(business_id, user["id"])
    sb = get_supabase()
    rows = (
        sb.table("connected_accounts")
        .select("provider, status, last_synced_at, scopes, created_at")
        .eq("business_id", business_id).execute().data or []
    )
    by_provider = {r["provider"]: r for r in rows}
    return {
        "providers": {
            p: by_provider.get(p, {"provider": p, "status": "disconnected", "last_synced_at": None})
            for p in PROVIDERS
        },
        "google_oauth_configured": bool(settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET),
    }


# ── Manual sync ───────────────────────────────────────────────

class SyncIn(BaseModel):
    business_id: str
    provider: str = "gmail"


@router.post("/sync")
async def trigger_sync(payload: SyncIn, background_tasks: BackgroundTasks,
                       user: dict = Depends(get_current_user)):
    ensure_owns_business(payload.business_id, user["id"])
    if payload.provider not in PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unknown provider '{payload.provider}'")

    sb = get_supabase()
    rows = (
        sb.table("connected_accounts").select("id, status")
        .eq("business_id", payload.business_id).eq("provider", payload.provider)
        .limit(1).execute().data
    )
    if not rows:
        raise HTTPException(status_code=404, detail=f"{payload.provider} is not connected")
    if rows[0]["status"] != "active":
        raise HTTPException(status_code=409, detail=f"{payload.provider} needs to be reconnected first")

    background_tasks.add_task(run_sync, rows[0]["id"])
    return {"message": "Sync started — new receipts will appear as they're processed.",
            "max_items_this_run": settings.SYNC_MAX_ITEMS_PER_RUN}


# ── Disconnect ────────────────────────────────────────────────

class DisconnectIn(BaseModel):
    business_id: str
    provider: str = "gmail"


@router.post("/disconnect")
async def disconnect(payload: DisconnectIn, user: dict = Depends(get_current_user)):
    ensure_owns_business(payload.business_id, user["id"])
    if payload.provider not in PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unknown provider '{payload.provider}'")

    # Delete the row (tokens gone); processed_external_items is intentionally
    # kept so a later reconnect doesn't re-ingest everything.
    get_supabase().table("connected_accounts").delete() \
        .eq("business_id", payload.business_id).eq("provider", payload.provider).execute()
    return {"disconnected": payload.provider}

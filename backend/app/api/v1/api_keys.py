"""
API Keys API — Phase 10 (Enterprise: API keys)
GET    /api/v1/api-keys           → list keys for a business (never returns the hash)
POST   /api/v1/api-keys           → owner-only; create a key, plaintext shown ONCE
DELETE /api/v1/api-keys/{key_id}  → owner-only; revoke (soft-delete — history is kept)
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from app.core.supabase import get_supabase
from app.core.auth import get_current_user, ensure_owns_business, ensure_is_owner
from app.core.api_key_auth import generate_api_key

router = APIRouter()


@router.get("")
async def list_api_keys(business_id: str, user: dict = Depends(get_current_user)):
    ensure_owns_business(business_id, user["id"])
    sb = get_supabase()
    rows = (
        sb.table("api_keys").select("id, name, key_prefix, created_at, last_used_at, revoked_at")
        .eq("business_id", business_id).order("created_at", desc=True).execute().data or []
    )
    return {"keys": rows}


class CreateKeyIn(BaseModel):
    business_id: str
    name: str


@router.post("")
async def create_api_key(payload: CreateKeyIn, user: dict = Depends(get_current_user)):
    ensure_is_owner(payload.business_id, user["id"])
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="Name is required")

    plaintext, prefix, key_hash = generate_api_key()
    sb = get_supabase()
    row = sb.table("api_keys").insert({
        "business_id": payload.business_id,
        "name": payload.name.strip(),
        "key_prefix": prefix,
        "key_hash": key_hash,
        "created_by": user["id"],
    }).execute().data[0]

    return {
        "id": row["id"], "name": row["name"], "key_prefix": row["key_prefix"],
        "created_at": row["created_at"],
        "key": plaintext,  # shown exactly once — the caller must save it now
    }


@router.delete("/{key_id}")
async def revoke_api_key(key_id: str, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    rows = sb.table("api_keys").select("*").eq("id", key_id).limit(1).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="API key not found")
    ensure_is_owner(rows[0]["business_id"], user["id"])

    sb.table("api_keys").update({
        "revoked_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", key_id).execute()
    return {"revoked": key_id}

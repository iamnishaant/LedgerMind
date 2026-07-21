"""
Team API — Phase 10 (Enterprise: Teams & Roles)
GET    /api/v1/team                  → members (+ pending invites, owner only) for a business
POST   /api/v1/team/invite           → owner-only; creates a redeemable invite link
POST   /api/v1/team/accept           → any authenticated user; redeems an invite token
PATCH  /api/v1/team/{member_id}/role → owner-only; promote/demote a member
DELETE /api/v1/team/{member_id}      → owner-only; remove a member

Two roles: 'owner' (full control) and 'member'. No email-sending infra in this
project — invites are shareable links the owner sends out of band; the
recipient redeems the token once logged in.
"""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from app.core.config import settings
from app.core.supabase import get_supabase
from app.core.auth import get_current_user, ensure_owns_business, ensure_is_owner, get_member_role

router = APIRouter()

INVITE_TTL_DAYS = 7


def _member_with_profile(sb, member: dict) -> dict:
    """Attach email/full_name to a business_members row for display."""
    try:
        email = sb.auth.admin.get_user_by_id(member["user_id"]).user.email
    except Exception:
        email = None
    profile = sb.table("profiles").select("full_name").eq("id", member["user_id"]).limit(1).execute().data
    full_name = profile[0]["full_name"] if profile else None
    return {**member, "email": email, "full_name": full_name}


@router.get("")
async def list_team(business_id: str, user: dict = Depends(get_current_user)):
    ensure_owns_business(business_id, user["id"])
    sb = get_supabase()
    members = (
        sb.table("business_members").select("*")
        .eq("business_id", business_id).order("created_at").execute().data or []
    )
    result = {"members": [_member_with_profile(sb, m) for m in members], "pending_invites": []}

    if get_member_role(business_id, user["id"]) == "owner":
        now = datetime.now(timezone.utc)
        rows = (
            sb.table("business_invites").select("id, role, token, expires_at, created_at, accepted_at")
            .eq("business_id", business_id).order("created_at", desc=True).execute().data or []
        )
        result["pending_invites"] = [
            {k: v for k, v in r.items() if k != "accepted_at"}
            for r in rows
            if not r["accepted_at"] and datetime.fromisoformat(r["expires_at"]) > now
        ]

    return result


class InviteIn(BaseModel):
    business_id: str
    role: str = "member"


@router.post("/invite")
async def invite_member(payload: InviteIn, user: dict = Depends(get_current_user)):
    ensure_is_owner(payload.business_id, user["id"])
    if payload.role != "member":
        raise HTTPException(status_code=400, detail="Invites can only grant the 'member' role")

    token = secrets.token_urlsafe(24)
    expires_at = datetime.now(timezone.utc) + timedelta(days=INVITE_TTL_DAYS)

    sb = get_supabase()
    sb.table("business_invites").insert({
        "business_id": payload.business_id,
        "role": payload.role,
        "token": token,
        "invited_by": user["id"],
        "expires_at": expires_at.isoformat(),
    }).execute()

    return {
        "token": token,
        "invite_url": f"{settings.FRONTEND_URL}/join/{token}",
        "expires_at": expires_at.isoformat(),
    }


class AcceptIn(BaseModel):
    token: str


@router.post("/accept")
async def accept_invite(payload: AcceptIn, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    rows = sb.table("business_invites").select("*").eq("token", payload.token).limit(1).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Invite not found")
    invite = rows[0]

    if invite["accepted_at"]:
        raise HTTPException(status_code=409, detail="This invite has already been used")
    if datetime.fromisoformat(invite["expires_at"]) < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="This invite has expired")

    business_id = invite["business_id"]
    if get_member_role(business_id, user["id"]) is not None:
        raise HTTPException(status_code=409, detail="You're already a member of this business")

    sb.table("business_members").insert({
        "business_id": business_id, "user_id": user["id"],
        "role": invite["role"], "invited_by": invite["invited_by"],
    }).execute()
    sb.table("business_invites").update({
        "accepted_by": user["id"], "accepted_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", invite["id"]).execute()

    return {"business_id": business_id, "role": invite["role"]}


def _ensure_not_last_owner(sb, business_id: str, excluding_member_id: str) -> None:
    other_owners = (
        sb.table("business_members").select("id")
        .eq("business_id", business_id).eq("role", "owner")
        .neq("id", excluding_member_id).limit(1).execute().data
    )
    if not other_owners:
        raise HTTPException(status_code=400, detail="Can't remove/demote the last owner of a business")


class RoleIn(BaseModel):
    role: str


@router.patch("/{member_id}/role")
async def change_role(member_id: str, payload: RoleIn, user: dict = Depends(get_current_user)):
    if payload.role not in ("owner", "member"):
        raise HTTPException(status_code=400, detail="role must be 'owner' or 'member'")

    sb = get_supabase()
    rows = sb.table("business_members").select("*").eq("id", member_id).limit(1).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Member not found")
    member = rows[0]
    ensure_is_owner(member["business_id"], user["id"])

    if member["role"] == "owner" and payload.role == "member":
        _ensure_not_last_owner(sb, member["business_id"], member_id)

    sb.table("business_members").update({"role": payload.role}).eq("id", member_id).execute()
    return {"member_id": member_id, "role": payload.role}


@router.delete("/{member_id}")
async def remove_member(member_id: str, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    rows = sb.table("business_members").select("*").eq("id", member_id).limit(1).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Member not found")
    member = rows[0]
    ensure_is_owner(member["business_id"], user["id"])

    if member["role"] == "owner":
        _ensure_not_last_owner(sb, member["business_id"], member_id)

    sb.table("business_members").delete().eq("id", member_id).execute()
    return {"removed": member_id}

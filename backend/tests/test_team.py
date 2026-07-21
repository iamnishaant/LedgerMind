"""
Team API (Phase 10: Teams & Roles) — DB-backed against the real (dev)
Supabase project.

Covers: the auto-owner trigger, the invite/accept token flow (valid, reused,
expired, already-a-member, unknown-token), role changes, member removal, and
the "can't remove/demote the last owner" guard — plus that a plain member is
rejected from every owner-only action.
"""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from app.api.v1.team import (
    list_team, invite_member, accept_invite, change_role, remove_member,
    InviteIn, AcceptIn, RoleIn,
)
from app.core.auth import get_member_role


@pytest.fixture
def second_user(supabase):
    """A second throwaway auth user, NOT a member of any business by default."""
    email = f"pytest-member-{uuid.uuid4().hex[:10]}@financeos.local"
    user_id = None
    try:
        created = supabase.auth.admin.create_user({
            "email": email, "password": "PytestQA123!", "email_confirm": True,
        })
        user_id = created.user.id
        yield user_id
    finally:
        if user_id:
            try:
                supabase.auth.admin.delete_user(user_id)
            except Exception:
                pass


def _add_member(supabase, business_id, user_id, role="member"):
    return supabase.table("business_members").insert({
        "business_id": business_id, "user_id": user_id, "role": role,
    }).execute().data[0]


async def test_owner_is_auto_added_as_a_member_on_business_creation(qa_business):
    business_id, owner_id = qa_business
    assert get_member_role(business_id, owner_id) == "owner"


async def test_list_team_shows_the_solo_owner(qa_business):
    business_id, owner_id = qa_business
    result = await list_team(business_id, user={"id": owner_id})
    assert len(result["members"]) == 1
    assert result["members"][0]["user_id"] == owner_id
    assert result["members"][0]["role"] == "owner"
    assert result["members"][0]["email"]  # profile enrichment worked


async def test_invite_and_accept_full_round_trip(qa_business, second_user):
    business_id, owner_id = qa_business

    invite = await invite_member(InviteIn(business_id=business_id, role="member"), user={"id": owner_id})
    assert invite["token"]
    assert invite["invite_url"].endswith(f"/join/{invite['token']}")

    result = await accept_invite(AcceptIn(token=invite["token"]), user={"id": second_user})
    assert result == {"business_id": business_id, "role": "member"}
    assert get_member_role(business_id, second_user) == "member"


async def test_invite_by_non_owner_is_rejected(qa_business, second_user, supabase):
    business_id, owner_id = qa_business
    _add_member(supabase, business_id, second_user, role="member")

    with pytest.raises(HTTPException) as exc_info:
        await invite_member(InviteIn(business_id=business_id, role="member"), user={"id": second_user})
    assert exc_info.value.status_code == 403


async def test_invite_cannot_grant_owner_role(qa_business):
    business_id, owner_id = qa_business
    with pytest.raises(HTTPException) as exc_info:
        await invite_member(InviteIn(business_id=business_id, role="owner"), user={"id": owner_id})
    assert exc_info.value.status_code == 400


async def test_accept_unknown_token_is_404():
    with pytest.raises(HTTPException) as exc_info:
        await accept_invite(AcceptIn(token="not-a-real-token"), user={"id": str(uuid.uuid4())})
    assert exc_info.value.status_code == 404


async def test_accept_already_used_invite_is_409(qa_business, second_user):
    business_id, owner_id = qa_business
    invite = await invite_member(InviteIn(business_id=business_id, role="member"), user={"id": owner_id})
    await accept_invite(AcceptIn(token=invite["token"]), user={"id": second_user})

    another_user = str(uuid.uuid4())
    with pytest.raises(HTTPException) as exc_info:
        await accept_invite(AcceptIn(token=invite["token"]), user={"id": another_user})
    assert exc_info.value.status_code == 409


async def test_accept_expired_invite_is_410(qa_business, second_user, supabase):
    business_id, owner_id = qa_business
    invite = await invite_member(InviteIn(business_id=business_id, role="member"), user={"id": owner_id})
    # Force it into the past.
    expired = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    supabase.table("business_invites").update({"expires_at": expired}).eq("token", invite["token"]).execute()

    with pytest.raises(HTTPException) as exc_info:
        await accept_invite(AcceptIn(token=invite["token"]), user={"id": second_user})
    assert exc_info.value.status_code == 410


async def test_accept_by_an_existing_member_is_409(qa_business, second_user, supabase):
    business_id, owner_id = qa_business
    _add_member(supabase, business_id, second_user, role="member")
    invite = await invite_member(InviteIn(business_id=business_id, role="member"), user={"id": owner_id})

    with pytest.raises(HTTPException) as exc_info:
        await accept_invite(AcceptIn(token=invite["token"]), user={"id": second_user})
    assert exc_info.value.status_code == 409


async def test_list_team_hides_pending_invites_from_a_plain_member(qa_business, second_user, supabase):
    business_id, owner_id = qa_business
    _add_member(supabase, business_id, second_user, role="member")
    await invite_member(InviteIn(business_id=business_id, role="member"), user={"id": owner_id})

    as_owner = await list_team(business_id, user={"id": owner_id})
    assert len(as_owner["pending_invites"]) == 1

    as_member = await list_team(business_id, user={"id": second_user})
    assert as_member["pending_invites"] == []


async def test_owner_can_promote_a_member_to_owner(qa_business, second_user, supabase):
    business_id, owner_id = qa_business
    member_row = _add_member(supabase, business_id, second_user, role="member")

    result = await change_role(member_row["id"], RoleIn(role="owner"), user={"id": owner_id})
    assert result["role"] == "owner"
    assert get_member_role(business_id, second_user) == "owner"


async def test_cannot_demote_the_last_owner(qa_business, supabase):
    business_id, owner_id = qa_business
    owner_row = supabase.table("business_members").select("*") \
        .eq("business_id", business_id).eq("user_id", owner_id).execute().data[0]

    with pytest.raises(HTTPException) as exc_info:
        await change_role(owner_row["id"], RoleIn(role="member"), user={"id": owner_id})
    assert exc_info.value.status_code == 400
    assert get_member_role(business_id, owner_id) == "owner"  # unchanged


async def test_demoting_one_of_two_owners_is_allowed(qa_business, second_user, supabase):
    business_id, owner_id = qa_business
    second_owner_row = _add_member(supabase, business_id, second_user, role="owner")

    result = await change_role(second_owner_row["id"], RoleIn(role="member"), user={"id": owner_id})
    assert result["role"] == "member"
    assert get_member_role(business_id, second_user) == "member"
    assert get_member_role(business_id, owner_id) == "owner"  # original owner untouched


async def test_change_role_rejects_invalid_role_value(qa_business, second_user, supabase):
    business_id, owner_id = qa_business
    member_row = _add_member(supabase, business_id, second_user, role="member")

    with pytest.raises(HTTPException) as exc_info:
        await change_role(member_row["id"], RoleIn(role="admin"), user={"id": owner_id})
    assert exc_info.value.status_code == 400


async def test_change_role_by_non_owner_is_rejected(qa_business, second_user, supabase):
    business_id, owner_id = qa_business
    member_row = _add_member(supabase, business_id, second_user, role="member")

    with pytest.raises(HTTPException) as exc_info:
        await change_role(member_row["id"], RoleIn(role="owner"), user={"id": second_user})
    assert exc_info.value.status_code == 403


async def test_owner_can_remove_a_member(qa_business, second_user, supabase):
    business_id, owner_id = qa_business
    member_row = _add_member(supabase, business_id, second_user, role="member")

    result = await remove_member(member_row["id"], user={"id": owner_id})
    assert result == {"removed": member_row["id"]}
    assert get_member_role(business_id, second_user) is None


async def test_cannot_remove_the_last_owner(qa_business, supabase):
    business_id, owner_id = qa_business
    owner_row = supabase.table("business_members").select("*") \
        .eq("business_id", business_id).eq("user_id", owner_id).execute().data[0]

    with pytest.raises(HTTPException) as exc_info:
        await remove_member(owner_row["id"], user={"id": owner_id})
    assert exc_info.value.status_code == 400
    assert get_member_role(business_id, owner_id) == "owner"  # still there


async def test_remove_member_by_non_owner_is_rejected(qa_business, second_user, supabase):
    business_id, owner_id = qa_business
    member_row = _add_member(supabase, business_id, second_user, role="member")

    with pytest.raises(HTTPException) as exc_info:
        await remove_member(member_row["id"], user={"id": second_user})
    assert exc_info.value.status_code == 403
    assert get_member_role(business_id, second_user) == "member"  # unchanged


async def test_remove_member_nonexistent_id_is_404(qa_business):
    business_id, owner_id = qa_business
    with pytest.raises(HTTPException) as exc_info:
        await remove_member(str(uuid.uuid4()), user={"id": owner_id})
    assert exc_info.value.status_code == 404

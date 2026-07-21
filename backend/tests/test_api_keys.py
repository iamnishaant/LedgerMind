"""
API Keys — DB-backed against the real (dev) Supabase project.

Covers key generation (never stores plaintext), the owner-only management
API, and that revocation actually disables the key for lookups.
"""
import uuid

import pytest
from fastapi import HTTPException

from app.api.v1.api_keys import list_api_keys, create_api_key, revoke_api_key, CreateKeyIn
from app.core.api_key_auth import generate_api_key, business_id_for_api_key, KEY_PREFIX, _hash_key


def test_generate_api_key_never_stores_plaintext_but_hash_is_reproducible():
    plaintext, prefix, key_hash = generate_api_key()
    assert plaintext.startswith(KEY_PREFIX)
    assert prefix == plaintext[:12]
    assert key_hash == _hash_key(plaintext)
    assert key_hash != plaintext  # sanity: it's actually hashed, not just echoed


async def test_owner_can_create_and_list_a_key(qa_business):
    business_id, owner_id = qa_business
    created = await create_api_key(CreateKeyIn(business_id=business_id, name="Zapier"), user={"id": owner_id})
    assert created["key"].startswith(KEY_PREFIX)
    assert created["name"] == "Zapier"

    listed = await list_api_keys(business_id, user={"id": owner_id})
    assert len(listed["keys"]) == 1
    assert listed["keys"][0]["id"] == created["id"]
    assert "key" not in listed["keys"][0]
    assert "key_hash" not in listed["keys"][0]


async def test_create_key_by_non_owner_is_rejected(qa_business, supabase):
    business_id, owner_id = qa_business
    member_id = str(uuid.uuid4())
    with pytest.raises(HTTPException) as exc_info:
        await create_api_key(CreateKeyIn(business_id=business_id, name="X"), user={"id": member_id})
    assert exc_info.value.status_code == 403


async def test_create_key_rejects_empty_name(qa_business):
    business_id, owner_id = qa_business
    with pytest.raises(HTTPException) as exc_info:
        await create_api_key(CreateKeyIn(business_id=business_id, name="   "), user={"id": owner_id})
    assert exc_info.value.status_code == 400


async def test_lookup_works_until_revoked(qa_business):
    business_id, owner_id = qa_business
    created = await create_api_key(CreateKeyIn(business_id=business_id, name="Export bot"), user={"id": owner_id})

    assert business_id_for_api_key(created["key"]) == business_id

    result = await revoke_api_key(created["id"], user={"id": owner_id})
    assert result == {"revoked": created["id"]}

    assert business_id_for_api_key(created["key"]) is None


async def test_revoke_by_non_owner_is_rejected(qa_business):
    business_id, owner_id = qa_business
    created = await create_api_key(CreateKeyIn(business_id=business_id, name="X"), user={"id": owner_id})

    with pytest.raises(HTTPException) as exc_info:
        await revoke_api_key(created["id"], user={"id": str(uuid.uuid4())})
    assert exc_info.value.status_code == 403
    assert business_id_for_api_key(created["key"]) == business_id  # unchanged


async def test_revoke_nonexistent_key_is_404(qa_business):
    business_id, owner_id = qa_business
    with pytest.raises(HTTPException) as exc_info:
        await revoke_api_key(str(uuid.uuid4()), user={"id": owner_id})
    assert exc_info.value.status_code == 404


def test_business_id_for_api_key_rejects_non_prefixed_and_unknown_keys():
    assert business_id_for_api_key("not-a-real-key") is None
    assert business_id_for_api_key(KEY_PREFIX + "totally-made-up") is None

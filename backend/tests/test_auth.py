"""
Authorization — DB-backed against the real (dev) Supabase project.

The core property under test: ensure_owns_business() is what stands between
"logged in" and "logged in AND allowed to touch this specific business." The
backend runs on the service-role key (bypasses RLS), so this check is the
only thing enforcing per-business isolation — verified here, not assumed.
"""
import uuid

import pytest
from fastapi import HTTPException

from app.core.auth import ensure_owns_business, ensure_owns_receipt, ensure_owns_budget


def test_owner_is_allowed(qa_business):
    business_id, user_id = qa_business
    ensure_owns_business(business_id, user_id)  # must not raise


def test_non_owner_is_rejected(qa_business):
    business_id, _real_owner_id = qa_business
    someone_else = str(uuid.uuid4())
    with pytest.raises(HTTPException) as exc_info:
        ensure_owns_business(business_id, someone_else)
    assert exc_info.value.status_code == 403


def test_nonexistent_business_is_rejected(qa_business):
    _business_id, user_id = qa_business
    fake_business_id = str(uuid.uuid4())
    with pytest.raises(HTTPException) as exc_info:
        ensure_owns_business(fake_business_id, user_id)
    assert exc_info.value.status_code == 403


def test_ensure_owns_receipt_rejects_nonexistent_receipt(qa_business):
    _business_id, user_id = qa_business
    with pytest.raises(HTTPException) as exc_info:
        ensure_owns_receipt(str(uuid.uuid4()), user_id)
    assert exc_info.value.status_code == 404


def test_ensure_owns_budget_rejects_nonexistent_budget(qa_business):
    _business_id, user_id = qa_business
    with pytest.raises(HTTPException) as exc_info:
        ensure_owns_budget(str(uuid.uuid4()), user_id)
    assert exc_info.value.status_code == 404


def test_ensure_owns_receipt_allows_owner_rejects_others(qa_business, supabase):
    business_id, owner_id = qa_business
    receipt = supabase.table("receipts").insert({
        "business_id": business_id, "uploaded_by": owner_id,
        "storage_path": "test/path.jpg", "file_name": "path.jpg", "status": "pending",
    }).execute().data[0]

    row = ensure_owns_receipt(receipt["id"], owner_id)
    assert row["id"] == receipt["id"]

    with pytest.raises(HTTPException) as exc_info:
        ensure_owns_receipt(receipt["id"], str(uuid.uuid4()))
    assert exc_info.value.status_code == 403

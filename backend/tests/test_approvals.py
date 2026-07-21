"""
Approvals API — DB-backed against the real (dev) Supabase project.

Owner-only decision endpoint gating expenses the Fraud agent flagged
'pending'. Covers the happy path (approve/reject), the owner-only guard, and
the "can't decide twice" state check.
"""
import uuid

import pytest
from fastapi import HTTPException

from app.api.v1.approvals import list_pending_approvals, decide, DecisionIn
from app.core.auth import get_member_role


def _insert_expense(supabase, business_id, *, approval_status="pending", amount=5000.0):
    return supabase.table("expenses").insert({
        "business_id": business_id, "amount": amount, "currency": "INR",
        "vendor_name": "Test Vendor", "category": "Equipment",
        "expense_date": "2026-07-15", "approval_status": approval_status,
    }).execute().data[0]


@pytest.fixture
def second_user(supabase):
    email = f"pytest-approver-{uuid.uuid4().hex[:10]}@financeos.local"
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


async def test_list_pending_only_returns_pending_expenses(qa_business, supabase):
    business_id, owner_id = qa_business
    pending = _insert_expense(supabase, business_id, approval_status="pending")
    _insert_expense(supabase, business_id, approval_status="not_required")
    _insert_expense(supabase, business_id, approval_status="approved")

    result = await list_pending_approvals(business_id, user={"id": owner_id})
    ids = [e["id"] for e in result["pending"]]
    assert ids == [pending["id"]]


async def test_owner_can_approve(qa_business, supabase):
    business_id, owner_id = qa_business
    expense = _insert_expense(supabase, business_id, approval_status="pending")

    result = await decide(expense["id"], DecisionIn(decision="approved"), user={"id": owner_id})
    assert result == {"expense_id": expense["id"], "approval_status": "approved"}

    updated = supabase.table("expenses").select("*").eq("id", expense["id"]).execute().data[0]
    assert updated["approval_status"] == "approved"
    assert updated["approved_by"] == owner_id
    assert updated["approved_at"] is not None


async def test_owner_can_reject_with_a_reason(qa_business, supabase):
    business_id, owner_id = qa_business
    expense = _insert_expense(supabase, business_id, approval_status="pending")

    result = await decide(expense["id"], DecisionIn(decision="rejected", reason="Looks like a duplicate submission"),
                           user={"id": owner_id})
    assert result["approval_status"] == "rejected"

    updated = supabase.table("expenses").select("*").eq("id", expense["id"]).execute().data[0]
    assert updated["approval_status"] == "rejected"
    assert updated["rejection_reason"] == "Looks like a duplicate submission"


async def test_member_cannot_decide(qa_business, second_user, supabase):
    business_id, owner_id = qa_business
    supabase.table("business_members").insert({
        "business_id": business_id, "user_id": second_user, "role": "member",
    }).execute()
    expense = _insert_expense(supabase, business_id, approval_status="pending")

    with pytest.raises(HTTPException) as exc_info:
        await decide(expense["id"], DecisionIn(decision="approved"), user={"id": second_user})
    assert exc_info.value.status_code == 403

    unchanged = supabase.table("expenses").select("approval_status").eq("id", expense["id"]).execute().data[0]
    assert unchanged["approval_status"] == "pending"


async def test_cannot_decide_an_expense_thats_not_pending(qa_business, supabase):
    business_id, owner_id = qa_business
    expense = _insert_expense(supabase, business_id, approval_status="approved")

    with pytest.raises(HTTPException) as exc_info:
        await decide(expense["id"], DecisionIn(decision="rejected"), user={"id": owner_id})
    assert exc_info.value.status_code == 400


async def test_decide_nonexistent_expense_is_404(qa_business):
    business_id, owner_id = qa_business
    with pytest.raises(HTTPException) as exc_info:
        await decide(str(uuid.uuid4()), DecisionIn(decision="approved"), user={"id": owner_id})
    assert exc_info.value.status_code == 404


async def test_decide_rejects_invalid_decision_value(qa_business, supabase):
    business_id, owner_id = qa_business
    expense = _insert_expense(supabase, business_id, approval_status="pending")

    with pytest.raises(HTTPException) as exc_info:
        await decide(expense["id"], DecisionIn(decision="maybe"), user={"id": owner_id})
    assert exc_info.value.status_code == 400

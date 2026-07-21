"""
CSV export — DB-backed against the real (dev) Supabase project.

Covers both auth paths (a normal Supabase session AND an API key), the
month filter, and that an API key from a different business is rejected.
"""
import csv
import io
import uuid

import pytest
from fastapi import HTTPException

from app.api.v1.export import export_expenses_csv
from app.api.v1.api_keys import create_api_key, CreateKeyIn


def _insert_expense(supabase, business_id, *, amount, expense_date, vendor="Test Vendor"):
    return supabase.table("expenses").insert({
        "business_id": business_id, "amount": amount, "currency": "INR",
        "vendor_name": vendor, "category": "Office Supplies", "expense_date": expense_date,
    }).execute().data[0]


def _rows(response) -> list[dict]:
    text = response.body.decode("utf-8")
    return list(csv.DictReader(io.StringIO(text)))


async def test_export_via_session_auth(qa_business, supabase, qa_access_token):
    business_id, owner_id = qa_business
    _insert_expense(supabase, business_id, amount=1000.0, expense_date="2026-07-01")
    _insert_expense(supabase, business_id, amount=2000.0, expense_date="2026-07-15")

    response = await export_expenses_csv(business_id, month=None, authorization=f"Bearer {qa_access_token}")
    assert response.media_type == "text/csv"
    assert 'attachment; filename="expenses.csv"' in response.headers["content-disposition"]

    rows = _rows(response)
    assert len(rows) == 2
    assert {r["amount"] for r in rows} == {"1000.0", "2000.0"}


async def test_export_via_api_key(qa_business, supabase):
    business_id, owner_id = qa_business
    _insert_expense(supabase, business_id, amount=500.0, expense_date="2026-07-01")

    created = await create_api_key(CreateKeyIn(business_id=business_id, name="ERP bot"), user={"id": owner_id})
    response = await export_expenses_csv(business_id, month=None, authorization=f"Bearer {created['key']}")

    rows = _rows(response)
    assert len(rows) == 1
    assert rows[0]["amount"] == "500.0"


async def test_export_month_filter(qa_business, supabase, qa_access_token):
    business_id, owner_id = qa_business
    _insert_expense(supabase, business_id, amount=100.0, expense_date="2026-06-15")
    _insert_expense(supabase, business_id, amount=200.0, expense_date="2026-07-15")

    response = await export_expenses_csv(business_id, month="2026-07", authorization=f"Bearer {qa_access_token}")
    rows = _rows(response)
    assert len(rows) == 1
    assert rows[0]["amount"] == "200.0"


async def test_export_rejects_missing_auth_header(qa_business):
    business_id, _owner_id = qa_business
    with pytest.raises(HTTPException) as exc_info:
        await export_expenses_csv(business_id, month=None, authorization=None)
    assert exc_info.value.status_code == 401


async def test_export_rejects_revoked_api_key(qa_business):
    business_id, owner_id = qa_business
    from app.api.v1.api_keys import revoke_api_key
    created = await create_api_key(CreateKeyIn(business_id=business_id, name="X"), user={"id": owner_id})
    await revoke_api_key(created["id"], user={"id": owner_id})

    with pytest.raises(HTTPException) as exc_info:
        await export_expenses_csv(business_id, month=None, authorization=f"Bearer {created['key']}")
    assert exc_info.value.status_code == 401


async def test_export_rejects_an_api_key_from_a_different_business(qa_business, second_business):
    business_a, owner_a = qa_business
    business_b, owner_b = second_business

    created = await create_api_key(CreateKeyIn(business_id=business_a, name="A's key"), user={"id": owner_a})

    with pytest.raises(HTTPException) as exc_info:
        await export_expenses_csv(business_b, month=None, authorization=f"Bearer {created['key']}")
    assert exc_info.value.status_code == 403

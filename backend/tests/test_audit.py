"""
Audit Log API — DB-backed against the real (dev) Supabase project.

Route functions are called directly (not through a TestClient — no route in
this codebase is, since each is a thin `ensure_owns_business()` + query
wrapper); the aggregation math in audit_summary() is exactly the kind of
logic this project unit-tests elsewhere (e.g. forecast_agent, budgets'
_status_for), so it's covered here alongside the filtering behavior.
"""
import uuid

import pytest
from fastapi import HTTPException

from app.api.v1.audit import list_audit_log, audit_summary


def _insert_run(supabase, business_id, *, agent_name, status, receipt_id=None):
    return supabase.table("agent_runs").insert({
        "business_id": business_id,
        "receipt_id": receipt_id,
        "agent_name": agent_name,
        "status": status,
    }).execute().data[0]


async def test_summary_with_no_runs_is_100pct_success_not_a_zero_division(qa_business):
    business_id, user_id = qa_business
    result = await audit_summary(business_id, user={"id": user_id})
    assert result["total_runs"] == 0
    assert result["failed_runs"] == 0
    assert result["success_rate"] == 100.0
    assert result["by_agent"] == {}


async def test_summary_counts_and_success_rate(qa_business, supabase):
    business_id, user_id = qa_business
    _insert_run(supabase, business_id, agent_name="ocr_agent", status="completed")
    _insert_run(supabase, business_id, agent_name="accounting_agent", status="completed")
    _insert_run(supabase, business_id, agent_name="fraud_agent", status="completed")
    _insert_run(supabase, business_id, agent_name="fraud_agent", status="failed")

    result = await audit_summary(business_id, user={"id": user_id})
    assert result["total_runs"] == 4
    assert result["failed_runs"] == 1
    assert result["success_rate"] == 75.0
    assert result["by_agent"] == {"fraud_agent": 2, "ocr_agent": 1, "accounting_agent": 1}
    assert result["by_status"] == {"completed": 3, "failed": 1}


async def test_list_filters_by_agent_name(qa_business, supabase):
    business_id, user_id = qa_business
    _insert_run(supabase, business_id, agent_name="ocr_agent", status="completed")
    _insert_run(supabase, business_id, agent_name="fraud_agent", status="completed")
    _insert_run(supabase, business_id, agent_name="fraud_agent", status="failed")

    result = await list_audit_log(
        business_id=business_id, agent_name="fraud_agent", status=None, receipt_id=None,
        page=1, limit=50, user={"id": user_id},
    )
    assert len(result["runs"]) == 2
    assert all(r["agent_name"] == "fraud_agent" for r in result["runs"])


async def test_list_filters_by_status(qa_business, supabase):
    business_id, user_id = qa_business
    _insert_run(supabase, business_id, agent_name="ocr_agent", status="completed")
    _insert_run(supabase, business_id, agent_name="fraud_agent", status="failed")

    result = await list_audit_log(
        business_id=business_id, agent_name=None, status="failed", receipt_id=None,
        page=1, limit=50, user={"id": user_id},
    )
    assert len(result["runs"]) == 1
    assert result["runs"][0]["status"] == "failed"


async def test_list_respects_pagination_limit(qa_business, supabase):
    business_id, user_id = qa_business
    for _ in range(5):
        _insert_run(supabase, business_id, agent_name="ocr_agent", status="completed")

    result = await list_audit_log(
        business_id=business_id, agent_name=None, status=None, receipt_id=None,
        page=1, limit=2, user={"id": user_id},
    )
    assert len(result["runs"]) == 2


async def test_non_owner_is_rejected(qa_business):
    business_id, _owner_id = qa_business
    someone_else = str(uuid.uuid4())
    with pytest.raises(HTTPException) as exc_info:
        await list_audit_log(
            business_id=business_id, agent_name=None, status=None, receipt_id=None,
            page=1, limit=50, user={"id": someone_else},
        )
    assert exc_info.value.status_code == 403

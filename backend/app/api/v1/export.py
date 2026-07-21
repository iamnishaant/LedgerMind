"""
Export API — Phase 10 (Enterprise: ERP export)
GET /api/v1/export/expenses.csv → CSV of booked expenses, GST-column-complete
                                   enough to hand to an external accounting/
                                   ERP tool.

Accepts EITHER a normal Supabase session (same as every other endpoint) OR
an API key (Authorization: Bearer fos_...) — the one endpoint in this API
that machine clients actually need. See app/core/api_key_auth.py for why
this dual mode isn't extended to the rest of the API.
"""
from __future__ import annotations

import csv
import io
from typing import Optional

from fastapi import APIRouter, HTTPException, Header, Response

from app.core.supabase import get_supabase
from app.core.auth import get_current_user, ensure_owns_business
from app.core.api_key_auth import KEY_PREFIX, business_id_for_api_key
from app.core.dates import month_bounds

router = APIRouter()

CSV_COLUMNS = [
    "expense_date", "vendor_name", "category", "description", "amount", "currency",
    "gst_number", "gst_rate", "gst_amount", "itc_eligible",
    "fraud_risk", "approval_status",
]


async def _resolve_export_access(business_id: str, authorization: Optional[str]) -> None:
    """Raise 401/403 unless the caller (session or API key) can access business_id."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header")
    token = authorization.split(" ", 1)[1].strip()

    if token.startswith(KEY_PREFIX):
        key_business_id = business_id_for_api_key(token)
        if key_business_id is None:
            raise HTTPException(status_code=401, detail="Invalid or revoked API key")
        if key_business_id != business_id:
            raise HTTPException(status_code=403, detail="This API key doesn't have access to this business")
        return

    user = await get_current_user(authorization)
    ensure_owns_business(business_id, user["id"])


@router.get("/expenses.csv")
async def export_expenses_csv(
    business_id: str,
    month: Optional[str] = None,  # YYYY-MM, same convention as GET /expenses
    authorization: Optional[str] = Header(default=None),
):
    await _resolve_export_access(business_id, authorization)

    sb = get_supabase()
    query = sb.table("expenses").select(",".join(CSV_COLUMNS)).eq("business_id", business_id)
    if month:
        start, end = month_bounds(month)
        query = query.gte("expense_date", start).lt("expense_date", end)
    rows = query.order("expense_date", desc=False).execute().data or []

    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=CSV_COLUMNS, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)

    filename = f"expenses_{month}.csv" if month else "expenses.csv"
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

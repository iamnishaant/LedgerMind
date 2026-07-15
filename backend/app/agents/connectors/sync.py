"""
Connector sync job — shared by the Inngest cron poll AND the manual
"Sync now" endpoint, so both paths are identical by construction.

Burst protection: at most settings.SYNC_MAX_ITEMS_PER_RUN new items are
ingested per run (applies to EVERY run, not just first connect — same guard
covers long offline gaps and bulk-forwarded email too). The remainder is
naturally picked up by the next poll because dedup is ledger-based.
"""
from __future__ import annotations

import time
from datetime import datetime, timezone

from app.core.config import settings
from app.core.supabase import get_supabase
from app.core.ingest import ingest_receipt, run_ingest_pipeline
from app.agents.connectors.base import Connector, ReconnectRequired
from app.agents.connectors.gmail import GmailConnector

_CONNECTORS: dict[str, Connector] = {
    "gmail": GmailConnector(),
    # future: "drive": DriveConnector(), "dropbox": ..., "outlook": ...
}


def get_connector(provider: str) -> Connector:
    try:
        return _CONNECTORS[provider]
    except KeyError:
        raise ValueError(f"No connector implemented for provider '{provider}'")


async def run_sync(account_id: str) -> dict:
    """
    Sync one connected account: list → dedup → fetch → ingest → ledger → audit.
    Returns a small result summary (also written to agent_runs).
    """
    sb = get_supabase()
    started = time.time()

    rows = sb.table("connected_accounts").select("*").eq("id", account_id).limit(1).execute().data
    if not rows:
        return {"error": "account not found", "ingested": 0}
    account = rows[0]
    if account["status"] != "active":
        return {"error": f"account status is '{account['status']}'", "ingested": 0}

    business_id = account["business_id"]
    provider = account["provider"]
    connector = get_connector(provider)

    # The connector has no user identity; attribute automated uploads to the business owner.
    owner = sb.table("businesses").select("owner_id").eq("id", business_id).limit(1).execute().data
    uploaded_by = owner[0]["owner_id"]

    summary = {"provider": provider, "listed": 0, "skipped_dedup": 0, "ingested": 0, "failed": 0, "capped": False}

    try:
        items = await connector.list_new_items(account)
        summary["listed"] = len(items)

        # Dedup against the ledger
        seen = {
            r["external_message_id"]
            for r in (
                sb.table("processed_external_items")
                .select("external_message_id")
                .eq("business_id", business_id).eq("provider", provider)
                .execute().data or []
            )
        }
        fresh = [it for it in items if it.external_id not in seen]
        summary["skipped_dedup"] = len(items) - len(fresh)

        # Burst cap (see module docstring)
        cap = max(1, settings.SYNC_MAX_ITEMS_PER_RUN)
        if len(fresh) > cap:
            summary["capped"] = True
            fresh = fresh[:cap]

        for item in fresh:
            try:
                file_bytes = await connector.fetch_item(account, item)
                receipt_id = await ingest_receipt(
                    business_id=business_id,
                    uploaded_by=uploaded_by,
                    file_bytes=file_bytes,
                    filename=item.filename,
                    content_type=item.mime_type,
                    source=provider,
                )
                # Sequential inline pipeline run — deliberate: paces the OCR/LLM
                # load instead of firing N background tasks at once.
                await run_ingest_pipeline(receipt_id, business_id, uploaded_by, file_bytes)

                sb.table("processed_external_items").insert({
                    "business_id": business_id,
                    "provider": provider,
                    "external_message_id": item.external_id,
                }).execute()

                sb.table("agent_runs").insert({
                    "business_id": business_id,
                    "receipt_id": receipt_id,
                    "agent_name": f"{provider}_connector",
                    "status": "completed",
                    "input_payload": {"source": "automation", "external_id": item.external_id,
                                       "filename": item.filename, "size_bytes": item.size_bytes},
                }).execute()
                summary["ingested"] += 1
            except Exception as e:  # one bad attachment must not kill the batch
                summary["failed"] += 1
                sb.table("agent_runs").insert({
                    "business_id": business_id,
                    "agent_name": f"{provider}_connector",
                    "status": "failed",
                    "input_payload": {"source": "automation", "external_id": item.external_id,
                                       "filename": item.filename},
                    "error_message": str(e)[:500],
                }).execute()

        sb.table("connected_accounts").update({
            "last_synced_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", account_id).execute()

    except ReconnectRequired as e:
        sb.table("connected_accounts").update({"status": "needs_reconnect"}).eq("id", account_id).execute()
        summary["error"] = f"reconnect required: {e}"

    # Run-level audit entry
    sb.table("agent_runs").insert({
        "business_id": business_id,
        "agent_name": f"{provider}_connector",
        "status": "failed" if summary.get("error") else "completed",
        "input_payload": {"source": "automation", "kind": "sync_run"},
        "output_payload": summary,
        "duration_ms": int((time.time() - started) * 1000),
    }).execute()

    return summary

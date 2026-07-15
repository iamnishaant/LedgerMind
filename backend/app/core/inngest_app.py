"""
Inngest — scheduled polling for connected accounts (Phase 8).

The cron function calls the SAME run_sync() as the manual "Sync now" button,
so scheduled and manual ingestion are identical by construction.

Dev note: with INNGEST_EVENT_KEY/SIGNING_KEY blank the client runs in dev
mode; the schedule only actually fires when the Inngest dev server
(`npx inngest-cli@latest dev`) or Inngest Cloud is connected to /api/inngest.
Manual sync works regardless — no Inngest infrastructure required.
"""
from __future__ import annotations

import inngest

from app.core.config import settings
from app.core.supabase import get_supabase
from app.agents.connectors.sync import run_sync

inngest_client = inngest.Inngest(
    app_id="ai-financeos",
    event_key=settings.INNGEST_EVENT_KEY or None,
    is_production=bool(settings.INNGEST_EVENT_KEY and settings.INNGEST_SIGNING_KEY),
)


@inngest_client.create_function(
    fn_id="poll-connected-accounts",
    trigger=inngest.TriggerCron(cron="*/15 * * * *"),
)
async def poll_connected_accounts(ctx: inngest.Context, step: inngest.Step) -> dict:
    """Every 15 min: sync every active connected account (per-run item cap applies)."""
    sb = get_supabase()
    accounts = (
        sb.table("connected_accounts").select("id, provider, business_id")
        .eq("status", "active").execute().data or []
    )
    results = {}
    for account in accounts:
        results[account["id"]] = await run_sync(account["id"])
    return {"accounts_synced": len(accounts), "results": results}


INNGEST_FUNCTIONS = [poll_connected_accounts]

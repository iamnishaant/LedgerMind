-- ============================================================
-- Migration 0003 — Phase 8 (Automation & Integrations)
-- Run this in the Supabase SQL Editor against the LIVE project.
--
-- connected_accounts:        one OAuth connection per (business, provider).
--                            Tokens are Fernet-encrypted by the backend BEFORE
--                            insert — the DB never sees plaintext tokens.
-- processed_external_items:  dedup ledger so a Gmail message is never
--                            ingested twice, even across reconnects.
-- ============================================================

create table public.connected_accounts (
  id                      uuid primary key default uuid_generate_v4(),
  business_id             uuid not null references public.businesses(id) on delete cascade,
  provider                text not null check (provider in ('gmail','drive','dropbox','outlook','whatsapp')),
  encrypted_access_token  text not null,
  encrypted_refresh_token text,
  expires_at              timestamptz,
  scopes                  text[],
  status                  text not null default 'active'
                          check (status in ('active','needs_reconnect','disconnected')),
  last_synced_at          timestamptz,
  created_at              timestamptz not null default now(),
  unique (business_id, provider)
);

create table public.processed_external_items (
  id                  uuid primary key default uuid_generate_v4(),
  business_id         uuid not null references public.businesses(id) on delete cascade,
  provider            text not null,
  external_message_id text not null,
  processed_at        timestamptz not null default now(),
  unique (business_id, provider, external_message_id)
);

-- Polling job scans for active accounts across all businesses
create index connected_accounts_status_idx on public.connected_accounts(status);
create index processed_external_items_lookup_idx
  on public.processed_external_items(business_id, provider, external_message_id);

-- ── RLS (same owner-scoped pattern as receipts/expenses) ──
alter table public.connected_accounts        enable row level security;
alter table public.processed_external_items  enable row level security;

create policy "Connected account access" on public.connected_accounts
  for all using (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  );

create policy "Processed item access" on public.processed_external_items
  for all using (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  );

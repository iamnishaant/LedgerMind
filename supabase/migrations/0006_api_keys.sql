-- ============================================================
-- Migration 0006 — Phase 10 (API keys + ERP export)
-- Run this in the Supabase SQL Editor against the LIVE project.
--
-- Only the SHA-256 hash of a key is ever stored — the plaintext is shown to
-- the owner exactly once, at creation, same as every real API key product.
-- key_prefix (first 12 chars of the plaintext) is stored separately purely
-- for display ("fos_ab12...") so a key can be identified in a list without
-- ever re-deriving or exposing the rest of it.
-- ============================================================

create table public.api_keys (
  id            uuid primary key default uuid_generate_v4(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  name          text not null,
  key_prefix    text not null,
  key_hash      text not null unique,
  created_by    uuid not null references public.profiles(id),
  last_used_at  timestamptz,
  revoked_at    timestamptz,
  created_at    timestamptz not null default now()
);

create index on public.api_keys(business_id);
create index on public.api_keys(key_hash);

alter table public.api_keys enable row level security;

-- Visible to members (so the UI can list them); creation/revocation only
-- ever happens through the backend (service-role key, owner-gated) — same
-- write model as business_members/business_invites.
create policy "API keys visible to members" on public.api_keys
  for select using (is_business_member(business_id));

-- ============================================================
-- Migration 0007 — Correction-Feedback Loop (Phase 2 follow-up)
-- Run this in the Supabase SQL Editor against the LIVE project.
--
-- Every time a human fixes an expense's category, we record it here. That
-- becomes a durable, per-business signal that improves future categorization
-- for THAT business only (see docs/CORRECTION_FEEDBACK_LOOP.md):
--   Tier 1 — a confident vendor→category prior is applied deterministically (no LLM)
--   Tier 2 — recent corrections are injected as few-shot examples for the LLM
-- Cold start (no corrections) → behaviour is identical to before this table existed.
-- ============================================================

create table public.expense_corrections (
  id                 uuid primary key default uuid_generate_v4(),
  business_id        uuid not null references public.businesses(id) on delete cascade,
  expense_id         uuid references public.expenses(id) on delete set null,
  vendor_name        text,
  raw_text_excerpt   text,               -- optional context for few-shot
  original_category  text,
  corrected_category text not null,
  corrected_by       uuid references public.profiles(id),
  created_at         timestamptz not null default now()
);

create index on public.expense_corrections(business_id, vendor_name);
create index on public.expense_corrections(business_id, created_at desc);

alter table public.expense_corrections enable row level security;

-- Same tenancy model as the rest of the app: members can read; the backend
-- (service-role key) writes. is_business_member() already exists (Phase 10).
create policy "Corrections visible to members" on public.expense_corrections
  for select using (is_business_member(business_id));

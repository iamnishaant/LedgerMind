-- ============================================================
-- Migration 0005 — Phase 10 (Approvals workflow)
-- Run this in the Supabase SQL Editor against the LIVE project.
--
-- Expenses the Fraud agent scores as 'high' risk now land in approval_status
-- = 'pending' instead of silently sitting there — an owner must approve or
-- reject them. Everything else defaults to 'not_required': this is an
-- opt-in gate on flagged expenses only, not a blanket approval queue.
-- ============================================================

alter table public.expenses
  add column approval_status text not null default 'not_required'
    check (approval_status in ('not_required','pending','approved','rejected')),
  add column approved_by      uuid references public.profiles(id),
  add column approved_at      timestamptz,
  add column rejection_reason text;

create index on public.expenses(business_id, approval_status)
  where approval_status = 'pending';

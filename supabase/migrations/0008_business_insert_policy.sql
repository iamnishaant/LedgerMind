-- ============================================================
-- Migration 0008 — Fix: self-service business creation blocked by RLS
-- Run this in the Supabase SQL Editor against the LIVE project.
--
-- Regression from 0004_teams.sql: it replaced the old owner-based
-- "Business owner" policy on public.businesses with a membership-based
-- "Business access" (for all using is_business_member(id)). Because a
-- `for all` policy's USING doubles as the INSERT WITH CHECK, INSERT now
-- required is_business_member(NEW.id) — but the owner's membership row is
-- only created by the AFTER INSERT trigger (handle_new_business), so at
-- WITH CHECK time the user is not yet a member. Result: every onboarding
-- insert from the browser client fails with
--   "new row violates row-level security policy for table 'businesses'".
--
-- Fix: a dedicated INSERT policy that lets a user create a business they
-- own. On INSERT, permissive policies' WITH CHECKs are OR-combined, so this
-- unblocks creation while the membership-based policy still governs
-- SELECT/UPDATE/DELETE. owner_id = auth.uid() also stops a client from
-- creating a business owned by someone else.
-- ============================================================

create policy "Create own business" on public.businesses
  for insert with check (owner_id = auth.uid());

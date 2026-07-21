-- ============================================================
-- Migration 0004 — Phase 10 (Teams & Roles)
-- Run this in the Supabase SQL Editor against the LIVE project.
--
-- business_members: who belongs to a business + their role. Every business
--                    always has exactly the owner as a member (auto-created
--                    by a trigger, same pattern as handle_new_user()).
-- business_invites:  token-based invite links (no email-sending infra in
--                     this project — the owner shares the link out of band;
--                     the recipient redeems it once logged in).
--
-- Two roles only: 'owner' (full control) and 'member' (day-to-day access,
-- cannot approve flagged expenses or manage the team). Kept intentionally
-- minimal — a 3rd 'admin' tier can be added later if a real need shows up.
-- ============================================================

create table public.business_members (
  id           uuid primary key default uuid_generate_v4(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  role         text not null default 'member' check (role in ('owner','member')),
  invited_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  unique (business_id, user_id)
);

create table public.business_invites (
  id           uuid primary key default uuid_generate_v4(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  role         text not null default 'member' check (role in ('member')), -- can't invite as owner
  token        text not null unique,
  invited_by   uuid not null references public.profiles(id),
  expires_at   timestamptz not null,
  accepted_by  uuid references public.profiles(id),
  accepted_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index on public.business_members(user_id);
create index on public.business_invites(business_id);

-- ── Auto-create the owner's membership row whenever a business is created ──
-- Mirrors handle_new_user()'s pattern exactly: SECURITY DEFINER so this
-- works regardless of who/what inserted the business row (backend service
-- role, or the browser client's direct insert in onboarding/page.tsx).
create or replace function public.handle_new_business()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.business_members (business_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (business_id, user_id) do nothing;
  return new;
end;
$$;

create trigger on_business_created
  after insert on public.businesses
  for each row execute procedure public.handle_new_business();

-- ── Backfill: every business that already exists gets its owner as a member ──
insert into public.business_members (business_id, user_id, role)
select id, owner_id, 'owner' from public.businesses
on conflict (business_id, user_id) do nothing;

-- ── RLS ──
alter table public.business_members enable row level security;
alter table public.business_invites enable row level security;

-- SECURITY DEFINER helper — avoids RLS self-recursion on business_members
-- (a plain "in (select business_id from business_members where user_id = ...)"
-- policy on business_members itself would recurse into its own policy check).
create or replace function public.is_business_member(target_business_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.business_members
    where business_id = target_business_id and user_id = auth.uid()
  );
$$;

create policy "Member roster visible to members" on public.business_members
  for select using (is_business_member(business_id));

create policy "Invites visible to members" on public.business_invites
  for select using (is_business_member(business_id));

-- No INSERT/UPDATE/DELETE policies on either table: membership changes only
-- ever happen through the backend (service-role key, bypasses RLS) or the
-- SECURITY DEFINER trigger above — same model as every other write path in
-- this project (see auth.py's module docstring).

-- ── Widen existing owner-only policies to the whole team ──
-- Replaces "owner_id = auth.uid()" scoping with membership scoping now that
-- a business can have more than one user. The owner is always a member too
-- (via the trigger above), so nothing an owner could previously do is lost.
drop policy "Business owner" on public.businesses;
create policy "Business access" on public.businesses
  for all using (is_business_member(id));

drop policy "Receipt access" on public.receipts;
create policy "Receipt access" on public.receipts
  for all using (is_business_member(business_id));

drop policy "Expense access" on public.expenses;
create policy "Expense access" on public.expenses
  for all using (is_business_member(business_id));

drop policy "Budget access" on public.budgets;
create policy "Budget access" on public.budgets
  for all using (is_business_member(business_id));

drop policy "Agent run access" on public.agent_runs;
create policy "Agent run access" on public.agent_runs
  for all using (is_business_member(business_id));

drop policy "Connected account access" on public.connected_accounts;
create policy "Connected account access" on public.connected_accounts
  for all using (is_business_member(business_id));

drop policy "Processed item access" on public.processed_external_items;
create policy "Processed item access" on public.processed_external_items
  for all using (is_business_member(business_id));

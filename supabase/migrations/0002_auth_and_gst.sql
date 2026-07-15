-- ============================================================
-- Migration 0002 — Phase 0 (real auth) + Phase 3 (GST Intelligence)
-- Run this in the Supabase SQL Editor against the LIVE project
-- (schema.sql alone won't re-apply to an already-created database).
-- ============================================================

-- ── Phase 0: auto-create a profile row when a new auth user signs up ──
-- Without this, public.profiles never gets populated and every
-- foreign key that references profiles(id) (businesses.owner_id,
-- receipts.uploaded_by, chat_messages.user_id) would fail on first use.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── Phase 3: the vendor's GSTIN as printed on THIS receipt ──
-- (distinct from businesses.gst_number, which is the business's OWN
-- GST registration). Needed for ITC eligibility + audit trail.
alter table public.expenses add column if not exists gst_number text;

create index if not exists expenses_gst_number_idx on public.expenses(business_id, gst_number);

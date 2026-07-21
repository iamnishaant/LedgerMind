-- ============================================================
-- AI FinanceOS — Supabase PostgreSQL Schema
-- Phase 1 MVP, forward-compatible through Phase 10
-- ============================================================

-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "vector"; -- pgvector for Phase 4 RAG

-- ============================================================
-- PROFILES (extends Supabase auth.users)
-- ============================================================
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  full_name    text,
  avatar_url   text,
  plan         text not null default 'free' check (plan in ('free', 'starter', 'professional', 'business', 'enterprise')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ============================================================
-- BUSINESSES (supports multi-branch in Phase 10)
-- ============================================================
create table public.businesses (
  id           uuid primary key default uuid_generate_v4(),
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  name         text not null,
  gst_number   text,                        -- for GST Agent (Phase 3)
  currency     text not null default 'INR', -- multi-currency (Phase 10)
  country      text not null default 'IN',
  metadata     jsonb not null default '{}', -- extensible: branch info, settings, etc.
  created_at   timestamptz not null default now()
);

-- ============================================================
-- TEAMS & ROLES (Phase 10) — who belongs to a business + their role.
-- Every business always has its owner as a member (auto-created by a
-- trigger — see TRIGGERS section below). Two roles only: 'owner' (full
-- control) and 'member' (day-to-day access, no approvals/team management).
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

-- Token-based invite links — no email-sending infra in this project, so the
-- owner shares the link out of band and the recipient redeems it once logged in.
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

-- ============================================================
-- RECEIPTS / DOCUMENTS (raw uploads)
-- ============================================================
create table public.receipts (
  id              uuid primary key default uuid_generate_v4(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  uploaded_by     uuid not null references public.profiles(id),
  storage_path    text not null,               -- Supabase Storage object path
  file_name       text not null,
  file_type       text,                         -- image/pdf/etc.
  status          text not null default 'pending'
                  check (status in ('pending','processing','needs_review','completed','failed')),
  confidence      float,                        -- OCR confidence score (0–1)
  raw_text        text,                         -- full OCR extracted text
  metadata        jsonb not null default '{}',  -- bounding boxes, page count, etc.
  created_at      timestamptz not null default now(),
  processed_at    timestamptz
);

-- ============================================================
-- EXPENSES (core financial record)
-- ============================================================
create table public.expenses (
  id              uuid primary key default uuid_generate_v4(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  receipt_id      uuid references public.receipts(id) on delete set null,

  -- Core fields (Phase 1)
  amount          numeric(15, 2) not null,      -- NEVER store as float
  currency        text not null default 'INR',
  vendor_name     text,
  description     text,
  category        text,                          -- set by Accounting Agent
  expense_date    date not null,

  -- GST fields (Phase 3)
  gst_number      text,                          -- vendor's GSTIN as printed on THIS receipt
  gst_rate        numeric(5, 2),                 -- e.g. 18.00 for 18%
  gst_amount      numeric(15, 2),
  hsn_code        text,
  itc_eligible    boolean default false,

  -- Agent metadata (Phase 2+)
  is_duplicate    boolean default false,
  fraud_risk      text check (fraud_risk in ('low','medium','high')),
  agent_tags      text[],                        -- e.g. ['auto_categorized', 'gst_verified']

  -- Approvals (Phase 10) — the Fraud agent sets 'pending' on 'high' risk;
  -- everything else stays 'not_required'. Opt-in gate, not a blanket queue.
  approval_status  text not null default 'not_required'
                   check (approval_status in ('not_required','pending','approved','rejected')),
  approved_by      uuid references public.profiles(id),
  approved_at      timestamptz,
  rejection_reason text,

  -- Flexible extensibility (Phase 10: multi-branch, ERP tags, etc.)
  metadata        jsonb not null default '{}',

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ============================================================
-- BUDGETS (Phase 5)
-- ============================================================
create table public.budgets (
  id              uuid primary key default uuid_generate_v4(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  name            text not null,
  category        text,
  amount          numeric(15, 2) not null,
  period_type     text not null default 'monthly' check (period_type in ('monthly','quarterly','annual','project')),
  period_start    date not null,
  period_end      date not null,
  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now()
);

-- ============================================================
-- CHAT MESSAGES (Phase 4 — RAG Chat)
-- ============================================================
create table public.chat_messages (
  id              uuid primary key default uuid_generate_v4(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  user_id         uuid not null references public.profiles(id),
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  tool_calls      jsonb,                         -- LLM tool calls/results
  embedding       vector(1536),                  -- pgvector for RAG (Phase 4)
  created_at      timestamptz not null default now()
);

-- ============================================================
-- AGENT RUN LOG (Audit trail — Phase 10)
-- ============================================================
create table public.agent_runs (
  id              uuid primary key default uuid_generate_v4(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  receipt_id      uuid references public.receipts(id),
  agent_name      text not null,                 -- 'ocr_agent', 'accounting_agent', etc.
  status          text not null check (status in ('started','completed','failed','awaiting_human')),
  input_payload   jsonb,
  output_payload  jsonb,
  error_message   text,
  duration_ms     integer,
  created_at      timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================
create index on public.expenses(business_id, expense_date desc);
create index on public.expenses(business_id, category);
create index on public.expenses(business_id, approval_status) where approval_status = 'pending';
create index on public.receipts(business_id, status);
create index on public.agent_runs(business_id, agent_name);
create index on public.chat_messages using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
alter table public.profiles    enable row level security;
alter table public.businesses  enable row level security;
alter table public.business_members enable row level security;
alter table public.business_invites enable row level security;
alter table public.receipts    enable row level security;
alter table public.expenses    enable row level security;
alter table public.budgets     enable row level security;
alter table public.chat_messages enable row level security;
alter table public.agent_runs  enable row level security;

-- Profiles: users can only see/edit their own profile
create policy "Own profile" on public.profiles
  for all using (auth.uid() = id);

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

-- Businesses: any team member (the owner is always a member too)
create policy "Business access" on public.businesses
  for all using (is_business_member(id));

-- Team roster + invites: visible to members. No write policies — membership
-- changes only ever happen through the backend (service-role key, bypasses
-- RLS) or the auto-owner trigger below, same model as every other write
-- path in this project (see auth.py's module docstring).
create policy "Member roster visible to members" on public.business_members
  for select using (is_business_member(business_id));

create policy "Invites visible to members" on public.business_invites
  for select using (is_business_member(business_id));

-- Receipts: scoped to businesses the user is a member of
create policy "Receipt access" on public.receipts
  for all using (is_business_member(business_id));

-- Expenses: scoped to businesses the user is a member of
create policy "Expense access" on public.expenses
  for all using (is_business_member(business_id));

-- Budgets: scoped to businesses the user is a member of
create policy "Budget access" on public.budgets
  for all using (is_business_member(business_id));

-- Chat: scoped to user + business
create policy "Chat access" on public.chat_messages
  for all using (user_id = auth.uid());

-- Agent runs: scoped to businesses the user is a member of
create policy "Agent run access" on public.agent_runs
  for all using (is_business_member(business_id));

-- ============================================================
-- TRIGGERS — auto-update updated_at
-- ============================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_expenses_updated_at
  before update on public.expenses
  for each row execute procedure public.set_updated_at();

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- TRIGGER — auto-create a profile row when a new auth user signs up
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- TRIGGER — auto-create the owner's business_members row (Phase 10)
-- ============================================================
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

-- ============================================================
-- AUTOMATIONS (Phase 8) — OAuth connections + ingest dedup
-- ============================================================
create table public.connected_accounts (
  id                      uuid primary key default uuid_generate_v4(),
  business_id             uuid not null references public.businesses(id) on delete cascade,
  provider                text not null check (provider in ('gmail','drive','dropbox','outlook','whatsapp')),
  encrypted_access_token  text not null,     -- Fernet-encrypted by the backend; never plaintext
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

create index connected_accounts_status_idx on public.connected_accounts(status);
create index processed_external_items_lookup_idx
  on public.processed_external_items(business_id, provider, external_message_id);

alter table public.connected_accounts        enable row level security;
alter table public.processed_external_items  enable row level security;

create policy "Connected account access" on public.connected_accounts
  for all using (is_business_member(business_id));

create policy "Processed item access" on public.processed_external_items
  for all using (is_business_member(business_id));

-- ============================================================
-- API KEYS (Phase 10) — programmatic access for ERP export
-- Only a SHA-256 hash is stored; the plaintext key is shown once, at
-- creation. key_prefix is display-only, for identifying a key in a list.
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

create policy "API keys visible to members" on public.api_keys
  for select using (is_business_member(business_id));

-- ============================================================
-- 0009 — Chat sessions (conversation threads)
--
-- chat_messages was a single flat log per (business, user): every question ever
-- asked ran together, there was no way to start a clean conversation, revisit an
-- earlier one, or delete a thread. This groups messages into named sessions.
--
-- Existing messages are migrated into one "Earlier conversation" session per
-- (business, user) so nothing is lost and history keeps rendering.
-- ============================================================

create table if not exists public.chat_sessions (
  id              uuid primary key default uuid_generate_v4(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  user_id         uuid not null references public.profiles(id),
  title           text not null default 'New chat',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ON DELETE CASCADE: deleting a thread must take its messages with it, which is
-- what "delete this chat" means to the user.
alter table public.chat_messages
  add column if not exists session_id uuid references public.chat_sessions(id) on delete cascade;

-- Session list is always "my threads in this business, most recent first".
create index if not exists chat_sessions_owner_idx
  on public.chat_sessions(business_id, user_id, updated_at desc);

-- Loading a thread reads its messages in order.
create index if not exists chat_messages_session_idx
  on public.chat_messages(session_id, created_at);

-- ── Backfill: adopt orphaned messages into one session per (business, user) ──
do $$
declare
  rec record;
  new_session uuid;
begin
  for rec in
    select distinct business_id, user_id
    from public.chat_messages
    where session_id is null
  loop
    insert into public.chat_sessions (business_id, user_id, title, created_at, updated_at)
    values (
      rec.business_id, rec.user_id, 'Earlier conversation',
      coalesce((select min(created_at) from public.chat_messages
                where business_id = rec.business_id and user_id = rec.user_id), now()),
      coalesce((select max(created_at) from public.chat_messages
                where business_id = rec.business_id and user_id = rec.user_id), now())
    )
    returning id into new_session;

    update public.chat_messages
    set session_id = new_session
    where business_id = rec.business_id
      and user_id = rec.user_id
      and session_id is null;
  end loop;
end $$;

-- ── RLS: same rule as chat_messages — a thread belongs to the user who made it ──
alter table public.chat_sessions enable row level security;

drop policy if exists "Chat session access" on public.chat_sessions;
create policy "Chat session access" on public.chat_sessions
  for all using (user_id = auth.uid());

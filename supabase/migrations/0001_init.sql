-- OSLIFE · initial schema
-- One table per data stream. All rows are scoped to a single user via user_id + RLS.
-- Passively-ingested tables get REPLICA IDENTITY FULL so Supabase Realtime sends the full row.
-- Upserts are idempotent via UNIQUE on external_id / dedup_key.

-- ── Extensions ────────────────────────────────────────────────────────────────
create extension if not exists "pg_cron" with schema "extensions";
create extension if not exists "pgcrypto" with schema "extensions";

-- ── 1. Health ─────────────────────────────────────────────────────────────────
create table if not exists health_daily_stats (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users not null,
  date         date not null,
  steps        integer default 0,
  sleep_min    integer default 0,
  avg_resting_hr integer default 0,
  active_min   integer default 0,
  unique (user_id, date)
);
alter table health_daily_stats enable row level security;
alter table health_daily_stats replica identity full;
create policy "owner" on health_daily_stats for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ── 2. Finance transactions ───────────────────────────────────────────────────
create table if not exists finance_tx (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null,
  occurred_on   date not null,
  amount        numeric(12,2) not null,
  counterparty  text default '',
  description   text default '',
  category      text default 'other',
  dedup_key     text,
  unique (user_id, dedup_key)
);
alter table finance_tx enable row level security;
alter table finance_tx replica identity full;
create policy "owner" on finance_tx for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ── 3. Subscriptions ─────────────────────────────────────────────────────────
create table if not exists subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users not null,
  name            text not null,
  amount          numeric(10,2) not null,
  cadence         text not null default 'monthly',
  next_charge_on  date,
  active          boolean not null default true,
  notes           text
);
alter table subscriptions enable row level security;
create policy "owner" on subscriptions for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ── 4. Gmail inbox ────────────────────────────────────────────────────────────
create table if not exists gmail_messages (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users not null,
  external_id  text not null,
  from_addr    text default '',
  subject      text default '',
  snippet      text default '',
  received_at  timestamptz not null,
  read         boolean not null default false,
  importance   text default 'normal',
  labels       text[] default '{}',
  unique (user_id, external_id)
);
alter table gmail_messages enable row level security;
alter table gmail_messages replica identity full;
create policy "owner" on gmail_messages for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ── 5. Calendar / day blocks ──────────────────────────────────────────────────
create table if not exists day_blocks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  external_id text not null,
  date        date not null,
  start_time  time,
  end_time    time,
  title       text default '',
  description text default '',
  block_type  text default 'personal',
  status      text default 'planned',
  unique (user_id, external_id)
);
alter table day_blocks enable row level security;
alter table day_blocks replica identity full;
create policy "owner" on day_blocks for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ── 6. Projects (Notion) ──────────────────────────────────────────────────────
create table if not exists projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  external_id text not null,
  name        text not null,
  client      text default '',
  domain      text default 'personal',
  status      text default 'lead',
  deadline    date,
  value       numeric(12,2) default 0,
  progress    numeric(5,4) default 0,
  source      text default 'notion',
  unique (user_id, external_id)
);
alter table projects enable row level security;
alter table projects replica identity full;
create policy "owner" on projects for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ── 7. Habits ─────────────────────────────────────────────────────────────────
create table if not exists habits (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid references auth.users not null,
  name      text not null,
  icon      text default '✅',
  color     text,
  active    boolean not null default true,
  order_idx integer default 0
);
alter table habits enable row level security;
create policy "owner" on habits for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table if not exists habit_log (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid references auth.users not null,
  habit_id  uuid references habits not null,
  on_date   date not null,
  done      boolean not null default true,
  unique (habit_id, on_date)
);
alter table habit_log enable row level security;
create policy "owner" on habit_log for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ── 8. Goals ──────────────────────────────────────────────────────────────────
create table if not exists goals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users not null,
  title        text not null,
  domain       text default 'personal',
  target_value numeric(12,2) default 0,
  unit         text default '',
  due_on       date,
  progress     numeric(5,4) default 0,
  status       text default 'active'
);
alter table goals enable row level security;
create policy "owner" on goals for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ── 9. Dog log ────────────────────────────────────────────────────────────────
create table if not exists dog_log (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users not null,
  kind         text not null,
  happened_at  timestamptz not null default now(),
  duration_min integer,
  distance_km  numeric(6,2),
  notes        text
);
alter table dog_log enable row level security;
create policy "owner" on dog_log for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ── 10. Screen time ───────────────────────────────────────────────────────────
create table if not exists screentime (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  usage_date  date not null,
  app_name    text not null,
  duration_ms bigint default 0,
  category    text default 'other',
  dedup_key   text,
  unique (user_id, dedup_key)
);
alter table screentime enable row level security;
create policy "owner" on screentime for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ── 11. Location visits ───────────────────────────────────────────────────────
create table if not exists location_visits (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  date        date not null,
  place_name  text default '',
  place_type  text default '',
  start_at    timestamptz not null,
  end_at      timestamptz,
  dedup_key   text,
  unique (user_id, dedup_key)
);
alter table location_visits enable row level security;
create policy "owner" on location_visits for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ── 12. Spotify history ───────────────────────────────────────────────────────
create table if not exists spotify_history (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  track_name  text not null,
  artist      text default '',
  album       text default '',
  genres      text[] default '{}',
  played_at   timestamptz not null,
  duration_ms integer default 0,
  dedup_key   text,
  unique (user_id, dedup_key)
);
alter table spotify_history enable row level security;
alter table spotify_history replica identity full;
create policy "owner" on spotify_history for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ── 13. Brain state (threads + patterns) ─────────────────────────────────────
create table if not exists brain_state (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users not null unique,
  threads    jsonb default '[]',
  patterns   jsonb default '[]',
  updated_at timestamptz default now()
);
alter table brain_state enable row level security;
create policy "owner" on brain_state for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ── Realtime publication ──────────────────────────────────────────────────────
-- Add passively-ingested tables to the realtime publication so the React app
-- receives live updates when Apps Script / Edge Functions / GitHub Actions write rows.
alter publication supabase_realtime add table health_daily_stats;
alter publication supabase_realtime add table finance_tx;
alter publication supabase_realtime add table gmail_messages;
alter publication supabase_realtime add table day_blocks;
alter publication supabase_realtime add table projects;
alter publication supabase_realtime add table spotify_history;

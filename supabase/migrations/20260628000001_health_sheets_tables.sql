-- Health Sheets ingest — new tables + column additions
-- Triggered by: supabase/functions/health-sheets-ingest

-- ── Extend health_daily_stats with activity columns ───────────────────────────
alter table health_daily_stats
  add column if not exists distance_m    numeric(10,2) default 0,
  add column if not exists calories_kcal numeric(10,2) default 0,
  add column if not exists duration_min  integer       default 0;

-- ── Body metrics (weight + body fat) ─────────────────────────────────────────
create table if not exists health_body_metrics (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users not null,
  datetime     timestamptz not null,
  weight_kg    numeric(6,2),
  body_fat_pct numeric(5,2),
  unique (user_id, datetime)
);
alter table health_body_metrics enable row level security;
alter table health_body_metrics replica identity full;
create policy "owner" on health_body_metrics for all to authenticated
  using  ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ── Sleep sessions ─────────────────────────────────────────────────────────────
create table if not exists health_sleep (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users not null,
  date       date not null,
  start_time timestamptz,
  end_time   timestamptz,
  light_min  integer default 0,
  deep_min   integer default 0,
  rem_min    integer default 0,
  awake_min  integer default 0,
  unique (user_id, date)
);
alter table health_sleep enable row level security;
alter table health_sleep replica identity full;
create policy "owner" on health_sleep for all to authenticated
  using  ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

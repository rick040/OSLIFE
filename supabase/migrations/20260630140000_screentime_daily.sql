-- Per-day screen-time aggregates that aren't per-app: phone unlocks (pickups).
-- Fed by screentime-sheet-ingest from the "Ontgrendelingen" tab.
create table if not exists screentime_daily (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users not null,
  usage_date date not null,
  pickups    integer default 0,
  unique (user_id, usage_date)
);
alter table screentime_daily enable row level security;
alter table screentime_daily replica identity full;
create policy "owner" on screentime_daily for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

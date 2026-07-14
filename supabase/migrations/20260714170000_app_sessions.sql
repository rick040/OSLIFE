-- OSLIFE · per-app foreground sessions → per-app screen time (MacroDroid stopwatch).
--
-- Fills the one gap the README called out: "Per-app duration has no MacroDroid
-- equivalent (no generic foreground-app trigger)". It does per app: a MacroDroid
-- macro runs a stopwatch while an app is in the foreground (App Launched → start,
-- App Closed → stop) and, on close, POSTs the app name + elapsed seconds to
-- phone-events-ingest. That function stores the raw session here and derives the
-- day's per-app total into `screentime` — the same recompute-from-raw pattern
-- that moved pickups from the Schermtijd sheet to `phone_events`.

create table if not exists app_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  app_name    text not null,                       -- the app whose stopwatch this is (e.g. 'YouTube')
  category    text not null default 'other',       -- server-classified: work|social|media|comms|other
  seconds     integer not null,                    -- session length (stopwatch value at App Closed)
  ended_at    timestamptz not null,                -- when the app was closed / stopwatch stopped
  ingested_at timestamptz not null default now(),  -- stamped server-side (trigger below)
  dedup_key   text not null,                        -- `${ended_at_iso}|${app_name}` — idempotent re-sends
  unique (user_id, dedup_key)
);
create index if not exists app_sessions_user_ended_idx on app_sessions (user_id, ended_at);
alter table app_sessions enable row level security;
alter table app_sessions replica identity full;
create policy "owner" on app_sessions for all to authenticated
  using  ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Stamp ingested_at on every write (mirrors migration …120000 / phone_events).
drop trigger if exists set_ingested_at on app_sessions;
create trigger set_ingested_at before insert or update on app_sessions
  for each row execute function public.set_ingested_at();

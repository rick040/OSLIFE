-- OSLIFE · replace the MacroDroid-stopwatch screen-time pipeline with a direct
-- Opened/Closed event log — the same model the "Schermtijd" Apps-Script webhook
-- (Timestamp | App Name | State | Screen Time) already used, just posted
-- straight to Supabase instead of a spreadsheet.
--
-- `app_sessions` (the stopwatch-seconds approach from 20260714170000) is gone:
-- MacroDroid now sends one event per App-Opened/App-Closed trigger, same as it
-- already did for the spreadsheet, so no stopwatch/Magic-Text duration is needed
-- on the phone side. screentime-app-ingest pairs Opened→Closed per app itself.
drop table if exists app_sessions;

-- ── Raw app open/close event log ──────────────────────────────────────────────
create table if not exists screentime_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  app_name    text not null,
  state       text not null check (state in ('Opened', 'Closed')),
  occurred_at timestamptz not null,
  ingested_at timestamptz not null default now(),  -- stamped server-side (trigger below)
  unique (user_id, occurred_at, app_name, state)     -- idempotent re-sends
);
create index if not exists screentime_events_user_app_idx on screentime_events (user_id, app_name, occurred_at);
alter table screentime_events enable row level security;
alter table screentime_events replica identity full;
create policy "owner" on screentime_events for all to authenticated
  using  ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop trigger if exists set_ingested_at on screentime_events;
create trigger set_ingested_at before insert or update on screentime_events
  for each row execute function public.set_ingested_at();

-- ── Clear the stale sheet-imported totals ─────────────────────────────────────
-- `screentime` itself is kept (the frontend reads it as-is); only its rows are
-- wiped so the old Google-Sheet import doesn't mix with the new direct feed.
-- The new totals are recomputed fresh from `screentime_events` as MacroDroid
-- events come in.
truncate table screentime;

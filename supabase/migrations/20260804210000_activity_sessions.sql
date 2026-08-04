-- ── Activity sessions: cycling / in-vehicle detection from MacroDroid ────────
-- Replaces the Google Apps Script "Activiteiten" sheet (doGet appending
-- Started/Stopped rows and pairing them by adjacent-row position) with a
-- direct MacroDroid → activity-ingest → Supabase pipeline.
--
-- The old sheet script paired row N with row N-1, so any "false stop" —
-- MacroDroid's activity-recognition confidence briefly dipping below the
-- threshold and then recovering seconds later — split one real ride into
-- several fragmented rows instead of one continuous session. This table
-- stores one row per continuous session (started_at → ended_at, null while
-- still ongoing) and activity-ingest merges a false stop server-side: a
-- "started" event that arrives within a short grace window of that same
-- activity's last "stopped" event reopens the existing row instead of
-- starting a new one — same merge pattern as location_visits/geofence-ingest.

create table if not exists activity_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null,
  activity_type text not null,               -- 'cycling' | 'in_vehicle' | ...
  started_at    timestamptz not null,
  ended_at      timestamptz,                 -- null while still ongoing
  source        text not null default 'macrodroid',
  ingested_at   timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists activity_sessions_user_type_idx on activity_sessions (user_id, activity_type, ended_at);
create index if not exists activity_sessions_user_started_idx on activity_sessions (user_id, started_at desc);

alter table activity_sessions enable row level security;
alter table activity_sessions replica identity full;
create policy "owner" on activity_sessions for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop trigger if exists set_ingested_at on activity_sessions;
create trigger set_ingested_at before insert or update on activity_sessions
  for each row execute function public.set_ingested_at();

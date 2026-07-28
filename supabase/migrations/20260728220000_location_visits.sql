-- ── Location visits: dwell sessions derived from geofence-ingest ─────────────
-- location_checkins (20260717000000) logs one raw row per accepted "enter"
-- event and is left untouched — run_inference()'s R10 rule reads it and is
-- unaffected by session-level changes here.
--
-- This table adds the enter/leave session geofence-ingest didn't have: each
-- row spans one continuous visit to a place (entered_at → left_at, null while
-- still there). geofence-ingest merges GPS-jitter flapping (a spurious
-- exit+re-entry within a short grace window) by reopening the existing row
-- instead of starting a new one, so a visit's duration survives a brief blip
-- instead of splitting into several short, noisy sessions.

create table if not exists location_visits (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  place_id    text,                          -- MacroDroid geofence id (stable per place)
  place_name  text not null,
  place_type  text,
  lat         numeric(9,6),
  lon         numeric(9,6),
  entered_at  timestamptz not null,
  left_at     timestamptz,                   -- null while still inside
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists location_visits_user_place_idx on location_visits (user_id, place_id, left_at);
create index if not exists location_visits_user_entered_idx on location_visits (user_id, entered_at desc);

alter table location_visits enable row level security;
create policy "owner" on location_visits for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

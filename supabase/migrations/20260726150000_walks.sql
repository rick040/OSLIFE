-- ── Android walk tracker: GPS routes for the Kyra walk-map card ──────────────
-- The standalone Android app (see /android) auto-detects a real dog walk
-- (home-geofence exit/entry, or a car ride immediately before a walk — see
-- /android/README.md) and posts the finished route once, via walk-ingest.
-- Each walk also writes a matching dog_log row (kind='walk') so it shows up
-- in the existing Kyra timeline/coach exactly like a manually logged walk —
-- this table only carries the extra route/GPS detail the map card needs.

create table if not exists walks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null,
  started_at    timestamptz not null,
  ended_at      timestamptz not null,
  duration_min  integer not null,
  distance_km   numeric(6,2) not null default 0,
  points        jsonb not null default '[]'::jsonb, -- [{lat, lon, t}, ...]
  trigger_source text, -- 'home' | 'car_forest' | 'manual'
  dog_log_id    uuid references dog_log(id) on delete set null,
  created_at    timestamptz not null default now()
);

alter table walks enable row level security;
create policy "owner" on walks for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index if not exists walks_user_started_at_idx on walks (user_id, started_at desc);

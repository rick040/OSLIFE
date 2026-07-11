-- OSLIFE · phone-activity events → phone-derived sleep.
--
-- Replicates Samsung Health's "no phone use = asleep" heuristic without a health
-- app: a MacroDroid macro on the phone POSTs a timestamped event on every
-- "Device Unlocked" (picked up) and "Screen Off" (laid down). The
-- phone-events-ingest Edge Function stores them here and derives a sleep session
-- from the longest overnight gap (last activity before bed → first morning
-- unlock), writing it to health_sleep with source='phone'.

-- ── Raw phone-activity event log ──────────────────────────────────────────────
create table if not exists phone_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  ts          timestamptz not null,               -- when the event happened
  kind        text not null,                       -- 'unlock' | 'screen_off' | 'screen_on'
  ingested_at timestamptz not null default now(),  -- stamped server-side (trigger below)
  unique (user_id, ts, kind)                        -- idempotent re-sends
);
create index if not exists phone_events_user_ts_idx on phone_events (user_id, ts);
alter table phone_events enable row level security;
alter table phone_events replica identity full;
create policy "owner" on phone_events for all to authenticated
  using  ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ── Sleep provenance ──────────────────────────────────────────────────────────
-- Distinguish a real Samsung-Health session from a phone-inactivity estimate.
-- Existing rows came from the Health Sheet, so default 'health_app'. The
-- derivation only ever writes/overwrites rows whose source is NOT 'health_app',
-- so real sleep data always wins over an estimate for the same night.
alter table health_sleep
  add column if not exists source text not null default 'health_app';

-- ── Stamp ingested_at on every phone_events write (mirrors migration …120000) ─
drop trigger if exists set_ingested_at on phone_events;
create trigger set_ingested_at before insert or update on phone_events
  for each row execute function public.set_ingested_at();

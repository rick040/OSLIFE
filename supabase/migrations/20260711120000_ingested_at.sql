-- OSLIFE · true "last synced" timestamp for every externally-ingested table.
--
-- The Databronnen (sync-status) screen previously had to infer freshness from
-- the newest row's *natural* timestamp (received_at / date / occurred_on …),
-- which lags for daily feeds and points at planned future items for agenda /
-- payments. This adds an `ingested_at` column that records when a row was
-- actually written, and a BEFORE INSERT OR UPDATE trigger stamps it server-side
-- on EVERY write — so it stays accurate no matter which connection did the
-- write (Edge Function, Apps Script sheet ingest, Gmail/Calendar sync, or the
-- in-app CSV import) without changing any of those writers.
--
-- Only purely-ingested tables get this. projects/clients are edited in-app too
-- and already carry updated_at / synced_at, so they are intentionally left out.

-- ── 1. Add the column (existing rows default to now(), backfilled below) ──────
alter table health_daily_stats  add column if not exists ingested_at timestamptz not null default now();
alter table health_sleep        add column if not exists ingested_at timestamptz not null default now();
alter table health_body_metrics add column if not exists ingested_at timestamptz not null default now();
alter table finance_tx          add column if not exists ingested_at timestamptz not null default now();
alter table payments            add column if not exists ingested_at timestamptz not null default now();
alter table screentime          add column if not exists ingested_at timestamptz not null default now();
alter table gmail_messages      add column if not exists ingested_at timestamptz not null default now();
alter table day_blocks          add column if not exists ingested_at timestamptz not null default now();

-- ── 2. Backfill history from each row's natural timestamp ─────────────────────
-- Done BEFORE the trigger exists so these UPDATEs don't overwrite the estimate
-- with now(). Date-only columns map to end-of-day (best-case for a daily feed).
-- Existing rows thus keep an approximate, honest age instead of all reading
-- "synced just now" until the next real sync.
update health_daily_stats  set ingested_at = (date + time '23:59')::timestamptz;
update health_sleep        set ingested_at = coalesce(end_time, (date + time '23:59')::timestamptz);
update health_body_metrics set ingested_at = datetime;
update finance_tx          set ingested_at = coalesce(paid_at, (occurred_on + time '23:59')::timestamptz);
update payments            set ingested_at = coalesce((due + time '23:59')::timestamptz, now());
update screentime          set ingested_at = (usage_date + time '23:59')::timestamptz;
update gmail_messages      set ingested_at = received_at;
update day_blocks          set ingested_at = (date + time '23:59')::timestamptz;

-- ── 3. Server-side stamp on every write ──────────────────────────────────────
create or replace function public.set_ingested_at()
returns trigger
language plpgsql
as $$
begin
  new.ingested_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'health_daily_stats','health_sleep','health_body_metrics',
    'finance_tx','payments','screentime','gmail_messages','day_blocks'
  ]
  loop
    execute format('drop trigger if exists set_ingested_at on %I', t);
    execute format(
      'create trigger set_ingested_at before insert or update on %I
         for each row execute function public.set_ingested_at()', t);
  end loop;
end $$;

-- OSLIFE · CRM/PM ADHD revamp
-- Four additive pieces on top of the native CRM (20260701120000_crm_native.sql).
-- This migration carries the two that need schema; features 2 (Today focus) and
-- 3 (project templates) are pure client code over existing tables.
--   1. Object-permanence follow-up health on clients
--   4. One-click invoice from unbilled hours (a `billed` flag + one global rate)
-- Everything is additive + idempotent; existing rows keep working untouched.

-- ── 1. Follow-up health on clients ───────────────────────────────────────────
-- last_contacted_at is bumped whenever a message is linked to the client (or by
-- the manual "Contact gelogd" button); follow_up_cycle_days is the per-client
-- cadence the health dot (green/yellow/red) is measured against.
alter table public.clients
  add column if not exists last_contacted_at    timestamptz,
  add column if not exists follow_up_cycle_days integer not null default 30;

-- ── 4a. Mark hours as billed once an invoice draws from them ──────────────────
alter table public.project_hours
  add column if not exists billed boolean not null default false;

-- ── 4b. App settings — one owner-scoped row holding the global hourly rate ────
create table if not exists public.app_settings (
  user_id     uuid primary key references auth.users not null,
  hourly_rate numeric not null default 0,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
alter table public.app_settings enable row level security;
alter table public.app_settings replica identity full;
create policy "owner" on public.app_settings for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ── Realtime ─────────────────────────────────────────────────────────────────
-- Idempotent: `alter publication ... add table` errors if already a member.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_settings'
  ) then
    execute 'alter publication supabase_realtime add table public.app_settings';
  end if;
end $$;

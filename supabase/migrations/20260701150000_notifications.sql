-- notifications — proactive Telegram nudges (morning briefing, evening
-- check-in reminder, habit reminders, urgent alerts). notification_prefs
-- links a Telegram chat to the one OSLIFE user and holds per-category
-- toggles + timing; notification_log is the idempotency ledger so the
-- notify-tick Edge Function (fired every 5 min by pg_cron) never double-sends
-- even if a tick fires a few minutes off-schedule.
--
-- The actual `cron.schedule(...)` call is NOT in this migration — it embeds
-- a bearer secret (CRON_SECRET) that must never be committed to git. Run it
-- once by hand in the Supabase SQL Editor (see docs/SECRETS.md).

-- pg_net lets a pg_cron job reach an Edge Function's HTTPS URL via net.http_post.
create extension if not exists "pg_net";

-- ── notification_prefs ───────────────────────────────────────────────────────
create table if not exists public.notification_prefs (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade unique,
  telegram_chat_id   bigint,             -- set only by telegram-webhook on /start
  telegram_username  text,               -- set only by telegram-webhook on /start
  linked_at          timestamptz,        -- set only by telegram-webhook on /start
  morning_briefing   boolean not null default true,
  evening_checkin    boolean not null default true,
  habit_reminders    boolean not null default true,
  urgent_alerts      boolean not null default true,
  morning_time       time not null default '07:30',
  evening_time       time not null default '20:00',
  habit_time         time not null default '21:00',
  quiet_hours_start  time,               -- null = disabled; applies to urgent_alerts only
  quiet_hours_end    time,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.notification_prefs enable row level security;

create policy "owner" on public.notification_prefs
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Surface live link-status/toggle changes to the app, like daily_checkin.
alter publication supabase_realtime add table public.notification_prefs;

-- ── notification_log — idempotency / dedup ledger ────────────────────────────
-- kind: 'morning' | 'evening_checkin' | 'habit_reminder' |
--       'urgent_payment' | 'urgent_thread' | 'urgent_project_blocked'
-- dedup_key: the date (YYYY-MM-DD) for the three daily slots, or the
-- underlying row's id for urgent alerts (payment.id / thread.id / project.id).
-- An insert into this table IS the "claim" — the unique constraint makes
-- dedup atomic even if two ticks race.
create table if not exists public.notification_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null,
  dedup_key  text not null,
  sent_at    timestamptz not null default now(),
  unique (user_id, kind, dedup_key)
);

alter table public.notification_log enable row level security;

create policy "owner" on public.notification_log
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

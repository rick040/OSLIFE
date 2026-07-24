-- Nudges — proactive Telegram interactions throughout the day, beyond the
-- three fixed daily slots (morning briefing, evening check-in, habit
-- reminders). notify-tick rolls a small random chance of firing one each
-- tick while inside the active window, so timing is unpredictable rather
-- than landing on a fixed minute. "Last sent" is looked up from
-- notification_log (kind='nudge') instead of a dedicated timestamp column,
-- reusing the existing claim()/dedup ledger rather than a parallel one.

alter table public.notification_prefs
  add column if not exists nudges_enabled boolean not null default false,
  add column if not exists nudges_per_day smallint not null default 3
    check (nudges_per_day between 1 and 12),
  add column if not exists nudge_categories text[] not null default array['task', 'sharp', 'suggestion', 'checkin']
    check (nudge_categories <@ array['task', 'sharp', 'suggestion', 'checkin']::text[]);

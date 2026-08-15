-- OSLIFE · read telemetry — one row per screen opened.
--
-- The 2026-08-15 field study could measure writes but never reads, so every
-- verdict about a read-only screen (Gezondheid, Locaties, Kennisbank,
-- Verbanden, Reflectie, Inbox) was explicitly unfalsifiable: a screen whose
-- value is in *looking* leaves no trace in a row count, and "no writes" was
-- indistinguishable from "never opened".
--
-- This is the smallest thing that fixes that. It exists so nav prominence can
-- be decided by measurement instead of intention — a screen earns its slot by
-- being opened, and loses it the same way — and so the archived screens can be
-- reviewed on real evidence on 2026-09-15 rather than re-argued.
--
-- Deliberately minimal: no session id, no duration, no referrer, no device.
-- Those are answers to questions nobody is asking yet, and an unused column is
-- exactly the pattern this redesign is cutting.
create table if not exists screen_views (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid references auth.users not null,
  view      text not null,           -- a nav.ts View id (free text: the union changes faster than a constraint should)
  opened_at timestamptz not null default now()
);

-- The only query this table is for: "which screens did I open, and when",
-- newest first, over a date range.
create index if not exists screen_views_user_opened_idx
  on screen_views (user_id, opened_at desc);

alter table screen_views enable row level security;

create policy "owner" on screen_views for all to authenticated
  using  ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

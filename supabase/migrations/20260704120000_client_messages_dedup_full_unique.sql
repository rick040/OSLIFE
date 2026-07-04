-- Fix: WhatsApp import (and any client_messages upsert) silently imported 0 rows.
--
-- The app upserts with `ON CONFLICT (user_id, source, external_id) DO NOTHING`
-- (src/lib/supabase.ts insertMessages). The dedup index was PARTIAL
-- (`WHERE external_id IS NOT NULL`), and Postgres cannot use a partial index as
-- a conflict arbiter from a plain column list — it raises
--   "there is no unique or exclusion constraint matching the ON CONFLICT specification"
-- so every import threw and returned 0.
--
-- Recreate it as a full unique index so the column-list conflict target matches.
-- NULL external_ids (manual messages) remain distinct under a normal unique
-- index, so multiple manual rows are still allowed; only non-null external_ids
-- (WhatsApp/Fiverr/Gmail-sourced) dedupe.
drop index if exists public.client_messages_dedup;
create unique index if not exists client_messages_dedup
  on public.client_messages (user_id, source, external_id);

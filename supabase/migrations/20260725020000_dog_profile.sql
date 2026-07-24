-- ── Dog (Kyra) profile persistence + full dog_log columns ───────────────────
-- Two bugs this fixes:
--   1. dogProfile (name/breed/birthdate/weight/vet/photo) only ever lived in
--      the client's zustand-persist localStorage blob — never in Supabase — so
--      it showed up empty (NaN age, 0 kg) on any fresh device/browser. Reuses
--      app_settings (already the one-row-per-user settings table) instead of a
--      new table, since this is exactly more per-user app settings.
--   2. dog_log only ever stored kind/happened_at/duration_min/distance_km/notes.
--      weight_kg, location, photo, poop_consistency and training_type were
--      collected in the UI (EntryFields) but silently dropped on write, so a
--      logged weight entry vanished on reload.

alter table public.app_settings
  add column if not exists dog_name       text,
  add column if not exists dog_breed      text,
  add column if not exists dog_birthdate  date,
  add column if not exists dog_weight_kg  numeric(5,2),
  add column if not exists dog_vet        text,
  add column if not exists dog_photo      text;

alter table public.dog_log
  add column if not exists weight_kg        numeric(5,2),
  add column if not exists location         text,
  add column if not exists photo            text,
  add column if not exists poop_consistency smallint,
  add column if not exists training_type    text;

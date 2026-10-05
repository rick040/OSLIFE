-- OSLIFE · full smart-scale body composition on health_body_metrics.
--
-- Until now the table only had weight_kg + body_fat_pct, so everything else a
-- smart scale measures (muscle ratio, body water, bone mass, visceral fat, BMR,
-- …) was thrown away at ingest. The gym wall display (/tablet/workout) charts
-- these, so store them. All columns are nullable: every scale reports a
-- different subset, and a reading that only has a weight stays valid.
--
-- Writers: weight-ingest (MacroDroid, structured JSON or labelled notification
-- text), health-ingest (body[] rows), integrations/apps-script/health-sheets.gs
-- (Samsung Health "Gewicht" sheet).

alter table health_body_metrics
  add column if not exists bmi                    numeric(4,1),
  add column if not exists muscle_mass_kg         numeric(6,2),
  add column if not exists muscle_pct             numeric(5,2),  -- "spierpercentage" / muscle ratio
  add column if not exists skeletal_muscle_kg     numeric(6,2),
  add column if not exists skeletal_muscle_pct    numeric(5,2),
  add column if not exists fat_free_mass_kg       numeric(6,2),
  add column if not exists body_water_pct         numeric(5,2),
  add column if not exists bone_mass_kg           numeric(5,2),
  add column if not exists protein_pct            numeric(5,2),
  add column if not exists subcutaneous_fat_pct   numeric(5,2),
  add column if not exists visceral_fat           numeric(5,1),  -- index/level, unitless
  add column if not exists bmr_kcal               integer,
  add column if not exists metabolic_age          integer;

-- Realtime so a fresh weigh-in shows up on the gym display without a reload.
-- The client already subscribes to this table (store.ts syncSlices), but it was
-- never added to the publication, so those change events never fired.
alter table health_body_metrics replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'health_body_metrics'
  ) then
    execute 'alter publication supabase_realtime add table health_body_metrics';
  end if;
end $$;

-- Snapshot the library thumbnail/gif on each workout exercise so the visual
-- workout screen doesn't need a runtime join back to the (client-only) exercise
-- library dataset. Null for custom (non-library) exercises.
alter table workout_exercises add column if not exists image_url text;
alter table workout_exercises add column if not exists gif_url text;

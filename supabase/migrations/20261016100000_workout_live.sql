-- Workout remote mode: one live row per user that the big screen (the gym
-- tablet's WorkoutMode) and the phone (/remote) both read and write through
-- Supabase Realtime. The screen shows the exercise, image and progress; the
-- phone is only the controls (kg, reps, set loggen, vorige/volgende oefening).
--
-- It is deliberately NOT workout_sessions (that's the finished-workout history
-- that logWorkoutSession writes when "Voltooien" is pressed). This row is
-- ephemeral cursor state for the workout that is running right now:
--
--   * `sets` holds the per-set kg/reps/logged table, keyed by exercise id, so
--     both devices agree on every set - not just the current one. The "current
--     kg and reps" are simply sets[exercise][set_idx].
--   * `exercises` is a small snapshot of the plan (id, name, muscle group,
--     targets) so the phone is self-contained: it needs no other OSLIFE data
--     loaded to render the controls.
--   * The row is never deleted. A new workout upserts over it and a finished
--     one flips status to 'ended'. That keeps `rev` strictly increasing across
--     workouts, which is what both clients use to ignore stale/duplicate
--     realtime events (no clock comparison between devices).
--   * `updated_by` is a random per-client id, so a device can recognise and
--     skip the echo of its own write instead of ping-ponging state.
create table if not exists workout_live (
  user_id          uuid primary key references auth.users on delete cascade,
  status           text not null default 'active' check (status in ('active', 'ended')),
  plan_id          uuid,                 -- no FK: a deleted plan must not block cleanup
  plan_name        text,
  exercises        jsonb not null default '[]'::jsonb,
  sets             jsonb not null default '{}'::jsonb,
  exercise_idx     integer not null default 0,
  set_idx          integer not null default 0,
  finish_requested boolean not null default false,  -- phone asks the screen to save + close
  updated_by       text,
  rev              integer not null default 1,
  updated_at       timestamptz not null default now()
);

alter table workout_live enable row level security;
create policy "owner" on workout_live for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- rev/updated_at are server-owned so clients can't skew them.
create or replace function public.workout_live_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.rev := old.rev + 1;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists workout_live_touch on workout_live;
create trigger workout_live_touch before update on workout_live
  for each row execute function public.workout_live_touch();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'workout_live'
  ) then
    execute 'alter publication supabase_realtime add table workout_live';
  end if;
end $$;

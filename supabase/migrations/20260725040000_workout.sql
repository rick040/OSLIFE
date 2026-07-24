-- Workout module: plans (recurring split day + target exercises), logged
-- sessions, and the sets within a session. Mirrors the projects/project_tasks
-- shape (a plan owns exercises; a session owns sets) rather than one big
-- denormalized table.

-- ── Plans (the recurring split, e.g. "Chest + triceps" on Fridays) ───────────
create table if not exists workout_plans (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null,
  name          text not null,
  day_of_week   smallint,              -- 0=Sun..6=Sat, null = no fixed day
  muscle_groups text[] not null default '{}',
  color         text,
  order_idx     integer not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
alter table workout_plans enable row level security;
create policy "owner" on workout_plans for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ── Exercises within a plan (the template — targets, not actuals) ───────────
create table if not exists workout_exercises (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users not null,
  plan_id      uuid references workout_plans(id) on delete cascade not null,
  name         text not null,
  muscle_group text not null,
  target_sets  integer not null default 3,
  target_reps  text not null default '8-12',
  order_idx    integer not null default 0,
  created_at   timestamptz not null default now()
);
alter table workout_exercises enable row level security;
create policy "owner" on workout_exercises for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create index if not exists workout_exercises_plan_idx on workout_exercises (plan_id);

-- ── Logged sessions (an actual workout, optionally against a plan) ──────────
create table if not exists workout_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users not null,
  plan_id      uuid references workout_plans(id) on delete set null,
  plan_name    text,                   -- snapshot so history survives a renamed/deleted plan
  started_at   timestamptz not null default now(),
  completed_at timestamptz,
  duration_min integer,
  notes        text,
  created_at   timestamptz not null default now()
);
alter table workout_sessions enable row level security;
alter table workout_sessions replica identity full;
create policy "owner" on workout_sessions for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create index if not exists workout_sessions_started_idx on workout_sessions (user_id, started_at);

-- ── Sets logged within a session ─────────────────────────────────────────────
create table if not exists workout_sets (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null,
  session_id    uuid references workout_sessions(id) on delete cascade not null,
  exercise_id   uuid references workout_exercises(id) on delete set null,
  exercise_name text not null,         -- snapshot so history survives an edited/deleted exercise
  muscle_group  text not null,
  set_number    integer not null default 1,
  weight_kg     numeric(6,2),
  reps          integer,
  created_at    timestamptz not null default now()
);
alter table workout_sets enable row level security;
alter table workout_sets replica identity full;
create policy "owner" on workout_sets for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create index if not exists workout_sets_session_idx on workout_sets (session_id);

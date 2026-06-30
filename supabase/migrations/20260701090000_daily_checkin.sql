-- daily_checkin — the one signal no sensor captures: how Rick actually felt.
-- A lightweight per-day energy (1-5) + mood (1-5) + optional note, captured in
-- the app. This is what lets REFLECT compute energy↔spend, energy↔screentime
-- and meetings↔energy correlations instead of treating energy as a constant.

create table if not exists public.daily_checkin (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  date       date not null,
  energy     int check (energy between 1 and 5),
  mood       int check (mood between 1 and 5),
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

alter table public.daily_checkin enable row level security;

-- Match the project-wide convention: one owner-scoped ALL policy.
create policy "owner" on public.daily_checkin
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Surface live updates to the app like the other passively-synced tables.
alter publication supabase_realtime add table public.daily_checkin;

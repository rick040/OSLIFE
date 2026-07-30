-- OSLIFE · North Star (Noordster) milestones — actually persisted.
--
-- store.milestones (the sub-goals shown under a North Star goal) was never
-- written to Supabase at all: addGoalMilestone/toggleMilestone/
-- deleteGoalMilestone were pure in-memory Zustand mutations with no
-- Supabase call, no backing table, nothing. buildMemorySnapshot() narrates
-- it to HEYRA as fact ("Mijlpalen binnen 7 dagen: …") and the suggestion
-- engine builds chips off it, but a reload, a different device, or a
-- cleared cache silently lost every one of these with nothing in the UI
-- saying so — flagged as the most severe finding in the 2026-07-29 data
-- audit and the redesign proposal's §03.
--
-- Mirrors project_milestones' shape/RLS (20260701120000_crm_native.sql)
-- exactly, minus `progress` — the Milestone type (src/types.ts) has no
-- progress field, only title/done/due, so this doesn't invent a column
-- nothing reads.

create table if not exists goal_milestones (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  goal_id     uuid references goals(id) on delete cascade not null,
  title       text not null,
  due_date    date,
  done        boolean not null default false,
  order_idx   integer default 0,
  created_at  timestamptz default now()
);
alter table goal_milestones enable row level security;
alter table goal_milestones replica identity full;
create policy "owner" on goal_milestones for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create index if not exists goal_milestones_goal_idx on goal_milestones(goal_id);

-- Realtime, same as project_milestones/heyra_memory — a milestone added or
-- ticked off on one device shows up on another.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'goal_milestones'
  ) then
    execute 'alter publication supabase_realtime add table goal_milestones';
  end if;
end $$;

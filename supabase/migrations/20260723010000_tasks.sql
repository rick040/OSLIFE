-- OSLIFE · Tasks — real per-row storage for open loops/reminders, replacing
-- the JSONB `brain_state.threads` blob. Today every task edit (addTask,
-- closeThread, reopenThread, updateThread) rewrites the ENTIRE threads array
-- back to one upserted brain_state row — a whole-blob write on every single
-- task change, and a race under concurrent tabs/devices (last-write-wins on
-- the full array). A proper table gives each task its own row and its own
-- targeted UPDATE, which also happens to be what HEYRA's chat-driven action
-- cards (Phase 2) need to reliably create/close a task from natural language.
--
-- This is additive — brain_state.threads is left in place as a frozen/legacy
-- column for one release (loadLiveData() reads both for a transition period)
-- and is not dropped here. See docs/CODEBASE_MAP.md for the cutover plan.

create table if not exists tasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  domain      text not null,
  title       text not null,
  owed_to     text not null default 'self (HEYRA)',
  due         date,
  status      text not null default 'open' check (status in ('open', 'closed')),
  priority    text check (priority is null or priority in ('High', 'Medium', 'Low')),
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists tasks_user_status_idx on tasks (user_id, status);
create index if not exists tasks_user_due_idx on tasks (user_id, due) where status = 'open';

alter table tasks enable row level security;
create policy "owner" on tasks for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

alter table tasks replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks'
  ) then
    execute 'alter publication supabase_realtime add table tasks';
  end if;
end $$;

insert into type_registry (type, label, default_domains, default_tier, projection_table) values
  ('task', 'Taak', array['work'], 'normaal', 'tasks')
on conflict (type) do nothing;

drop trigger if exists emit_event on tasks;
create trigger emit_event after insert or update on tasks
  for each row execute function public.emit_event();

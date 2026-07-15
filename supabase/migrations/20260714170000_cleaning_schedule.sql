-- ADHD-proof cleaning schedule: per-task-per-day completion log.
-- The schedule itself (zones, tasks) is static content shipped in the client
-- (src/cleaning/schedule.ts), so only completions need a table.
create table if not exists cleaning_log (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid references auth.users not null,
  task_key text not null,
  on_date  date not null,
  done     boolean not null default true,
  unique (user_id, task_key, on_date)
);
alter table cleaning_log enable row level security;
create policy "owner" on cleaning_log for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index if not exists cleaning_log_on_date_idx on cleaning_log (user_id, on_date);

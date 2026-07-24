-- Subtask checklist for the Taken (tasks) screen redesign.
alter table tasks
  add column if not exists checklist jsonb not null default '[]'::jsonb;

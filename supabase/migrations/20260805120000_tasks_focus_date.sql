-- OSLIFE · "Belangrijkste vandaag" — the day's most important tasks.
--
-- The dashboard needs a small, deliberate shortlist of what actually matters
-- today, not just "whatever sorts highest". A pin is a date rather than a
-- boolean so it expires on its own: yesterday's three don't silently become
-- today's three, and the history of what was picked on a given day stays
-- readable. null = not pinned.
alter table tasks
  add column if not exists focus_date date;

-- The dashboard's only query against this column: today's pins for this user,
-- including already-closed ones (the block shows progress, so it can't filter
-- on status).
create index if not exists tasks_user_focus_idx on tasks (user_id, focus_date)
  where focus_date is not null;

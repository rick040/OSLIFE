-- ── HEYRA learned memory ──────────────────────────────────────────────────────
-- One jsonb row per user holding the durable facts HEYRA has learned about Rick
-- while talking to him — preferences, working style, relationships, recurring
-- context. This is the "learn as we speak" layer: distinct from brain_state
-- (open loops + reflect patterns, which are derived from live data), these are
-- things only surfaced by conversation and worth remembering across sessions.
-- Same single-row-per-user + RLS shape as brain_state.

create table if not exists heyra_memory (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users not null unique,
  facts      jsonb default '[]',
  updated_at timestamptz default now()
);

alter table heyra_memory enable row level security;
create policy "owner" on heyra_memory for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Realtime so a fact learned on one device shows up on another. Idempotent:
-- only add to the publication when not already a member.
alter table heyra_memory replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'heyra_memory'
  ) then
    execute 'alter publication supabase_realtime add table heyra_memory';
  end if;
end $$;

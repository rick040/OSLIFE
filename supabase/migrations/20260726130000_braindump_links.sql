-- ── Braindump: link a capture to something it belongs to ──────────────────────
-- Tags say *what kind of thing* a braindump is; this says *where it lives*.
-- Rick wants to file a capture under an existing task or Kennisbank entry
-- ("apply this to somewhere") rather than only tag/domain it. A small
-- polymorphic join table — no new columns on braindump_entries, no schema
-- change needed as more linkable types show up later (just widen the check).

create table if not exists braindump_links (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users not null,
  braindump_entry_id  uuid references braindump_entries(id) on delete cascade not null,
  linked_type         text not null check (linked_type in ('task', 'wiki_entry')),
  linked_id           uuid not null,
  created_at          timestamptz not null default now(),
  unique (braindump_entry_id, linked_type, linked_id)
);

create index if not exists braindump_links_entry_idx on braindump_links (braindump_entry_id);
create index if not exists braindump_links_target_idx on braindump_links (linked_type, linked_id);

alter table braindump_links enable row level security;
create policy "owner" on braindump_links for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Realtime so a link made on one device shows up live everywhere else.
alter table braindump_links replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'braindump_links'
  ) then
    execute 'alter publication supabase_realtime add table braindump_links';
  end if;
end $$;

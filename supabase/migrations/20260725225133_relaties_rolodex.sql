-- OSLIFE · Relaties rolodex redesign — extra contactvelden, tags, en connecties
-- tussen mensen. Additief op de Slice 2 `person`/`interaction` tabellen.

-- ── 1. Extra contactvelden + tags op `person` ─────────────────────────────────
alter table person
  add column if not exists company       text,
  add column if not exists job_title     text,
  add column if not exists instagram_url text,
  add column if not exists linkedin_url  text,
  add column if not exists twitter_url   text,
  add column if not exists website_url   text,
  add column if not exists tags          text[] not null default '{}';

-- ── 2. Connecties tussen mensen (rolodex-netwerk) ─────────────────────────────
create table if not exists person_connection (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null,
  person_a_id   uuid references person(id) on delete cascade not null,
  person_b_id   uuid references person(id) on delete cascade not null,
  label         text not null default 'Connectie',   -- bv. collega, partner, geïntroduceerd door
  note          text,
  created_at    timestamptz not null default now(),
  constraint person_connection_distinct check (person_a_id <> person_b_id)
);
create index if not exists person_connection_user_idx on person_connection (user_id);
create index if not exists person_connection_a_idx on person_connection (person_a_id);
create index if not exists person_connection_b_idx on person_connection (person_b_id);
-- Eén rij per paar, ongeacht de volgorde waarin de twee ids zijn opgegeven.
create unique index if not exists person_connection_pair_uniq
  on person_connection (user_id, least(person_a_id, person_b_id), greatest(person_a_id, person_b_id));

alter table person_connection enable row level security;
alter table person_connection replica identity full;
create policy "owner" on person_connection for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='person_connection') then
    alter publication supabase_realtime add table person_connection;
  end if;
end $$;

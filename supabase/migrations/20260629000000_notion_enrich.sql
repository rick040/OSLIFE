-- Enrich projects table with fields from the richer Notion sync
alter table projects
  add column if not exists notion_url  text,
  add column if not exists type        text[] default '{}',
  add column if not exists prioriteit  text,
  add column if not exists start_datum date;

-- Clients table — mirrors the Notion Clients database
create table if not exists clients (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null,
  external_id   text not null,
  notion_url    text,
  name          text not null,
  client_status text,
  crm_status    text,
  first_contact date,
  email         text,
  website_url   text,
  potentie      text,
  scope         numeric(12,2),
  domain        text default 'personal',
  synced_at     timestamptz default now(),
  unique (user_id, external_id)
);

alter table clients enable row level security;
alter table clients replica identity full;
create policy "owner" on clients for all to authenticated
  using  ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

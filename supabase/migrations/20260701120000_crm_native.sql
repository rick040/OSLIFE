-- OSLIFE · native CRM
-- Turns Projecten/CRM from a read-only Notion mirror into a fully in-app
-- project manager: clients ←→ projects, plus a per-project template
-- (hours tracker, milestones, recurring tasks, activity log, invoices) and a
-- unified client message inbox (email / fiverr / whatsapp).
--
-- All tables are owner-scoped via user_id + RLS and added to the realtime
-- publication so the React store stays live. Everything here is additive —
-- existing Notion-synced rows in projects/clients keep working untouched.

-- ── Projects: extra fields for the project sheet ─────────────────────────────
alter table projects
  add column if not exists client_id    uuid references clients(id) on delete set null,
  add column if not exists deliverables text[] default '{}',
  add column if not exists scope_text   text,
  add column if not exists notes        text,
  add column if not exists archived     boolean not null default false,
  add column if not exists updated_at    timestamptz default now();

create index if not exists projects_client_id_idx on projects(client_id);

-- In-app created clients/projects still need a (user_id, external_id) value to
-- satisfy the existing unique constraint. The app generates `local-<uuid>` ids
-- for those; Notion-synced rows keep their Notion page id.

-- ── Project milestones ───────────────────────────────────────────────────────
create table if not exists project_milestones (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  project_id  uuid references projects(id) on delete cascade not null,
  title       text not null,
  due_date    date,
  progress    numeric(5,4) not null default 0,   -- 0..1
  done        boolean not null default false,
  order_idx   integer default 0,
  created_at  timestamptz default now()
);
alter table project_milestones enable row level security;
alter table project_milestones replica identity full;
create policy "owner" on project_milestones for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create index if not exists project_milestones_project_idx on project_milestones(project_id);

-- ── Project tasks (one-time or recurring) ────────────────────────────────────
create table if not exists project_tasks (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users not null,
  project_id      uuid references projects(id) on delete cascade not null,
  name            text not null,
  done            boolean not null default false,
  due_date        date,
  priority        text,                            -- High | Medium | Low
  recurrence      text,                            -- daily | weekly | monthly | null (one-time)
  recur_every     integer default 1,              -- e.g. every 2 weeks
  last_done_on    date,
  order_idx       integer default 0,
  created_at      timestamptz default now()
);
alter table project_tasks enable row level security;
alter table project_tasks replica identity full;
create policy "owner" on project_tasks for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create index if not exists project_tasks_project_idx on project_tasks(project_id);

-- ── Project hours (time tracker) ─────────────────────────────────────────────
create table if not exists project_hours (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  project_id  uuid references projects(id) on delete cascade not null,
  on_date     date not null,
  hours       numeric(6,2) not null default 0,
  note        text,
  billable    boolean not null default true,
  created_at  timestamptz default now()
);
alter table project_hours enable row level security;
alter table project_hours replica identity full;
create policy "owner" on project_hours for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create index if not exists project_hours_project_idx on project_hours(project_id);

-- ── Project invoices ─────────────────────────────────────────────────────────
create table if not exists project_invoices (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  project_id  uuid references projects(id) on delete cascade not null,
  number      text default '',
  amount      numeric(12,2) not null default 0,
  status      text not null default 'draft',       -- draft | sent | paid | overdue
  issued_on   date,
  due_on      date,
  paid_on     date,
  note        text,
  created_at  timestamptz default now()
);
alter table project_invoices enable row level security;
alter table project_invoices replica identity full;
create policy "owner" on project_invoices for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create index if not exists project_invoices_project_idx on project_invoices(project_id);

-- ── Project activity log ─────────────────────────────────────────────────────
-- Free-text notes that the app analyses and (optionally) links to a task or
-- milestone, recording whatever action it took.
create table if not exists project_activity (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  project_id  uuid references projects(id) on delete cascade not null,
  body        text not null,
  link_type   text,                                -- task | milestone | null
  link_id     uuid,
  action      text,                                -- completed | progress | linked | null
  created_at  timestamptz default now()
);
alter table project_activity enable row level security;
alter table project_activity replica identity full;
create policy "owner" on project_activity for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create index if not exists project_activity_project_idx on project_activity(project_id);

-- ── Client messages (unified inbox) ──────────────────────────────────────────
-- email / fiverr / whatsapp, pulled from Gmail, imported from WhatsApp exports
-- or added by hand. Grouped into conversations via contact_key.
create table if not exists client_messages (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users not null,
  client_id    uuid references clients(id) on delete set null,
  project_id   uuid references projects(id) on delete set null,
  channel      text not null default 'email',      -- email | fiverr | whatsapp
  direction    text not null default 'in',         -- in | out
  contact      text default '',
  contact_key  text default '',
  subject      text,
  snippet      text default '',
  body         text,
  ts           timestamptz not null default now(),
  unread       boolean not null default true,
  source       text default 'manual',              -- manual | gmail | whatsapp_import | fiverr
  external_id  text,
  created_at   timestamptz default now()
);
alter table client_messages enable row level security;
alter table client_messages replica identity full;
create policy "owner" on client_messages for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create index if not exists client_messages_client_idx on client_messages(client_id);
create index if not exists client_messages_contact_idx on client_messages(contact_key);
-- Dedup imported/synced messages (manual rows have null external_id → not constrained).
create unique index if not exists client_messages_dedup
  on client_messages(user_id, source, external_id)
  where external_id is not null;

-- ── Realtime ─────────────────────────────────────────────────────────────────
-- Idempotent: `alter publication ... add table` errors if the table is already
-- a member, so add each one only when it isn't published yet.
do $$
declare t text;
begin
  foreach t in array array[
    'project_milestones','project_tasks','project_hours',
    'project_invoices','project_activity','client_messages','clients'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;

-- OSLIFE · Fiverr client/project intake pipeline
-- Additive only. Reuses existing conventions rather than introducing new ones:
--   - Fiverr username per client -> clients.aliases (already used this way for
--     to2bi9 / rosie_bel09 / noortjeqff / etc. — no new column needed).
--   - client_messages already has channel='fiverr', source='gmail_sync' and a
--     (user_id, source, external_id) dedup unique index — reused as-is.
--   - projects.status is free text (no enum) — 'draft' is a new value, no
--     schema change needed.
--
-- New pieces:
--   1. service_packages: manually-maintained pricing reference the intake
--      drafting step checks before estimating a price.
--   2. project_invoices.document_url: link to the generated proposal/invoice
--      Google Doc, following the plain-nullable-url convention already used
--      by projects.notion_url / clients.notion_url.

create table if not exists service_packages (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid references auth.users not null,
  name               text not null,
  description        text,
  default_specs      text[] default '{}',   -- e.g. '{"4 Instagram posts","5 Instagram stories"}'
  unit               text default 'package', -- package | hour | item | ...
  default_unit_price numeric(12,2),
  active             boolean not null default true,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);
alter table service_packages enable row level security;
alter table service_packages replica identity full;
create policy "owner" on service_packages for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create index if not exists service_packages_active_idx on service_packages(user_id, active);

alter table project_invoices
  add column if not exists document_url text;

-- ── Realtime ─────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['service_packages'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;

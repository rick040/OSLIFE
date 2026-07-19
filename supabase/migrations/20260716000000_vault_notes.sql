-- OSLIFE · vault notes — Obsidian-shaped Markdown mirror of prose content
-- (braindump entries, interaction summaries, period summaries, client
-- messages), written by the materialize-note Edge Function. Postgres stays
-- the source of truth (RLS, realtime, search_memory's hybrid recall); this
-- bucket is a generated, re-creatable mirror, not a second copy to hand-sync.
--
-- Deliberately excludes numeric/structured data (finance, health, habits) —
-- see docs/SECRETS.md and the materialize-note function header for scope.
--
-- Same private-bucket + owner-scoped-storage-policy shape as the existing
-- `braindump` bucket (20260702170000_braindump.sql).

insert into storage.buckets (id, name, public)
values ('vault', 'vault', false)
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'vault owner read') then
    create policy "vault owner read" on storage.objects for select to authenticated
      using (bucket_id = 'vault' and owner = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'vault owner write') then
    create policy "vault owner write" on storage.objects for insert to authenticated
      with check (bucket_id = 'vault' and owner = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'vault owner update') then
    create policy "vault owner update" on storage.objects for update to authenticated
      using (bucket_id = 'vault' and owner = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'vault owner delete') then
    create policy "vault owner delete" on storage.objects for delete to authenticated
      using (bucket_id = 'vault' and owner = (select auth.uid()));
  end if;
end $$;

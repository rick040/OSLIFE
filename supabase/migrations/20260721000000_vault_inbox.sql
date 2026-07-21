-- OSLIFE · vault-inbox — the write direction of the Obsidian integration.
-- `vault` (20260716000000_vault_notes.sql) is a generated, read-only mirror:
-- OSLIFE writes it, nobody hand-edits it. This bucket is the opposite: Rick
-- drops a plain Markdown note here (from Obsidian, synced over the S3
-- protocol — see docs/SECRETS.md §7), and vault-inbox-sync (pg_cron, same
-- shared-secret pattern as notify-tick/embed-memory-backfill) picks it up,
-- creates a braindump_entries row, and moves the file under `processed/` so
-- the same note is never re-ingested. Postgres stays the one source of
-- truth — this bucket is just the inbox tray, not a second copy to hand-sync.
--
-- Same private-bucket + owner-scoped-storage-policy shape as `vault`/`braindump`.

insert into storage.buckets (id, name, public)
values ('vault-inbox', 'vault-inbox', false)
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'vault-inbox owner read') then
    create policy "vault-inbox owner read" on storage.objects for select to authenticated
      using (bucket_id = 'vault-inbox' and owner = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'vault-inbox owner write') then
    create policy "vault-inbox owner write" on storage.objects for insert to authenticated
      with check (bucket_id = 'vault-inbox' and owner = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'vault-inbox owner update') then
    create policy "vault-inbox owner update" on storage.objects for update to authenticated
      using (bucket_id = 'vault-inbox' and owner = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'vault-inbox owner delete') then
    create policy "vault-inbox owner delete" on storage.objects for delete to authenticated
      using (bucket_id = 'vault-inbox' and owner = (select auth.uid()));
  end if;
end $$;

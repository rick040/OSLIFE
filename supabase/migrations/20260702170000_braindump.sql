-- ── Braindump v2: universal capture → Markdown log ────────────────────────────
-- One row per shared/captured item. The share sheet (or the in-app capture box)
-- inserts a `pending` row instantly; the braindump-ingest edge function (and, for
-- media, the braindump-worker) then fills in the derived Markdown, a one-line
-- summary, the app taxonomy (domain/kind/sentiment), tags and a thumbnail, and
-- flips status to `ready`. The `markdown` column is the lightweight "MD file" that
-- Heyra and OSLife read as context. Same single-owner + RLS + realtime shape as
-- the other app-owned tables (see 20260702120000_heyra_memory.sql).

create table if not exists braindump_entries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users not null,
  created_at   timestamptz default now(),
  source_kind  text not null default 'text',   -- text|link|image|pdf|youtube|instagram|pinterest|video|audio|file
  status       text not null default 'pending', -- pending|processing|ready|failed
  title        text,
  source_url   text,                            -- original link (null for shared files)
  markdown     text,                            -- the lightweight MD "file" (the deliverable)
  summary      text,                            -- one-line, for the grid card
  domain       text,                            -- Domain enum (reuses app taxonomy)
  kind         text,                            -- ItemKind enum
  sentiment    text,                            -- Sentiment enum
  tags         text[] default '{}',
  thumb_url    text,                            -- Storage URL of the thumbnail
  meta         jsonb default '{}',              -- per-type extras (channel, author, pages, duration, ocr…)
  error        text                             -- populated when status='failed'
);

create index if not exists braindump_entries_user_created_idx
  on braindump_entries (user_id, created_at desc);

alter table braindump_entries enable row level security;
create policy "owner" on braindump_entries for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Realtime so an item shared on the phone streams into an open grid on the laptop,
-- and so the pending → ready enrichment upgrade shows up live. Idempotent add.
alter table braindump_entries replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'braindump_entries'
  ) then
    execute 'alter publication supabase_realtime add table braindump_entries';
  end if;
end $$;

-- ── Storage bucket for thumbnails + transient media processing ─────────────────
-- Private bucket. Thumbnails are kept; originals uploaded for processing are
-- deleted by braindump-ingest / braindump-worker after the derived MD is written.
insert into storage.buckets (id, name, public)
values ('braindump', 'braindump', false)
on conflict (id) do nothing;

-- Owner-scoped storage policies (the service role used by the edge function /
-- worker bypasses RLS, so these govern only client access to the user's own files).
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'braindump owner read') then
    create policy "braindump owner read" on storage.objects for select to authenticated
      using (bucket_id = 'braindump' and owner = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'braindump owner write') then
    create policy "braindump owner write" on storage.objects for insert to authenticated
      with check (bucket_id = 'braindump' and owner = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'braindump owner delete') then
    create policy "braindump owner delete" on storage.objects for delete to authenticated
      using (bucket_id = 'braindump' and owner = (select auth.uid()));
  end if;
end $$;

-- ── Kennisbank: curated wiki entries distilled from braindump captures ───────────
-- Rick shares plenty of one-off things into the braindump (an interesting
-- Instagram post, an idea worth stealing) that are worth more than a searchable
-- note — he wants some of them turned into a small wiki: the original
-- transcript, the key takeaway, and how it could apply to him / his projects /
-- projects he hasn't thought of yet. Not everything qualifies, so this is a
-- suggest-then-confirm flow (same shape as the inference engine): braindump-ingest
-- asks Claude to flag entries that look like an actionable idea/insight and
-- proposes a wiki entry (status='suggested'); Rick confirms or rejects it in the
-- Kennisbank view. Only confirmed entries get materialised as a real .md file in
-- the vault (materialize-note) — rejected suggestions never touch the vault.

create table if not exists wiki_entries (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users not null,
  braindump_entry_id  uuid references braindump_entries(id) on delete set null,
  created_at          timestamptz default now(),
  confirmed_at        timestamptz,
  status              text not null default 'suggested', -- suggested|confirmed|rejected
  title               text not null,
  transcript          text not null,   -- the original captured content (braindump markdown)
  takeaway            text not null,   -- key takeaway, in Rick's own context
  application         text not null,   -- how this could apply to him / his projects / future projects
  domain              text,           -- Domain enum (reuses app taxonomy)
  tags                text[] default '{}',
  source_url          text
);

create index if not exists wiki_entries_user_created_idx
  on wiki_entries (user_id, created_at desc);

alter table wiki_entries enable row level security;
create policy "owner" on wiki_entries for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Realtime so a suggestion from the ingest pipeline shows up live in Kennisbank.
alter table wiki_entries replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wiki_entries'
  ) then
    execute 'alter publication supabase_realtime add table wiki_entries';
  end if;
end $$;

-- ── Confirm/reject (mirrors confirm_inference) ────────────────────────────────
-- SECURITY DEFINER with its own authorization check: a signed-in user may only
-- resolve their own suggestions; a service-role call (no JWT) is trusted.
create or replace function public.confirm_wiki_entry(p_id uuid, p_decision text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.wiki_entries%rowtype;
begin
  select * into w from public.wiki_entries where id = p_id;
  if not found then return false; end if;
  if w.status <> 'suggested' then return false; end if;

  if auth.uid() is not null and auth.uid() <> w.user_id then
    raise exception 'not authorized to resolve this wiki entry';
  end if;

  if p_decision = 'confirm' then
    update public.wiki_entries set status = 'confirmed', confirmed_at = now() where id = p_id;
  elsif p_decision = 'reject' then
    update public.wiki_entries set status = 'rejected' where id = p_id;
  else
    raise exception 'p_decision must be confirm or reject';
  end if;

  return true;
end;
$$;

grant execute on function public.confirm_wiki_entry(uuid, text) to authenticated, anon, service_role;

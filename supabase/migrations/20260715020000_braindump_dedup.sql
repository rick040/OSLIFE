-- OSLIFE · Braindump dedup — content-hash based duplicate detection.
--
-- Additive only. braindump-ingest computes a hash of the meaningful content
-- (normalised text/URL, or file bytes) before writing a `ready` row; if an
-- existing `ready` entry for the same user shares the same hash within the
-- lookback window, the new row is marked `duplicate` instead — visible and
-- recoverable in the Capture grid, but excluded from search_memory() so
-- re-shares never pollute recall. `status` has no check constraint, so
-- introducing the 'duplicate' value needs no schema change beyond the column.

alter table braindump_entries add column if not exists content_hash text;
create index if not exists braindump_entries_user_hash_idx on braindump_entries(user_id, content_hash);

-- search_memory(): add an explicit status filter to the braindump branch so
-- duplicate/failed/pending/processing rows never surface in retrieval
-- (belt-and-suspenders alongside the existing tier filter). Same signature as
-- 20260715000000_memory_embeddings.sql, so a plain create-or-replace is fine.
create or replace function public.search_memory(p_query text, p_limit int default 8, p_query_embedding vector(1024) default null)
returns table (id uuid, source text, title text, snippet text, ts timestamptz, rank real)
language sql
security invoker
set search_path = ''
as $$
  with q as (select websearch_to_tsquery('dutch', coalesce(p_query, '')) as tsq)
  select h.id, h.source, h.title, h.snippet, h.ts,
         case
           when p_query_embedding is null or h.embedding is null then h.text_rank
           else h.text_rank * 0.5 + (1 - (h.embedding <=> p_query_embedding)) * 0.5
         end as rank
  from (
    select b.id, 'braindump'::text as source,
           coalesce(b.title, '(capture)') as title,
           left(coalesce(b.summary, b.markdown, ''), 240) as snippet,
           b.created_at as ts,
           ts_rank(to_tsvector('dutch', coalesce(b.title,'') || ' ' || coalesce(b.summary,'') || ' ' || coalesce(b.markdown,'')), q.tsq) as text_rank,
           b.embedding
    from public.braindump_entries b, q
    where b.tier <> 'geheim' and b.status = 'ready'
      and to_tsvector('dutch', coalesce(b.title,'') || ' ' || coalesce(b.summary,'') || ' ' || coalesce(b.markdown,'')) @@ q.tsq
    union all
    select i.id, 'interaction', coalesce(i.summary, '(contact)'),
           left(coalesce(i.summary,''), 240), i.occurred_at,
           ts_rank(to_tsvector('dutch', coalesce(i.summary,'')), q.tsq),
           i.embedding
    from public.interaction i, q
    where i.tier <> 'geheim' and i.summary is not null
      and to_tsvector('dutch', coalesce(i.summary,'')) @@ q.tsq
    union all
    select s.id, 'summary', s.domain || ' ' || s.period,
           left(s.text, 240), s.created_at,
           ts_rank(to_tsvector('dutch', s.text), q.tsq),
           s.embedding
    from public.summaries s, q
    where s.tier <> 'geheim'
      and to_tsvector('dutch', s.text) @@ q.tsq
  ) h
  order by rank desc
  limit greatest(1, least(coalesce(p_limit, 8), 50));
$$;

grant execute on function public.search_memory(text, int, vector) to authenticated, service_role;

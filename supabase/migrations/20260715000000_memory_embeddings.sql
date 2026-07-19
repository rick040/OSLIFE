-- OSLIFE · vector memory upgrade — wires the pgvector extension (already
-- installed, see 20260714150000_memory_retrieval.sql) behind search_memory()
-- now that an embedding provider (Voyage AI, VOYAGE_API_KEY) has been chosen.
--
-- Additive only: every column is nullable and search_memory() falls back to
-- its existing full-text-only behaviour whenever an embedding is absent (no
-- key configured, or a row not embedded yet) — exactly the same
-- "app never breaks without this key" contract ANTHROPIC_API_KEY already has.

create extension if not exists vector with schema extensions;

alter table braindump_entries add column if not exists embedding vector(1024);
alter table interaction        add column if not exists embedding vector(1024);
alter table summaries          add column if not exists embedding vector(1024);

-- No ivfflat/hnsw index yet — this is a single-user app with a small row
-- count, so a sequential scan over embeddings is fine. Add an index once the
-- table sizes actually warrant it.

-- ── search_memory(): hybrid full-text + cosine-similarity recall ──────────────
-- Backward compatible: p_query_embedding defaults to null, in which case the
-- score is identical to the pre-existing ts_rank-only behaviour. When an
-- embedding IS supplied, rows with an embedding blend ts_rank with cosine
-- similarity (1 - cosine distance); rows without one (not embedded yet) keep
-- their plain ts_rank. tier='geheim' stays excluded exactly as before.
--
-- The old 2-arg signature is dropped first: adding a parameter is not a
-- signature-compatible `create or replace`, it would otherwise leave both the
-- old and new function overloaded side by side.
drop function if exists public.search_memory(text, int);

create function public.search_memory(p_query text, p_limit int default 8, p_query_embedding vector(1024) default null)
returns table (id uuid, source text, title text, snippet text, ts timestamptz, rank real)
language sql
security invoker
set search_path = ''
as $$
  with q as (select websearch_to_tsquery('dutch', coalesce(p_query, '')) as tsq)
  select h.id, h.source, h.title, h.snippet, h.ts,
         case
           when p_query_embedding is null or h.embedding is null then h.text_rank
           -- search_path='' means the pgvector `<=>` operator (installed in the
           -- `extensions` schema, not pg_catalog) won't resolve unqualified —
           -- must use OPERATOR(schema.op) to keep the hardened search_path.
           else h.text_rank * 0.5 + (1 - (h.embedding OPERATOR(extensions.<=>) p_query_embedding)) * 0.5
         end as rank
  from (
    select b.id, 'braindump'::text as source,
           coalesce(b.title, '(capture)') as title,
           left(coalesce(b.summary, b.markdown, ''), 240) as snippet,
           b.created_at as ts,
           ts_rank(to_tsvector('dutch', coalesce(b.title,'') || ' ' || coalesce(b.summary,'') || ' ' || coalesce(b.markdown,'')), q.tsq) as text_rank,
           b.embedding
    from public.braindump_entries b, q
    where b.tier <> 'geheim'
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

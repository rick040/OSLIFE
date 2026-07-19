-- OSLIFE · Business ideas — Strategie HQ becomes an overview of every business
-- idea Rick has captured (voice note or text), each fully elaborated by Claude
-- into a feasibility score, timeline, milestones, financials, risks,
-- opportunities and a SWOT analysis, plus a complete Markdown write-up.
-- Same single-owner + RLS + realtime + event-spine shape as every other
-- fact table; the vector column follows the same "additive, nullable,
-- search_memory() degrades to full-text-only without it" contract as
-- braindump_entries/interaction/summaries (20260715000000_memory_embeddings.sql).

create table if not exists business_ideas (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references auth.users not null,

  -- capture
  source                text not null default 'text' check (source in ('voice','text')),
  raw_input             text,                                   -- original transcript/typed text

  -- elaboration pipeline (idea-elaborate edge function)
  elaboration_status    text not null default 'pending' check (elaboration_status in ('pending','processing','ready','failed')),
  error                 text,

  -- lifecycle (user-managed, independent of elaboration_status)
  status                text not null default 'idea' check (status in ('idea','active','parked','archived')),

  -- core write-up
  title                 text not null,
  overview              text,
  domain                text not null default 'cross',
  tags                  text[] not null default '{}',

  -- strategic analysis (all AI-elaborated, all editable afterwards)
  feasibility_score     int check (feasibility_score is null or (feasibility_score >= 0 and feasibility_score <= 100)),
  feasibility_reasoning text,
  timeline              text,                                   -- narrative timeline
  milestones            jsonb not null default '[]',             -- [{title, due, done}]
  financials            jsonb not null default '{}',             -- {investmentNeeded, revenueProjection:[{period,amount}], costs:[{label,amount}], breakEven, notes}
  risks                 jsonb not null default '[]',              -- [{risk, impact, mitigation}]
  opportunities         jsonb not null default '[]',              -- [{opportunity, potential}]
  swot                  jsonb not null default '{}',              -- {strengths:[], weaknesses:[], opportunities:[], threats:[]}

  -- the full write-up, "volledig in md formaat" — this is what materialize-note mirrors
  markdown              text,

  tier                  text not null default 'normaal' check (tier in ('normaal','geheim')),
  embedding             vector(1024),

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists business_ideas_user_created_idx on business_ideas (user_id, created_at desc);

alter table business_ideas enable row level security;
create policy "owner" on business_ideas for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter table business_ideas replica identity full;
alter publication supabase_realtime add table business_ideas;

-- ── type-registry + event-spine mirroring (same pattern as every Slice 2 table) ──
insert into type_registry (type, label, default_domains, default_tier, projection_table) values
  ('business_idea', 'Business-idee', array['work'], 'normaal', 'business_ideas')
on conflict (type) do nothing;

drop trigger if exists emit_event on business_ideas;
create trigger emit_event after insert or update on business_ideas
  for each row execute function public.emit_event();

-- ── search_memory(): add business_ideas as a 4th recall source ────────────────
-- Full re-definition (same reasoning as 20260715020000_braindump_dedup.sql —
-- a function body can't be diffed, so every migration touching it restates
-- the whole thing). Only elaborated (status='ready'), non-geheim ideas surface.
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
    union all
    select bi.id, 'business_idea', coalesce(bi.title, '(idee)'),
           left(coalesce(bi.overview, bi.markdown, ''), 240), bi.created_at,
           ts_rank(to_tsvector('dutch', coalesce(bi.title,'') || ' ' || coalesce(bi.overview,'') || ' ' || coalesce(bi.markdown,'')), q.tsq),
           bi.embedding
    from public.business_ideas bi, q
    where bi.tier <> 'geheim' and bi.elaboration_status = 'ready'
      and to_tsvector('dutch', coalesce(bi.title,'') || ' ' || coalesce(bi.overview,'') || ' ' || coalesce(bi.markdown,'')) @@ q.tsq
  ) h
  order by rank desc
  limit greatest(1, least(coalesce(p_limit, 8), 50));
$$;

grant execute on function public.search_memory(text, int, vector) to authenticated, service_role;

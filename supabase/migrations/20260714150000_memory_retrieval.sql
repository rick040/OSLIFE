-- OSLIFE · Slice 3 — geheugen & retrieval: samenvattingen + tier-veilige zoek.
--
-- Twee stukken van de PM-201 geheugenarchitectuur:
--   1. `summaries` + build_summaries() — nachtelijke roll-up die de ruwe events/
--      projecties indikt tot leesbare dag-digests, zodat oude data compact
--      opvraagbaar blijft (fase 4: gearchiveerde samenvattingen).
--   2. search_memory() — de retrieval-primitive. Postgres full-text search
--      (config 'dutch') over de tier=normaal tekstbronnen. `geheim` blijft er
--      bewust buiten: het mag nooit in generieke context belanden die naar een
--      cloud-AI kan gaan. pgvector (extensie 'vector' staat klaar) kan later
--      achter dezelfde RPC-interface geschoven worden zodra een embedding-
--      provider gekozen is; dat is een aparte (ingestie-)keuze, buiten deze scope.

-- ── 1. Samenvattingen ─────────────────────────────────────────────────────────
create table if not exists summaries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users not null,
  period       text not null,                         -- day | week | month | quarter
  period_start date not null,
  domain       text not null default 'all',           -- LifeDomain of 'all'
  text         text not null,
  event_count  int not null default 0,
  derived_from uuid[] not null default '{}',
  tier         text not null default 'normaal' check (tier in ('normaal','geheim')),
  created_at   timestamptz not null default now(),
  unique (user_id, period, period_start, domain)
);
create index if not exists summaries_user_period_idx on summaries (user_id, period, period_start desc);

alter table summaries enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='summaries' and policyname='owner') then
    create policy "owner" on summaries for all to authenticated
      using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
  end if;
end $$;

-- ── 2. Nachtelijke roll-up (deterministisch, geen LLM) ────────────────────────
-- Bouwt per gebruiker een dag-samenvatting voor gisteren + vandaag (upsert, zodat
-- late data de rij bijwerkt). Alleen tier=normaal bronnen (steps/slaap/finance/
-- werk/relaties); energie uit daily_checkin (geheim) blijft er bewust buiten.
create or replace function public.build_summaries()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  u uuid;
  d date;
  body text;
  ln text;
  n_total int;
  cnt int;
  amt numeric;
begin
  for u in select id from auth.users loop
    foreach d in array array[current_date - 1, current_date] loop
      body := '';
      n_total := 0;

      -- Gezondheid: stappen + slaap (beide tier=normaal)
      ln := concat_ws(', ',
        (select hds.steps || ' stappen' from public.health_daily_stats hds where hds.user_id=u and hds.date=d and hds.steps is not null),
        (select round((coalesce(hs.light_min,0)+coalesce(hs.deep_min,0)+coalesce(hs.rem_min,0))/60.0, 1) || 'u slaap'
           from public.health_sleep hs where hs.user_id=u and hs.date=d));
      if coalesce(ln, '') <> '' then body := body || 'Gezondheid: ' || ln || E'\n'; n_total := n_total + 1; end if;

      -- Finance: aantal + netto van die dag
      select count(*), coalesce(sum(amount),0) into cnt, amt
        from public.finance_tx where user_id=u and occurred_on=d;
      if cnt > 0 then
        body := body || 'Finance: ' || cnt || ' transactie(s), netto €' || round(amt,2) || E'\n';
        n_total := n_total + cnt;
      end if;

      -- Werk: projectactiviteit die dag
      select count(*) into cnt from public.project_activity pa
        where pa.project_id in (select id from public.projects where user_id=u) and pa.created_at::date = d;
      if cnt > 0 then body := body || 'Werk: ' || cnt || ' projectupdate(s)' || E'\n'; n_total := n_total + cnt; end if;

      -- Relaties: contactmomenten die dag
      select count(*) into cnt from public.interaction where user_id=u and occurred_at::date = d;
      if cnt > 0 then body := body || 'Relaties: ' || cnt || ' contactmoment(en)' || E'\n'; n_total := n_total + cnt; end if;

      if length(body) > 0 then
        insert into public.summaries (user_id, period, period_start, domain, text, event_count, tier)
        values (u, 'day', d, 'all', rtrim(body, E'\n'), n_total, 'normaal')
        on conflict (user_id, period, period_start, domain)
        do update set text = excluded.text, event_count = excluded.event_count, created_at = now();
      end if;
    end loop;
  end loop;
end;
$$;

revoke execute on function public.build_summaries() from public, anon, authenticated;

-- ── 3. Retrieval-primitive: tier-veilige full-text search ─────────────────────
-- SECURITY INVOKER: draait onder de RLS van de aanroeper, dus alleen eigen rijen.
-- Plus expliciete tier<>'geheim' als diepteverdediging.
create or replace function public.search_memory(p_query text, p_limit int default 8)
returns table (id uuid, source text, title text, snippet text, ts timestamptz, rank real)
language sql
security invoker
set search_path = ''
as $$
  with q as (select websearch_to_tsquery('dutch', coalesce(p_query, '')) as tsq)
  select h.* from (
    select b.id, 'braindump'::text as source,
           coalesce(b.title, '(capture)') as title,
           left(coalesce(b.summary, b.markdown, ''), 240) as snippet,
           b.created_at as ts,
           ts_rank(to_tsvector('dutch', coalesce(b.title,'') || ' ' || coalesce(b.summary,'') || ' ' || coalesce(b.markdown,'')), q.tsq) as rank
    from public.braindump_entries b, q
    where b.tier <> 'geheim'
      and to_tsvector('dutch', coalesce(b.title,'') || ' ' || coalesce(b.summary,'') || ' ' || coalesce(b.markdown,'')) @@ q.tsq
    union all
    select i.id, 'interaction', coalesce(i.summary, '(contact)'),
           left(coalesce(i.summary,''), 240), i.occurred_at,
           ts_rank(to_tsvector('dutch', coalesce(i.summary,'')), q.tsq)
    from public.interaction i, q
    where i.tier <> 'geheim' and i.summary is not null
      and to_tsvector('dutch', coalesce(i.summary,'')) @@ q.tsq
    union all
    select s.id, 'summary', s.domain || ' ' || s.period,
           left(s.text, 240), s.created_at,
           ts_rank(to_tsvector('dutch', s.text), q.tsq)
    from public.summaries s, q
    where s.tier <> 'geheim'
      and to_tsvector('dutch', s.text) @@ q.tsq
  ) h
  order by h.rank desc
  limit greatest(1, least(coalesce(p_limit, 8), 50));
$$;

grant execute on function public.search_memory(text, int) to authenticated, service_role;

-- ── 4. Nachtelijk schema via pg_cron ──────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('oslife-summaries', '30 3 * * *', 'select public.build_summaries()');
  end if;
end $$;

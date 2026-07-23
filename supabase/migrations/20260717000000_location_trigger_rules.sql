-- OSLIFE · PM-072 Fase 1 — locatie-check-ins + configureerbare herhaal-detectie.
--
-- Basis voor ELKE toekomstige "X keer bij Y binnen Z dagen"-regel (niet alleen
-- de dierenarts/Kyra-case uit het voorbeeld) — drempelwaarden leven in de nieuwe
-- `trigger_rules`-tabel, niet hardcoded in SQL. Puur regels/statistiek, geen
-- AI-afhankelijkheid (principe 3) — dit draait volledig via pg_cron/plpgsql.
--
-- Volgt exact hetzelfde patroon als phone_events/finance_tx (Slice 0/1): eigen
-- fact-tabel, geregistreerd in type_registry, gespiegeld naar de event-log via
-- de bestaande emit_event()-trigger. Geen bestaande module aangeraakt buiten
-- run_inference() zelf (create or replace, zelfde signatuur).
--
-- Audit-noot (zie plan): er bestond nog GEEN geofence-ingest van welke aard dan
-- ook — R2 "dog_walk" stond alleen als ongeimplementeerd idee in
-- docs/DATA-ARCHITECTURE.md. Dit is dus nieuwbouw volgens het bestaande
-- MacroDroid-ingest-contract (phone-events-ingest/wallet-ingest), niet het
-- bevestigen van een bestaand contract.

-- ── 1. Ruwe check-ins (MacroDroid geofence-trigger → geofence-ingest) ─────────
create table if not exists location_checkins (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  place_id    text,                          -- MacroDroid geofence-id (stabiel per plek)
  place_name  text not null,                 -- mensleesbaar label, bv. "Dierenarts Kyra"
  place_type  text,                          -- optioneel vrij label (vet, gym, school…)
  lat         numeric(9,6),
  lon         numeric(9,6),
  ts          timestamptz not null default now(),
  tier        text not null default 'normaal' check (tier in ('normaal','geheim')),
  created_at  timestamptz not null default now()
);
create index if not exists location_checkins_user_ts_idx on location_checkins (user_id, ts desc);
create index if not exists location_checkins_user_place_idx on location_checkins (user_id, place_name);

alter table location_checkins enable row level security;
create policy "owner" on location_checkins for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

insert into type_registry (type, label, default_domains, default_tier, projection_table) values
  ('location_checkins', 'Locatie-check-in', array['cross'], 'normaal', 'location_checkins')
on conflict (type) do nothing;

drop trigger if exists emit_event on location_checkins;
create trigger emit_event after insert or update on location_checkins
  for each row execute function public.emit_event();

-- ── 2. Configureerbare herhaal-drempels — de basis voor elke toekomstige regel ─
-- rule_key dient ook als events.rule_id: onderdrukking (rule_suppressed(), Slice
-- 4) en regel-tuning (rule_performance) werken zo per geconfigureerde regel, niet
-- gebundeld onder één generieke SQL-regel-id — een dierenarts-regel die je vaak
-- afwijst onderdrukt niet ook een toekomstige, ongerelateerde sportschool-regel.
create table if not exists trigger_rules (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users not null,
  rule_key        text not null,
  place_matcher   text not null,             -- regex (place_name) of exacte match (place_id/place_type)
  match_field     text not null default 'place_name' check (match_field in ('place_name','place_id','place_type')),
  count_threshold int not null default 3,
  window_days     int not null default 7,
  domains         text[] not null default array['cross'],
  event_type      text not null default 'repeat_location_pattern',
  question        text not null,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (user_id, rule_key)
);
alter table trigger_rules enable row level security;
create policy "owner" on trigger_rules for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Seed het dierenarts/Kyra-voorbeeld als data, niet als code — één configuratie-
-- rij, verwijderbaar/aanpasbaar door Rick zonder migratie (Fase 4-uitbreidbaarheid
-- begint hier al: dezelfde tabel bedient elke toekomstige regel).
insert into trigger_rules (user_id, rule_key, place_matcher, match_field, count_threshold, window_days, domains, question)
select id, 'vet_kyra', '(?i)dierenart|dierenkliniek|dierenziekenhuis|kyra', 'place_name', 3, 7, array['pet','health'],
       'Ik heb gezien dat je de afgelopen week meerdere keren bij de dierenarts bent geweest. Wil je dat ik een medisch dossier aanmaak voor Kyra de hond?'
from auth.users
on conflict (user_id, rule_key) do nothing;

-- ── 3. R10 · generieke herhaal-locatie-detectie (leest trigger_rules) ─────────
-- create or replace vereist de volledige functie-body (gelijke signatuur) — R1/
-- R5/R6/R7 hieronder zijn ONGEWIJZIGD gekopieerd uit 20260714130000, alleen R10
-- is toegevoegd. Rechten (revoke van public/anon/authenticated, Slice 1-hardening
-- in 20260714131000) blijven staan: CREATE OR REPLACE FUNCTION wijzigt geen ACL's.
create or replace function public.run_inference()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  u uuid;
begin
  for u in select id from auth.users loop

    -- R1 · dierenartsbezoek uit een betaling ---------------------------------
    insert into public.events (
      user_id, type, domains, occurred_at, recorded_at, source, source_detail,
      confidence, status, rule_id, tier, payload, dedup_key)
    select
      u, 'vet_visit', array['pet','health'], ft.occurred_on::timestamptz, now(),
      'inferred', 'rule:R1', 0.70, 'inferred', 'R1', 'normaal',
      jsonb_build_object(
        'finance_tx_id', ft.id, 'merchant', ft.counterparty, 'amount', ft.amount,
        'confirm_channel', 'digest',
        'question', 'Was dit een dierenartsbezoek voor Kyra?'),
      'R1:' || ft.id::text
    from public.finance_tx ft
    where ft.user_id = u
      and ft.counterparty is not null
      and ft.counterparty ~* '(dierenart|dierenkliniek|dierenziekenhuis|dierendokter|anicura|evidensia)'
      and not exists (
        select 1 from public.events e
        where e.user_id = u and e.rule_id = 'R1' and e.dedup_key = 'R1:' || ft.id::text);

    -- R5 · terugkerende vaste uitgave die nog geen abonnement is --------------
    insert into public.events (
      user_id, type, domains, occurred_at, recorded_at, source, source_detail,
      confidence, status, rule_id, tier, payload, dedup_key)
    select
      u, 'subscription_candidate', array['finance'], now(), now(),
      'inferred', 'rule:R5', 0.75, 'inferred', 'R5', 'normaal',
      jsonb_build_object(
        'name', g.counterparty, 'amount', round(g.avg_amt, 2), 'cadence', 'monthly',
        'occurrences', g.n, 'confirm_channel', 'digest',
        'question', 'Terugkerende uitgave bij ' || g.counterparty || ' — als abonnement bijhouden?'),
      'R5:' || lower(g.counterparty)
    from (
      select ft.counterparty,
             count(*) as n,
             count(distinct to_char(ft.occurred_on, 'YYYY-MM')) as months,
             avg(abs(ft.amount)) as avg_amt,
             coalesce(stddev_pop(abs(ft.amount)), 0) as sd
      from public.finance_tx ft
      where ft.user_id = u and ft.counterparty is not null and ft.amount < 0
      group by ft.counterparty
      having count(*) >= 3
         and count(distinct to_char(ft.occurred_on, 'YYYY-MM')) >= 3
         and avg(abs(ft.amount)) > 0
         and coalesce(stddev_pop(abs(ft.amount)), 0) <= 0.15 * avg(abs(ft.amount))
    ) g
    where not exists (
        select 1 from public.subscriptions s
        where s.user_id = u and lower(s.name) = lower(g.counterparty))
      and not exists (
        select 1 from public.events e
        where e.user_id = u and e.rule_id = 'R5' and e.dedup_key = 'R5:' || lower(g.counterparty));

    -- R6 · drie korte slaapnachten op rij (throttle: max 1x per 7 dagen) ------
    insert into public.events (
      user_id, type, domains, occurred_at, recorded_at, source, source_detail,
      confidence, status, rule_id, tier, payload, dedup_key)
    select
      u, 'energy_dip_pattern', array['health','mindset'], agg.mx::timestamptz, now(),
      'inferred', 'rule:R6', 0.70, 'inferred', 'R6', 'geheim',
      jsonb_build_object(
        'nights', 3, 'confirm_channel', 'digest',
        'question', 'Je sliep 3 nachten kort achter elkaar. Merk je minder energie?'),
      'R6:' || to_char(agg.mx, 'YYYY-MM-DD')
    from (
      select max(t.d) as mx, count(*) as c, bool_and(t.tot < 360) as alldip
      from (
        select date as d,
               (coalesce(light_min,0) + coalesce(deep_min,0) + coalesce(rem_min,0)) as tot
        from public.health_sleep
        where user_id = u
        order by date desc
        limit 3
      ) t
    ) agg
    where agg.c = 3 and agg.alldip
      and not exists (
        select 1 from public.events e
        where e.user_id = u and e.rule_id = 'R6' and e.recorded_at > now() - interval '7 days');

    -- R7 · actief project ligt stil terwijl de deadline nadert ---------------
    insert into public.events (
      user_id, type, domains, occurred_at, recorded_at, source, source_detail,
      confidence, status, rule_id, tier, payload, dedup_key)
    select
      u, 'project_stall', array['work'], now(), now(),
      'inferred', 'rule:R7', 0.80, 'inferred', 'R7', 'normaal',
      jsonb_build_object(
        'project_id', p.id, 'name', p.name, 'deadline', p.deadline,
        'confirm_channel', 'digest',
        'question', 'Project "' || p.name || '" ligt stil en de deadline nadert. Actie nodig?'),
      'R7:' || p.id::text || ':' || to_char(now(), 'IYYY-IW')
    from public.projects p
    where p.user_id = u
      and p.status in ('active','review')
      and p.deadline is not null
      and p.deadline <= (now()::date + 14)
      and coalesce(p.archived, false) = false
      and not exists (
        select 1 from public.project_activity pa
        where pa.project_id = p.id and pa.created_at > now() - interval '7 days')
      and not exists (
        select 1 from public.events e
        where e.user_id = u and e.rule_id = 'R7'
          and e.dedup_key = 'R7:' || p.id::text || ':' || to_char(now(), 'IYYY-IW'));

    -- R10 · terugkerend locatiepatroon (configureerbaar via trigger_rules) ---
    -- Generiek: leest ALLE actieve trigger_rules-rijen van deze gebruiker, geen
    -- per-plek-logica hardcoded hier. rule_id = tr.rule_key (niet 'R10') zodat
    -- onderdrukking/tuning per geconfigureerde regel werkt, niet gebundeld.
    insert into public.events (
      user_id, type, domains, occurred_at, recorded_at, source, source_detail,
      confidence, status, rule_id, tier, payload, dedup_key)
    select
      u, tr.event_type, tr.domains, now(), now(),
      'inferred', 'rule:R10/' || tr.rule_key, 0.70, 'inferred', tr.rule_key, 'normaal',
      jsonb_build_object(
        'rule_key', tr.rule_key, 'count', g.cnt, 'window_days', tr.window_days,
        'confirm_channel', 'digest', 'question', tr.question),
      tr.rule_key || ':' || to_char(now(), 'IYYY-IW')
    from public.trigger_rules tr
    cross join lateral (
      select count(distinct l.ts::date) as cnt
      from public.location_checkins l
      where l.user_id = u
        and l.ts >= now() - (tr.window_days || ' days')::interval
        and (
          (tr.match_field = 'place_name' and l.place_name ~* tr.place_matcher) or
          (tr.match_field = 'place_id'   and l.place_id = tr.place_matcher) or
          (tr.match_field = 'place_type' and l.place_type = tr.place_matcher)
        )
    ) g
    where tr.user_id = u
      and tr.active
      and g.cnt >= tr.count_threshold
      and not exists (
        select 1 from public.events e
        where e.user_id = u and e.rule_id = tr.rule_key
          and e.dedup_key = tr.rule_key || ':' || to_char(now(), 'IYYY-IW'));

  end loop;
end;
$$;

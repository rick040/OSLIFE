-- OSLIFE · generieke patroon-engine + versioneerd profiel.
--
-- Rick vroeg om R10's aanpak (config-driven herhaal-detectie) niet beperkt te
-- houden tot locatie, maar toe te passen "op alles": een voorbeeld met
-- uitgavenpatroon -> budgetadvies, en een voorbeeld met semantisch gelinkte
-- braindumps -> een blijvend, versioneerd profiel dat toekomstige HEYRA-
-- antwoorden voedt. Twee nieuwe regels, zelfde bewezen patroon als R1/R5/R10:
-- eigen config-tabel (of, voor R12, direct de bestaande embeddings), een
-- create-or-replace-blok in run_inference(), en een confirm_inference()-effect
-- — niets AI-afhankelijk (principe 3), alles config in plaats van code.
--
-- Dit is BEWUST niet dynamische SQL over een willekeurige brontabel (format()+
-- execute) — dat zou een SQL-injectierisico + testcomplexiteit toevoegen voor
-- weinig winst bij één gebruiker. Elke regel blijft, net als R1/R5/R6/R7/R10,
-- een eigen handgeschreven blok binnen zijn eigen domein; "generiek" betekent
-- hier: generiek BINNEN dat domein (elke configuratie-rij in budget_rules of
-- elke braindump-cluster), niet generiek OVER domeinen heen.
--
-- R11 · budgetdrempel — analoog aan R10, maar dan finance_tx (sum i.p.v. count).
-- R12 · semantisch thema — gebruikt de bestaande pgvector-embeddings
--       (20260715000000_memory_embeddings.sql) om braindumps te clusteren
--       zonder gedeeld trefwoord; kan pas nu omdat die embeddings al bestaan.
--
-- profile_facts is de vervanging-in-wording voor de expliciet in Fase 0
-- gevlagde tekortkoming van heyra_memory/LearnedFact (AI-only, ongeversioneerd,
-- hard capped op 60, stilzwijgend overschreven — schendt principe 4). Dit rondt
-- NIET de volledige LearnedFact-migratie af (dat write-pad blijft ongewijzigd,
-- zie de code-comment daar) — het geeft alleen NIEUWE, regel-afgeleide feiten
-- (te beginnen met R12) meteen een versioneerd, bevestigings-gated thuis, met
-- audit-trail via superseded_at i.p.v. silent overwrite.

-- ── 1. budget_rules — configureerbare uitgavendrempels per categorie ─────────
create table if not exists budget_rules (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null,
  rule_key      text not null,
  category      text not null,            -- moet matchen met finance_tx.category (canonical taxonomy)
  sum_threshold numeric not null,         -- totaal (EUR, absoluut) binnen window_days dat de regel triggert
  count_min     int not null default 3,   -- minimaal dit aantal transacties
  window_days   int not null default 30,
  question      text,                     -- optioneel; anders een gegenereerde vraag
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (user_id, rule_key)
);
alter table budget_rules enable row level security;
create policy "owner" on budget_rules for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Bewust GEEN seed-rij — anders dan de dierenarts/Kyra-case uit het originele
-- voorbeeld is er geen gegeven voorbeeldcategorie; Rick voegt zelf toe via één
-- INSERT (zie integrations/macrodroid/patroon-regels.md), zelfde als trigger_rules.

-- ── 2. budget_caps — het resultaat: een ingesteld maandmaximum per categorie ──
create table if not exists budget_caps (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users not null,
  category        text not null,
  monthly_max     numeric not null,
  active          boolean not null default true,
  source_rule_id  text,                   -- budget_rules.rule_key die dit voorstelde, null = handmatig
  tier            text not null default 'normaal' check (tier in ('normaal','geheim')),
  created_at      timestamptz not null default now(),
  unique (user_id, category)
);
alter table budget_caps enable row level security;
create policy "owner" on budget_caps for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ── 3. profile_facts — versioneerd profiel (nooit silent overwrite) ──────────
-- Elke nieuwe waarde voor dezelfde `key` supersedet de vorige (superseded_at
-- gezet), i.p.v. hem te overschrijven of te droppen — principe 4. `key` is de
-- stabiele identiteit van het feit (bv. 'theme:<seed-braindump-id>'); de
-- huidige/actieve versie is de rij met superseded_at is null.
create table if not exists profile_facts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users not null,
  key             text not null,
  label           text not null,
  value           jsonb not null default '{}',
  version         int not null default 1,
  confidence      numeric(3,2) not null default 0.70,
  source_rule_id  text,
  source_ids      uuid[] not null default '{}',
  superseded_at   timestamptz,
  tier            text not null default 'normaal' check (tier in ('normaal','geheim')),
  created_at      timestamptz not null default now()
);
create index if not exists profile_facts_user_key_idx on profile_facts (user_id, key, superseded_at);
alter table profile_facts enable row level security;
create policy "owner" on profile_facts for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Interne helper (niet direct door de frontend aangeroepen — alleen vanuit
-- confirm_inference(), zelf al SECURITY DEFINER). Supersede-atomisch: zet de
-- huidige actieve rij (indien aanwezig) op superseded_at=now(), voegt de
-- nieuwe versie toe met version+1.
create or replace function public.upsert_profile_fact(
  p_user_id uuid, p_key text, p_label text, p_value jsonb,
  p_confidence numeric, p_source_rule_id text, p_source_ids uuid[] default '{}', p_tier text default 'normaal'
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  prev_version int;
  new_id uuid;
begin
  update public.profile_facts
     set superseded_at = now()
   where user_id = p_user_id and key = p_key and superseded_at is null
  returning version into prev_version;

  insert into public.profile_facts (user_id, key, label, value, version, confidence, source_rule_id, source_ids, tier)
  values (p_user_id, p_key, p_label, p_value, coalesce(prev_version, 0) + 1, p_confidence, p_source_rule_id, p_source_ids, p_tier)
  returning id into new_id;

  return new_id;
end;
$$;

revoke execute on function public.upsert_profile_fact(uuid, text, text, jsonb, numeric, text, uuid[], text) from public, anon, authenticated;

-- ── 4. run_inference(): R11 (budgetdrempel) + R12 (semantisch thema) toegevoegd ─
-- create or replace vereist de volledige body (gelijke signatuur) — R1/R3/R4/
-- R5/R6/R7/P1/R10 hieronder zijn ONGEWIJZIGD gekopieerd uit 20260723000000.
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

    -- R3 · onbeantwoorde inbound mail van een bekend persoon (>24u ongelezen) --
    insert into public.events (
      user_id, type, domains, occurred_at, recorded_at, source, source_detail,
      confidence, status, rule_id, tier, payload, dedup_key)
    select
      u, 'owed_reply', array['relationships'], gm.received_at, now(),
      'inferred', 'rule:R3', 0.80, 'inferred', 'R3', 'normaal',
      jsonb_build_object('gmail_id', gm.id, 'from', gm.from_addr, 'subject', gm.subject, 'person_id', pr.id,
        'confirm_channel', 'digest',
        'question', 'Je hebt nog niet gereageerd op ' || coalesce(pr.display_name, gm.from_addr) ||
                    ' ("' || coalesce(gm.subject, '') || '"). Openstaand?'),
      'R3:' || gm.id::text
    from public.gmail_messages gm
    join public.person pr on pr.user_id = u and gm.from_addr = any(pr.emails)
    where gm.user_id = u and gm.read = false and gm.received_at < now() - interval '24 hours'
      and not exists (select 1 from public.events e where e.user_id=u and e.rule_id='R3' and e.dedup_key='R3:'||gm.id::text);

    -- R4 · admin-item verloopt binnen de opzegtermijn (tijdgevoelig) ----------
    insert into public.events (
      user_id, type, domains, occurred_at, recorded_at, source, source_detail,
      confidence, status, rule_id, tier, payload, dedup_key)
    select
      u, 'renewal_due', array['home_admin'], ai.renewal_on::timestamptz, now(),
      'inferred', 'rule:R4', 1.00, 'inferred', 'R4', 'normaal',
      jsonb_build_object('admin_item_id', ai.id, 'title', ai.title, 'renewal_on', ai.renewal_on,
        'notice_period_days', ai.notice_period_days, 'confirm_channel', 'immediate',
        'question', '"' || ai.title || '" verloopt op ' || to_char(ai.renewal_on, 'DD-MM-YYYY') || '. Actie nodig?'),
      'R4:' || ai.id::text || ':' || to_char(ai.renewal_on, 'YYYY-MM-DD')
    from public.admin_item ai
    where ai.user_id = u and ai.renewal_on is not null
      and ai.renewal_on >= current_date
      and ai.renewal_on <= current_date + coalesce(ai.notice_period_days, 30)
      and not exists (select 1 from public.events e where e.user_id=u and e.rule_id='R4' and e.dedup_key='R4:'||ai.id::text||':'||to_char(ai.renewal_on,'YYYY-MM-DD'));

    -- P1 · voorstel: 3+ dierenartsbezoeken in 6 weken -> Kyra-dossier ---------
    insert into public.events (
      user_id, type, domains, occurred_at, recorded_at, source, source_detail,
      confidence, status, rule_id, tier, payload, dedup_key)
    select
      u, 'health_condition_promotion', array['pet','health'], now(), now(),
      'inferred', 'rule:P1', 0.85, 'inferred', 'P1', 'geheim',
      jsonb_build_object(
        'subject', 'kyra', 'label', 'Terugkerende dierenartsbezoeken',
        'notes', '3+ dierenartsbezoeken in 6 weken.',
        'derived_from', (select coalesce(jsonb_agg(e.id), '[]'::jsonb) from public.events e
                          where e.user_id=u and e.type='vet_visit' and e.occurred_at > now() - interval '42 days'),
        'confirm_channel', 'app_only',
        'question', 'Ik heb gezien dat je de afgelopen weken meerdere keren bij de dierenarts bent geweest. Wil je dat ik een medisch dossier aanmaak voor Kyra de hond?'),
      'P1:kyra'
    where (select count(*) from public.events e
           where e.user_id=u and e.type='vet_visit' and e.occurred_at > now() - interval '42 days') >= 3
      and not exists (
        select 1 from public.events e
        where e.user_id=u and e.rule_id='P1' and e.dedup_key='P1:kyra')
      and not exists (
        select 1 from public.health_condition hc
        where hc.user_id=u and hc.subject='kyra'
          and hc.label='Terugkerende dierenartsbezoeken' and hc.status <> 'resolved');

    -- R10 · terugkerend locatiepatroon (configureerbaar via trigger_rules) ---
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

    -- R11 · budgetdrempel overschreden (configureerbaar via budget_rules) ----
    -- Zelfde vorm als R10 maar dan een SOM i.p.v. een AANTAL, over finance_tx.
    insert into public.events (
      user_id, type, domains, occurred_at, recorded_at, source, source_detail,
      confidence, status, rule_id, tier, payload, dedup_key)
    select
      u, 'budget_cap_suggestion', array['finance'], now(), now(),
      'inferred', 'rule:R11/' || br.rule_key, 0.70, 'inferred', br.rule_key, 'normaal',
      jsonb_build_object(
        'rule_key', br.rule_key, 'category', br.category,
        'spent', round(g.total, 2), 'count', g.cnt, 'window_days', br.window_days,
        'suggested_max', round(g.total, 2),
        'confirm_channel', 'digest',
        'question', coalesce(br.question,
          'Je gaf de afgelopen ' || br.window_days::text || ' dagen €' || round(g.total,2)::text ||
          ' uit aan ' || br.category || ' (' || g.cnt::text || 'x). Een maximum instellen van €' ||
          round(g.total,2)::text || ' per maand?')),
      br.rule_key || ':' || to_char(now(), 'IYYY-IW')
    from public.budget_rules br
    cross join lateral (
      select sum(abs(ft.amount)) as total, count(*) as cnt
      from public.finance_tx ft
      where ft.user_id = u
        and ft.category = br.category
        and ft.amount < 0
        and ft.occurred_on >= (now() - (br.window_days || ' days')::interval)::date
    ) g
    where br.user_id = u
      and br.active
      and g.cnt >= br.count_min
      and g.total >= br.sum_threshold
      and not exists (
        select 1 from public.events e
        where e.user_id = u and e.rule_id = br.rule_key
          and e.dedup_key = br.rule_key || ':' || to_char(now(), 'IYYY-IW'));

    -- R12 · semantisch thema in braindumps (leest bestaande pgvector-embeddings) ─
    -- Geen config-tabel nodig — dit werkt direct op braindump_entries.embedding,
    -- net zoals search_memory() al doet. Elke kandidaat-anker `b` moet
    -- chronologisch de VROEGSTE zijn in zijn eigen buurtje (created_at-order,
    -- niet id-order — gen_random_uuid() is niet tijd-sorteerbaar) zodat hetzelfde
    -- opkomende thema niet door elk lid ervan apart als los voorstel opduikt.
    -- rule_id='R12' (gedeeld, niet per-cluster) — er is geen vooraf-configureerbare
    -- identiteit per thema zoals bij R10/trigger_rules, dus onderdrukking werkt
    -- hier bewust op de hele detectiesoort, niet per instantie.
    insert into public.events (
      user_id, type, domains, occurred_at, recorded_at, source, source_detail,
      confidence, status, rule_id, tier, payload, dedup_key)
    select
      u, 'theme_detected', array['cross'], now(), now(),
      'inferred', 'rule:R12', 0.65, 'inferred', 'R12', 'normaal',
      jsonb_build_object(
        'seed_id', c.seed_id, 'seed_title', c.seed_title,
        'note_ids', c.note_ids, 'count', c.cnt,
        'confirm_channel', 'digest',
        'question', 'Ik zie ' || c.cnt::text || ' braindumps die sterk op elkaar lijken (rond "' ||
          c.seed_title || '"). Dit als terugkerend thema in je profiel opnemen?'),
      'R12:' || c.seed_id::text
    from (
      select b.id as seed_id,
             coalesce(b.title, left(b.summary, 60), 'notitie') as seed_title,
             count(o.id) + 1 as cnt,
             jsonb_agg(o.id) || jsonb_build_array(b.id) as note_ids
      from public.braindump_entries b
      join public.braindump_entries o
        on o.user_id = b.user_id
       and o.id <> b.id
       and o.tier <> 'geheim'
       and o.embedding is not null
       and o.created_at >= now() - interval '45 days'
       and (o.created_at > b.created_at or (o.created_at = b.created_at and o.id > b.id))
       and (b.embedding operator(extensions.<=>) o.embedding) <= 0.15
      where b.user_id = u
        and b.tier <> 'geheim'
        and b.embedding is not null
        and b.created_at >= now() - interval '45 days'
      group by b.id, b.title, b.summary
      having count(o.id) >= 2
    ) c
    where not exists (
        select 1 from public.events e
        where e.user_id = u and e.rule_id = 'R12' and e.dedup_key = 'R12:' || c.seed_id::text);

  end loop;
end;
$$;

-- ── 5. confirm_inference(): effecten voor budget_cap_suggestion + theme_detected ─
create or replace function public.confirm_inference(p_event_id uuid, p_decision text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev public.events%rowtype;
begin
  select * into ev from public.events where id = p_event_id;
  if not found then return false; end if;
  if ev.status <> 'inferred' then return false; end if;

  if auth.uid() is not null and auth.uid() <> ev.user_id then
    raise exception 'not authorized to confirm this inference';
  end if;

  if p_decision = 'confirm' then
    update public.events set status = 'confirmed' where id = p_event_id;

    if ev.type = 'subscription_candidate' then
      insert into public.subscriptions (user_id, name, amount, cadence, active, notes)
      values (
        ev.user_id,
        coalesce(ev.payload->>'name', 'Onbekend'),
        nullif(ev.payload->>'amount','')::numeric,
        coalesce(ev.payload->>'cadence', 'monthly'),
        true,
        'Automatisch bevestigd uit inferentie R5');
    end if;

    if ev.type = 'health_condition_promotion' then
      insert into public.health_condition (user_id, subject, label, opened_at, status, notes, derived_from, tier)
      values (
        ev.user_id,
        coalesce(ev.payload->>'subject', 'onbekend'),
        coalesce(ev.payload->>'label', 'Automatisch dossier'),
        current_date,
        'monitoring',
        coalesce(ev.payload->>'notes', 'Automatisch voorgesteld dossier (bevestigd).'),
        (select coalesce(array_agg(x::uuid), '{}')
           from jsonb_array_elements_text(coalesce(ev.payload->'derived_from', '[]'::jsonb)) x)
          || array[ev.id],
        'geheim');
    end if;

    if ev.type = 'budget_cap_suggestion' then
      insert into public.budget_caps (user_id, category, monthly_max, source_rule_id, tier)
      values (
        ev.user_id,
        ev.payload->>'category',
        coalesce((ev.payload->>'suggested_max')::numeric, 0),
        ev.rule_id,
        'normaal')
      on conflict (user_id, category) do update
        set monthly_max = excluded.monthly_max, active = true, source_rule_id = excluded.source_rule_id;
    end if;

    if ev.type = 'theme_detected' then
      perform public.upsert_profile_fact(
        ev.user_id,
        'theme:' || coalesce(ev.payload->>'seed_id', ev.id::text),
        coalesce(ev.payload->>'seed_title', 'Terugkerend thema'),
        jsonb_build_object('note_ids', ev.payload->'note_ids', 'count', ev.payload->'count'),
        0.65,
        'R12',
        (select coalesce(array_agg(x::uuid), '{}')
           from jsonb_array_elements_text(coalesce(ev.payload->'note_ids', '[]'::jsonb)) x),
        'normaal');
    end if;

  elsif p_decision = 'reject' then
    update public.events set status = 'rejected' where id = p_event_id;
  else
    raise exception 'p_decision must be confirm or reject';
  end if;

  return true;
end;
$$;

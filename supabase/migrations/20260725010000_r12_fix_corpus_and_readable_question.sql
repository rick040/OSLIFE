-- OSLIFE · R12 bugfix — noise van `summaries` + onleesbare vraagtekst.
--
-- Rick zag live 7 bijna-identieke voorstellen, allemaal "rond 'all day'" — en
-- kon niet zien waarop ze eigenlijk sloegen. Twee losse fouten in de vorige
-- migratie (20260725000000):
--
-- 1. `summaries` hoort niet in de corpus. Nachtelijke samenvattingen worden
--    elke nacht uit hetzelfde sjabloon gegenereerd (zelfde domain/period,
--    vergelijkbare opbouw) — ze clusteren dus vanzelf op sjabloon-gelijkenis,
--    niet op een echt terugkerend thema in Ricks eigen denken. `domain ||
--    ' ' || period` (bv. 'all' + 'day' = "all day") maakte dit ook nog eens
--    onherkenbaar als label. braindump_entries en interaction zijn wél door
--    Rick zelf geschreven/betekenisvolle content — die blijven.
-- 2. De vraagtekst toonde alleen een aantal + één (soms zinloos) label, geen
--    enkel concreet aanknopingspunt waarop Rick kon beoordelen of het klopte.
--    Nu worden tot 3 echte titels/labels van de gematchte items getoond —
--    deterministisch (geen AI, principe 3), gewoon de bestaande data zelf.
--
-- De 5 door de bug veroorzaakte voorstellen zijn al verwijderd (niet alleen
-- verworpen — rule_suppressed() telt ALLE historische afwijzingen mee, dus
-- laten staan als 'rejected' had R12 permanent onderdrukt na 3+ afwijzingen
-- zonder dat Rick ooit een geldig voorstel zag).

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

    -- R12 · semantisch thema over braindumps + interaction (summaries eruit) --
    -- `summaries` verwijderd uit de corpus (zie migratie-header) — alleen
    -- door Rick zelf geschreven content clustert nog. sample_labels toont tot
    -- 3 echte titels uit de match, zodat de vraag zelf al laat zien waar het
    -- over gaat i.p.v. een generiek "N items" + één mogelijk zinloos label.
    with corpus as (
      select 'braindump'::text as src, id, coalesce(title, left(summary, 60), 'notitie') as label,
             embedding, tier, created_at
      from public.braindump_entries where user_id = u
      union all
      select 'interaction', id, coalesce(left(summary, 60), 'contact'), embedding, tier, occurred_at
      from public.interaction where user_id = u
    )
    insert into public.events (
      user_id, type, domains, occurred_at, recorded_at, source, source_detail,
      confidence, status, rule_id, tier, payload, dedup_key)
    select
      u, 'theme_detected', array['cross'], now(), now(),
      'inferred', 'rule:R12', 0.65, 'inferred', 'R12', 'normaal',
      jsonb_build_object(
        'seed_source', c.seed_source, 'seed_id', c.seed_id, 'seed_title', c.seed_title,
        'note_ids', c.note_ids, 'count', c.cnt,
        'confirm_channel', 'digest',
        'question', 'Ik zie ' || c.cnt::text || ' items die sterk op elkaar lijken: "' ||
          array_to_string(c.sample_labels, '", "') || '". Dit als terugkerend thema in je profiel opnemen?'),
      'R12:' || c.seed_source || ':' || c.seed_id::text
    from (
      select b.src as seed_source, b.id as seed_id, b.label as seed_title,
             count(o.id) + 1 as cnt,
             jsonb_agg(jsonb_build_object('source', o.src, 'id', o.id))
               || jsonb_build_array(jsonb_build_object('source', b.src, 'id', b.id)) as note_ids,
             (array[b.label] || array_agg(o.label))[1:3] as sample_labels
      from corpus b
      join corpus o
        on not (o.src = b.src and o.id = b.id)
       and o.tier <> 'geheim'
       and o.embedding is not null
       and o.created_at >= now() - interval '45 days'
       and (
         o.created_at > b.created_at
         or (o.created_at = b.created_at and o.src > b.src)
         or (o.created_at = b.created_at and o.src = b.src and o.id > b.id)
       )
       and (b.embedding operator(extensions.<=>) o.embedding) <= 0.20
      where b.tier <> 'geheim'
        and b.embedding is not null
        and b.created_at >= now() - interval '45 days'
      group by b.src, b.id, b.label
      having count(o.id) >= 2
    ) c
    where not exists (
        select 1 from public.events e
        where e.user_id = u and e.rule_id = 'R12'
          and e.dedup_key = 'R12:' || c.seed_source || ':' || c.seed_id::text);

  end loop;
end;
$$;

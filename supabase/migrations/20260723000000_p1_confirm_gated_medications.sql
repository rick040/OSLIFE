-- OSLIFE · PM-072 Fase 2 — P1 wordt bevestigings-gated + medicatie-herinneringen.
--
-- P1 maakte tot nu toe direct een health_condition-rij aan zodra de drempel
-- (3+ dierenartsbezoeken in 6 weken) gehaald werd — geen bevestiging, geen
-- spoor voordat het al bestond. Dat overtreedt de expliciete eis uit de Fase
-- 2-opdracht: "automatische acties met gevolgen (dossier aanmaken, alarm
-- zetten...) vereisen altijd Ricks expliciete bevestiging vooraf." Rick heeft
-- expliciet gekozen om P1 om te zetten naar hetzelfde bevestigings-patroon als
-- elke andere regel (R1/R3/R4/R5/R6/R7/R10): een `inferred`-event; het dossier
-- ontstaat pas in confirm_inference() bij bevestiging.
--
-- confirm_channel='app_only' (nieuw, naast de bestaande 'digest'/'immediate')
-- zodat dit specifieke type NIET ook via de Telegram-avonddigest binnenkomt —
-- het accepteren opent een wizard (baseline-info + medicatie) die alleen in de
-- app zelf bestaat; via Telegram bevestigen zou een leeg dossier achterlaten
-- zonder ooit de wizard te tonen.

-- ── 1. P1 → voorstel i.p.v. directe insert; confirm_inference() krijgt het effect
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
    -- Was een directe insert in health_condition; nu net als elke andere regel
    -- een inferred-event. confirm_inference() maakt het dossier pas aan bij
    -- bevestiging (zie effect hieronder). confirm_channel='app_only': dit
    -- opent een wizard die alleen in de app bestaat, dus geen Telegram-digest.
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

  end loop;
end;
$$;

-- ── 2. confirm_inference(): nieuw effect voor health_condition_promotion ─────
-- p_event_id wordt in derived_from opgenomen zodat de frontend het net
-- aangemaakte dossier direct kan vinden (`derived_from @> array[p_event_id]`)
-- om de wizard te openen, zonder confirm_inference()'s return-contract
-- (boolean, gebruikt door bestaande callers) te hoeven wijzigen.
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

  elsif p_decision = 'reject' then
    update public.events set status = 'rejected' where id = p_event_id;
  else
    raise exception 'p_decision must be confirm or reject';
  end if;

  return true;
end;
$$;

-- ── 3. Medicatie: schema/herinneringen (Telegram — geen native app, zie audit) ─
create table if not exists medications (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users not null,
  health_condition_id uuid references health_condition(id) on delete cascade,
  name                text not null,
  dosage              text,
  schedule_note       text,               -- vrij tekstveld voor nuance (bv. "alleen op trainingsdagen")
  reminder_times      time[] not null default '{}',  -- elke dag op deze tijden een Telegram-herinnering
  active              boolean not null default true,
  tier                text not null default 'geheim' check (tier in ('normaal','geheim')),
  created_at          timestamptz not null default now()
);
create index if not exists medications_user_condition_idx on medications (user_id, health_condition_id);

alter table medications enable row level security;
create policy "owner" on medications for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

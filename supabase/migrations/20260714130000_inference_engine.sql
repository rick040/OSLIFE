-- OSLIFE · Slice 1 — inferentiemotor + hybride bevestiging.
--
-- Bouwt op de event-spine (Slice 0). De motor leest de projectietabellen, leidt
-- gebeurtenissen af volgens expliciete regels, en schrijft ze als `inferred`
-- events (status='inferred', confidence, rule_id, dedup_key). Niets wordt
-- vastgelegd als feit zonder bevestiging: de gebruiker bevestigt of verwerpt via
-- confirm_inference(), wat de status naar 'confirmed'/'rejected' zet en bij
-- bevestiging het effect toepast (bv. een abonnement aanmaken). Afwijzingen
-- blijven staan als event, zodat ze (a) niet opnieuw voorgesteld worden en
-- (b) de regel-tuning voeden (rule_performance-view, fase 7).
--
-- Regels in v1 (haalbaar op de huidige signalen):
--   R1 vet_visit        — betaling bij een dierenarts  → vet_visit (Kyra)
--   R5 subscription     — terugkerende vaste uitgave niet in subscriptions
--   R6 energy_dip       — 3 korte slaapnachten op rij   → mindset-signaal
--   R7 project_stall    — actief project stil + deadline nadert
-- (R2 dog_walk, R3 owed_reply, R4 renewal wachten op signalen/entiteiten uit
--  latere slices; R8 vendor en R9 follow-up bestaan al elders.)

-- ── 1. Inferentiemotor ────────────────────────────────────────────────────────
-- SECURITY DEFINER: draait via pg_cron zonder auth-context, moet daarom RLS
-- omzeilen en zet user_id expliciet. search_path leeg + alles gekwalificeerd.
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

  end loop;
end;
$$;

-- ── 2. Bevestiging (inference_with_confirmation) ──────────────────────────────
-- SECURITY DEFINER met eigen autorisatiecheck: een ingelogde gebruiker mag alleen
-- zijn eigen inferenties bevestigen; een service-role aanroep (Telegram-webhook,
-- auth.uid() is null) is vertrouwd. Bij 'confirm' wordt het effect toegepast.
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

  -- Autorisatie: eigen record, of vertrouwde server-context (geen JWT).
  if auth.uid() is not null and auth.uid() <> ev.user_id then
    raise exception 'not authorized to confirm this inference';
  end if;

  if p_decision = 'confirm' then
    update public.events set status = 'confirmed' where id = p_event_id;

    -- Effect per type. Alleen veilige, additieve effecten; rijkere promoties
    -- (medisch dossier, open loops) komen in latere slices.
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

  elsif p_decision = 'reject' then
    update public.events set status = 'rejected' where id = p_event_id;
  else
    raise exception 'p_decision must be confirm or reject';
  end if;

  return true;
end;
$$;

grant execute on function public.confirm_inference(uuid, text) to authenticated, anon, service_role;

-- ── 3. Regel-prestatie (tuning-signaal, fase 7) — puur afgeleid uit events ────
create or replace view public.rule_performance
with (security_invoker = true) as
select
  user_id,
  rule_id,
  count(*)                                as proposed,
  count(*) filter (where status = 'confirmed') as confirmed,
  count(*) filter (where status = 'rejected')  as rejected,
  count(*) filter (where status = 'inferred')  as pending
from public.events
where rule_id is not null
group by user_id, rule_id;

-- ── 4. Uurschema via pg_cron (idempotent; alleen als pg_cron aanwezig is) ─────
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('oslife-inference', '7 * * * *', 'select public.run_inference()');
  end if;
end $$;

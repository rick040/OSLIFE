-- OSLIFE · Slice 2 — nieuwe v1-domeinen: mensen/relaties, huis & admin, gezondheidsdossier.
--
-- Voegt de drie nieuwe domeinen uit de PM-201 domeinkaart toe, plus de regels die
-- ze ontsluiten (R3 owed_reply, R4 renewal_due) en de promotie P1 (3 dierenarts-
-- bezoeken in 6 weken -> automatisch een Kyra-dossier). Additief; bestaande
-- tabellen ongemoeid. Zelfde single-owner + RLS + realtime-vorm als de rest.

-- ── 1. Mensen / relaties ──────────────────────────────────────────────────────
create table if not exists person (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users not null,
  display_name        text not null,
  kind                text not null default 'network',   -- network | business | both
  emails              text[] not null default '{}',       -- afzender-matching (zoals clients.aliases)
  phones              text[] not null default '{}',
  birthday            date,
  cadence_days        int,                                 -- gewenste contactfrequentie
  last_interaction_at timestamptz,                         -- afgeleid, voor "te lang niet gesproken"
  client_id           uuid references clients(id) on delete set null,
  notes               text,
  tier                text not null default 'normaal' check (tier in ('normaal','geheim')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists person_user_idx on person (user_id);

create table if not exists interaction (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  person_id   uuid references person(id) on delete cascade,
  channel     text not null,                               -- mail | whatsapp | call | in_person | fiverr
  direction   text not null default 'in',                  -- in | out
  summary     text,
  owed_reply  boolean not null default false,              -- ben ik een reactie schuldig
  occurred_at timestamptz not null default now(),
  source      text not null default 'manual',
  tier        text not null default 'normaal' check (tier in ('normaal','geheim')),
  created_at  timestamptz not null default now()
);
create index if not exists interaction_user_person_idx on interaction (user_id, person_id, occurred_at desc);

-- ── 2. Huis & admin ───────────────────────────────────────────────────────────
create table if not exists admin_item (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid references auth.users not null,
  title              text not null,
  category           text not null,                        -- insurance|contract|warranty|vehicle|house|subscription_admin|document
  provider           text,
  renewal_on         date,                                 -- verloopt/verlengt (kern-trigger R4)
  notice_period_days int,                                  -- opzegtermijn: hoe vroeg waarschuwen
  amount             numeric(12,2),                        -- jaarlast (link naar finance)
  cancellable        boolean not null default false,
  notes              text,
  tier               text not null default 'normaal' check (tier in ('normaal','geheim')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists admin_item_user_renewal_idx on admin_item (user_id, renewal_on);

create table if not exists admin_document (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null,
  admin_item_id uuid references admin_item(id) on delete cascade,
  title         text,
  kind          text,                                      -- pdf | image
  storage_path  text not null,                             -- in de bestaande 'braindump' bucket
  tier          text not null default 'normaal' check (tier in ('normaal','geheim')),
  created_at    timestamptz not null default now()
);

-- ── 3. Gezondheidsdossier (ook voor Kyra) ─────────────────────────────────────
create table if not exists health_condition (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users not null,
  subject      text not null default 'rick',               -- rick | kyra
  label        text not null,
  opened_at    date not null default current_date,
  status       text not null default 'active',             -- active | monitoring | resolved
  notes        text,
  derived_from uuid[] not null default '{}',               -- lineage: onderliggende events (P1)
  tier         text not null default 'geheim' check (tier in ('normaal','geheim')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists health_condition_user_subject_idx on health_condition (user_id, subject);

-- ── 4. RLS + realtime voor alle nieuwe tabellen ───────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['person','interaction','admin_item','admin_document','health_condition']
  loop
    execute format('alter table %I enable row level security', t);
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname='owner') then
      execute format(
        'create policy "owner" on %I for all to authenticated
           using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    end if;
    execute format('alter table %I replica identity full', t);
    if not exists (
      select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;

-- ── 5. Type-registry + event-spiegeling voor de nieuwe fact-tabellen ──────────
insert into type_registry (type, label, default_domains, default_tier, projection_table) values
  ('person',           'Persoon',          array['relationships'],           'normaal', 'person'),
  ('interaction',      'Contactmoment',    array['relationships'],           'normaal', 'interaction'),
  ('admin_item',       'Admin-item',       array['home_admin'],              'normaal', 'admin_item'),
  ('admin_document',   'Admin-document',   array['home_admin'],              'normaal', 'admin_document'),
  ('health_condition', 'Gezondheidsdossier', array['health'],                'geheim',  'health_condition'),
  -- afgeleide types die de motor produceert (labels + tier centraal):
  ('vet_visit',              'Dierenartsbezoek',      array['pet','health'],       'normaal', null),
  ('subscription_candidate', 'Abonnement-kandidaat',  array['finance'],            'normaal', null),
  ('energy_dip_pattern',     'Slaap/energie-signaal', array['health','mindset'],   'geheim',  null),
  ('project_stall',          'Stilliggend project',   array['work'],               'normaal', null),
  ('owed_reply',             'Openstaande reactie',   array['relationships'],      'normaal', null),
  ('renewal_due',            'Verloopt binnenkort',   array['home_admin'],         'normaal', null)
on conflict (type) do nothing;

-- Spiegel interaction / admin_item / health_condition naar de event-log (dubbel-schrijven).
do $$
declare t text;
begin
  foreach t in array array['interaction','admin_item','health_condition']
  loop
    execute format('drop trigger if exists emit_event on %I', t);
    execute format(
      'create trigger emit_event after insert or update on %I
         for each row execute function public.emit_event()', t);
  end loop;
end $$;

-- ── 6. Motor uitbreiden met R3, R4 en promotie P1 ─────────────────────────────
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

    -- R1 · dierenartsbezoek uit een betaling
    insert into public.events (
      user_id, type, domains, occurred_at, recorded_at, source, source_detail,
      confidence, status, rule_id, tier, payload, dedup_key)
    select
      u, 'vet_visit', array['pet','health'], ft.occurred_on::timestamptz, now(),
      'inferred', 'rule:R1', 0.70, 'inferred', 'R1', 'normaal',
      jsonb_build_object('finance_tx_id', ft.id, 'merchant', ft.counterparty, 'amount', ft.amount,
        'confirm_channel', 'digest', 'question', 'Was dit een dierenartsbezoek voor Kyra?'),
      'R1:' || ft.id::text
    from public.finance_tx ft
    where ft.user_id = u and ft.counterparty is not null
      and ft.counterparty ~* '(dierenart|dierenkliniek|dierenziekenhuis|dierendokter|anicura|evidensia)'
      and not exists (select 1 from public.events e where e.user_id=u and e.rule_id='R1' and e.dedup_key='R1:'||ft.id::text);

    -- R5 · terugkerende vaste uitgave die nog geen abonnement is
    insert into public.events (
      user_id, type, domains, occurred_at, recorded_at, source, source_detail,
      confidence, status, rule_id, tier, payload, dedup_key)
    select
      u, 'subscription_candidate', array['finance'], now(), now(),
      'inferred', 'rule:R5', 0.75, 'inferred', 'R5', 'normaal',
      jsonb_build_object('name', g.counterparty, 'amount', round(g.avg_amt, 2), 'cadence', 'monthly',
        'occurrences', g.n, 'confirm_channel', 'digest',
        'question', 'Terugkerende uitgave bij ' || g.counterparty || ' — als abonnement bijhouden?'),
      'R5:' || lower(g.counterparty)
    from (
      select ft.counterparty, count(*) as n,
             count(distinct to_char(ft.occurred_on, 'YYYY-MM')) as months,
             avg(abs(ft.amount)) as avg_amt, coalesce(stddev_pop(abs(ft.amount)), 0) as sd
      from public.finance_tx ft
      where ft.user_id = u and ft.counterparty is not null and ft.amount < 0
      group by ft.counterparty
      having count(*) >= 3 and count(distinct to_char(ft.occurred_on, 'YYYY-MM')) >= 3
         and avg(abs(ft.amount)) > 0 and coalesce(stddev_pop(abs(ft.amount)), 0) <= 0.15 * avg(abs(ft.amount))
    ) g
    where not exists (select 1 from public.subscriptions s where s.user_id=u and lower(s.name)=lower(g.counterparty))
      and not exists (select 1 from public.events e where e.user_id=u and e.rule_id='R5' and e.dedup_key='R5:'||lower(g.counterparty));

    -- R6 · drie korte slaapnachten op rij (throttle 7 dagen)
    insert into public.events (
      user_id, type, domains, occurred_at, recorded_at, source, source_detail,
      confidence, status, rule_id, tier, payload, dedup_key)
    select
      u, 'energy_dip_pattern', array['health','mindset'], agg.mx::timestamptz, now(),
      'inferred', 'rule:R6', 0.70, 'inferred', 'R6', 'geheim',
      jsonb_build_object('nights', 3, 'confirm_channel', 'digest',
        'question', 'Je sliep 3 nachten kort achter elkaar. Merk je minder energie?'),
      'R6:' || to_char(agg.mx, 'YYYY-MM-DD')
    from (
      select max(t.d) as mx, count(*) as c, bool_and(t.tot < 360) as alldip
      from (
        select date as d, (coalesce(light_min,0)+coalesce(deep_min,0)+coalesce(rem_min,0)) as tot
        from public.health_sleep where user_id = u order by date desc limit 3
      ) t
    ) agg
    where agg.c = 3 and agg.alldip
      and not exists (select 1 from public.events e where e.user_id=u and e.rule_id='R6' and e.recorded_at > now() - interval '7 days');

    -- R7 · actief project ligt stil terwijl de deadline nadert
    insert into public.events (
      user_id, type, domains, occurred_at, recorded_at, source, source_detail,
      confidence, status, rule_id, tier, payload, dedup_key)
    select
      u, 'project_stall', array['work'], now(), now(),
      'inferred', 'rule:R7', 0.80, 'inferred', 'R7', 'normaal',
      jsonb_build_object('project_id', p.id, 'name', p.name, 'deadline', p.deadline,
        'confirm_channel', 'digest', 'question', 'Project "' || p.name || '" ligt stil en de deadline nadert. Actie nodig?'),
      'R7:' || p.id::text || ':' || to_char(now(), 'IYYY-IW')
    from public.projects p
    where p.user_id = u and p.status in ('active','review') and p.deadline is not null
      and p.deadline <= (now()::date + 14) and coalesce(p.archived, false) = false
      and not exists (select 1 from public.project_activity pa where pa.project_id=p.id and pa.created_at > now() - interval '7 days')
      and not exists (select 1 from public.events e where e.user_id=u and e.rule_id='R7' and e.dedup_key='R7:'||p.id::text||':'||to_char(now(),'IYYY-IW'));

    -- R3 · onbeantwoorde inbound mail van een bekend persoon (>24u ongelezen)
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

    -- R4 · admin-item verloopt binnen de opzegtermijn (tijdgevoelig)
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

    -- P1 · promotie: 3+ dierenartsbezoeken in 6 weken -> automatisch Kyra-dossier
    insert into public.health_condition (user_id, subject, label, opened_at, status, notes, derived_from, tier)
    select
      u, 'kyra', 'Terugkerende dierenartsbezoeken', current_date, 'monitoring',
      '3+ dierenartsbezoeken in 6 weken — automatisch dossier (promotie P1).',
      (select coalesce(array_agg(e.id), '{}') from public.events e
       where e.user_id=u and e.type='vet_visit' and e.occurred_at > now() - interval '42 days'),
      'geheim'
    where (select count(*) from public.events e
           where e.user_id=u and e.type='vet_visit' and e.occurred_at > now() - interval '42 days') >= 3
      and not exists (
        select 1 from public.health_condition hc
        where hc.user_id=u and hc.subject='kyra'
          and hc.label='Terugkerende dierenartsbezoeken' and hc.status <> 'resolved');

  end loop;
end;
$$;

revoke execute on function public.run_inference() from public, anon, authenticated;

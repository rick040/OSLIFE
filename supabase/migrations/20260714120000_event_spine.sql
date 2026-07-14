-- OSLIFE · Slice 0 — de event-spine, type-registry, universele envelop & geheim-tier.
--
-- PM-201 datalaag-upgrade. Tot nu toe was de huidige staat verspreid over losse
-- fact-tabellen + twee JSONB-projectierijen; niets legde vast WANNEER iets bekend
-- werd of WAAROM een waarde er staat, en correcties overschreven feiten stil.
--
-- Deze migratie legt het ontbrekende ruggegraat:
--   1. `events`      — append-only log met de universele metadata-envelop. Elke
--                      schrijf naar een fact-tabel wordt hierheen gespiegeld door
--                      een trigger (dubbel-schrijven), zodat niets meer stil
--                      overschreven wordt en elke waarde herleidbaar is.
--   2. `type_registry` — per record-`type`: levensdomeinen, standaard gevoeligheid
--                      (tier), doel-projectietabel en veldcontract. Eén databron
--                      voor de trigger én voor schema-versionering (fase 7).
--   3. `tier`         — twee-traps gevoeligheid (`normaal` / `geheim`) op de
--                      inhoud-dragende tabellen. `geheim` gaat nooit naar cloud-AI
--                      (afdwinging in latere slices; kolom + default hier).
--
-- Bestaande tabellen worden NIET hernoemd of gebroken: ze blijven de
-- read-optimized projectie van de huidige staat; de app en Realtime lezen ze
-- ongewijzigd. Alleen additief. Zelfde single-owner + RLS-vorm als de rest.

-- ── 1. Universele metadata-envelop: de append-only event-log ──────────────────
create table if not exists events (
  seq           bigint generated always as identity,      -- totale volgorde (deterministische herbouw)
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null,
  type          text not null,                            -- recordsoort (= projectietabel of afgeleid type)
  domains       text[] not null default '{}',             -- levensdomeinen (multiplexing); uit type_registry
  occurred_at   timestamptz not null default now(),       -- wanneer het in de wereld gebeurde
  recorded_at   timestamptz not null default now(),       -- wanneer het systeem het leerde
  source        text not null default 'system',           -- sensor|import|manual|inferred|assistant|external|system
  source_detail text,                                     -- fijn label (health_app, abn_csv, rule:vet_visit_v1…)
  source_ref    text,                                     -- externe id / dedup_key (idempotentie op de bron)
  confidence    numeric(3,2) not null default 1.0,        -- 0..1; 1.0 = directe observatie/manueel
  status        text not null default 'observed'          -- observed|inferred|confirmed|rejected|superseded
                check (status in ('observed','inferred','confirmed','rejected','superseded')),
  derived_from  uuid[] not null default '{}',             -- lineage: welke event-id's dit produceerden
  rule_id       text,                                     -- welke inferentieregel (voor tuning bij afwijzing)
  tags          text[] not null default '{}',             -- ontologie- + vrije tags (retrieval-facet)
  tier          text not null default 'normaal'           -- normaal|geheim
                check (tier in ('normaal','geheim')),
  valid_from    timestamptz,                              -- levensduur voor projectie-records
  valid_to      timestamptz,
  payload       jsonb not null default '{}',              -- canonieke inhoud van het event (row-snapshot)
  dedup_key     text                                      -- optionele bron-referentie (geen unieke constraint: log is puur append)
);

create index if not exists events_user_occurred_idx on events (user_id, occurred_at desc);
create index if not exists events_user_type_idx      on events (user_id, type);
create index if not exists events_domains_gin        on events using gin (domains);
create index if not exists events_tags_gin           on events using gin (tags);
-- lineage-opzoeking: "welk event hoort bij deze projectie-rij?"
create index if not exists events_payload_id_idx     on events ((payload->>'id'));

alter table events enable row level security;
create policy "owner" on events for all to authenticated
  using  ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
-- Bewust NIET aan supabase_realtime toegevoegd: de log is hoog-volume en de
-- client leest de staat uit de projecties (bestaand kanaal oslife-live).

-- ── 2. Type-registry: per-type levensdomeinen, tier, projectie & contract ─────
create table if not exists type_registry (
  type             text primary key,
  label            text not null,
  default_domains  text[] not null default '{}',          -- levensdomeinen die dit type voedt
  default_tier     text not null default 'normaal' check (default_tier in ('normaal','geheim')),
  projection_table text,                                  -- welke tabel dit type projecteert (null = puur afgeleid)
  field_contract   jsonb not null default '{}',           -- huidig veldcontract (schema-versionering, fase 7)
  version          int not null default 1,
  active           boolean not null default true,
  updated_at       timestamptz not null default now()
);
alter table type_registry enable row level security;
-- Registry is niet user-gebonden (metadata); lezen mag voor elke ingelogde user,
-- schrijven gaat via migraties/service-role.
create policy "read" on type_registry for select to authenticated using (true);

insert into type_registry (type, label, default_domains, default_tier, projection_table) values
  ('finance_tx',         'Transactie',            array['finance'],                 'normaal', 'finance_tx'),
  ('payments',           'Openstaande betaling',  array['finance'],                 'normaal', 'payments'),
  ('health_daily_stats', 'Dagelijkse activiteit', array['health'],                  'normaal', 'health_daily_stats'),
  ('health_sleep',       'Slaap',                 array['health'],                  'normaal', 'health_sleep'),
  ('health_body_metrics','Lichaamsmeting',        array['health'],                  'normaal', 'health_body_metrics'),
  ('daily_checkin',      'Dagelijkse check-in',   array['health','mindset'],        'geheim',  'daily_checkin'),
  ('dog_log',            'Kyra-activiteit',       array['pet','health'],            'normaal', 'dog_log'),
  ('phone_events',       'Telefoon-activiteit',   array['behaviour','health'],      'normaal', 'phone_events'),
  ('screentime',         'Schermtijd',            array['behaviour'],               'normaal', 'screentime'),
  ('gmail_messages',     'E-mail',                array['work','relationships'],    'normaal', 'gmail_messages'),
  ('day_blocks',         'Agendablok',            array['calendar'],                'normaal', 'day_blocks'),
  ('habit_log',          'Gewoonte-tik',          array['habits'],                  'normaal', 'habit_log'),
  ('project_activity',   'Projectactiviteit',     array['work'],                    'normaal', 'project_activity'),
  ('braindump_entries',  'Capture',               array['cross'],                   'normaal', 'braindump_entries')
on conflict (type) do nothing;

-- ── 3. Gevoeligheids-tier op de inhoud-dragende tabellen ──────────────────────
-- Default 'normaal' zodat geen bestaande flow breekt; records worden expliciet
-- 'geheim' gemarkeerd (of via de type-default bij nieuwe schrijf). daily_checkin
-- krijgt geen kolom-default 'geheim' hier om bestaande rijen niet te herclassificeren;
-- de type_registry-default stuurt de nieuwe event-tier.
alter table braindump_entries add column if not exists tier text not null default 'normaal';
alter table daily_checkin     add column if not exists tier text not null default 'normaal';
alter table finance_tx        add column if not exists tier text not null default 'normaal';
alter table brain_state       add column if not exists tier text not null default 'normaal';
alter table heyra_memory      add column if not exists tier text not null default 'normaal';

do $$
declare t text;
begin
  foreach t in array array['braindump_entries','daily_checkin','finance_tx','brain_state','heyra_memory']
  loop
    execute format(
      'alter table %I drop constraint if exists %I', t, t || '_tier_chk');
    execute format(
      'alter table %I add constraint %I check (tier in (''normaal'',''geheim''))', t, t || '_tier_chk');
  end loop;
end $$;

-- ── 4. Dubbel-schrijven via trigger (geen ingestie-code aangeraakt) ───────────
-- Spiegelt elke INSERT/UPDATE op een fact-tabel naar `events`. Levensdomeinen en
-- standaard-tier komen uit type_registry (keyed op de tabelnaam). Exception-safe:
-- een fout in het loggen mag de primaire schrijf NOOIT blokkeren.
create or replace function public.emit_event()
returns trigger
language plpgsql
as $$
declare
  j    jsonb := to_jsonb(new);
  reg  record;
begin
  begin
    select default_domains, default_tier
      into reg
      from public.type_registry
     where type = tg_table_name;

    insert into public.events (
      user_id, type, domains, occurred_at, recorded_at,
      source, confidence, status, tier, payload, dedup_key)
    values (
      (j->>'user_id')::uuid,
      tg_table_name,
      coalesce(reg.default_domains, '{}'),
      coalesce(
        (j->>'occurred_at')::timestamptz,
        (j->>'occurred_on')::timestamptz,
        (j->>'ts')::timestamptz,
        (j->>'received_at')::timestamptz,
        (j->>'datetime')::timestamptz,
        (j->>'happened_at')::timestamptz,
        (j->>'date')::timestamptz,
        (j->>'usage_date')::timestamptz,
        (j->>'on_date')::timestamptz,
        (j->>'due')::timestamptz,
        (j->>'created_at')::timestamptz,
        now()),
      now(),
      coalesce(j->>'source', 'system'),
      1.0,
      'observed',
      coalesce(j->>'tier', reg.default_tier, 'normaal'),
      j,
      tg_table_name || ':' || coalesce(j->>'id', j->>'dedup_key', j->>'external_id', '')
    );
  exception when others then
    -- Loggen mag de bron-write nooit laten falen.
    null;
  end;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'finance_tx','payments','health_daily_stats','health_sleep','health_body_metrics',
    'daily_checkin','dog_log','phone_events','screentime','gmail_messages',
    'day_blocks','habit_log','project_activity','braindump_entries'
  ]
  loop
    execute format('drop trigger if exists emit_event on %I', t);
    execute format(
      'create trigger emit_event after insert or update on %I
         for each row execute function public.emit_event()', t);
  end loop;
end $$;

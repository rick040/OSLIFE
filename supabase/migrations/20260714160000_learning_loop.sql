-- OSLIFE · Slice 4 — leer-loop: regel-tuning, self-audit, vergeetbeleid + tombstones.
--
-- Sluit het bouwplan. Drie mechanismen:
--   1. Regel-tuning  — een regel die je structureel verwerpt, stopt met voorstellen.
--                      Afgedwongen via een BEFORE INSERT-trigger op events, zodat
--                      run_inference ongewijzigd blijft.
--   2. Self-audit    — maandelijkse rapportage: welke regels vuren nooit, welke
--                      worden veel verworpen, welke nieuwe domeinen blijven leeg.
--                      Geschreven als summaries-rij (period='month', domain='audit'),
--                      dus zichtbaar in de Samenvattingen-tab.
--   3. Vergeten      — forget() verwijdert een record HARD, inclusief de gespiegelde
--                      kopie in de event-log, en laat een tombstone-event achter zodat
--                      de verwijdering herleidbaar is zonder de inhoud te bewaren
--                      (recht op vergeten, met name voor tier=geheim).

-- ── 1. Regel-tuning: onderdruk een regel met te hoge afwijs-ratio ─────────────
create or replace function public.rule_suppressed(p_user uuid, p_rule text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select (rej >= 3 and rej::numeric / nullif(conf + rej, 0) >= 0.7)
     from (
       select count(*) filter (where status = 'confirmed') as conf,
              count(*) filter (where status = 'rejected')  as rej
       from public.events
       where user_id = p_user and rule_id = p_rule
     ) t),
    false);
$$;

-- BEFORE INSERT op events: laat een nieuwe inferentie van een onderdrukte regel
-- stil vallen. Observed/afgeleide events (rule_id null) passeren altijd.
create or replace function public.suppress_muted_inferences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'inferred' and new.rule_id is not null
     and public.rule_suppressed(new.user_id, new.rule_id) then
    return null; -- regel wordt structureel verworpen → niet opnieuw voorstellen
  end if;
  return new;
end;
$$;

drop trigger if exists suppress_muted on public.events;
create trigger suppress_muted before insert on public.events
  for each row execute function public.suppress_muted_inferences();

-- ── 2. Maandelijkse self-audit ────────────────────────────────────────────────
create or replace function public.run_self_audit()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  u uuid;
  body text;
  fired text;
  never text;
  muted text;
  empty_domains text;
  all_rules text[] := array['R1','R3','R4','R5','R6','R7'];
begin
  for u in select id from auth.users loop
    body := '';

    select string_agg(distinct rule_id, ', ' order by rule_id) into fired
      from public.events where user_id = u and rule_id is not null;

    select string_agg(r, ', ') into never
      from unnest(all_rules) r
      where not exists (select 1 from public.events e where e.user_id = u and e.rule_id = r);

    select string_agg(r, ', ') into muted
      from unnest(all_rules) r
      where public.rule_suppressed(u, r);

    select string_agg(t, ', ') into empty_domains
      from (
        select 'relaties' t where not exists (select 1 from public.person where user_id = u)
        union all select 'huis&admin' where not exists (select 1 from public.admin_item where user_id = u)
        union all select 'dossiers' where not exists (select 1 from public.health_condition where user_id = u)
      ) x;

    body := 'Self-audit ' || to_char(current_date, 'YYYY-MM') || E':\n';
    body := body || '- Regels actief: ' || coalesce(fired, 'geen') || E'\n';
    if never is not null then body := body || '- Vuurden nooit: ' || never || E'\n'; end if;
    if muted is not null then body := body || '- Onderdrukt (te vaak verworpen): ' || muted || E'\n'; end if;
    if empty_domains is not null then body := body || '- Domeinen nog leeg: ' || empty_domains || E'\n'; end if;

    insert into public.summaries (user_id, period, period_start, domain, text, event_count, tier)
    values (u, 'month', date_trunc('month', current_date)::date, 'audit', rtrim(body, E'\n'), 0, 'normaal')
    on conflict (user_id, period, period_start, domain)
    do update set text = excluded.text, created_at = now();
  end loop;
end;
$$;

revoke execute on function public.run_self_audit() from public, anon, authenticated;

-- ── 3. Vergeten + tombstone ───────────────────────────────────────────────────
-- Verwijdert een record hard uit zijn projectietabel EN de gespiegelde kopie in
-- de event-log (emit_event dupliceerde de inhoud daarheen), en laat een inhoudsloze
-- tombstone achter. Alleen eigen data (of vertrouwde service-role).
create or replace function public.forget(p_table text, p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid;
begin
  if p_table not in ('braindump_entries','interaction','person','admin_item',
                     'admin_document','health_condition','daily_checkin') then
    raise exception 'forget() not allowed for table %', p_table;
  end if;

  execute format('select user_id from public.%I where id = $1', p_table)
    into owner using p_id;
  if owner is null then return false; end if;
  if auth.uid() is not null and auth.uid() <> owner then
    raise exception 'not authorized to forget this record';
  end if;

  -- Verwijder het record zelf.
  execute format('delete from public.%I where id = $1', p_table) using p_id;
  -- Verwijder de gespiegelde kopie in de event-log (inhoud mag niet achterblijven).
  delete from public.events where user_id = owner and type = p_table and payload->>'id' = p_id::text;
  -- Herleidbare, inhoudsloze tombstone.
  insert into public.events (user_id, type, domains, source, confidence, status, tier, payload)
  values (owner, 'tombstone', array[]::text[], 'system', 1.0, 'observed', 'normaal',
          jsonb_build_object('of_table', p_table, 'of_id', p_id::text));
  return true;
end;
$$;

grant execute on function public.forget(text, uuid) to authenticated, service_role;

-- ── 4. Maandschema via pg_cron ────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('oslife-self-audit', '0 4 1 * *', 'select public.run_self_audit()');
  end if;
end $$;

# MacroDroid → locatie-check-ins (PM-072 Fase 1)

**Nieuw** — anders dan de andere integraties in deze map, bestond dit contract nog niet. Er was
geen enkele geofence-/locatie-ingest in OSLIFE (zie het auditverslag in het plan-document). Dit is
de basis voor élke toekomstige "X keer bij Y binnen Z dagen"-regel, niet alleen de dierenarts/
Kyra-case — de drempelwaarden leven in de `trigger_rules`-tabel, niet in code.

MacroDroid stuurt bij het **binnenkomen** van een geofence een check-in naar de
`geofence-ingest` Edge Function; die schrijft 'm weg in `location_checkins`. De (uur-)cron
`run_inference()` leest die tabel en stelt een dossier/actie voor zodra een geconfigureerde
drempel gehaald wordt (bv. 3x binnen 7 dagen) — dat voorstel zie je terug op het
**Inferenties**-scherm, net als de andere automatische suggesties.

## Endpoint

```
https://nhyunnnmdcmojvkxrbpl.supabase.co/functions/v1/geofence-ingest
```

Auth: de header `x-webhook-secret: <secret>` **of** de query-param `?secret=<secret>` — zelfde
patroon als de andere MacroDroid-functies. De functie gebruikt `GEOFENCE_WEBHOOK_SECRET`, en valt
terug op je bestaande `WALLET_WEBHOOK_SECRET` (zelfde telefoon/MacroDroid-app) als je 'm niet apart
zet.

## Macro — Geofence binnengekomen

- **Trigger:** Locatie → **Geofence** → kies/maak de plek (bv. "Dierenarts Kyra") → toestand
  **Binnengekomen / Entered**
- **Actie:** HTTP-verzoek → **GET**
  ```
  …/functions/v1/geofence-ingest?place_name=Dierenarts%20Kyra&place_id=vet_kyra&event=enter&secret=<secret>
  ```
  `place_id` is een stabiel, door jou gekozen label voor deze plek (gebruik je later als
  `place_matcher` als je een regel op exacte id wilt matchen i.p.v. op naam). `place_name` is wat
  je terugziet in de app en wat de regex in `trigger_rules.place_matcher` standaard op matcht.

Optioneel, als je MacroDroid's Locatie-variabelen erbij wilt: voeg `&lat={lat}&lon={lon}` toe.

Een geofence-macro met een **Verlaten/Exited**-trigger mag je ook op dit endpoint laten wijzen met
`&event=exit` — die wordt geaccepteerd maar genegeerd (`{"ok":true,"ignored":true}`), zodat je geen
aparte macro-zonder-actie hoeft te bouwen als MacroDroid er toch één wil aanmaken.

## Testen

- Plak de URL met je echte secret + een test-`place_name` in een browser, of gebruik MacroDroid's
  **Test acties**. Verwacht: `{"ok":true,"logged":1}`.
- `{"ok":false,"error":"Unauthorized"}` → de secret klopt niet.
- Een nieuw voorstel verschijnt pas zodra de configureerde drempel gehaald is (standaard voor de
  Kyra-regel: 3 losse dagen binnen 7 dagen) — dit checkt de uurlijkse `run_inference()`-cron, dus
  reken op maximaal een uur vertraging na het bereiken van de drempel, niet meteen na de laatste
  check-in.

## Een eigen regel toevoegen (zonder migratie/code)

Elke rij in `trigger_rules` is een onafhankelijke, configureerbare regel — voeg er zelf een toe
in de Supabase SQL Editor (of laat OSLIFE dit later autonoom voorstellen, zie Fase 4/5 in het
plan):

```sql
insert into trigger_rules (user_id, rule_key, place_matcher, match_field, count_threshold, window_days, domains, question)
values (
  '<jouw auth.users id>', 'sportschool', '(?i)fitness|gym|sportschool', 'place_name', 3, 7,
  array['health'], 'Je bent de afgelopen week 3x bij de sportschool geweest — een workout-log bijhouden?'
);
```

## Deploy + secret

```bash
supabase functions deploy geofence-ingest --project-ref nhyunnnmdcmojvkxrbpl
supabase secrets set GEOFENCE_WEBHOOK_SECRET=<random string> --project-ref nhyunnnmdcmojvkxrbpl
```

En de migratie `supabase/migrations/20260717000000_location_trigger_rules.sql`.

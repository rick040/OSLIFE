# MacroDroid → activiteiten (fietsen / auto) direct naar Supabase

Vervangt de Google Apps Script "Activiteiten"-sheet (`doGet` die Started/Stopped-rijen
appendt en de duur berekent door rij N te matchen met rij N-1). Dat matchen-op-positie
brak zodra MacroDroid een **valse stop** logde — de Activity Recognition-confidence
zakt even onder de drempel en herstelt seconden later — waardoor één rit in meerdere
losse rijen versplinterde. `activity-ingest` lost dit op de server op: een "started"-
event dat binnen een kort tijdvenster na dezelfde activiteit's laatste "stopped"-event
binnenkomt heropent de bestaande sessie in plaats van een nieuwe te starten (zelfde
patroon als `geofence-ingest`/`location_visits`).

## Endpoint

```
https://nhyunnnmdcmojvkxrbpl.supabase.co/functions/v1/activity-ingest
```

Auth: header `x-webhook-secret: <ACTIVITY_WEBHOOK_SECRET>` **of** de query-param
`?secret=<secret>` — zelfde patroon als de andere MacroDroid-functies. Valt terug op
je bestaande `WALLET_WEBHOOK_SECRET` als je `ACTIVITY_WEBHOOK_SECRET` niet apart zet.

## Macro — geen structuurwijziging, alleen de URL

Je bestaande macro ("Activiteiten", met de Als/Anders-structuur op confidence) blijft
precies zoals hij is — je vervangt alleen de twee `script.google.com/macros/...`
HTTP-request-URL's:

- **Als-tak** (hoge confidence, bv. Vertrouwen >= 60/70%) → GET
  ```
  …/functions/v1/activity-ingest?activity=[trigger_naam]&state=started&secret=<secret>
  ```
- **Anders-tak** (lage confidence, bv. Vertrouwen < 50%) → GET
  ```
  …/functions/v1/activity-ingest?activity=[trigger_naam]&state=stopped&secret=<secret>
  ```

`activity` mag de rauwe trigger-naam blijven die je al gebruikte (bv.
`"Activiteit - Op de fiets: Vertrouwen >= 60%"`) — `activity-ingest` strip
`"Activiteit - "` en `": Vertrouwen…"` net als de oude Apps Script deed, en matcht
op `fiets`/`cycling`/`bike` → `cycling`, `voertuig`/`vehicle`/`auto`/`car` →
`in_vehicle`. Heb je liever losse triggers per activiteit zonder Als/Anders, dan werkt
`state=started`/`state=stopped` ook los per macro.

Alternatief: stuur `confidence=[percentage]` mee in plaats van `state` — de functie
leidt zelf started/stopped af (>=50% = started, <50% = stopped), voor het geval je
macro geen apart `state`-veld heeft.

## Response

- `{"ok":true,"activity":"cycling","state":"started","session":"started","id":"..."}` — nieuwe sessie
- `{"ok":true,...,"session":"already_open",...}` — dubbele start-trigger, genegeerd
- `{"ok":true,...,"session":"merged_false_stop",...}` — valse stop hersteld, zelfde sessie loopt door
- `{"ok":true,...,"state":"stopped","session":"closed",...}` — sessie afgesloten
- `{"ok":true,...,"session":"ignored_no_open_session"}` — stray stop zonder open sessie, genegeerd
- `{"ok":false,"error":"Unauthorized"}` — secret klopt niet

Merge-venster is standaard 3 minuten, instelbaar via de `ACTIVITY_MERGE_MINUTES`
secret/env var op de functie.

## Testen

- Plak de GET-URL met je echte secret in een browser, of gebruik MacroDroid's
  **Test acties**.
- Logs: `supabase functions logs activity-ingest --project-ref nhyunnnmdcmojvkxrbpl`
- Sessies zijn zichtbaar in de app onder **Gezondheid → Activiteiten · fietsen &
  onderweg** (leest rechtstreeks uit `activity_sessions`, geen aparte lijst-endpoint
  nodig).

## Deploy + secret

```bash
supabase functions deploy activity-ingest --project-ref nhyunnnmdcmojvkxrbpl
supabase secrets set ACTIVITY_WEBHOOK_SECRET=<random string> --project-ref nhyunnnmdcmojvkxrbpl
```

En de migratie `supabase/migrations/20260804210000_activity_sessions.sql`.

## Oude Google Sheet

Zodra dit werkt kun je de MacroDroid-trigger op de oude `doGet`-Apps-Script-URL en de
bijbehorende "Activiteiten"-sheet laten voor wat ze zijn (of verwijderen) — dit
endpoint vervangt ze volledig, inclusief de valse-stop-fix die de sheet nooit had.

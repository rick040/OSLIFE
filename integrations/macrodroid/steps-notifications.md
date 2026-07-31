# MacroDroid → stappen uit stappenteller-notificatie

Vervangt de oude "Stappen"-tab in de Health-sheet: MacroDroid vangt de
stappen-notificatie van Samsung Health (of Google Fit) af — bv. **"4.391
stappen"** — en post die direct naar `steps-ingest`, dat alleen de
`steps`-kolom van vandaag's `health_daily_stats`-rij bijwerkt (upsert op
`user_id, date`). Bestaat de rij voor vandaag nog niet, dan wordt hij
aangemaakt; bestaat hij al (bv. omdat Tasker al slaapdata voor vandaag
schreef), dan wordt alléén het stappenaantal bijgewerkt — de "middernacht"-
logica zit dus al in de database, niet in de macro.

## Endpoint

```
https://nhyunnnmdcmojvkxrbpl.supabase.co/functions/v1/steps-ingest
```

Auth: header `x-webhook-secret: <PHONE_WEBHOOK_SECRET>` (dezelfde secret die
`phone-events-ingest` en `weight-ingest` al gebruiken — geen aparte secret
nodig, tenzij je `STEPS_WEBHOOK_SECRET` los instelt).

## Macro

- **Trigger:** Notificatie ontvangen/bijgewerkt → app **Samsung Health**
  (of Google Fit)
- **Constraint:** Macro-uitvoerfrequentie — max. 1x per uur (of vaker als je
  wilt, maar niet bij elke stap: de notificatie update continu). Dit is een
  constraint op de macro zelf, niet iets dat in de HTTP-actie hoeft.
- **Actie:** HTTP-verzoek → **POST**
  `…/functions/v1/steps-ingest`
  Headers: `Content-Type: application/json`, `x-webhook-secret: <secret>`
  Body:
  ```json
  {"title": "[notification_title]", "text": "[notification_text]"}
  ```

`steps-ingest` haalt het getal zelf uit de tekst (regex op `NNN stappen` /
`NNN steps`, met of zonder duizendtal-punt/komma — "4.391 stappen" wordt
correct 4391). Verwacht bij een geslaagde match:
`{"ok":true,"date":"2026-07-31","steps":4391}`.

## Alternatief: MacroDroid haalt het getal zelf uit de notificatie

Als je liever een MacroDroid-tekstbewerking-actie gebruikt (regex `\d+` op de
notificatietekst, na het strippen van het duizendtal-scheidingsteken) i.p.v.
de server het te laten parsen, stuur dan het al-uitgepakte getal mee:

```json
{"steps": [lv=stappen]}
```

Optioneel ook een expliciete datum meesturen (anders neemt de functie zelf
"vandaag" in Europe/Amsterdam-tijd, niet UTC):

```json
{"steps": [lv=stappen], "date": "[year]-[month_number]-[dayofmonth]"}
```

## Testen

1. Open de stappen-notificatie op je telefoon zodat je de exacte titel/tekst
   ziet.
2. Draai de macro via **Test acties**.
3. Krijg je `{"ok":false,"error":"No steps found","title":"...","text":"..."}`
   terug? Stuur me de exacte `title`/`text` (of check
   `supabase functions logs steps-ingest --project-ref nhyunnnmdcmojvkxrbpl`)
   en de regex in `supabase/functions/steps-ingest/index.ts` wordt aangepast.

## Verhouding tot Tasker/Health Connect

`health-ingest` (Tasker, Health Connect) kan losstaand óók stappen posten.
Beide routes schrijven idempotent naar dezelfde kolom via upsert — wie het
laatst post "wint" voor die dag, verder geen dubbele rijen (in tegenstelling
tot gewicht, is hier maar één datapunt per dag, geen losse metingen).

# MacroDroid → schermtijd per app (Opened/Closed, geen sheet)

Actieve tijd **per app** bijhouden, rechtstreeks in Supabase — precies dezelfde
aanpak als de oude Apps-Script-webhook (Timestamp | App Name | State | Screen
Time), alleen zonder spreadsheet ertussen. MacroDroid stuurt bij het openen én
sluiten van een app de app-naam + status naar de `screentime-app-ingest` Edge
Function; die bewaart elk event ruw en berekent bij elke "Closed" de duur
zelf, net als de sheet-formule deed.

## Endpoint

```
https://nhyunnnmdcmojvkxrbpl.supabase.co/functions/v1/screentime-app-ingest
```

Auth: header `x-webhook-secret: <secret>` **of** de query-param `?secret=<secret>`
(de query-param is het makkelijkst op de telefoon). De functie gebruikt
`SCREENTIME_WEBHOOK_SECRET`, met terugval op `PHONE_WEBHOOK_SECRET`, met
terugval op `WALLET_WEBHOOK_SECRET` — dezelfde telefoon/MacroDroid-app als je
slaap-/pickup-macro's, dus je hoeft geen nieuw secret te verzinnen.

Elke macro-actie stuurt:

```
…/functions/v1/screentime-app-ingest?app={app_name}&state={Opened|Closed}&secret=<secret>
```

- `app` — de naam van de app (bv. `YouTube`). Gebruik de Magic Text van de
  trigger zodat één macro meerdere apps aankan.
- `state` — `Opened` bij "App geopend", `Closed` bij "App gesloten" (aliassen
  open/start/launched en close/stop/end werken ook).

Geen stopwatch, geen Magic-Text-duur nodig — de functie onthoudt zelf wanneer
een app openging en trekt dat af van het sluitmoment.

---

## Snel importeren

`integrations/macrodroid/oslife-app-timer.macro` is een kant-en-klare export van
de macro hieronder (MacroDroid → Import macro). Zet na import alleen je eigen
secret in de lokale variabele `secret` en selecteer de apps bij beide triggers.

## De macro — één macro voor meerdere apps

### Triggers
- **App geopend (App Launched):** selecteer alle apps die je wilt bijhouden
  (YouTube, Instagram, …).
- **App gesloten (App Closed):** dezelfde apps.

### Acties — voorwaardelijke logica op basis van welke trigger afging
1. **If** → conditie **"Trigger afgegaan / Trigger fired"** → kies de
   **App geopend**-trigger. Daaronder:
   - **HTTP-verzoek → GET** naar de URL hierboven met `app={app_name}` (Magic
     Text van de trigger) en `state=Opened`.
2. **Else If** → conditie **"Trigger afgegaan"** → kies de **App gesloten**-trigger.
   Daaronder:
   - **HTTP-verzoek → GET** naar dezelfde URL met `app={app_name}` en
     `state=Closed`.

> Dit zijn exact dezelfde twee triggers en dezelfde `app`/`state`-parameters als
> de oude webhook naar de Schermtijd-sheet — alleen de URL verandert.

## Variant — per app een eigen macro

Wil je het simpel houden, maak dan per app een aparte macro met een vaste
app-naam in de URL (`&app=YouTube`) in plaats van `{app_name}`. Verder
identiek.

## Testen

- Draai de macro één keer (MacroDroid → macro → ⋮ → **Test acties**) of plak de
  URL met je echte secret in een browser. Verwacht bij `state=Opened`:
  `{"ok":true,"logged":1,"screentime_rows":0}`; bij de bijbehorende
  `state=Closed`: `{"ok":true,"logged":1,"screentime_rows":1}` (het aantal
  dag-totalen dat is bijgewerkt).
- `{"ok":false,"error":"Unauthorized"}` → de secret klopt niet.
- `{"ok":false,"error":"Need app=<name> and state=Opened|Closed"}` → `app` of
  `state` ontbreekt/is onherkenbaar.

De per-app tijd verschijnt in **Schermtijd** en de feed staat als **Schermtijd**
op het **Databronnen**-scherm. Batterij: geef MacroDroid vrijstelling van
batterij-optimalisatie, anders worden App-triggers gemist.

## Deploy + migratie

```bash
supabase functions deploy screentime-app-ingest --project-ref nhyunnnmdcmojvkxrbpl
```

Migratie `supabase/migrations/20260725050000_screentime_app_events.sql` (maakt
`screentime_events` aan, verwijdert de oude `app_sessions`-tabel en wist de
verouderde, sheet-geïmporteerde rijen in `screentime` zodat oude en nieuwe data
niet dooreenlopen).

## Verhouding tot de Schermtijd-sheet

Deze macro vervangt de Schermtijd-sheet volledig voor per-app-tijd: de sheet,
`screentime-sheet.gs` en de `screentime-sheet-ingest` Edge Function zijn
verwijderd. Phone-unlocks (`screentime_daily.pickups`) blijven ongewijzigd via
`phone-events-ingest` lopen — dat is een los signaal (schermontgrendelingen,
niet per-app) en staat hier los van.

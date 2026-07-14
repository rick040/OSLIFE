# MacroDroid → schermtijd per app (stopwatch)

Actieve tijd **per app** bijhouden met een MacroDroid-stopwatch, zónder losse app
(StayFree) of Google Sheet. Terwijl een app op de voorgrond staat loopt een
stopwatch; bij het sluiten stuurt MacroDroid de app-naam + de verstreken tijd naar
de `phone-events-ingest` Edge Function. Die bewaart de sessie in `app_sessions` en
telt er de dag-totalen per app van bij elkaar in `screentime` — dezelfde
"opnieuw-berekenen-uit-ruwe-events"-aanpak als de ontgrendelingen (pickups). Dit is
de MacroDroid-tegenhanger waar de Schermtijd-sheet tot nu toe de enige bron voor was.

## Endpoint

```
https://nhyunnnmdcmojvkxrbpl.supabase.co/functions/v1/phone-events-ingest
```

Zelfde endpoint en secret als de slaap-/pickup-macro's (`phone-sleep.md`). Auth: de
header `x-webhook-secret: <secret>` **of** de query-param `?secret=<secret>` (de
functie gebruikt `PHONE_WEBHOOK_SECRET`, met terugval op `WALLET_WEBHOOK_SECRET`).
De query-param is het makkelijkst op de telefoon.

Bij het sluiten van een app stuurt de macro:

```
…/functions/v1/phone-events-ingest?kind=app_usage&app={app_name}&seconds={stopwatch}&secret=<secret>
```

- `app` — de naam van de app (bv. `YouTube`). Gebruik de Magic Text van de
  "App gesloten"-trigger zodat één macro meerdere apps aankan.
- Duur — één van `seconds` (aanrader), `ms`, of `duration`. De functie snapt
  losse seconden (`754`), klok-notatie (`12:34` = mm:ss, `1:02:03` = h:mm:ss) én
  tokens (`1u 3m 12s`). Zet hier de **stopwatch-waarde** via de Magic Text-knop.

---

## De stopwatch aanmaken

Registreer de stopwatch één keer voordat je de macro bouwt: via de **startscherm-tegel**
van MacroDroid → nieuwe stopwatch toevoegen, naam **"app timer"**.

## De macro — één macro voor meerdere apps (aanrader)

### Triggers
- **App geopend (App Launched):** selecteer alle apps die je wilt bijhouden
  (YouTube, Instagram, …).
- **App gesloten (App Closed):** dezelfde apps.

### Acties — voorwaardelijke logica op basis van welke trigger afging
1. **If** → conditie **"Trigger afgegaan / Trigger fired"** → kies de
   **App geopend**-trigger. Daaronder:
   - **Stopwatch** → "app timer" → **Reset** en daarna **Start** (of gebruik het
     Action Block uit stap "Reset" hieronder), zodat elke sessie op 0 begint.
   - **Zwevende tekst (Floating Text):** toon de tijd als overlay. Klik op
     **Magic Text** en kies de waarde van de stopwatch, zodat de lopende tijd op
     je scherm staat.
2. **Else If** → conditie **"Trigger afgegaan"** → kies de **App gesloten**-trigger.
   Daaronder, **in deze volgorde** (de stopwatch-waarde moet gelezen worden vóór
   je hem stopt/reset):
   - **HTTP-verzoek → GET** naar de URL hierboven. Vul bij `app` de
     **`{app_name}`** Magic Text van de trigger in en bij `seconds` de
     **stopwatch-waarde** (Magic Text).
   - **Stopwatch** → "app timer" → **Stop**.
   - **Zwevende tekst verbergen** → verberg de overlay.

> Omdat er (bijna) altijd maar één app tegelijk op de voorgrond staat, kan één
> gedeelde stopwatch alle apps aan: hij reset bij elke app-start en meet zo steeds
> de voorgrond-sessie van de laatst geopende app.

## Variant — per app een eigen macro

Wil je het simpel houden, maak dan per app een aparte macro met een vaste app-naam
in de URL (`&app=YouTube`) in plaats van `{app_name}`. Verder identiek.

## Optioneel — reset-knop via een Action Block

Voeg een los **Action Block** toe dat de stopwatch **reset en herstart**. Bewerk
daarna de "Zwevende tekst"-actie en stel in dat een **klik op de zwevende tekst**
dat Action Block aanroept — zo zet je de timer tijdens gebruik weer op nul.

## Testen

- Draai de macro één keer (MacroDroid → macro → ⋮ → **Test acties**) of plak de URL
  met je echte secret in een browser. Verwacht:
  `{"ok":true,"logged":1,"screentime_rows":1}`.
- `{"ok":false,"error":"Unauthorized"}` → de secret klopt niet.
- `{"ok":false,"error":"No valid app session …"}` → `app` ontbreekt of de duur was
  0 (stopwatch-Magic Text niet ingevuld).

De per-app tijd verschijnt in **Schermtijd** en de feed staat als **Schermtijd** op
het **Databronnen**-scherm. Batterij: geef MacroDroid vrijstelling van
batterij-optimalisatie, anders worden App-triggers gemist.

## Deploy + migratie

```bash
supabase functions deploy phone-events-ingest --project-ref nhyunnnmdcmojvkxrbpl
```

Migratie `supabase/migrations/20260714170000_app_sessions.sql` (de `app_sessions`-tabel).
`PHONE_WEBHOOK_SECRET` en `OSLIFE_USER_ID` zijn al gezet voor de bestaande macro's.

## Verhouding tot de Schermtijd-sheet

Deze macro is bedoeld als vervanging van de per-app-tabbladen van de Schermtijd-sheet
(net zoals de ontgrendelingen naar `phone_events` verhuisden). Laat je beide bronnen
lopen, dan tellen ze op als hun categorie verschilt — kies er één per app.

# MacroDroid → slaap uit telefoongebruik

Slaap **zonder health-app**. MacroDroid stuurt bij slaap-events een timestamp naar de
`phone-events-ingest` Edge Function; die schrijft er een slaapsessie van in `health_sleep`
(`source='phone'`). Echte Samsung-Health-sessies (`source='health_app'`) winnen altijd en
worden nooit overschreven.

Er zijn **twee manieren**, in volgorde van nauwkeurigheid. Je hoeft er maar één te doen —
manier A is de aanrader. Doe je beide, dan wint A per nacht.

## Endpoint

```
https://nhyunnnmdcmojvkxrbpl.supabase.co/functions/v1/phone-events-ingest
```

Auth: de header `x-webhook-secret: <secret>` **of** de query-param `?secret=<secret>`. De functie
gebruikt `PHONE_WEBHOOK_SECRET`, en valt terug op je bestaande `WALLET_WEBHOOK_SECRET` (zelfde
telefoon/MacroDroid). De query-param is het makkelijkst op de telefoon.

---

## Manier A — MacroDroid's eigen slaapdetectie (aanrader)

MacroDroid heeft een **Slaap**-trigger die zelf detecteert wanneer je in slaap valt en wakker
wordt (op basis van bewegingloosheid + tijd). Dat is de nauwkeurigste bron: geen schatting, maar
een echte begin- en eindtijd. Maak twee macro's.

### Macro A1 — In slaap gevallen
- **Trigger:** Slaap → toestand **In slaap / Asleep**
- **Actie:** HTTP-verzoek → **GET**
  `…/functions/v1/phone-events-ingest?kind=sleep_start&secret=<secret>`

### Macro A2 — Wakker geworden
- **Trigger:** Slaap → toestand **Wakker / Awake**
- **Actie:** HTTP-verzoek → **GET**
  `…/functions/v1/phone-events-ingest?kind=sleep_end&secret=<secret>`

De functie koppelt elke `sleep_end` aan de laatste `sleep_start` ervoor (binnen 14 u) en zet dat
één-op-één als slaapsessie neer — geen heuristiek.

---

## Manier B — Ontgrendel-/scherm-uit-events (fallback)

Werkt zónder de Slaap-trigger. De functie leidt de nacht af uit het langste gat tussen
ontgrendelingen (Samsung Health's "je gebruikt je telefoon 's nachts niet" -aanpak).

### Macro B1 — Ontgrendeling
- **Trigger:** Apparaat-events → **Scherm ontgrendeld** (Screen Unlocked)
- **Actie:** HTTP GET `…?kind=unlock&secret=<secret>`

### Macro B2 — Scherm uit (bedtijd, optioneel maar nauwkeuriger)
- **Trigger:** Apparaat-events → **Scherm aan/uit** → **Uit**
- **Actie:** HTTP GET `…?kind=screen_off&secret=<secret>`

Nachten waarvoor manier A een sessie levert, worden door B genegeerd.

---

## Testen

- Draai de macro één keer (MacroDroid → macro → ⋮ → **Test acties**) of plak de URL met je echte
  secret in een browser. Verwacht: `{"ok":true,"logged":1,"sleep_sessions":0}`.
- `sleep_sessions` wordt 1 zodra er een compleet paar is (bij manier A: een `sleep_start` gevolgd
  door een `sleep_end`; bij B: een avond-event + ochtend-ontgrendeling ≥ 3 u later).
- `{"ok":false,"error":"Unauthorized"}` → de secret klopt niet.

Batterij: geef MacroDroid vrijstelling van batterij-optimalisatie, anders kunnen nachtelijke
triggers gemist worden.

De afgeleide uren verschijnen automatisch in **Gezondheid/Vitals** en de feed staat als
**Telefoon-events** op het **Databronnen**-scherm.

## Geldige `kind`-waarden

`sleep_start`, `sleep_end` (manier A) · `unlock`, `screen_off`, `screen_on` (manier B). NL/EN
aliassen (`in_slaap`/`wakker`/`asleep`/`awake`, …) worden ook herkend.

## Deploy + secret

```bash
supabase functions deploy phone-events-ingest --project-ref nhyunnnmdcmojvkxrbpl
supabase secrets set PHONE_WEBHOOK_SECRET=<random string> --project-ref nhyunnnmdcmojvkxrbpl
```

En de migratie `supabase/migrations/20260711130000_phone_events.sql`.

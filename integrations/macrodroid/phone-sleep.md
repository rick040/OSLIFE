# MacroDroid → slaap uit telefoongebruik

Vervangt de Samsung-Health "je gebruikt je telefoon 's nachts niet, dus je slaapt"-
schatting **zonder health-app**. Twee kleine MacroDroid-macro's sturen een timestamp bij
**ontgrendelen** (opgepakt) en **scherm uit** (neergelegd) naar de `phone-events-ingest`
Edge Function. Die logt ze in `phone_events` en leidt per nacht een slaapsessie af uit het
langste nachtelijke gat (laatste activiteit vóór bed → eerste ontgrendeling 's ochtends) en
schrijft die naar `health_sleep` met `source='phone'`.

Echte Samsung-Health-sessies (`source='health_app'`) winnen altijd: een phone-schatting
overschrijft nooit een nacht waarvoor de health-sheet al data leverde, en zodra de sheet
alsnog binnenkomt vervangt die de schatting.

## Endpoint

```
https://nhyunnnmdcmojvkxrbpl.supabase.co/functions/v1/phone-events-ingest
```

Auth via de header `x-webhook-secret: <PHONE_WEBHOOK_SECRET>` (of, als je die niet apart
zet, valt de functie terug op `WALLET_WEBHOOK_SECRET` — zelfde telefoon, zelfde MacroDroid).

## Macro 1 — Ontgrendeling (wakker/pickup)

- **Trigger:** Device Events → Device Unlocked
- **Action:** HTTP Request
  - Method: **GET**
  - URL: `https://nhyunnnmdcmojvkxrbpl.supabase.co/functions/v1/phone-events-ingest?kind=unlock`
  - Header: `x-webhook-secret` = `<PHONE_WEBHOOK_SECRET>`

## Macro 2 — Scherm uit (neergelegd/bedtijd)

- **Trigger:** Device Events → Screen Off
- **Action:** HTTP Request
  - Method: **GET**
  - URL: `https://nhyunnnmdcmojvkxrbpl.supabase.co/functions/v1/phone-events-ingest?kind=screen_off`
  - Header: `x-webhook-secret` = `<PHONE_WEBHOOK_SECRET>`

> Macro 2 is optioneel maar maakt de bedtijd nauwkeuriger. Zonder scherm-uit-events gebruikt
> de afleiding de laatste avond-ontgrendeling als bedtijd (schat de nacht dan iets langer in).

Je hoeft de tijd niet zelf mee te sturen — de server stempelt het moment van binnenkomst.
Wil je toch een expliciete tijd (bv. bij een test), voeg dan `&ts=2026-07-11T23:45:00Z` toe.

## Afleiding (server, `phone-events-ingest`)

- Kijkt terug over de laatste **4 dagen** en herberekent na elk event.
- Slaapgat = grootste gat tussen twee opeenvolgende ontgrendelingen dat **≥ 3 u** en **≤ 14 u**
  duurt, begint in de avond/nacht (bedtijd 19:00–04:00) en eindigt 's ochtends (03:00–13:00).
- Bedtijd = eerste **scherm-uit** ná de laatste avond-ontgrendeling (anders die ontgrendeling).
- Wakker = eerste ochtend-ontgrendeling. De sessie hangt aan de **wakker-datum**.
- Telefoon-inactiviteit kent geen slaapfases → de hele duur komt in `light_min` te staan
  (de app leest totaal = light+deep+rem); `source='phone'` markeert het als schatting.

De afgeleide uren verschijnen automatisch in **Gezondheid/Vitals** (leest `health_sleep`), en de
feed staat als **Telefoon-events** op het **Databronnen**-scherm zodat je ziet of MacroDroid nog
stuurt.

## Deploy + secret

```bash
supabase functions deploy phone-events-ingest --project-ref nhyunnnmdcmojvkxrbpl
supabase secrets set PHONE_WEBHOOK_SECRET=<random string> --project-ref nhyunnnmdcmojvkxrbpl
# OSLIFE_USER_ID is al gezet voor de andere ingest-functies.
```

En de migratie `supabase/migrations/20260711130000_phone_events.sql` (tabel `phone_events` +
`health_sleep.source`).

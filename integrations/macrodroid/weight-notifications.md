# MacroDroid → gewicht uit weegschaal-notificatie (experimenteel)

Vult de Health-sheet-import (Samsung Health-export) aan met een snellere,
real-time route: als je weegschaal-app (Smart Life) een notificatie stuurt na
een meting, vangt MacroDroid die af en post 'm direct naar `weight-ingest`.

**Let op — experimenteel.** De exacte notificatietekst van Smart Life bij een
weging is niet met zekerheid bekend (kon niet geverifieerd worden zonder je
telefoon). De parser zoekt generiek naar een patroon als `82,3 kg` of
`82.3kg` in titel+tekst. Test dit eerst met **Test acties** voordat je 'm
structureel aanzet — het kan zijn dat Smart Life het gewicht helemaal niet in
de notificatie zet (sommige scale-apps tonen het resultaat alleen in-app).

## Endpoint

```
https://nhyunnnmdcmojvkxrbpl.supabase.co/functions/v1/weight-ingest
```

Auth: header `x-webhook-secret: <WALLET_WEBHOOK_SECRET>` (zelfde secret als
Wallet/telefoon-events — geen aparte secret nodig, tenzij je `WEIGHT_WEBHOOK_SECRET`
los instelt).

## Macro

- **Trigger:** Notificatie ontvangen → app **Smart Life**
- **Actie:** HTTP-verzoek → **POST**
  `…/functions/v1/weight-ingest`
  Headers: `Content-Type: application/json`, `x-webhook-secret: <secret>`
  Body:
  ```json
  {"title": "[notification_title]", "text": "[notification_text]"}
  ```

## Testen en de regex bijstellen

1. Weeg jezelf, kijk wat voor notificatie Smart Life geeft (sleep 'm open in
   het notificatiescherm zodat je de volledige titel + tekst ziet).
2. Draai de macro via **Test acties**. Verwacht bij een geslaagde match:
   `{"ok":true,"weight_kg":82.3,"body_fat_pct":null}`.
3. Krijg je `{"ok":false,"error":"No weight found","title":"...","text":"..."}`
   terug? Dan bevat de notificatie geen herkenbaar `NN,N kg`-patroon. Stuur me
   de exacte `title`/`text` uit die response (of uit
   `supabase functions logs weight-ingest --project-ref nhyunnnmdcmojvkxrbpl`)
   en ik pas de regex in `supabase/functions/weight-ingest/index.ts` aan.
4. Alternatief als de tekst geen bruikbaar patroon bevat: laat MacroDroid zelf
   met een regex-actie het gewicht uit de notificatie halen in een lokale
   variabele, en stuur die gestructureerd mee i.p.v. de ruwe tekst:
   ```json
   {"weight_kg": [lv=gewicht], "body_fat_pct": [lv=vetpercentage]}
   ```

## Dubbele metingen

Deze route en de Health-sheet-import (Samsung Health) schrijven naar dezelfde
tabel (`health_body_metrics`) maar dedupliceren niet tegen elkaar (ze hebben
meestal een net iets ander tijdstip). Dat geeft in het slechtste geval een
extra puntje op de gewichtsgrafiek met (vrijwel) dezelfde waarde — onschuldig,
maar wil je dat niet, gebruik dan alleen deze route of alleen de Health-sheet.

# MacroDroid → banktransacties in real time

Vervangt (of vult aan op) de Betalingen-sheet-flow: in plaats van een rij
toevoegen aan een Google Sheet die pas elke 30 minuten door Apps Script wordt
uitgelezen, post MacroDroid de transactie **direct** naar `wallet-ingest`.
Dezelfde trigger als je nu al hebt (notificatie van je bank-app), alleen de
actie verandert van "rij toevoegen" naar "HTTP-verzoek".

`wallet-ingest` is dezelfde functie die Google Wallet al gebruikt — hij is
uitgebreid zodat hij ook (a) andere apps herkent via het `app`-veld en (b)
al-uitgepakte velden accepteert in plaats van dat hij zelf de notificatietekst
moet raden.

## Endpoint

```
https://nhyunnnmdcmojvkxrbpl.supabase.co/functions/v1/wallet-ingest
```

Auth: header `x-webhook-secret: <WALLET_WEBHOOK_SECRET>`.

## Optie A — ruwe notificatie laten parsen (eenvoudigst)

Werkt hetzelfde als de bestaande Google Wallet-macro. Body:

```json
{"title": "[notification_title]", "text": "[notification_text]", "app": "ABN AMRO"}
```

De functie zoekt zelf een bedrag (`€ 12,50` / `12.50`) en een winkelnaam
(na "bij"/"at"/"van") in titel+tekst. Werkt goed zolang de banknotificatie een
duidelijk bedrag en "bij <winkel>" bevat — check dat met "Test acties" voordat
je 'm aanzet.

## Optie B — al-uitgepakte velden meesturen (nauwkeuriger)

Als je macro het bedrag/de winkelnaam al met een regex/lokale variabele uit de
notificatie haalt (zoals de oude Betalingen-sheet-macro deed), stuur ze dan
direct mee — dat is betrouwbaarder dan opnieuw raden uit de tekst:

```json
{
  "app": "ABN AMRO",
  "amount": [lv=bedrag],
  "merchant": "[lv=winkel]",
  "account_type": "Zakelijk",
  "title": "[notification_title]",
  "text": "[notification_text]"
}
```

Velden (allemaal optioneel, vul aan wat je macro al weet):

| Veld | Betekenis | Als niet meegegeven |
|---|---|---|
| `amount` | bedrag (positief, wordt als uitgave opgeslagen) | geraden uit titel+tekst |
| `merchant` | winkel/tegenpartij | geraden uit titel+tekst |
| `account_type` of `domain` | `"Zakelijk"`/`"Persoonlijk"` (of `parking`/`buurtkaart`) | geraden uit winkelnaam |
| `payment_method` | bv. `"contactless"`, `"ideal"` | `"contactless"` |
| `category` | bv. `"Groceries"` | geraden uit winkelnaam |
| `date` | `YYYY-MM-DD` | vandaag (Amsterdam) |
| `app` | naam van de bank-app → wordt `source` in de database | `"google_wallet"` |

`title`/`text` blijven zinvol om mee te sturen ook bij optie B: ze komen in de
`description` van de transactie te staan, handig om later terug te lezen wat
de originele notificatie zei.

## Dedup — geen dubbele boekingen

Alle bronnen (Wallet, bank-notificatie, ABN CSV-import, Betalingen-sheet)
gebruiken dezelfde sleutel `datum|bedrag`. Dezelfde aankoop die uit twee
bronnen binnenkomt (bv. real-time notificatie + later CSV-import) landt dus
precies één keer in `finance_tx`.

## Testen

- MacroDroid → macro → ⋮ → **Test acties**, of plak de URL-body handmatig via
  een REST-client. Verwacht bij een geldige betaling: `{"ok":true,"merchant":"...","amount":...}`.
- `{"ok":true,"skipped":true}` → geen bedrag/winkel gevonden in de notificatie
  (optie A) — controleer de exacte notificatietekst.
- `{"ok":false,"error":"Unauthorized"}` → secret klopt niet.

## Overstappen van de Betalingen-sheet

Je hoeft de Betalingen-sheet-macro niet te verwijderen om dit te testen — laat
'm gerust nog even naast de nieuwe macro draaien (dedup vangt dubbels af).
Zodra je vertrouwen hebt in de directe POST, zet je de oude macro uit
(`payments-sheet-ingest` blijft gewoon bestaan als fallback, je hoeft niks te
deployen om 'm uit te schakelen).

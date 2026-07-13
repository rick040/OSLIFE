# OSLIFE · connecties & datastromen

Architectuur: **Google Apps Script + Google Sheets + Notion + de Geldrop Buurtkaart WordPress
API** (ingestie) → **Supabase** (Postgres + Realtime + Edge Functions) → **React app** (live
reads). Alles schrijft uitsluitend naar het OSLIFE-project `nhyunnnmdcmojvkxrbpl` — geen Vercel /
rick-os tussenlaag.

## Apps Script — één los project (`apps-script/`)

Alle ingestie zit in **één standalone project** ("OSLIFE ingest", script.google.com → New project,
níet aan een sheet gekoppeld). De sheet-lezers openen je sheets **op ID** — je raakt de scripts die
de sheets vullen dus niet aan. Voeg alle bestanden toe aan dit ene project en run `installAllTriggers()`.

| Bestand | Doet | Schrijft naar |
|---------|------|---------------|
| `Code.gs` | hub + gedeelde helpers + `installAllTriggers()` | Notion→`projects`/`clients`, Gmail→`gmail_messages`, Calendar→`day_blocks`, betalingen-agenda→`payments` (direct via PostgREST) |
| `health-sheets.gs` | leest Health-sheet (id) | `health-sheets-ingest` → `health_*` |
| `payments-sheet.gs` | leest Betalingen-sheet (id) | `payments-sheet-ingest` → `finance_tx` |
| `screentime-sheet.gs` | leest Schermtijd-sheet (id) | `screentime-sheet-ingest` → `screentime` |
| `setup-health-sheet.gs` | eenmalig hulpscript (los te draaien) | maakt de Health-sheet tabs aan |
| `appsscript.json` | manifest (Gmail/Calendar/Sheets scopes) | — |

De sheet-lezers lezen kolommen **op header-naam** (case-insensitief), dus volgorde en extra kolommen
maken niet uit. De verwachte tabs/kolommen + sheet-id properties staan boven in elk bestand en in
`../.env.example`.

## Edge Functions (`../supabase/functions/`)

- `notion-sync` — leest Projects + Clients uit Notion → `projects` / `clients`.
- `notion-mutate` — schrijft app-wijzigingen **terug** naar Notion (status, prioriteit, deadline,
  budget, …). Detecteert per property het type (select vs status) zodat de payload altijd klopt.
- `notion-hq` — live callouts van de 3 side-business pagina's (Buurtkaart, The Eyes, Dakmeester).
- `gbk-overview` — proxyt de Geldrop Buurtkaart WordPress API (`/wp-json/gbk/v1/overview`) met de
  `X-GBK-Key` header; de key blijft server-side (secret `GBK_API_KEY`).
- `health-sheets-ingest`, `payments-sheet-ingest`, `screentime-sheet-ingest` — ontvangen de
  Sheet-payloads en upserten idempotent.
- `wallet-ingest` (`supabase/functions/wallet-ingest/`) — betaal-notificaties (MacroDroid) →
  `finance_tx`, real-time. Werkt met Google Wallet (ruwe notificatie, zoals eerst) én met bank-apps
  (ruw óf al-uitgepakte velden zoals bedrag/rekeningtype). Vervangt de Betalingen-sheet-flow voor
  macro's die direct kunnen posten. Setup: `macrodroid/bank-notifications.md`.
- `phone-events-ingest` (`supabase/functions/phone-events-ingest/`) — MacroDroid ontgrendel- en
  scherm-uit-events → `phone_events`, leidt daaruit slaap af → `health_sleep` (`source='phone'`) én
  dagelijkse ontgrendel-tellingen af → `screentime_daily.pickups` (vervangt de "Ontgrendelingen"-tab
  in de Schermtijd-sheet). Setup: `macrodroid/phone-sleep.md`.
- `weight-ingest` (`supabase/functions/weight-ingest/`) — weegschaal-app-notificatie (MacroDroid) →
  `health_body_metrics`, real-time. Experimenteel (notificatietekst niet geverifieerd), aanvullend op
  de Health-sheet-import. Setup: `macrodroid/weight-notifications.md`.

## Finance dedup

`payments-sheet-ingest` en de in-app ABN AMRO CSV-import gebruiken dezelfde
`dedup_key = "YYYY-MM-DD|bedrag"`. Door `UNIQUE (user_id, dedup_key)` + `ignoreDuplicates` wordt een
betaling die in beide bronnen voorkomt precies één keer opgeslagen.

## Secrets

Zie `../.env.example` voor het volledige contract (edge-function secrets + Script Properties per
project). Niets hiervan hoort in git of in de frontend-bundle.

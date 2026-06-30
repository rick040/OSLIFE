# OSLIFE · connecties & datastromen

Architectuur: **Google Apps Script + Google Sheets + Notion + de Geldrop Buurtkaart WordPress
API** (ingestie) → **Supabase** (Postgres + Realtime + Edge Functions) → **React app** (live
reads). Alles schrijft uitsluitend naar het OSLIFE-project `nhyunnnmdcmojvkxrbpl` — geen Vercel /
rick-os tussenlaag.

## Apps Script (`apps-script/`)

| Bestand | Project | Schrijft naar |
|---------|---------|---------------|
| `Code.gs` | Account-level hub (één project) | Notion→`projects`/`clients`, Gmail→`gmail_messages`, Calendar→`day_blocks`, betalingen-agenda→`payments`, **rechtstreeks via PostgREST** |
| `health-sheets.gs` | Gebonden aan de Health-sheet | `health-sheets-ingest` → `health_*` |
| `payments-sheet.gs` | Gebonden aan de Betalingen-sheet | `payments-sheet-ingest` → `finance_tx` |
| `screentime-sheet.gs` | Gebonden aan de Schermtijd-sheet | `screentime-sheet-ingest` → `screentime` |
| `setup-health-sheet.gs` | Eenmalig hulpscript | maakt de Health-sheet tabs aan |
| `appsscript.json` | Manifest (Gmail + Calendar scopes) | — |

Elk script leest kolommen **op header-naam** (case-insensitief), dus de volgorde en extra kolommen
maken niet uit. De setup-instructies + verwachte kolommen staan boven in elk bestand.

## Edge Functions (`../supabase/functions/`)

- `notion-sync` — leest Projects + Clients uit Notion → `projects` / `clients`.
- `notion-mutate` — schrijft app-wijzigingen **terug** naar Notion (status, prioriteit, deadline,
  budget, …). Detecteert per property het type (select vs status) zodat de payload altijd klopt.
- `notion-hq` — live callouts van de 3 side-business pagina's (Buurtkaart, The Eyes, Dakmeester).
- `gbk-overview` — proxyt de Geldrop Buurtkaart WordPress API (`/wp-json/gbk/v1/overview`) met de
  `X-GBK-Key` header; de key blijft server-side (secret `GBK_API_KEY`).
- `health-sheets-ingest`, `payments-sheet-ingest`, `screentime-sheet-ingest` — ontvangen de
  Sheet-payloads en upserten idempotent.
- `wallet-ingest` (`edge-functions/wallet-ingest.ts`) — Google Wallet notificaties (MacroDroid) →
  `finance_tx`.

## Finance dedup

`payments-sheet-ingest` en de in-app ABN AMRO CSV-import gebruiken dezelfde
`dedup_key = "YYYY-MM-DD|bedrag"`. Door `UNIQUE (user_id, dedup_key)` + `ignoreDuplicates` wordt een
betaling die in beide bronnen voorkomt precies één keer opgeslagen.

## Secrets

Zie `../.env.example` voor het volledige contract (edge-function secrets + Script Properties per
project). Niets hiervan hoort in git of in de frontend-bundle.

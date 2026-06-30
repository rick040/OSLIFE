# OSLIFE · secrets & waar ze horen

Eén overzicht van élke secret/env-var, op welk platform die hoort, en waar je de waarde
vandaan haalt. **Geen echte waarden in dit bestand** — alleen placeholders en niet-geheime id's.

Backend = uitsluitend Supabase **`nhyunnnmdcmojvkxrbpl`** ("oslife") + Vercel **oslife**.
Zie ook `.env.example` voor exact dezelfde lijst in env-formaat.

---

## 1. Vercel (project `oslife`) — Settings → Environment Variables

Alleen deze twee. Publiek/veilig (RLS beschermt de data).

| Variabele | Waarde | Waar vandaan |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://nhyunnnmdcmojvkxrbpl.supabase.co` | vast |
| `VITE_SUPABASE_ANON_KEY` | *(anon key)* | Supabase → Settings → API → anon/public |

## 2. Supabase — Edge Functions → Manage secrets

`SUPABASE_URL` en `SUPABASE_SERVICE_ROLE_KEY` worden **automatisch geïnjecteerd** — niet zelf zetten.

| Secret | Gebruikt door | Waar vandaan |
|---|---|---|
| `OSLIFE_USER_ID` | notion-sync, *-sheet-ingest, wallet-ingest | Supabase → Authentication → Users → jouw UUID |
| `NOTION_TOKEN` | notion-sync, notion-hq, notion-mutate | notion.so → Settings → Integrations |
| `INGEST_SECRET` | health/payments/screentime-sheet-ingest | **zelf verzinnen** (random) |
| `WALLET_WEBHOOK_SECRET` | wallet-ingest | **zelf verzinnen** (random) |
| `GBK_API_KEY` | gbk-overview | Geldrop Buurtkaart admin → API key (`X-GBK-Key`) |
| `SYNC_SECRET` *(optioneel)* | notion-sync / notion-mutate | **zelf verzinnen** (random) |
| `GBK_BASE_URL` *(optioneel)* | gbk-overview | `https://www.geldropbuurtkaart.nl` (default) |

> Legacy: `RICK_USER_ID` wordt nog als fallback gelezen, maar gebruik `OSLIFE_USER_ID`.

## 3. GitHub — niets

Er zijn geen GitHub Actions meer (de Spotify-workflow is verwijderd). Oude repo-secrets
(`SUPABASE_*`, `SPOTIFY_*`, `RICK_USER_ID`) mogen weg.

## 4. Apps Script — het ene "OSLIFE ingest" project → Script Properties

| Property | Waarde |
|---|---|
| `SUPABASE_URL` | `https://nhyunnnmdcmojvkxrbpl.supabase.co` |
| `SUPABASE_SERVICE_KEY` | service_role key (Supabase → Settings → API) — **geheim** |
| `OSLIFE_USER_ID` | jouw auth-UUID (zelfde als in Supabase) |
| `NOTION_TOKEN` | zelfde als in Supabase |
| `NOTION_DB_ID` | `239ddc8e-9208-8186-b452-cc35f89677ff` (Projects) |
| `NOTION_CLIENTS_DB_ID` | `239ddc8e-9208-8102-86b9-eda32f63e815` (Clients) |
| `PAYMENTS_CAL_ID` | id van je betalingen-Google Calendar |
| `INGEST_SECRET` | **exact dezelfde** waarde als in Supabase |
| `HEALTH_SYNC_URL` | `https://nhyunnnmdcmojvkxrbpl.supabase.co/functions/v1/health-sheets-ingest` |
| `HEALTH_SHEET_ID` | id uit de Health-sheet URL |
| `PAYMENTS_SYNC_URL` | `https://nhyunnnmdcmojvkxrbpl.supabase.co/functions/v1/payments-sheet-ingest` |
| `PAYMENTS_SHEET_ID` | id uit de Betalingen-sheet URL |
| `SCREENTIME_SYNC_URL` | `https://nhyunnnmdcmojvkxrbpl.supabase.co/functions/v1/screentime-sheet-ingest` |
| `SCREENTIME_SHEET_ID` | id uit de Schermtijd-sheet URL |

> Sheet-id = het lange stuk in de URL: `docs.google.com/spreadsheets/d/`**`<ID>`**`/edit`.
> Daarna `installAllTriggers()` één keer draaien en de scopes autoriseren.

---

## Waarden die op meerdere plekken **gelijk** moeten zijn

- `INGEST_SECRET` → Supabase **én** Apps Script (zelfde random string).
- `OSLIFE_USER_ID` → Supabase **én** Apps Script.
- `NOTION_TOKEN` → Supabase **én** Apps Script.
- `SUPABASE_SERVICE_KEY` (Apps Script) = de service_role key uit Supabase.

## Zelf verzinnen vs. opzoeken

- **Verzinnen** (`openssl rand -base64 32`): `INGEST_SECRET`, `WALLET_WEBHOOK_SECRET`, `SYNC_SECRET`.
- **Opzoeken**: `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `OSLIFE_USER_ID`, `NOTION_TOKEN`, `GBK_API_KEY`.

## Per databron: welke secrets heb je nodig

| Databron | Nodig |
|---|---|
| Projecten / CRM (Notion, lezen+schrijven) | `NOTION_TOKEN` (+ `OSLIFE_USER_ID`) |
| Strategie HQ callouts | `NOTION_TOKEN` |
| Buurtkaart (WordPress API) | `GBK_API_KEY` |
| Geld · Betalingen-sheet | `INGEST_SECRET`, `OSLIFE_USER_ID` (+ Apps Script props) |
| Geld · Wallet | `WALLET_WEBHOOK_SECRET`, `OSLIFE_USER_ID` |
| Schermtijd-sheet | `INGEST_SECRET`, `OSLIFE_USER_ID` (+ Apps Script props) |
| Gezondheid-sheet | `INGEST_SECRET`, `OSLIFE_USER_ID` (+ Apps Script props) |
| Inbox / Agenda / Te betalen | Apps Script: `SUPABASE_SERVICE_KEY`, `OSLIFE_USER_ID` (+ `PAYMENTS_CAL_ID`) |

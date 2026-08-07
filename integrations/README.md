# OSLIFE · connecties & datastromen

Architectuur: **Google Apps Script + Google Sheets + de Geldrop Buurtkaart WordPress API**
(ingestie) → **Supabase** (Postgres + Realtime + Edge Functions) → **React app** (live
reads). Alles schrijft uitsluitend naar het OSLIFE-project `nhyunnnmdcmojvkxrbpl` — geen Vercel /
rick-os tussenlaag. Projecten/Klanten (CRM) worden volledig in-app beheerd, zonder externe sync.

## Apps Script — één los project (`apps-script/`)

Alle ingestie zit in **één standalone project** ("OSLIFE ingest", script.google.com → New project,
níet aan een sheet gekoppeld). De sheet-lezers openen je sheets **op ID** — je raakt de scripts die
de sheets vullen dus niet aan. Voeg alle bestanden toe aan dit ene project en run `installAllTriggers()`.

| Bestand | Doet | Schrijft naar |
|---------|------|---------------|
| `Code.gs` | hub + gedeelde helpers + `installAllTriggers()` | Gmail→`gmail_messages`, Calendar→`day_blocks`, betalingen-agenda→`payments` (direct via PostgREST) |
| `health-sheets.gs` | leest Health-sheet (id) — gewicht/slaap/activiteit, legacy fallback t.g.v. Tasker/Health Connect; leest géén stappen meer (zie `steps-ingest`) | `health-ingest` → `health_*` |
| `payments-sheet.gs` | leest Betalingen-sheet (id) | `payments-sheet-ingest` → `finance_tx` |
| `setup-health-sheet.gs` | eenmalig hulpscript (los te draaien) | maakt de Health-sheet tabs aan |
| `appsscript.json` | manifest (Gmail/Calendar/Sheets scopes) | — |

De sheet-lezers lezen kolommen **op header-naam** (case-insensitief), dus volgorde en extra kolommen
maken niet uit. De verwachte tabs/kolommen + sheet-id properties staan boven in elk bestand en in
`../.env.example`.

## Edge Functions (`../supabase/functions/`)

- `gbk-overview` — proxyt de Geldrop Buurtkaart WordPress API (`/wp-json/gbk/v1/overview`) met de
  `X-GBK-Key` header; de key blijft server-side (secret `GBK_API_KEY`).
- `health-ingest` — ontvangt sleep/weight/activity payloads (Tasker + Health Connect, of de legacy
  Health-sheet Apps Script) en upsert idempotent naar `health_*`. Stuurt een caller geen `steps` mee
  (zoals de Health-sheet sinds `steps-ingest` bestaat), dan blijft de `steps`-kolom onaangeroerd.
- `steps-ingest` (`supabase/functions/steps-ingest/`) — stappenteller-app-notificatie (MacroDroid,
  bv. "4.391 stappen") → `health_daily_stats.steps`, real-time. Vervangt de oude Health-sheet
  "Stappen"-tab als primaire stappen-bron. Setup: `macrodroid/steps-notifications.md`.
- `payments-sheet-ingest` — ontvangt de Betalingen-Sheet-payload en upsert idempotent.
- `wallet-ingest` (`supabase/functions/wallet-ingest/`) — betaal-notificaties (MacroDroid) →
  `finance_tx`, real-time. Werkt met Google Wallet (ruwe notificatie, zoals eerst) én met bank-apps
  (ruw óf al-uitgepakte velden zoals bedrag/rekeningtype). Vervangt de Betalingen-sheet-flow voor
  macro's die direct kunnen posten. Setup: `macrodroid/bank-notifications.md`.
- `phone-events-ingest` (`supabase/functions/phone-events-ingest/`) — MacroDroid ontgrendel- en
  scherm-uit-events → `phone_events`, leidt daaruit slaap af → `health_sleep` (`source='phone'`) én
  dagelijkse ontgrendel-tellingen af → `screentime_daily.pickups`. Setup: `macrodroid/phone-sleep.md`.
- `screentime-app-ingest` (`supabase/functions/screentime-app-ingest/`) — MacroDroid App
  Opened/Closed events (rechtstreeks, geen sheet) → `screentime_events`, leidt daaruit per-app
  dag-totalen af → `screentime`. Vervangt de oude Schermtijd-sheet + `screentime-sheet-ingest` +
  `app_sessions`-stopwatch. Setup: `macrodroid/app-timer.md`.
- `weight-ingest` (`supabase/functions/weight-ingest/`) — weegschaal-app-notificatie (MacroDroid) →
  `health_body_metrics`, real-time. Experimenteel (notificatietekst niet geverifieerd), blijft de
  primaire gewicht-bron naast `health-ingest`. Setup: `macrodroid/weight-notifications.md`.
- `claude-chat-ingest` (`supabase/functions/claude-chat-ingest/`) — ontvangt een samenvatting +
  kernpunten van een Claude-gesprek van de `oslife-remember` Claude Skill en logt die direct als een
  `braindump_entries`-rij (embed + vault + cognee, zelfde best-effort verrijking als een Braindump-
  capture). Setup: `../.claude/skills/oslife-remember/SKILL.md`.
- `kwgt-api` (`supabase/functions/kwgt-api/`) — backend voor de 5 premium KWGT-widgets (to-do
  lijst, belangrijkste items, actieve projecten, brain-dump quick add, HEYRA quick chat/voice):
  GET-only, secret via query-param, service-role. Setup + bouwgids per widget: `kwgt/README.md`.

## KWGT-widgets (`kwgt/`)

Vijf losse premium home-screen-widgets voor [KWGT](https://play.google.com/store/apps/details?id=org.kustom.widget)
("Kustom Widget"), gebaseerd op `kwgt-api` hierboven. Geen aparte server — je bouwt de widget zelf
in Kustom's eigen editor aan de hand van een exacte, module-voor-module gids per widget (kleuren,
formules, JSON-paden, tik-acties), en exporteert daarna als gewoon `.kwgt`-bestand om te delen.
Zie `kwgt/README.md` voor het gedeelde design-systeem en de opzet-stappen.

## Claude Skill (`../.claude/skills/oslife-remember/`)

Geen aparte server: een Claude Skill die je in je eigen Claude-profiel installeert (werkt dus in
élke chat, niet alleen dit repo). Op verzoek ("remember this in oslife") schrijft Claude zelf een
samenvatting + kernpunten en stuurt die via een bijgeleverd script (`curl`) naar
`claude-chat-ingest` — geen Supabase-credentials in de skill zelf, alleen de gedeelde
`CLAUDE_INGEST_SECRET` als env var. Zie `../.claude/skills/oslife-remember/SKILL.md` voor de
volledige setup.

## Finance dedup

`payments-sheet-ingest` en de in-app ABN AMRO CSV-import gebruiken dezelfde
`dedup_key = "YYYY-MM-DD|bedrag"`. Door `UNIQUE (user_id, dedup_key)` + `ignoreDuplicates` wordt een
betaling die in beide bronnen voorkomt precies één keer opgeslagen.

## Secrets

Zie `../.env.example` voor het volledige contract (edge-function secrets + Script Properties per
project). Niets hiervan hoort in git of in de frontend-bundle.

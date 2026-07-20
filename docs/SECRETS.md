# OSLIFE · secrets & waar ze horen

Eén overzicht van élke secret/env-var, op welk platform die hoort, en waar je de waarde
vandaan haalt. **Geen echte waarden in dit bestand** — alleen placeholders en niet-geheime id's.

Backend = uitsluitend Supabase **`nhyunnnmdcmojvkxrbpl`** ("oslife") + Vercel **oslife**.
Zie ook `.env.example` voor exact dezelfde lijst in env-formaat.

---

## 1. Vercel (project `oslife`) — Settings → Environment Variables

Publiek/veilig (RLS beschermt de data).

| Variabele | Waarde | Waar vandaan |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://nhyunnnmdcmojvkxrbpl.supabase.co` | vast |
| `VITE_SUPABASE_ANON_KEY` | *(anon key)* | Supabase → Settings → API → anon/public |
| `VITE_TELEGRAM_BOT_USERNAME` | *(bot username, zonder @)* | vast, niet geheim — van @BotFather |

## 2. Supabase — Edge Functions → Manage secrets

`SUPABASE_URL` en `SUPABASE_SERVICE_ROLE_KEY` worden **automatisch geïnjecteerd** — niet zelf zetten.

| Secret | Gebruikt door | Waar vandaan |
|---|---|---|
| `OSLIFE_USER_ID` | *-sheet-ingest, wallet-ingest, notify-tick, telegram-webhook | Supabase → Authentication → Users → jouw UUID |
| `INGEST_SECRET` | health/payments/screentime-sheet-ingest | **zelf verzinnen** (random) |
| `WALLET_WEBHOOK_SECRET` | wallet-ingest | **zelf verzinnen** (random) |
| `GBK_API_KEY` | gbk-overview | Geldrop Buurtkaart admin → API key (`X-GBK-Key`) |
| `GBK_BASE_URL` *(optioneel)* | gbk-overview | `https://www.geldropbuurtkaart.nl` (default) |
| `ANTHROPIC_API_KEY` | heyra-brain | console.anthropic.com → API keys. HEYRA's agents (src/heyra/agents/) en de nachtelijke Reflect-narrative vallen terug op de bestaande rule-based tekst als deze niet gezet is — de app breekt nooit zonder deze key. |
| `VOYAGE_API_KEY` *(optioneel)* | embed-memory, embed-memory-backfill, memory-search | dash.voyageai.com → API keys. Voedt search_memory()'s vector-recall (naast de bestaande full-text). Zonder deze key blijft alles zoals nu: puur full-text zoeken, geen embeddings. |
| `BRAINDUMP_WORKER_URL` *(optioneel)* | braindump-ingest | Publieke URL van de braindump media-worker (`integrations/braindump-worker/`). Zonder deze URL valt media (video/audio) terug op metadata-only (oEmbed/OpenGraph) — de app breekt nooit zonder. |
| `WORKER_SECRET` *(optioneel, samen met bovenstaande)* | braindump-ingest | **zelf verzinnen** (random) — zelfde waarde als in de worker's eigen `.env`. |
| `COGNEE_WORKER_URL` *(optioneel)* | cognee-remember, cognee-search, embed-memory-backfill | Publieke URL van de cognee-worker's Caddy-proxy (`integrations/cognee-worker/`), poort 8080. Zonder deze URL zijn cognee-remember/cognee-search stille no-ops — HEYRA's Zoeken en alle ingest-paden werken exact zoals nu, zonder kennisgraaf. |
| `COGNEE_WORKER_SECRET` *(optioneel, samen met bovenstaande)* | cognee-remember, cognee-search, embed-memory-backfill | **zelf verzinnen** (random) — zelfde waarde als `COGNEE_WORKER_SECRET` in de worker's `.env`. |
| `TELEGRAM_BOT_TOKEN` | notify-tick, telegram-webhook | @BotFather → `/newbot` → token |
| `TELEGRAM_WEBHOOK_SECRET` | telegram-webhook | **zelf verzinnen** (random) — meegegeven aan `setWebhook` als `secret_token`; Telegram stuurt 'm terug als header `X-Telegram-Bot-Api-Secret-Token` |
| `CRON_SECRET` | notify-tick | **zelf verzinnen** (random) — ook letterlijk gebruikt in de eenmalige `cron.schedule()`-SQL (niet elders opgeslagen, nooit ingevuld committen) |

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

## 5. Telegram-meldingen: eenmalige setup

Proactieve meldingen (ochtendbriefing, avond-check-in, gewoonte-herinneringen, urgente
signalen) lopen via een eigen Telegram-bot. Dit kan niet vanuit de sandbox waar de code
geschreven is — de onderstaande stappen doe je zelf, in deze volgorde, tegen het live
project `nhyunnnmdcmojvkxrbpl`:

1. **Bot aanmaken**: stuur `@BotFather` een bericht → `/newbot` → bewaar de token + username.
2. **Secrets zetten** (Supabase dashboard of `supabase secrets set`): `TELEGRAM_BOT_TOKEN`,
   `TELEGRAM_WEBHOOK_SECRET` (random), `CRON_SECRET` (random).
3. **`VITE_TELEGRAM_BOT_USERNAME`** zetten in Vercel → opnieuw deployen.
4. **Migratie toepassen**: `supabase/migrations/20260701150000_notifications.sql` via de
   SQL Editor (of `supabase db push`).
5. **Functies deployen**: `supabase functions deploy notify-tick` en
   `supabase functions deploy telegram-webhook --project-ref nhyunnnmdcmojvkxrbpl`, daarna in
   het dashboard bij beide functies **"Enforce JWT verification"** uitzetten.
6. **Webhook registreren** (eenmalige curl, met de token uit stap 1 en het
   `TELEGRAM_WEBHOOK_SECRET` uit stap 2):
   ```bash
   curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
     -H "Content-Type: application/json" \
     -d '{"url":"https://nhyunnnmdcmojvkxrbpl.supabase.co/functions/v1/telegram-webhook","secret_token":"<TELEGRAM_WEBHOOK_SECRET>"}'
   ```
7. **Cron-tick inplannen** (eenmalig in de SQL Editor, `<CRON_SECRET>` invullen met de echte
   waarde — dit ingevulde statement nooit committen):
   ```sql
   select cron.schedule(
     'oslife-notify-tick',
     '*/5 * * * *',
     $cron$
     select net.http_post(
       url     := 'https://nhyunnnmdcmojvkxrbpl.supabase.co/functions/v1/notify-tick',
       headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <CRON_SECRET>'),
       body    := '{}'::jsonb
     );
     $cron$
   );
   ```
8. **Account koppelen**: open `https://t.me/<username>` en stuur `/start`.
9. **Frontend deployen** zodat het tandwiel-icoon (Instellingen) live staat.

## 6. Vector memory (embed-memory-backfill): eenmalige setup

De nachtelijke `summaries`-roll-up (`build_summaries()`, plain SQL/pg_cron, geen HTTP)
kan zelf geen embeddings ophalen. `embed-memory-backfill` vangt dat op, en dient ook als
achtervang voor alles wat de fire-and-forget `embed-memory`-call miste. Zelfde
shared-secret patroon als notify-tick.

1. **Secret zetten**: `VOYAGE_API_KEY` (zie tabel hierboven).
2. **Functie deployen**: `supabase functions deploy embed-memory-backfill --project-ref nhyunnnmdcmojvkxrbpl`,
   daarna in het dashboard **"Enforce JWT verification"** uitzetten (pg_cron kan geen
   Supabase-JWT sturen).
3. **Cron inplannen** (eenmalig in de SQL Editor, `<CRON_SECRET>` invullen met de echte
   waarde — dezelfde secret als notify-tick gebruikt; dit ingevulde statement nooit committen):
   ```sql
   select cron.schedule(
     'oslife-embed-memory-backfill',
     '15 3 * * *',  -- ná oslife-summaries (03:30) is niet nodig; embeddings volgen los
     $cron$
     select net.http_post(
       url     := 'https://nhyunnnmdcmojvkxrbpl.supabase.co/functions/v1/embed-memory-backfill',
       headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <CRON_SECRET>'),
       body    := '{}'::jsonb
     );
     $cron$
   );
   ```

---

## Waarden die op meerdere plekken **gelijk** moeten zijn

- `INGEST_SECRET` → Supabase **én** Apps Script (zelfde random string).
- `OSLIFE_USER_ID` → Supabase **én** Apps Script.
- `SUPABASE_SERVICE_KEY` (Apps Script) = de service_role key uit Supabase.

## Zelf verzinnen vs. opzoeken

- **Verzinnen** (`openssl rand -base64 32`): `INGEST_SECRET`, `WALLET_WEBHOOK_SECRET`, `TELEGRAM_WEBHOOK_SECRET`, `CRON_SECRET`, `WORKER_SECRET`, `COGNEE_WORKER_SECRET`.
- **Opzoeken**: `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `OSLIFE_USER_ID`, `GBK_API_KEY`, `TELEGRAM_BOT_TOKEN`, `VOYAGE_API_KEY`.

## Per databron: welke secrets heb je nodig

| Databron | Nodig |
|---|---|
| Projecten / CRM (native, in-app) | geen — geen externe sync |
| Strategie HQ (business ideas) | `ANTHROPIC_API_KEY` (voor `idea-elaborate`) |
| Buurtkaart (WordPress API) | `GBK_API_KEY` |
| Geld · Betalingen-sheet | `INGEST_SECRET`, `OSLIFE_USER_ID` (+ Apps Script props) |
| Geld · Wallet | `WALLET_WEBHOOK_SECRET`, `OSLIFE_USER_ID` |
| Schermtijd-sheet | `INGEST_SECRET`, `OSLIFE_USER_ID` (+ Apps Script props) |
| Gezondheid-sheet | `INGEST_SECRET`, `OSLIFE_USER_ID` (+ Apps Script props) |
| Inbox / Agenda / Te betalen | Apps Script: `SUPABASE_SERVICE_KEY`, `OSLIFE_USER_ID` (+ `PAYMENTS_CAL_ID`) |
| HEYRA brain-agents / Reflect-narrative | `ANTHROPIC_API_KEY` (optioneel — zonder deze key blijft alles rule-based zoals nu) |
| Telegram-meldingen | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `CRON_SECRET`, `OSLIFE_USER_ID`, `VITE_TELEGRAM_BOT_USERNAME` |
| Vector memory (search_memory hybrid recall) | `VOYAGE_API_KEY` (optioneel — zonder deze key blijft alles full-text zoals nu), `CRON_SECRET`, `OSLIFE_USER_ID` (voor de backfill) |
| Vault-notes (Markdown-spiegel van braindump/interaction/summary/message) | geen eigen secret — materialize-note schrijft alleen naar Storage |
| Braindump media-worker (video/audio transcriptie) | `BRAINDUMP_WORKER_URL`, `WORKER_SECRET` (beide optioneel — zonder valt media terug op metadata-only) |
| cognee kennisgraaf (integrations/cognee-worker/) | `COGNEE_WORKER_URL`, `COGNEE_WORKER_SECRET` (beide optioneel — zonder blijven ingest/zoeken exact zoals nu, zonder graaf) |

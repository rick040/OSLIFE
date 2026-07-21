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
| `ANTHROPIC_API_KEY` | heyra-brain | console.anthropic.com → API keys. HEYRA's agents (src/heyra/agents/) en de nachtelijke Reflect-narrative vallen terug op de bestaande rule-based tekst als deze niet gezet is — de app breekt nooit zonder deze key. Ook gebruikt door summarize-email en draft-email-reply (Inbox, zie §8). |
| `SUPABASE_ANON_KEY` | materialize-note, summarize-email, draft-email-reply, create-gmail-draft | Supabase → Settings → API → anon/public (zelfde waarde als `VITE_SUPABASE_ANON_KEY` hierboven). |
| `GMAIL_CLIENT_ID` | create-gmail-draft | Google Cloud Console → OAuth-client (zie §8) — **geheim** |
| `GMAIL_CLIENT_SECRET` | create-gmail-draft | Google Cloud Console → OAuth-client (zie §8) — **geheim** |
| `GMAIL_REFRESH_TOKEN` | create-gmail-draft | eenmalige OAuth-autorisatie (zie §8) — **geheim** |
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

## 7. Obsidian: vault lezen + vault-inbox schrijven

Twee losse, allebei optionele integraties — geen van beide is nodig voor de rest van de
app. `vault` blijft een gegenereerde spiegel (OSLIFE schrijft, niemand bewerkt 'm met de
hand); `vault-inbox` is de omgekeerde richting (Rick schrijft, OSLIFE leest 'm leeg).

### 7a. Lezen: de `vault`-bucket als Obsidian-vault (read-only)

Supabase Storage praat het S3-protocol. Een S3 access key geeft **volledige toegang tot
alle buckets in dit project** (bypassed RLS) — behandel 'm dus als een brede sleutel, niet
als iets dat automatisch tot één bucket beperkt is.

1. **Supabase → Project Settings → Storage → S3 Connection**: noteer endpoint + region
   precies zoals het dashboard ze toont, en genereer een nieuw access-key-paar (Access Key
   ID + Secret Access Key — **geheim**, alleen server-/device-side gebruiken).
2. **Obsidian**: installeer de community plugin **Remotely Save**, voeg een S3-remote toe:
   endpoint/region/bucket (`vault`) + de key van stap 1, "S3 URL style" = Path-style. Test
   met "Check Connectivity".
3. Sync-richting: **remote → local** (dit is een gegenereerde spiegel — niet bewerken en
   terug-syncen). Eenmaal gesynchroniseerd zie je elke braindump/interaction/summary/
   business-idea als los `.md`-bestand met frontmatter, doorzoekbaar en met graph-view.
4. Rotate/verwijder de key meteen als het device met de Obsidian-config kwijtraakt of
   gecompromitteerd is (Supabase → S3 Connection → key verwijderen).

### 7b. Schrijven: `vault-inbox` → braindump-ingest (vault-inbox-sync)

Een los "inbox"-mapje in dezelfde Obsidian-vault, gesynchroniseerd naar de `vault-inbox`
bucket (tweede Remotely Save-remote, ditmaal **local → remote**, of bidirectioneel — een
verwerkt bestand verhuist toch naar `processed/`, dus een dubbele sync levert geen dubbele
verwerking op dankzij braindump-ingest's eigen content-hash dedup).

1. **Migratie toepassen**: `supabase/migrations/20260721000000_vault_inbox.sql` (maakt de
   `vault-inbox` bucket + owner-only policies).
2. **Tweede S3-remote in Remotely Save**: zelfde endpoint/region/key als 7a, bucket
   `vault-inbox`, richting local → remote (of bidirectioneel).
3. **Functie deployen**: `supabase functions deploy vault-inbox-sync --project-ref nhyunnnmdcmojvkxrbpl`,
   daarna in het dashboard **"Enforce JWT verification"** uitzetten (pg_cron kan geen
   Supabase-JWT sturen) — zelfde stap als notify-tick/embed-memory-backfill.
4. **Secret**: hergebruikt `CRON_SECRET` (zelfde waarde als notify-tick) — niets nieuws te
   verzinnen.
5. **Cron inplannen** (eenmalig in de SQL Editor, `<CRON_SECRET>` invullen met de echte
   waarde; dit ingevulde statement nooit committen):
   ```sql
   select cron.schedule(
     'oslife-vault-inbox-sync',
     '*/10 * * * *',
     $cron$
     select net.http_post(
       url     := 'https://nhyunnnmdcmojvkxrbpl.supabase.co/functions/v1/vault-inbox-sync',
       headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <CRON_SECRET>'),
       body    := '{}'::jsonb
     );
     $cron$
   );
   ```
6. Test: schrijf een `.md`-bestand in de Obsidian inbox-map, wacht op de eerstvolgende sync
   + cron-tick (max ~10 min), en check dat 'm als nieuwe kaart in Braindump verschijnt en
   het bronbestand naar `vault-inbox/processed/` is verhuisd.

> Wil je een notitie meteen privé houden? Zet `tier: geheim` in de frontmatter — die ene
> waarde wordt gelezen; verder classificeert braindump-ingest domain/kind/tags zoals altijd.

## 8. Inbox: e-mailsamenvattingen + concept-antwoorden (Gmail OAuth): eenmalige setup

De Inbox-uitbreiding (highlights-paneel, AI-samenvatting per mail, concept-antwoord
opslaan als échte Gmail-conceptmail) staat al in de code en de migratie/functies zijn al
live gezet vanuit de sandbox. Twee dingen kunnen **niet** vanuit de sandbox — die doe je
zelf, in deze volgorde:

1. **Apps Script opnieuw deployen**: `syncGmail()` in het ene "OSLIFE ingest"-project
   (zie §4 hierboven) stuurt nu ook `thread_id` en de volledige plaintext-body mee. Plak de
   bijgewerkte inhoud van `integrations/apps-script/Code.gs` in het bestaande Apps
   Script-project en sla op (**geen** nieuwe Script Properties of triggers nodig — dit hergebruikt
   gewoon `installAllTriggers()`'s bestaande `syncGmail`-trigger). Zonder deze stap blijft
   "Open in Gmail" op oudere rijen kapot en blijft de AI-samenvatting draaien op de oude
   280-tekens snippet in plaats van de volledige mail.
2. **Gmail OAuth-client aanmaken** (uitsluitend voor "concept opslaan in Gmail" —
   `create-gmail-draft`; de sync zelf blijft via Apps Script lopen, dat is losse code):
   - Google Cloud Console → nieuw/bestaand project → **Gmail API** inschakelen.
   - OAuth consent screen → Internal/Testing volstaat voor een single-user app.
   - Credentials → OAuth client ID → type **Desktop app**.
   - Eenmalig autoriseren met scope `gmail.compose` (niets breder):
     ```
     https://accounts.google.com/o/oauth2/v2/auth?client_id=<ID>&redirect_uri=urn:ietf:wg:oauth:2.0:oob&response_type=code&scope=https://www.googleapis.com/auth/gmail.compose&access_type=offline&prompt=consent
     ```
     inloggen, de teruggegeven code kopiëren, en inwisselen voor een refresh token:
     ```bash
     curl -X POST https://oauth2.googleapis.com/token \
       -d client_id=<ID> -d client_secret=<SECRET> -d code=<CODE> \
       -d grant_type=authorization_code -d redirect_uri=urn:ietf:wg:oauth:2.0:oob
     ```
   - Zet `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET` en de `refresh_token` uit de respons als
     `GMAIL_REFRESH_TOKEN` in Supabase → Edge Functions → Manage secrets (zie tabel
     hierboven). Zonder deze drie geeft "concept opslaan in Gmail" een 502 terug — de rest
     van de Inbox (lijst, samenvatting, concept-tekst genereren) werkt al zonder.

---

## Waarden die op meerdere plekken **gelijk** moeten zijn

- `INGEST_SECRET` → Supabase **én** Apps Script (zelfde random string).
- `OSLIFE_USER_ID` → Supabase **én** Apps Script.
- `SUPABASE_SERVICE_KEY` (Apps Script) = de service_role key uit Supabase.

## Zelf verzinnen vs. opzoeken

- **Verzinnen** (`openssl rand -base64 32`): `INGEST_SECRET`, `WALLET_WEBHOOK_SECRET`, `TELEGRAM_WEBHOOK_SECRET`, `CRON_SECRET`, `WORKER_SECRET`, `COGNEE_WORKER_SECRET`.
- **Opzoeken**: `VITE_SUPABASE_ANON_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `OSLIFE_USER_ID`, `GBK_API_KEY`, `TELEGRAM_BOT_TOKEN`, `VOYAGE_API_KEY`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` (§8).

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
| Inbox · AI-samenvatting + concept-antwoord | `ANTHROPIC_API_KEY`, `SUPABASE_ANON_KEY` (samenvatten/concept-tekst genereren); `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` (concept opslaan in Gmail — zonder deze drie 502'd alleen die ene actie, zie §8) |
| HEYRA brain-agents / Reflect-narrative | `ANTHROPIC_API_KEY` (optioneel — zonder deze key blijft alles rule-based zoals nu) |
| Telegram-meldingen | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `CRON_SECRET`, `OSLIFE_USER_ID`, `VITE_TELEGRAM_BOT_USERNAME` |
| Vector memory (search_memory hybrid recall) | `VOYAGE_API_KEY` (optioneel — zonder deze key blijft alles full-text zoals nu), `CRON_SECRET`, `OSLIFE_USER_ID` (voor de backfill) |
| Vault-notes (Markdown-spiegel van braindump/interaction/summary/message) | geen eigen secret — materialize-note schrijft alleen naar Storage |
| Obsidian vault-inbox (vault-inbox-sync) | `CRON_SECRET` (hergebruikt), `OSLIFE_USER_ID` — plus een S3 access key aan de Obsidian-kant (geen Supabase-secret, zie §7) |
| Braindump media-worker (video/audio transcriptie) | `BRAINDUMP_WORKER_URL`, `WORKER_SECRET` (beide optioneel — zonder valt media terug op metadata-only) |
| cognee kennisgraaf (integrations/cognee-worker/) | `COGNEE_WORKER_URL`, `COGNEE_WORKER_SECRET` (beide optioneel — zonder blijven ingest/zoeken exact zoals nu, zonder graaf) |

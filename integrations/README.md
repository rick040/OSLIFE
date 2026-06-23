# RICK-OS · connecties & datastromen (uitvoering)

Implementatie van het blueprint. Architectuur: **Google Apps Script** (ingestie) → **Supabase**
(store + Realtime + Edge Functions) → **React app** (live reads). Zie het goedgekeurde plan voor de
volledige redenering.

## Wat hier al klaarstaat (geen credentials nodig)

- `../supabase/migrations/0001_init.sql` — volledig Postgres-schema + RLS + realtime, spiegelt
  `src/types.ts`. Eén tabel per store-slice, dedup via `external_id` / `dedup_key`.
- `apps-script/Code.gs` — paste-klare ingestie voor Notion, Gmail, Agenda, betalingen-agenda,
  GoCardless (ABN) en Google Fit, met generieke `supabaseUpsert`.
- `apps-script/appsscript.json` — manifest met de benodigde OAuth-scopes (Gmail, Calendar, Fit).
- `../.env.example` — env-contract voor de app (alleen publieke Supabase URL + anon key).

## Stappen om live te gaan (hebben jouw accounts/keys nodig)

1. **Supabase-project** aanmaken. SQL editor → plak `0001_init.sql` (of `supabase db push`).
   Auth aanzetten, jouw account aanmaken, `RICK_USER_ID` (= `auth.users.id`) noteren.
2. **App koppelen**: `npm i @supabase/supabase-js`, `.env.local` vullen (`VITE_SUPABASE_URL`,
   `VITE_SUPABASE_ANON_KEY`, `VITE_DATA_SOURCE=supabase`). `src/lib/supabase.ts` client toevoegen en
   de store ([src/store.ts](../src/store.ts)) van `seed()`/localStorage omzetten naar Supabase-queries
   + realtime-subscriptions. Vaste `TODAY` ([src/domains.ts](../src/domains.ts)) vervangen door echte datum.
3. **Apps Script** project maken, `Code.gs` + `appsscript.json` plakken, Script Properties invullen
   (zie kop van `Code.gs`), triggers instellen. Run elke functie één keer handmatig → autoriseer scopes
   → controleer dat rijen in Supabase verschijnen en live in de app verschijnen.
4. **Edge Functions** (volgende artefact): `understand` (Claude `claude-haiku-4-5`, vervangt de
   keyword-classifier in [src/understand.ts](../src/understand.ts)), `reflect` (port van
   [src/reflect.ts](../src/reflect.ts) die uit Postgres leest, draait op `pg_cron`), `capture`
   (intake-endpoint voor Telegram/web). Claude-key in Supabase Function Secrets.

## Benodigde gegevens van jou (open punten uit het plan)

- Notion: database-id + property-namen (Name/Status/Client/Deadline/Value/Progress).
- Gmail: welke labels/filters tellen als "belangrijk"; afzender→domein-regels in `domainFor()`.
- GoCardless: account aanmaken (gratis), ABN koppelen (consent), `GC_ACCOUNT_ID`.
- Betalingen-agenda: hoe markeer je richting (in/uit) en betaald (bv. `[in]`/`[uit]` in titel, ✓ voor betaald).
- Health: Fit REST nu; eventueel later een Health Connect companion-app.

## Secrets

- App-bundle: alleen `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (publiek, RLS beschermt data).
- Apps Script Script Properties: `SUPABASE_SERVICE_KEY`, `NOTION_TOKEN`, `GC_SECRET_*`, etc.
- Edge Functions: Claude API key in Supabase Function Secrets / Vault.

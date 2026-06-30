# Database Schema — OSLIFE

> Gegenereerd overzicht van de Supabase Postgres-database achter OSLIFE.
> Laatst bijgewerkt: 2026-06-30.

## Project

| | |
|---|---|
| **Naam** | `oslife` |
| **Project ref** | `nhyunnnmdcmojvkxrbpl` |
| **URL** | `https://nhyunnnmdcmojvkxrbpl.supabase.co` |
| **Regio** | `eu-west-1` |
| **Postgres** | 17 (17.6.x) |
| **Status** | Active / Healthy |

> De overige Supabase-projecten in de organisatie (`rick-os`, `OSLIFE`, `brain-dump`)
> worden door deze applicatie **niet** gebruikt. De frontend, Python-ingest, Apps Script
> en Edge Functions wijzen allemaal naar `nhyunnnmdcmojvkxrbpl` (zie `.env.example`).
> Het oude **rick-os** project (en de bijbehorende Vercel-deployment) wordt uitgefaseerd;
> oslife draait volledig standalone op `oslife-iota.vercel.app` + dit Supabase-project.

## Algemene conventies

- Alle tabellen staan in het `public`-schema.
- Op **alle** tabellen is **Row Level Security (RLS)** ingeschakeld.
- Elke tabel heeft een `id uuid` primary key met default `gen_random_uuid()`.
- Elke tabel heeft een `user_id uuid` met een foreign key naar `auth.users.id`
  (per-gebruiker data-isolatie).
- Externe bronnen gebruiken vaak `external_id` en/of `dedup_key` voor idempotente sync.

## Tabellen (`public`)

19 tabellen. Rij-aantallen zijn een momentopname (2026-06-30).

### Agenda & productiviteit

#### `day_blocks` — _135 rijen_
Tijdblokken / dagplanning.

| Kolom | Type | Default / notitie |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK → auth.users |
| `external_id` | text | bron-id |
| `date` | date | |
| `start_time` | time | nullable |
| `end_time` | time | nullable |
| `title` | text | `''` |
| `description` | text | `''` |
| `block_type` | text | `'personal'` |
| `status` | text | `'planned'` |

#### `goals` — _leeg_
Doelen per levensdomein.

| Kolom | Type | Default / notitie |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK → auth.users |
| `title` | text | |
| `domain` | text | `'personal'` |
| `target_value` | numeric | `0` |
| `unit` | text | `''` |
| `due_on` | date | nullable |
| `progress` | numeric | `0` |
| `status` | text | `'active'` |

#### `habits` — _leeg_
Gewoontes (definitie).

| Kolom | Type | Default / notitie |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK → auth.users |
| `name` | text | |
| `icon` | text | `'✅'` |
| `color` | text | nullable |
| `active` | boolean | `true` |
| `order_idx` | integer | `0` |

#### `habit_log` — _leeg_
Afvinklog per gewoonte per dag.

| Kolom | Type | Default / notitie |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK → auth.users |
| `habit_id` | uuid | **FK → habits.id** |
| `on_date` | date | |
| `done` | boolean | `true` |

### Projecten & CRM

#### `projects` — _68 rijen_
Projecten, gesynchroniseerd vanuit Notion.

| Kolom | Type | Default / notitie |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK → auth.users |
| `external_id` | text | Notion-id |
| `name` | text | |
| `client` | text | `''` |
| `domain` | text | `'personal'` |
| `status` | text | `'lead'` |
| `deadline` | date | nullable |
| `value` | numeric | `0` |
| `progress` | numeric | `0` |
| `source` | text | `'notion'` |
| `notion_url` | text | nullable |
| `type` | text[] | `'{}'` |
| `prioriteit` | text | nullable |
| `start_datum` | date | nullable |

#### `clients` — _leeg_
CRM-klanten, gesynchroniseerd vanuit Notion.

| Kolom | Type | Default / notitie |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK → auth.users |
| `external_id` | text | Notion-id |
| `notion_url` | text | nullable |
| `name` | text | |
| `client_status` | text | nullable |
| `crm_status` | text | nullable |
| `first_contact` | date | nullable |
| `email` | text | nullable |
| `website_url` | text | nullable |
| `potentie` | text | nullable |
| `scope` | numeric | nullable |
| `domain` | text | `'personal'` |
| `synced_at` | timestamptz | `now()` |

### Financiën

#### `payments` — _262 rijen_
Betalingen (inkomend/uitgaand).

| Kolom | Type | Default / notitie |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK → auth.users |
| `payee` | text | |
| `amount` | numeric | |
| `due` | date | nullable |
| `direction` | text | `'outgoing'` |
| `status` | text | `'open'` |
| `domain` | text | `'personal'` |
| `source` | text | `'manual'` |
| `external_id` | text | nullable |
| `notes` | text | nullable |

#### `finance_tx` — _leeg_
Financiële transacties.

| Kolom | Type | Default / notitie |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK → auth.users |
| `occurred_on` | date | |
| `amount` | numeric | |
| `counterparty` | text | `''` |
| `description` | text | `''` |
| `category` | text | `'other'` |
| `dedup_key` | text | nullable |
| `domain` | text | `'personal'` |
| `source` | text | `'manual'` |
| `paid_at` | timestamptz | nullable |
| `payment_method` | text | `'unknown'` |

#### `subscriptions` — _leeg_
Terugkerende abonnementen.

| Kolom | Type | Default / notitie |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK → auth.users |
| `name` | text | |
| `amount` | numeric | |
| `cadence` | text | `'monthly'` |
| `next_charge_on` | date | nullable |
| `active` | boolean | `true` |
| `notes` | text | nullable |

### Health

#### `health_daily_stats` — _leeg_
Dagelijkse activiteitscijfers.

| Kolom | Type | Default / notitie |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK → auth.users |
| `date` | date | |
| `steps` | integer | `0` |
| `sleep_min` | integer | `0` |
| `avg_resting_hr` | integer | `0` |
| `active_min` | integer | `0` |
| `distance_m` | numeric | `0` |
| `calories_kcal` | numeric | `0` |
| `duration_min` | integer | `0` |

#### `health_body_metrics` — _leeg_
Lichaamsmetingen.

| Kolom | Type | Default / notitie |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK → auth.users |
| `datetime` | timestamptz | |
| `weight_kg` | numeric | nullable |
| `body_fat_pct` | numeric | nullable |

#### `health_sleep` — _leeg_
Slaapfases per nacht.

| Kolom | Type | Default / notitie |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK → auth.users |
| `date` | date | |
| `start_time` | timestamptz | nullable |
| `end_time` | timestamptz | nullable |
| `light_min` | integer | `0` |
| `deep_min` | integer | `0` |
| `rem_min` | integer | `0` |
| `awake_min` | integer | `0` |

### Tracking & overig

#### `gmail_messages` — _115 rijen_
Gmail-inbox sync.

| Kolom | Type | Default / notitie |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK → auth.users |
| `external_id` | text | Gmail message-id |
| `from_addr` | text | `''` |
| `subject` | text | `''` |
| `snippet` | text | `''` |
| `received_at` | timestamptz | |
| `read` | boolean | `false` |
| `importance` | text | `'normal'` |
| `labels` | text[] | `'{}'` |

#### `screentime` — _leeg_
Schermtijd per app per dag.

| Kolom | Type | Default / notitie |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK → auth.users |
| `usage_date` | date | |
| `app_name` | text | |
| `duration_ms` | bigint | `0` |
| `category` | text | `'other'` |
| `dedup_key` | text | nullable |

#### `location_visits` — _leeg_
Bezochte locaties.

| Kolom | Type | Default / notitie |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK → auth.users |
| `date` | date | |
| `place_name` | text | `''` |
| `place_type` | text | `''` |
| `start_at` | timestamptz | |
| `end_at` | timestamptz | nullable |
| `dedup_key` | text | nullable |

#### `spotify_history` — _leeg_
Afgespeelde tracks.

| Kolom | Type | Default / notitie |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK → auth.users |
| `track_name` | text | |
| `artist` | text | `''` |
| `album` | text | `''` |
| `genres` | text[] | `'{}'` |
| `played_at` | timestamptz | |
| `duration_ms` | integer | `0` |
| `dedup_key` | text | nullable |
| `ms_played` | integer | `0` |
| `popularity` | integer | `0` |
| `explicit` | boolean | `false` |
| `source` | text | `'spotify_api'` |

#### `dog_log` — _leeg_
Hond: wandelingen / activiteiten.

| Kolom | Type | Default / notitie |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK → auth.users |
| `kind` | text | |
| `happened_at` | timestamptz | `now()` |
| `duration_min` | integer | nullable |
| `distance_km` | numeric | nullable |
| `notes` | text | nullable |

#### `brain_state` — _leeg_
AI/assistent-state per gebruiker (één rij per gebruiker).

| Kolom | Type | Default / notitie |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK → auth.users, **uniek** |
| `threads` | jsonb | `'[]'` |
| `patterns` | jsonb | `'[]'` |
| `updated_at` | timestamptz | `now()` |

## Relaties

Vrijwel alle tabellen hangen direct aan `auth.users` via `user_id`. De enige
tabel-naar-tabel relatie binnen `public` is:

```
habits (1) ──< habit_log (n)   via habit_log.habit_id → habits.id
```

## Edge Functions

| Functie | Versie | `verify_jwt` | Doel |
|---|---|---|---|
| `wallet-ingest` | v9 | uit | Financiële/wallet-data ingest |
| `health-sheets-ingest` | v8 | uit | Health-data ingest vanuit Google Sheets |
| `notion-sync` | v6 | uit | Sync projecten/data vanuit Notion |
| `notion-hq` | v6 | uit | Notion HQ-sync |

> `verify_jwt` staat bij alle vier uit; deze functies vertrouwen op een eigen
> auth-mechanisme (service key / shared secret) i.p.v. een Supabase-JWT.

## Migraties

| Versie | Naam |
|---|---|
| `20260627213805` | `init` |
| `20260627223401` | `pipeline_columns` |
| `20260629224819` | `notion_enrich_clients` |

## Geïnstalleerde extensies

`plpgsql`, `pgcrypto`, `uuid-ossp`, `pg_stat_statements`, `supabase_vault`, `pg_cron`.

_(Vele andere extensies zijn beschikbaar maar niet geïnstalleerd, o.a. `vector`,
`postgis`, `pgmq`, `pg_net`, `pg_graphql`.)_

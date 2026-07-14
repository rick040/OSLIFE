# OSLIFE datalaag-architectuur (PM-201)

Het datamodel is het product; elk scherm is een view erop. Deze notitie beschrijft
het canonieke model en de bouwvolgorde. Scope = **formalize + upgrade** van de
bestaande Supabase-laag: bestaande tabellen blijven en worden projecties; we voegen
het ontbrekende ruggegraat en de metadata toe. Buiten scope: ingestie/pijplijnen
(alleen het SIGNAAL en zijn SHAPE tellen, nooit de connector).

## Kernprincipes
- **everything_is_an_event** — de spine is een append-only `events`-log; huidige
  staat is een projectie. Niets wordt stil overschreven.
- **universele envelop** — elk record/event draagt: id, type, domains[], occurred_at,
  recorded_at, source, confidence, status, derived_from, rule_id, tags, tier.
- **inference_with_confirmation** — het systeem leidt af, slaat op met confidence +
  status (observed/inferred/confirmed/rejected/superseded), en vraagt dan.
- **signal_multiplexing** — één signaal voedt meerdere levensdomeinen (bv. een lange
  wandeling = health-activiteit + hond-uitlaat + mood-datapunt).
- **emergent_structure** — herhaalde patronen promoveren zichzelf tot structuur.
- **local_first (pragmatisch)** — Supabase blijft bron van waarheid; data is
  exporteerbaar, mensleesbaar en overleeft elke vendor.

## Twee domein-assen (niet verwarren)
- `Domain` (bestaand): bedrijfstaxonomie — `parkingyou | prjct | buurtkaart | personal | cross`.
- `LifeDomain` (envelop): levensgebied dat een signaal voedt — `health | finance | work |
  relationships | home_admin | behaviour | pet | calendar | mindset | learning | cross`.

## Gevoeligheid (2 tiers)
`normaal` | `geheim`. `geheim` gaat NOOIT naar cloud-AI of externe verwerking en blijft
uit de vector-store. Standaard geheim: mentale/mindset-notities, gezondheidsdetails,
specifieke financiën, relatie-notities. Default per type staat in `type_registry`.

## Slice 0 (geïmplementeerd) — de fundering
Migratie: `supabase/migrations/20260714120000_event_spine.sql`.
- **`events`** — append-only log met de volledige envelop + `payload` (row-snapshot) +
  `seq` (totale volgorde). Niet op Realtime (hoog-volume; de client leest projecties).
- **`type_registry`** — per record-`type`: levensdomeinen, `default_tier`,
  `projection_table`, `field_contract` (schema-versionering, fase 7).
- **`tier`-kolom** op de inhoud-dragende tabellen (braindump_entries, daily_checkin,
  finance_tx, brain_state, heyra_memory), default `normaal`.
- **`emit_event()`-trigger** op de fact-tabellen: spiegelt elke insert/update naar
  `events` (dubbel-schrijven) met domeinen/tier uit `type_registry`. Exception-safe:
  loggen blokkeert nooit de primaire schrijf. Geen ingestie-code aangeraakt — puur datalaag.
- TypeScript-envelop-types in `src/types.ts` (`Envelope`, `EventRecord`,
  `TypeRegistryEntry`, `LifeDomain`, `Tier`, `EventSource`, `RecordStatus`).

## Afleidingsregels (fase 3, Slice 1) — IF · THEN · CONFIDENCE · CONFIRM · ON-REJECT
| id | trigger | produceert | conf | confirm | on reject |
|---|---|---|---|---|---|
| R1 vet_visit | betaling ~ dierenarts / locatie-match | event vet_visit (health,pet) | 0.7 | direct | verlaag merchant-gewicht |
| R2 dog_walk | lange GPS-wandeling in venster | dog_log(walk) | 0.6 | avonddigest | leer venster bij |
| R3 owed_reply | inbound zonder reactie >24u | interaction(owed_reply)+loop | 0.8 | scherm | markeer no-reply |
| R4 renewal_due | admin_item.renewal binnen opzegtermijn | nudge+loop | 1.0 | direct | pas termijn aan |
| R5 sub_creep | recurring tx niet in subscriptions | subscription-kandidaat | 0.75 | avonddigest | verhoog drempel |
| R6 energy_dip | slaap <6u meerdere nachten | mindset-pattern+nudge | 0.7 | ochtend | onderdruk type |
| R7 project_stall | active project lang stil, deadline nadert | loop "stokt" | 0.8 | scherm+digest | pas N aan |
| R8 vendor_categorize | onbekende merchant | vendor_tags (bestaand) | 0.5 | stil | manueel beschermt |
| R9 client_followup | last_contacted > cyclus | loop "opvolgen" | 0.9 | scherm+digest | verleng cadans |

## Promotieregels (patroon → structuur)
P1 3× vet_visit in 6 weken → `health_condition(subject=kyra)`. P2 3× recurring merchant →
`subscriptions`. P3 herhaalde owed_reply → belangrijke relatie. P4 terugkerend
admin-document → `admin_item`. P5 herhaald braindump-idee → `knowledge_item`.

## Slice 1 (geïmplementeerd) — inferentiemotor + hybride bevestiging
Migratie: `supabase/migrations/20260714130000_inference_engine.sql`.
- **`run_inference()`** (SECURITY DEFINER, pg_cron elk uur op :07): past R1/R5/R6/R7 toe,
  schrijft `inferred` events idempotent (NOT EXISTS op rule_id+dedup_key). Afgewezen
  inferenties blijven staan zodat ze niet opnieuw voorgesteld worden.
- **`confirm_inference(event_id, decision)`** (SECURITY DEFINER + eigen autorisatiecheck):
  zet status confirmed/rejected en past het effect toe (subscription_candidate → subscriptions).
  Aangeroepen vanuit de app (RLS-eigenaar) én de Telegram-webhook (service-role).
- **`rule_performance`**-view (security_invoker): proposed/confirmed/rejected/pending per regel,
  puur afgeleid uit events. Tuning-signaal voor fase 7.
- Hybride levering: hoge confidence (≥0.85) auto-commit; overige naar de review-queue
  (in-app scherm **Inferenties**) + een gebundelde **Telegram-avonddigest** met ✅/❌-knoppen
  (notify-tick), bevestigd via de `infer:`-callback in telegram-webhook.
- Client: `fetchPendingInferences`/`confirmInference` (supabase.ts), `inferences` +
  `loadInferences`/`resolveInference` (store), scherm `src/views/Inferences.tsx`.
- **Deploy-noot:** de twee edge-functions (notify-tick, telegram-webhook) moeten opnieuw
  gedeployd worden (`supabase functions deploy …`, JWT-verificatie uit) voordat de Telegram-
  digest live is. De motor (pg_cron) en het in-app scherm werken zodra de migratie is toegepast.

## Slice 2 (geïmplementeerd) — nieuwe v1-domeinen
Migratie: `supabase/migrations/20260714140000_slice2_domains.sql`.
- Nieuwe tabellen: `person`, `interaction` (mensen/relaties), `admin_item`, `admin_document`
  (huis & admin), `health_condition` (gezondheidsdossier, ook Kyra). RLS owner + realtime.
- Nieuwe regels in `run_inference()`: **R3** owed_reply (ongelezen inbound van bekend persoon
  >24u), **R4** renewal_due (admin-item binnen opzegtermijn, tijdgevoelig). Plus promotie
  **P1**: 3+ vet_visit-events in 6 weken → automatisch `health_condition(subject=kyra)`.
- `type_registry` uitgebreid met de nieuwe projectie- én afgeleide types; emit_event-triggers
  op interaction/admin_item/health_condition.
- Client: fetchers + CRUD (supabase.ts), store-slices + acties (people/interactions/adminItems/
  healthConditions), schermen `Relaties.tsx` + `HuisAdmin.tsx`, nav + routing.
- Resterende Slice 2-UI (klein): `health_condition` read-only tonen op de Kyra-view (subject=kyra)
  en Gezondheid-view (subject=rick). Datalaag + P1 werken al; alleen de weergave ontbreekt.

## Slice 3 (geïmplementeerd) — geheugen & retrieval
Migratie: `supabase/migrations/20260714150000_memory_retrieval.sql`.
- **`summaries`** + **`build_summaries()`** (SECURITY DEFINER, pg_cron 03:30): nachtelijke
  deterministische dag-roll-up (steps/slaap/finance/werk/relaties; geen LLM). Energie uit de
  geheim-getierde daily_checkin blijft er bewust buiten, dus de digest zelf is tier=normaal.
- **`search_memory(query, limit)`** (SECURITY INVOKER, RLS + expliciet tier<>'geheim'): de
  retrieval-primitive, Postgres full-text search (config `dutch`) over braindump/interaction/
  summaries. `geheim` komt er nooit in — het mag niet in cloud-AI-context belanden.
  pgvector (`vector` 0.8 staat klaar) kan later achter dezelfde RPC geschoven worden zodra
  een embedding-provider gekozen is (aparte, out-of-scope ingestie-keuze).
- **Context-assemblage-recept** (`src/heyra/context.ts`, fase 4.6): `assembleContext()` bouwt
  de bundel (facts + open loops + doelen + vandaag altijd, dan semantische recall via
  search_memory), geheim per constructie uitgesloten; `renderContext()` maakt het prompt-blok.
  Puur + unit-getest (`context.test.ts`). Beschikbaar voor de HEYRA-agents (adoptie incrementeel).
- Client: `fetchSummaries`/`searchMemory` (supabase.ts), `summaries`-store-slice, tab
  **Samenvattingen** in het Geheugen-scherm.

## Bouwvolgorde
- **Slice 0 (klaar):** envelop + `events` + `type_registry` + tier + emit_event-trigger.
- **Slice 1 (klaar):** regelmotor R1/R5/R6/R7 + confirm_inference + rule_performance +
  in-app review + Telegram-digest.
- **Slice 2 (klaar):** person/interaction/admin_item/admin_document/health_condition +
  R3/R4 + promotie P1 + Relaties- en Huis&Admin-schermen.
- **Slice 3 (klaar):** summaries + nachtelijke roll-up + tier-veilige search_memory +
  context-assemblage-recept.
- **Slice 4:** regel-tuning uit rule_performance; maandelijkse self-audit; vergeetbeleid +
  tombstones (recht op vergeten voor `geheim`).
- **Slice 3:** `summaries` + nachtelijke roll-up; embedding-search op tier=normaal;
  context-assemblage-recept in de HEYRA-router.
- **Slice 4:** regel-tuning uit accept/reject; maandelijkse self-audit; vergeetbeleid +
  tombstones (recht op vergeten voor `geheim`).

## Reducer-conventie (Slice 1+)
Een reducer vouwt events van één `type` naar zijn projectietabel. Correcties = nieuw event
met `status=superseded` via `derived_from`; de projectie neemt de nieuwste geldige.
Provenance-voorrang bij contradictie: manual/confirmed > sensor/import > inferred.

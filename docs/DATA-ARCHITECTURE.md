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

## Bouwvolgorde
- **Slice 0 (klaar):** envelop + `events` + `type_registry` + tier + emit_event-trigger.
- **Slice 1:** regelmotor R1–R9 als reducers op events; hybride bevestiging (avonddigest +
  direct-vragen + stil auto-commit), hergebruik notify-tick + Telegram + notification_log.
- **Slice 2:** nieuwe v1-entiteiten — `person`+`interaction` (Client wordt rol),
  `admin_item`+`admin_document`, `health_condition` + Kyra-dossier (P1).
- **Slice 3:** `summaries` + nachtelijke roll-up; embedding-search op tier=normaal;
  context-assemblage-recept in de HEYRA-router.
- **Slice 4:** regel-tuning uit accept/reject; maandelijkse self-audit; vergeetbeleid +
  tombstones (recht op vergeten voor `geheim`).

## Reducer-conventie (Slice 1+)
Een reducer vouwt events van één `type` naar zijn projectietabel. Correcties = nieuw event
met `status=superseded` via `derived_from`; de projectie neemt de nieuwste geldige.
Provenance-voorrang bij contradictie: manual/confirmed > sensor/import > inferred.

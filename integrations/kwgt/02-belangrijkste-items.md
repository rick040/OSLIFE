# Widget 2 · Belangrijkste items

Een rustige "3 belangrijkste dingen vandaag"-tegel (MIT — Most Important Tasks). Toont de taken die
je in OSLIFE als `focus_date = vandaag` hebt gepind; zijn er geen pins, dan valt de widget vanzelf
terug op je 3 hoogst-geprioriteerde open taken, zodat de widget nooit leeg oogt.

*Zie `README.md` voor het gedeelde design-systeem en hoe `kwgt-api` werkt.*

## Formaat

**4×2**-grid, zelfde canvas als widget 1. (Bouw 'm het snelst door widget 1 te **dupliceren** en
vanaf Stap 1 hieronder aan te passen — achtergrond/typografie blijven identiek.)

## Stap 1 — Netwerk-feed

- **URL:**
  ```
  https://nhyunnnmdcmojvkxrbpl.supabase.co/functions/v1/kwgt-api?w=focus&secret=<JOUW-SECRET>
  ```
- Methode GET, ververs elke 15-30 minuten.

## Stap 2 — Achtergrond

Zelfde als widget 1 (§Stap 2 in `01-todo-lijst.md`) — `#12141C` @ 92%, radius 24dp, glasrand 8%.

## Stap 3 — Kop

- Label `BELANGRIJKSTE VANDAAG`, 11sp, hoofdletters, `#9497A8`.
- Klein statuslabel rechtsboven: formule op `$.isPinned` → toon "gepind" (subtiel, `#F5A524` 60%
  dekking) als waar, anders niets — zo zie je in één oogopslag of dit je eigen keuze is of een
  automatische suggestie.

## Stap 4 — Drie genummerde regels

Geen vinkjes hier (dit is een overzicht, geen actielijst) — in plaats daarvan een groot cijfer per
regel, dat is wat het "premium MIT-lijstje"-gevoel geeft. Drie rijen, `items[0]`–`items[2]`
(`focus` geeft er standaard maximaal 3), hoogte ≈ 32dp elk:

1. **Tekst-module** — het cijfer, links, vaste breedte 24dp:
   - Tekst: `1` / `2` / `3` (statisch per rij — dit hoeft geen formule te zijn)
   - 20sp, vet, kleur: normaal `#F5A524` (amber); **overschrijf naar `#F2545B`** (koraal) met een
     if-formule wanneer `$.items[0].overdue` waar is
   - Zichtbaarheid: alleen tonen als `$.count` > index (zelfde patroon als widget 1)
2. **Tekst-module** — titel, ernaast:
   - Formule: `$.items[0].title` (resp. `[1]`, `[2]`)
   - 15sp, kleur `#F5F6FA`, max 1 regel + "…"
3. **Tekst-module** — domein-tag, rechts uitgelijnd, klein:
   - Formule: `$.items[0].domain`
   - 11sp, kleur `#6B6E80`, hoofdletters

## Stap 5 — Tik-actie

Geen inline-actie hier (bewust — dit is een "waar moet ik vandaag op focussen"-overzicht, geen
actielijst; afvinken doe je in widget 1 of de app). Zet op de hele kaart één simpele tik-actie:
**Open app** → OSLIFE, zodat een tik naar de volledige takenlijst springt.

## Testen

- Pin in de OSLIFE-app 2 taken als "Belangrijkste vandaag" → de widget toont exact die 2, met
  `isPinned` = waar.
- Verwijder alle pins → de widget valt automatisch terug op de 3 hoogst-geprioriteerde open taken
  (`isPinned` = onwaar) — nooit een lege tegel.

## Exporteren

Zelfde als widget 1: menu (⋮) → Preset opslaan als → Exporteren als `.kwgt`.

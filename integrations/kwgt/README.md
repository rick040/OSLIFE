# OSLIFE · 5 premium KWGT-widgets

Vijf kant-en-klare [KWGT](https://play.google.com/store/apps/details?id=org.kustom.widget)
("Kustom Widget") home-screen-widgets — direct importeerbaar, geen handwerk nodig. Ze staan in
`presets/*.kwgt`.

| # | Widget | Bestand | Toont | Tik |
|---|--------|---------|-------|-----|
| 1 | **To-do lijst** | `presets/01-todo-lijst.kwgt` | open taken, overdue eerst | ververst |
| 2 | **Belangrijkste items** | `presets/02-belangrijkste-items.kwgt` | vandaags "Belangrijkste"-shortlist | ververst |
| 3 | **Actieve projecten** | `presets/03-actieve-projecten.kwgt` | actieve projecten + voortgang + deadline | ververst |
| 4 | **Brain-dump quick add** | `presets/04-braindump-quick-add.kwgt` | "+"-tegel + aantal vandaag vastgelegd | ververst |
| 5 | **HEYRA quick chat/voice** | `presets/05-heyra-quick-chat.kwgt` | korte HEYRA-teaser (belangrijkste taak) | ververst |

Alle vijf praten met **`kwgt-api`** (`supabase/functions/kwgt-api/index.ts`) via Kustom's eigen
`wg()`-formule (**w**eb **g**et) — een ingebouwde Kustom-functie die een URL ophaalt en er direct
een JSON-veld uit leest, bv. `$wg(url, json, .count)$`. Geen los "netwerk"-scherm nodig: elke
tekst/kleur/breedte in de widget die live data toont, roept die formule gewoon rechtstreeks aan.

## Hoe dit tot stand kwam

Dit `preset.json`-formaat (het interne JSON-formaat in een `.kwgt`-bestand) staat nergens publiek
gedocumenteerd op een manier die ik hier kon raadplegen (Kustom's eigen documentatiesite was vanuit
deze omgeving niet bereikbaar). In plaats van te gokken heb ik **echte, werkende `.kwgt`-bestanden
van andere makers uitgepakt en de structuur teruggelezen** — o.a. uit
[AumGupta/KWGT-Widgets](https://github.com/AumGupta/KWGT-Widgets),
[fergassss1/kwgt-widgets](https://github.com/fergassss1/kwgt-widgets) en
[YifePlayte/Genshin-DailyNote-KWGT](https://github.com/YifePlayte/Genshin-DailyNote-KWGT) — die
laatste was de sleutel: een widget die al een externe JSON-API uitleest, dus met een écht, werkend
voorbeeld van de `wg()`-netwerkformule erin. De 5 OSLIFE-widgets zijn met een generator-script
(`scripts/build_presets.py`) opgebouwd volgens exact datzelfde, teruggevonden schema.

**Geverifieerd** (rechtstreeks overgenomen uit werkende widgets): de module-structuur
(`RootLayerModule`/`StackLayerModule`/`OverlapLayerModule`/`ShapeModule`/`TextModule`), hoe een
veld formule-gedreven wordt gemaakt (`internal_toggles`/`internal_formulas`), globals
(`globals_list`, incl. het `TEXT`-type dat Kustom na import automatisch als een invulveld toont),
de `wg(url, json, .pad)`-functie, tekst-opmaak (`[b]...[/b]`), en de "ververs nu"-tik-actie
(`KUSTOM_ACTION` / `TEXT_UPDATE`).

**Best-effort** (mijn eigen constructie bovenop dat schema, niet 1-op-1 uit een voorbeeld
overgenomen): de exacte pixel-opmaak/uitlijning van elke widget, en dat elke tik alleen ververst in
plaats van ook direct te kunnen schrijven (afvinken, tekst versturen). Kustom's tik-acties kunnen
apps/shortcuts openen of een globale variabele wisselen, maar ik heb geen betrouwbaar bevestigde
manier gevonden om vanuit één tik een eigen tekst te typen én direct te versturen zonder de kans op
dubbele/herhaalde verzendingen (Kustom herrekent formules bij elke ververs-cyclus, dus een simpele
"schrijf-bij-tik"-truc zou dezelfde actie steeds opnieuw kunnen afvuren). Vandaar: alle vijf
widgets zijn **read-only + verversen-op-tik**; voor het afvinken van een taak of het toevoegen van
een nieuwe Braindump/HEYRA-vraag open je de OSLIFE-app.

Kortom: als een widget na import niet exact goed toont, is de kans het grootst dat het aan een
detail in de opmaak ligt (best-effort deel) — laat het weten met een screenshot, dan pas ik het
generator-script aan en genereer ik een gecorrigeerde versie, in plaats van dat je zelf in Kustom
hoeft te knutselen.

## Importeren en instellen (per widget, één keer)

1. Zet het `.kwgt`-bestand op je telefoon (bv. via een cloud-drive, mail, of USB) en open het —
   Android opent het automatisch met KWGT, of kies **KWGT** → **Preset laden** → blader naar het
   bestand.
2. Zet 'm op je startscherm zoals elk KWGT-widget.
3. **Eenmalig instellen:** houd de widget ingedrukt → **Kustom bewerken** (of het potlood-icoon) →
   je ziet twee tekstvelden onder "Globals"/"Variabelen":
   - **OSLIFE API URL** — laat op de standaardwaarde staan, tenzij je zelf een ander
     OSLIFE-Supabase-project draait:
     ```
     https://nhyunnnmdcmojvkxrbpl.supabase.co/functions/v1/kwgt-api
     ```
   - **OSLIFE secret** — vul hier je `KWGT_WIDGETS_SECRET` in (zie hieronder).
4. Sla op. De widget haalt binnen enkele seconden live data op.

Zie je niks of een foutmelding in de widget? Tik erop (ververst direct) — komt er nog niks, dan
klopt de secret niet of staat de widget-URL fout.

## Backend opzetten (eenmalig, voor alle 5 widgets samen)

1. **Deploy de functie:**
   ```bash
   supabase functions deploy kwgt-api --project-ref nhyunnnmdcmojvkxrbpl
   ```
2. **Zet een secret** (of hergebruik `WIDGET_SUMMARY_SECRET` als je die al hebt — zie
   `kwgt-api`'s dockomment voor de fallback-keten):
   ```bash
   supabase secrets set KWGT_WIDGETS_SECRET=<random 32+ char secret> --project-ref nhyunnnmdcmojvkxrbpl
   ```
3. **HEYRA-widget:** zorg dat `ANTHROPIC_API_KEY` als secret staat (gedeeld met
   `braindump-ingest`/`heyra-brain`) — niet strikt nodig voor widget 5 zelf (die toont alleen de
   "Belangrijkste"-teaser), wel voor een eventuele latere uitbreiding naar een echt HEYRA-antwoord.

### Testen vanaf de telefoon (of laptop) voordat je importeert

Plak dit met je eigen secret in een browser — je moet meteen JSON terugkrijgen:

```
https://nhyunnnmdcmojvkxrbpl.supabase.co/functions/v1/kwgt-api?w=todos&secret=<jouw-secret>
```

`{"ok":false,"error":"Unauthorized"}` → secret klopt niet of is niet gezet.
`{"ok":true,"count":...,"items":[...]}` → de backend werkt.

## API-referentie (`kwgt-api`)

| `w=` | Extra params | Antwoord (belangrijkste velden) |
|------|--------------|----------------------------------|
| `todos` | — | `count`, `items[].{title,due,overdue,priority,domain,pinned}` |
| `focus` | — | `isPinned`, `count`, `items[]` (zelfde vorm als `todos`) |
| `projects` | — | `count`, `items[].{name,client,progressPct,deadline,daysLeft,overdue,domain}` |
| `braindump-count` | — | `count` (aantal Braindump-captures vandaag) |
| `braindump` | `text=<url-encoded tekst>` | `status:"captured"`, `preview` (niet door de widgets gebruikt — handig voor een eigen MacroDroid/Tasker-koppeling) |
| `heyra` | `msg=<url-encoded vraag>` | `reply` (niet door widget 5 gebruikt — zelfde reden) |
| `task-toggle` | `id=<task-uuid>` | zelfde vorm als `todos` (niet door de widget gebruikt) |

De laatste drie acties bestaan al in de backend (bruikbaar voor je eigen automatisering, bv. een
MacroDroid-macro die een knop indrukt), maar zitten bewust niet in de meegeleverde widgets zelf —
zie "Best-effort" hierboven.

## Gedeeld design-systeem — "OSLIFE Glass"

- Achtergrond: afgeronde kaart, `#12141C` @ 92%, met een subtiele glazen rand (wit @ 8%, 2dp
  stroke) — verhoudingen schalen mee met de widget-afmeting via `rh`/`rw` (`si(rheight)`/`si(rwidth)`).
- Kop-labels: klein, hoofdletters, gedimd (`#9497A8`).
- Hoofdtekst: `#F5F6FA`. Metatekst (datum/domein): `#6B6E80`.
- Eigen accentkleur per widget, ook gebruikt voor overdue-highlighting (koraal `#F2545B`):

| Widget | Accent |
|--------|--------|
| 1 · To-do lijst | Indigo `#7C6CF0` |
| 2 · Belangrijkste items | Amber `#F5A524` |
| 3 · Actieve projecten | Smaragd `#22D3AA` |
| 4 · Brain-dump quick add | Magenta `#EC4899` |
| 5 · HEYRA quick chat/voice | Hemelsblauw `#38BDF8` |

Widget 1/2/3 zijn ontworpen op een **4×2**-grid, widget 4/5 op een **2×2**-tegel — dat is alleen het
editor-canvas; op je startscherm passen ze zich automatisch aan de gekozen afmeting aan.

## Zelf aanpassen / opnieuw genereren

```bash
python3 integrations/kwgt/scripts/build_presets.py
```
Genereert alle 5 `.kwgt`-bestanden opnieuw in `presets/`. Pas kleuren/teksten/lay-out aan in het
script (elke widget heeft een eigen `build_*()`-functie) — geen zip/JSON-kennis nodig, het script
regelt de encoding.

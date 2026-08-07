# OSLIFE · 5 premium KWGT-widgets

Vijf losse, volwaardige [KWGT](https://play.google.com/store/apps/details?id=org.kustom.widget)
("Kustom Widget") home-screen-widgets die live OSLIFE-data tonen en terugschrijven:

| # | Widget | Bestand | Toont | Actie op tap |
|---|--------|---------|-------|--------------|
| 1 | **To-do lijst** | `01-todo-lijst.md` | open taken, overdue eerst | vinkje zet taak open↔closed |
| 2 | **Belangrijkste items** | `02-belangrijkste-items.md` | vandaags "Belangrijkste"-shortlist (`focus_date`) | tap opent OSLIFE |
| 3 | **Actieve projecten** | `03-actieve-projecten.md` | actieve projecten + voortgang + deadline | tap opent OSLIFE |
| 4 | **Brain-dump quick add** | `04-braindump-quick-add.md` | een compacte "+"-tegel | tekstinvoer → direct een Braindump-capture |
| 5 | **HEYRA quick chat/voice** | `05-heyra-quick-chat.md` | laatste HEYRA-antwoord | tekstinvoer (met dictee-microfoon van je toetsenbord) → HEYRA-antwoord |

Alle vijf praten met **één nieuwe Edge Function, `kwgt-api`**
(`supabase/functions/kwgt-api/index.ts`) — dezelfde gedeelde-secret-conventie als
`widget-summary`/`screentime-app-ingest`: gewoon een GET-request met een secret in de
query-string. Dat is bewust, want KWGT's netwerk-engine en zijn "Open URL"-tik-actie zijn
allebei GET-only — er is geen OAuth-flow of JWT-login nodig, dus dit werkt ook voor **anderen**
die hun eigen OSLIFE-Supabase-project draaien: iedereen vult straks gewoon zijn eigen `secret` +
`SUPABASE_URL` in.

## Waarom een bouwgids in plaats van een kant-en-klaar `.kwgt`-bestand

Een `.kwgt`-bestand is een zip met een intern JSON-formaat dat per Kustom-versie kan verschillen
en dat ik in deze omgeving niet tegen een echt toestel kan testen (geen Android/Kustom hier, geen
internettoegang tot Kustom's eigen documentatie). Een blind gegokt binair bestand dat niet
importeert is nul waard en oncontroleerbaar. In plaats daarvan krijg je hieronder een **exacte,
module-voor-module bouwgids** met kant-en-klare kleuren, teksten, JSON-paden en formules — je
klikt dit in Kustom's eigen editor in elkaar (10-15 min per widget, één keer), en het werkt
gegarandeerd omdat je Kustom's eigen, altijd-actuele UI gebruikt in plaats van een gegist bestand.
Overal waar Kustom's formuletaal een specifieke functienaam nodig heeft, verwijst de gids naar
Kustom's eigen formule-kiezer (het **ƒx-icoon** in de formulebalk → categorie **Network**/**Global**)
in plaats van een functienaam te gokken die inmiddels achterhaald kan zijn — zo werkt het ongeacht
je Kustom-versie.

Elke gids exporteert aan het eind als een **preset (.kwgt) via Kustom zelf** (Preset →
Exporteren), zodat je 'm daarna gewoon met anderen kan delen als bestand — die hoeven 'm dan alleen
te importeren en hun eigen `secret` in te vullen.

## Opzetten (eenmalig)

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
   `braindump-ingest`/`heyra-brain`) — anders antwoordt widget 5 met een foutmelding.
4. Onthoud je **basis-URL** en **secret** — je typt ze zo in elke widget's Netwerk-config:
   ```
   https://nhyunnnmdcmojvkxrbpl.supabase.co/functions/v1/kwgt-api
   ```

### Testen vanaf de telefoon (of laptop) voordat je gaat bouwen

Plak dit met je eigen secret in een browser — je moet meteen JSON terugkrijgen:

```
https://nhyunnnmdcmojvkxrbpl.supabase.co/functions/v1/kwgt-api?w=todos&secret=<jouw-secret>
```

`{"ok":false,"error":"Unauthorized"}` → secret klopt niet of is niet gezet.
`{"ok":true,"count":...,"items":[...]}` → de backend werkt, je kan beginnen bouwen.

## API-referentie (`kwgt-api`)

Alles is een **GET** naar dezelfde basis-URL, met `secret` als query-param en `w=` om de widget te
kiezen. Elke actie geeft direct JSON terug — ook de "schrijf"-acties (`braindump`, `heyra`,
`task-toggle`) — zodat je in Kustom dezelfde netwerk-feed kan gebruiken om zowel de actie uit te
voeren áls het scherm meteen te verversen met het resultaat. Geen Tasker/MacroDroid nodig.

| `w=` | Extra params | Antwoord (belangrijkste velden) |
|------|--------------|----------------------------------|
| `todos` | — | `count`, `items[].{title,due,overdue,priority,domain,pinned}` |
| `focus` | — | `isPinned`, `count`, `items[]` (zelfde vorm als `todos`) |
| `projects` | — | `count`, `items[].{name,client,progressPct,deadline,daysLeft,overdue,domain}` |
| `braindump` | `text=<url-encoded tekst>` | `status:"captured"`, `preview` |
| `heyra` | `msg=<url-encoded vraag>` | `reply` (kort, 2-3 zinnen) |
| `task-toggle` | `id=<task-uuid>` | zelfde vorm als `todos` (al ververst) |

Data-bron per widget: `tasks` (`focus_date = vandaag` = "Belangrijkste"), `projects`
(`status = 'active'`), `braindump_entries` (zelfde pipeline als de in-app capture en
`telegram-webhook`), en een eenmalige HEYRA-aanroep met een korte snapshot van vandaag als context
(geen doorlopend gesprekgeheugen — dit is een klein widgetje, geen chatscherm).

## Gedeeld design-systeem — "OSLIFE Glass"

Alle vijf widgets delen dezelfde donkere, glazige premium-look, elk met een eigen accentkleur zodat
ze in één oogopslag herkenbaar zijn maar overduidelijk uit dezelfde set komen.

**Ondergrond (elke widget):**
- Achtergrond-Shape: afgeronde rechthoek, radius **24dp**, kleur `#12141C`, dekking **92%**.
- Rand: 1dp stroke, wit `#FFFFFF` op **8%** dekking (de "glazen rand").
- Zachte schaduw: zwart, 12dp blur, 6dp y-offset, 30% dekking — geeft het zwevende kaart-effect.
- Binnenmarge: 16dp rondom.

**Typografie:**
- Kop/label (bv. "TO-DO", "BELANGRIJKSTE"): 11sp, **hoofdletters**, letter-spacing ruim, kleur
  `#9497A8` (gedimd), niet vet.
- Hoofdtekst/titels: 15-16sp, kleur `#F5F6FA`.
- Cijfers/tellers (bv. "3 open"): 28-32sp, vet, in de accentkleur van de widget.
- Meta/ondertekst (deadline, domein): 12sp, kleur `#6B6E80`.
- Lettertype: standaard Kustom-systeemfont is prima (Roboto/Product Sans); voor extra premium
  gevoel: Kustom → Instellingen → Lettertypes → importeer **Inter** of **Manrope** (gratis, Google
  Fonts) en gebruik die overal in plaats van het systeemfont.

**Accentkleuren per widget** (gebruik steeds op: de cijfer-teller, de progress-ring/bar, de
iconen en de rand van de primaire knop):

| Widget | Accent | Hex |
|--------|--------|-----|
| 1 · To-do lijst | Indigo | `#7C6CF0` |
| 2 · Belangrijkste items | Amber (normaal) / Koraal (overdue) | `#F5A524` / `#F2545B` |
| 3 · Actieve projecten | Smaragd → Teal (gradient) | `#22D3AA` → `#2DD4BF` |
| 4 · Brain-dump quick add | Magenta | `#EC4899` |
| 5 · HEYRA quick chat/voice | Hemelsblauw | `#38BDF8` |

**Iconen:** Kustom heeft ingebouwde icon-fonts (Material Icons e.a.) — kies ze via een
Tekst-module → Lettertype-kiezer → "Icon"-categorie, en pik het icoon uit de ingebouwde
icon-browser (vinkje, map, gloeilamp, microfoon). Zo hoef je geen unicode-codepoint te onthouden of
te gokken.

**Micro-interactie:** zet op elke tikbare Shape-module de ingebouwde **klik-ripple** aan
(Shape-module → Click effect → Ripple, kleur = de accentkleur op 25% dekking) — dat is wat een
widget "premium" laat aanvoelen bij het tikken, en kost geen extra module.

**Maatvoering:** alle vijf zijn ontworpen op een **4×2**-grid (todo/focus/projecten) of
**2×2**-grid (brain-dump/HEYRA, vierkante "tegel"-vorm) — precies aangegeven in elke losse gids.

## Volgorde van bouwen

Begin met **widget 1 (to-do lijst)** — die introduceert het basis-kaartje, de netwerk-feed en de
lijst-loop die de andere vier hergebruiken. Daarna gaan 2 en 3 sneller (kopieer widget 1, pas
kleuren/velden aan), en 4/5 introduceren de tekstinvoer-truc.

# OSLIFE-widgets op je Android/Samsung-homescreen (via KWGT)

Echte homescreen-widgets kunnen **niet** rechtstreeks uit een PWA op Android — dat
vereist native code. De pragmatische route voor een single-user app als OSLIFE is
**KWGT** (Kustom Widget Maker): je ontwerpt de widget in KWGT en laat 'm elke paar
minuten een JSON-samenvatting van OSLIFE ophalen. Geen APK, geen Play Store-gedoe.

De data komt van één kleine, **read-only** Edge Function: `widget-summary`. Die leest
alleen jouw eigen rijen en schrijft nooit iets — het ergste wat een gelekte token kan
doen is je takenteller tonen. Rotatie = `WIDGET_TOKEN` vervangen.

## 1. Endpoint deployen (eenmalig)

```bash
supabase functions deploy widget-summary --project-ref nhyunnnmdcmojvkxrbpl
```

Daarna in het Supabase-dashboard:

1. **Edge Functions → widget-summary → Settings → "Enforce JWT verification" UIT.**
   (KWGT kan geen Supabase-JWT sturen.)
2. **Edge Functions → Manage secrets:** voeg toe
   `WIDGET_TOKEN` = een willekeurige string, bv. `openssl rand -base64 24`.
   (`OSLIFE_USER_ID` staat er al voor de andere functies.)

Test in je browser of met curl (vervang `<TOKEN>`):

```
https://nhyunnnmdcmojvkxrbpl.supabase.co/functions/v1/widget-summary?token=<TOKEN>
```

Je krijgt JSON terug zoals in "Response-vorm" hieronder.

## 2. KWGT installeren

- Play Store: **KWGT Kustom Widget Maker** (gratis; de betaalde **KWGT Pro** ontgrendelt
  o.a. het exporteren en meerdere widget-groottes — voor thuisgebruik niet strikt nodig).
- Op Samsung werkt KWGT gewoon via One UI's widget-picker: lang op het homescreen drukken
  → **Widgets** → KWGT → kies een grootte (bv. 4x2) → tik de lege widget → **KWGT-editor**.

## 3. Data ophalen in KWGT

KWGT haalt een URL op met de **`wg()`**-formule en pakt er een JSON-veld uit:

```
wg("https://nhyunnnmdcmojvkxrbpl.supabase.co/functions/v1/widget-summary?token=<TOKEN>", "json", "PAD", REFRESH_MIN)
```

- `PAD` = het JSON-pad, bv. `tasks.line1` of `health.sleep.label`.
- `REFRESH_MIN` = ververs-interval in minuten (bv. `15`). Houd dit ruim i.v.m. batterij.

**Tip:** tik in KWGT elk tekst-item aan → **Text** → het `fx`-icoon → plak de formule.
De hele URL steeds herhalen is vervelend — zet 'm daarom één keer in een **Global**
(Globals → + → Text → naam `api`, waarde = de volledige URL mét token). Dan wordt elke
formule kort:

```
wg($gv(api)$, "json", "tasks.line1", 15)
```

## 4. Kant-en-klare regels (geen JSON-gepuzzel)

Elke sectie levert al opgemaakte strings, zodat je ze 1-op-1 op een tekst-item kunt zetten:

| Widget-tekst | KWGT-formule (met de `api`-global) |
|---|---|
| Taken-samenvatting | `wg($gv(api)$, "json", "tasks.line1", 15)` → `7 open · 2 vandaag · 1 te laat` |
| Belangrijkste taak | `wg($gv(api)$, "json", "tasks.headline", 15)` → `"Offerte sturen" — vandaag (High)` |
| Volgende mijlpaal | `wg($gv(api)$, "json", "tasks.next_milestone.title", 15)` |
| Gewoontes vandaag | `wg($gv(api)$, "json", "habits.line1", 15)` → `3/5 vandaag` |
| Langste streak | `wg($gv(api)$, "json", "habits.headline", 15)` → `🔥 Sporten 12d` |
| Top-doel | `wg($gv(api)$, "json", "goals.line1", 15)` → `Boek afmaken · 65%` |
| Gezondheid-regel | `wg($gv(api)$, "json", "health.line1", 15)` → `😴 7u 11m · 👣 8.423 · ⚖️ 78,4kg` |
| Alleen slaap | `wg($gv(api)$, "json", "health.sleep.label", 15)` → `7u 11m` |
| Alleen stappen | `wg($gv(api)$, "json", "health.steps", 15)` → `8423` |

### Losse velden voor een eigen layout

Wil je zelf opmaken (bv. een progress-bar voor je top-doel), gebruik de losse velden:

| Veld | Pad |
|---|---|
| Aantal open taken | `tasks.open_count` |
| Taken te laat | `tasks.overdue` |
| Eerste taak-naam | `tasks.top.0.name` |
| Eerste taak-project | `tasks.top.0.project` |
| Eerste taak "wanneer" | `tasks.top.0.due_label` |
| Gewoontes klaar | `habits.done_today` / `habits.total` |
| Eerste open gewoonte | `habits.open.0.name` (+ `habits.open.0.icon`, `habits.open.0.streak`) |
| Doel-voortgang % | `goals.top.progress_pct` (getal 0–100 — perfect voor een KWGT progress bar) |
| Slaap in minuten | `health.sleep.total_min` |
| Diepe slaap (min) | `health.sleep.deep_min` |
| Gewicht (kg) | `health.weight_kg` |

Voor een KWGT-**progress bar** zet je de "Level"-waarde op
`wg($gv(api)$, "json", "goals.top.progress_pct", 15)` en Max op `100`.

## 5. Meerdere widgets

Maak gewoon meerdere KWGT-widgets, elk met dezelfde global-URL maar andere velden:
één "Taken", één "Gezondheid", één "Gewoonten & doelen". Ze delen de cache van KWGT,
dus het endpoint wordt niet vaker geraakt dan je refresh-interval.

## Response-vorm

```jsonc
{
  "generated_at": "2026-07-11T14:03:00.000Z",
  "date": "2026-07-11",
  "tasks": {
    "open_count": 7, "due_today": 2, "overdue": 1,
    "top": [ { "name": "...", "project": "...", "due": "2026-07-12",
              "due_label": "morgen", "overdue": false, "priority": "High" } ],
    "next_milestone": { "title": "...", "due_label": "over 3 dagen", "progress_pct": 40 },
    "line1": "7 open · 2 vandaag · 1 te laat",
    "headline": "\"Offerte sturen\" — vandaag (High)"
  },
  "habits": {
    "done_today": 3, "total": 5, "best_streak": 12, "best_streak_name": "Sporten",
    "open": [ { "name": "...", "icon": "🏃", "streak": 4 } ],
    "line1": "3/5 vandaag", "headline": "🔥 Sporten 12d"
  },
  "goals": {
    "active": 4,
    "top": { "title": "Boek afmaken", "progress_pct": 65, "due_label": "over 5 dagen" },
    "line1": "Boek afmaken · 65%"
  },
  "health": {
    "sleep": { "date": "2026-07-11", "total_min": 431, "label": "7u 11m", "deep_min": 88, "rem_min": 92 },
    "steps": 8423, "weight_kg": 78.4,
    "line1": "😴 7u 11m · 👣 8.423 · ⚖️ 78,4kg"
  }
}
```

Lege secties vallen netjes terug op `"Geen open taken 🎉"` / `"Geen gezondheidsdata"` e.d.,
zodat de widget nooit een lege of kapotte string toont.

## Waarom niet gewoon de PWA?

- **Toevoegen aan startscherm** (via Chrome/Samsung Internet) geeft alleen een **app-icoon**,
  geen data-widget.
- De officiële `widgets`-manifest-feature werkt **alleen op Windows 11** (Widgets Board),
  niet op het Android-homescreen.
- Echte homescreen-widgets vereisen native Android-code (`AppWidgetProvider`, Kotlin) in
  een APK. Dat kan later alsnog — en dan gebruikt die APK exact ditzelfde `widget-summary`-
  endpoint als databron.

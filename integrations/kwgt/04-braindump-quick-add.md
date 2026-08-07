# Widget 4 · Brain-dump quick add

Eén vierkante tegel: tik erop, typ (of dicteer) een gedachte, en 'm staat meteen in je OSLIFE
Braindump — dezelfde pijplijn als de in-app capture-box en de Telegram-bot (samenvatting, tags,
domein worden er automatisch bij gegenereerd).

*Zie `README.md` voor het gedeelde design-systeem en hoe `kwgt-api` werkt.*

## Formaat

**2×2**-grid (een vierkante "tegel", geen lijst-widget) — Preset toevoegen → Widget → 2×2.

## Concept: hoe een tik hier een POST vervangt

Kustom's netwerk-engine is GET-only en heeft geen los "verstuur formulier"-concept, maar de
combinatie **Tekstinvoer-actie → Global variabele → Open URL met die Global in de query-string →
Ververs feed** werkt hier prima, want `kwgt-api?w=braindump&text=...` accepteert de tekst gewoon
als GET-parameter en geeft direct een bevestiging terug. Geen Tasker/MacroDroid nodig.

## Stap 1 — Global variabele

Instellingen (tandwiel) → **Global** → **Variables** → maak een tekst-Global aan met naam
`bd_text` (leeg als startwaarde).

## Stap 2 — Netwerk-feed (alleen voor de actie, geen periodieke poll nodig)

- **URL** (let op: gebruik hier de **URL-encode-formule** rond de Global, zodat spaties/leestekens
  geen kapotte URL geven — ƒx → Text → **URL Encode**, toegepast op `$gv(bd_text)$`):
  ```
  https://nhyunnnmdcmojvkxrbpl.supabase.co/functions/v1/kwgt-api?w=braindump&secret=<JOUW-SECRET>&text=<URL-encoded $gv(bd_text)$>
  ```
- Methode GET. **Ververs elke:** nooit/handmatig (deze feed hoeft alleen te vuren als reactie op de
  tik-actie hieronder, niet elke X minuten — anders stuur je steeds dezelfde tekst opnieuw in).

## Stap 3 — De tegel

**Shape-module**, volledig scherm, vierkant, radius 24dp:
- Vulkleur `#12141C` @ 92%, glasrand 8% wit, schaduw zoals het gedeelde design-systeem.
- Klik-ripple aan, kleur `#EC4899` (magenta) op 25% dekking.

**Tekst-module**, gecentreerd, groot icoon (Lettertype-kiezer → Icon-categorie → kies een
"toevoegen/potlood/hersenen"-glyph):
- 36sp, kleur `#EC4899`

**Tekst-module**, onder het icoon, gecentreerd:
- Tekst: `BRAIN-DUMP`
- 11sp, hoofdletters, letter-spacing ruim, `#9497A8`

**Tekst-module**, onderin de tegel (klein), de laatst-vastgelegde preview:
- Formule op de netwerk-feed: `$.preview` (toont pas iets ná de eerste tik van de sessie — laat
   'm anders leeg/verborgen met een if-formule op `$.status`)
- 10sp, kleur `#6B6E80`, max 2 regels

## Stap 4 — Tik-actie op de hele tegel

Eén tik-actie-lijst, in deze volgorde:

1. **Tekstinvoer** (Text Input) → schrijf het resultaat naar Global `bd_text`. Zet als hint-tekst
   iets als "Wat wil je vastleggen?" — de systeem-toetsenbord-dictee-knop (het microfoontje van
   Gboard/je eigen toetsenbord) werkt hier gratis mee, dus dit is meteen ook je voice-invoer.
2. **Open URL** (op de achtergrond/geen browser, indien je Kustom-versie die optie heeft) naar de
   URL uit Stap 2.
3. **Ververs netwerk-feed 0** — haalt de bevestiging (`preview`) op zodat Stap 3's onderste
   tekstregel meteen bijwerkt.
4. *(optioneel)* **Toon toast** met tekst "Vastgelegd in Braindump ✓" — een kleine, bevestigende
   flits zodat je zeker weet dat de tik is aangekomen ook al kijk je niet meteen naar de tegel.

## Testen

- Tik de tegel, typ "bel de tandarts" → binnen enkele seconden zie je 'm terug in OSLIFE onder
  Braindump (bron `kwgt`, automatisch samengevat/getagd door `braindump-ingest`).
- Laat het tekstveld leeg en bevestig → `kwgt-api` geeft `{"ok":false,"error":"text is required"}`
  terug en er wordt niets aangemaakt; de onderste regel toont dan niets nieuws.

## Exporteren

Menu (⋮) → Preset opslaan als → Exporteren als `.kwgt`. Bij import vult iedereen alleen zijn eigen
`secret` in de URL uit Stap 2 in (en desgewenst de basis-URL, als ze een eigen OSLIFE-project
draaien).

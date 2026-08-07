# Widget 5 · HEYRA quick chat/voice

Stel HEYRA in het voorbijgaan een vraag — getypt of gedicteerd — en het antwoord verschijnt
rechtstreeks op je startscherm. Geen open-gesprek-geheugen (dit is een widget, geen chatscherm):
elke vraag krijgt een vers, kort antwoord, gegrond in een snapshot van vandaag (agenda,
belangrijkste taken, actieve projecten).

*Zie `README.md` voor het gedeelde design-systeem en hoe `kwgt-api` werkt.*

## Formaat

**4×2**-grid — groter dan de brain-dump-tegel, want hier moet een antwoordzin passen.

## "Voice": hoe dat zonder eigen spraakherkenning werkt

Kustom heeft geen ingebouwde spraak-naar-tekst, maar dat hoeft ook niet: de systeem-**Tekstinvoer**-
actie opent het normale Android-toetsenbord, en zo goed als elk toetsenbord (Gboard, Samsung
Keyboard, SwiftKey) heeft een **microfoon-knop voor dictee**. Tik die knop tijdens de tekstinvoer in
en spreek je vraag in — HEYRA krijgt gewoon tekst binnen, precies zoals getypt. Robuust, gratis, en
werkt op elk toestel zonder extra permissies.

## Stap 1 — Global variabele

Instellingen → Global → Variables → tekst-Global `heyra_msg` (leeg als startwaarde).

## Stap 2 — Netwerk-feed

- **URL** (met URL-encode op de Global, zelfde als widget 4):
  ```
  https://nhyunnnmdcmojvkxrbpl.supabase.co/functions/v1/kwgt-api?w=heyra&secret=<JOUW-SECRET>&msg=<URL-encoded $gv(heyra_msg)$>
  ```
- Methode GET. **Ververs elke:** nooit/handmatig — alleen bij de tik-actie (elke ververs-cyclus zou
  anders dezelfde vraag opnieuw naar Claude sturen).

## Stap 3 — De kaart

**Shape-module**, achtergrond, zelfde basis als de andere widgets (`#12141C` @ 92%, radius 24dp,
glasrand 8%, klik-ripple in `#38BDF8` op 25%).

**Tekst-module**, kop linksboven:
- Icoon (microfoon-glyph uit de Icon-lettertype-categorie) + tekst `HEYRA`
- 11sp hoofdletters voor "HEYRA", icoon 16sp, kleur `#38BDF8`

**Tekst-module**, het antwoord — de hoofdmoot van de widget, gecentreerd verticaal:
- Formule (if/else): als er nog geen vraag is gesteld (`$.reply` leeg/ontbreekt) toon een
  uitnodigende starttekst, bv. *"Tik om HEYRA iets te vragen…"* in `#6B6E80`; zodra er een
  antwoord is, toon `$.reply` in `#F5F6FA`
- 14sp, tot 4 regels, midden uitgelijnd
- Als `kwgt-api` een foutmelding teruggeeft (`$.ok` = onwaar) toon in plaats daarvan `$.error` in
  `#F2545B` — zo zie je meteen of bv. `ANTHROPIC_API_KEY` ontbreekt in plaats van een stille lege
  widget

## Stap 4 — Tik-actie op de hele kaart

1. **Tekstinvoer** → schrijf naar Global `heyra_msg` (hint: "Vraag HEYRA iets…" — tik het
   dictee-microfoontje van je toetsenbord aan om te spreken in plaats van te typen).
2. **Open URL** (op de achtergrond, indien beschikbaar) naar de URL uit Stap 2.
3. **Ververs netwerk-feed 0** — haalt `$.reply` op en toont 'm in Stap 3's tekstvak.

Reken op **1-3 seconden** tussen tik en antwoord (Claude Haiku-aanroep + een paar
database-lookups voor context) — zet eventueel een kleine laad-indicator (Kustom's
"Loading"-modus op de netwerk-feed, module zichtbaar tijdens het laden) tussen Stap 2 en 3 als je
dat wilt visualiseren.

## Stap 5 — Snelkeuzes (optioneel, extra premium)

Voeg 2-3 kleine "chip"-Shapes onderin toe met vaste, veelgestelde vragen (bv. "Wat staat er
vandaag?", "Welk project heeft aandacht nodig?"). Elke chip krijgt dezelfde tik-actie-lijst als
Stap 4, alleen slaat Stap 1 de Tekstinvoer over en zet de Global direct op de vaste vraagtekst
("Wat staat er vandaag op de agenda?") — één tik, geen toetsenbord nodig.

## Testen

- Vraag "Wat zijn mijn belangrijkste taken vandaag?" → het antwoord moet overeenkomen met wat
  widget 2 laat zien (dezelfde `focus`-data zit in de context die `kwgt-api` meestuurt naar Claude).
- Zet `ANTHROPIC_API_KEY` tijdelijk uit in de Supabase-secrets → de widget toont netjes de
  foutmelding in plaats van niets te doen.

## Exporteren

Menu (⋮) → Preset opslaan als → Exporteren als `.kwgt`.

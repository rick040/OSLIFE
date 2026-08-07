# Widget 3 · Actieve projecten

Je actieve projecten met een voortgangsbalk en de deadline-aftelling — het overzicht dat je in één
oogopslag vertelt welk project aandacht nodig heeft.

*Zie `README.md` voor het gedeelde design-systeem en hoe `kwgt-api` werkt.*

## Formaat

**4×2**-grid. Bouw door widget 1 of 2 te dupliceren en de netwerk-feed/inhoud te vervangen.

## Stap 1 — Netwerk-feed

- **URL:**
  ```
  https://nhyunnnmdcmojvkxrbpl.supabase.co/functions/v1/kwgt-api?w=projects&secret=<JOUW-SECRET>
  ```
- Methode GET, ververs elke 30 minuten (projectvoortgang verandert minder vaak dan taken).

## Stap 2 — Achtergrond

Zelfde basis-kaart (`#12141C` @ 92%, radius 24dp, glasrand 8%). Accent hier is een **gradient**:
smaragd `#22D3AA` → teal `#2DD4BF`, gebruikt op de voortgangsbalken (Shape-module ondersteunt een
lineaire-gradient vulling — kies "Gradient" i.p.v. "Solid" bij de vulkleur).

## Stap 3 — Kop

- Label `ACTIEVE PROJECTEN`, 11sp, hoofdletters, `#9497A8`.
- Teller rechtsboven: `$.count`, 13sp vet, kleur `#2DD4BF`, gevolgd door "actief".

## Stap 4 — Drie projectregels

Drie rijen, `items[0]`–`items[2]` (limiteer visueel tot 3 op een 4×2-canvas; `kwgt-api` levert er
tot 6 — vergroot de widget naar 4×3 als je alle 6 wilt tonen, dan simpelweg 6 rijen i.p.v. 3).
Hoogte ≈ 34dp per rij (iets hoger dan widget 1/2, want elke rij heeft ook een voortgangsbalkje):

1. **Tekst-module** — projectnaam + klant, bovenste regel van de rij:
   - Formule: combineer `$.items[0].name` en `$.items[0].client` in één tekst via Kustom's
     tekst-concatenatie (ƒx → Text → Join/Concat), bv. `Naam — Klant`; laat "— Klant" weg als
     `client` leeg is (if-formule)
   - 14sp, kleur `#F5F6FA`
   - Zichtbaarheid: alleen tonen als `$.count` > index
2. **Shape-module** — voortgangsbalk-achtergrond, smal (breedte volle kaartbreedte, hoogte 4dp):
   - Vulkleur `#FFFFFF` op 10% dekking (de "lege" rail)
3. **Shape-module** — voortgangsbalk-vulling, zelfde positie, breedte gekoppeld aan een formule:
   - Breedte-formule: `$.items[0].progressPct` (0-100) omgezet naar een percentage van de
     rail-breedte — Kustom's Shape-module ondersteunt een breedte-formule in procenten; vul daar
     `items[0].progressPct` in als percentagewaarde
   - Vulkleur: de gradient uit Stap 2
4. **Tekst-module** — deadline-label, rechts uitgelijnd onder de balk:
   - Formule (if/else op `$.items[0].overdue`): als waar → "N dagen te laat" in `#F2545B`
     (gebruik `abs($.items[0].daysLeft)`); anders → "nog N dagen" in `#6B6E80` op basis van
     `$.items[0].daysLeft`; als `deadline` leeg is → toon niets
   - 11sp

## Stap 5 — Tik-actie

Elke rij: **Open app** → OSLIFE (project-detail zit alleen in de volledige app, dat hoeft de widget
niet te dupliceren). Optioneel: een tik op de voortgangsbalk zelf kan een **Tekstinvoer**-actie
starten die een percentage vraagt en met dezelfde `Open URL` + `Ververs feed`-truc als widget 1
`projects.progress` bijwerkt — dat vereist wel een extra `kwgt-api`-actie (`w=project-progress`)
die vandaag niet is gebouwd; voeg 'm toe naar hetzelfde patroon als `task-toggle` in
`supabase/functions/kwgt-api/index.ts` als je die wilt.

## Testen

- Zet een project op 100% voortgang in de app → de balk vult volledig, en zodra `status` niet meer
  `active` is verdwijnt het uit deze widget vanzelf (de feed filtert al op `status='active'`).
- Een project zonder deadline → geen "nog N dagen"-tekst, de rest van de rij blijft normaal.

## Exporteren

Zelfde als widget 1: menu (⋮) → Preset opslaan als → Exporteren als `.kwgt`.

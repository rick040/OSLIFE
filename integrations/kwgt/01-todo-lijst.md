# Widget 1 · To-do lijst

Een compacte, afvinkbare lijst van je open taken — overdue eerst, daarna op prioriteit. Tikken op
een vinkje sluit de taak direct af (en andersom), zonder de app te openen.

*Zie `README.md` voor het gedeelde design-systeem (kleuren/typografie/opzet) en hoe `kwgt-api`
werkt.*

## Formaat

**4×2**-grid (KWGT: Preset toevoegen → Widget → kies afmeting 4×2). Canvas ≈ 300×150dp.

## Stap 1 — Netwerk-feed

Instellingen (tandwiel) → **Global** → **Network** → **+ nieuwe feed** (dit wordt feed-index `0`):

- **URL:**
  ```
  https://nhyunnnmdcmojvkxrbpl.supabase.co/functions/v1/kwgt-api?w=todos&secret=<JOUW-SECRET>
  ```
- **Methode:** GET
- **Ververs elke:** 15 minuten (of vaker — het is een lichte call)
- **Cache:** uit (of "no-cache"), anders zie je een toggle niet meteen terug

## Stap 2 — Achtergrond

**Shape-module**, volledig scherm:
- Vorm: afgeronde rechthoek, radius **24dp**
- Vulkleur: `#12141C`, dekking **92%**
- Rand: 1dp, `#FFFFFF` op **8%** dekking
- Schaduw aan: zwart, 12dp blur, 6dp y-offset, 30% dekking

## Stap 3 — Kop

**Tekst-module**, linksboven, marge 16dp:
- Tekst: `TO-DO`
- 11sp, hoofdletters, letter-spacing ruim, kleur `#9497A8`

**Tekst-module** ernaast (rechtsboven, marge 16dp), de teller:
- Formule (ƒx → Network → JSON-uitlezen op feed 0, pad): `$.count` (aantal open taken)
- 13sp, vet, kleur `#7C6CF0` (indigo accent), gevolgd door het woordje "open"

## Stap 4 — De vier taakregels

KWGT kent geen dynamische lijst-component — een widget is een vast canvas. De gangbare, robuuste
oplossing (zo bouwt elke KWGT-lijstwidget dit): **4 vaste rijen**, elk hard gekoppeld aan een
array-index (`items[0]`…`items[3]`), die zichzelf verbergen als er geen taak op die plek is.

Bouw **rij 0** eerst helemaal af, groepeer 'm daarna tot een **Stack** en dupliceer 'm 3× voor
rij 1-3 (scheelt drie keer hetzelfde overtikken).

**Per rij** (hoogte ≈ 26dp, 4dp verticale marge tussen rijen, startend op y=40dp onder de kop):

1. **Shape-module** — rond vinkje, 18×18dp, links uitgelijnd:
   - Rand 1.5dp in de accentkleur (`#7C6CF0`); leeg/transparant vullen
   - **Zichtbaarheid-formule:** verberg deze hele rij wanneer er geen item op deze index is —
     ƒx → Global/Network → **if**-formule: toon alleen als `$.count` > de index van deze rij
     (rij 0 → `count > 0`, rij 1 → `count > 1`, enz.)
   - **Tik-actie** (zie Stap 5)
2. **Tekst-module** — de titel, direct rechts van het vinkje:
   - Formule: JSON-pad op feed 0 → `$.items[0].title` (voor rij 0; `items[1]`, `items[2]`,
     `items[3]` voor de volgende rijen)
   - 15sp, kleur `#F5F6FA`, **max 1 regel, afkappen met "…"**
   - Zelfde zichtbaarheid-formule als het vinkje
3. **Tekst-module** — meta, rechts uitgelijnd op dezelfde rij:
   - Formule die overdue/deadline combineert, bv.: als `$.items[0].overdue` waar is → toon
     "te laat" in `#F2545B`; anders toon `$.items[0].due` geformatteerd, of leeg als er geen
     datum is. Gebruik hiervoor Kustom's **if/else-formule** (ƒx → Logic → If) rond de twee
     JSON-paden `items[0].overdue` en `items[0].due`.
   - 12sp, kleur `#6B6E80` (of `#F2545B` bij overdue — zet de kleur ook achter een if-formule)

Herhaal dit voor `items[1]`, `items[2]`, `items[3]` in de rijen daaronder.

## Stap 5 — Tik-actie op het vinkje (afvinken zonder de app te openen)

Op elke vinkje-Shape, **twee tik-acties na elkaar**:

1. **Open URL** (op de achtergrond — zet "open op achtergrond/geen browser" aan als je Kustom-versie
   die optie heeft bij Open URL):
   ```
   https://nhyunnnmdcmojvkxrbpl.supabase.co/functions/v1/kwgt-api?w=task-toggle&id=$.items[0].id$&secret=<JOUW-SECRET>
   ```
   (vervang `items[0]` door de juiste index per rij)
2. **Ververs netwerk-feed 0** — zorgt dat de lijst meteen het nieuwe resultaat toont (de
   `task-toggle`-respons van `kwgt-api` is dezelfde vorm als `?w=todos`, dus feed 0's data klopt
   meteen weer).

Geen browser-app, geen Tasker/MacroDroid nodig — de widget praat rechtstreeks met `kwgt-api`.

## Stap 6 — Tik op de rij zelf (titel) → open OSLIFE

Zet op de titel-Tekst-module een aparte tik-actie **Open app** → OSLIFE, zodat een tik op de tekst
(in plaats van het vinkje) de volledige app opent voor meer detail.

## Testen

- Vink een taak af in de widget → het vinkje-vulling wisselt (voeg dat toe als extra
  vul-kleur-formule op het vinkje: gevuld `#7C6CF0` als je 'm net hebt afgevinkt) en de rij
  verdwijnt/schuift door bij de volgende ververs.
- Zet de widget op je startscherm met 0 open taken → alle 4 rijen verbergen zichzelf, alleen de
  kop + "0 open" blijft over (geen lege rommelige rijen).

## Exporteren

Kustom-editor → menu (⋮) → **Preset opslaan als** → **Exporteren als .kwgt-bestand**. Dat bestand
kan je met anderen delen; zij importeren 'm en vullen alleen hun eigen `secret` in de netwerk-feed-URL
in (Instellingen → Global → Network → feed 0 bewerken).

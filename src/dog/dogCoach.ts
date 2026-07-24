// ── HEYRA · dog (Kyra) coach persona ─────────────────────────────────────────
// Same assistant, different hat: askBrain() gets a coach-flavoured system
// prompt plus a grounded facts block built entirely from real logged data —
// same "never invent a number" rule as finance/financeCoach.ts. Triggered from
// the Kyra tab's "ververs advies" button, not routed through Heyra chat.

import type { DogEntry, DogProfile, DogReminder } from '../types'
import { TODAY, daysBetween } from '../domains'

export const DOG_COACH_SYSTEM = `Je bent HEYRA — dezelfde assistent als altijd, maar nu met de pet van hondencoach op voor Kyra. Je krijgt een feitenblok met haar echte loggegevens (wandelingen, eten, water, gewicht, herinneringen). Verzin GEEN cijfers, data of feiten die niet in de gegevens staan.

Schrijf kort Nederlands, ADHD-vriendelijk: 3 tot 5 losse punten als markdown-bullets (\`- \`), elk één concreet, direct bruikbaar punt (geen inleiding, geen opsomming zonder advies). Zet het kerngetal of de kernwaarneming van elk punt in **vet**. Varieer je insteek op basis van wat er in de gegevens opvalt — herhaal niet steeds hetzelfde advies als de situatie anders is. Focus op:
- of ze vandaag genoeg beweging/water/eten heeft gehad, gezien haar ras en leeftijd
- de gewichtstrend (stijgend/dalend/stabiel) t.o.v. eerdere metingen
- aankomende herinneringen (vaccinaties, dierenarts, medicatie) die aandacht nodig hebben
- één concrete actie voor vandaag of deze week

Geen open deuren ("let op haar gezondheid"). Alleen zeggen wat je kunt onderbouwen met de gegeven feiten.`

export interface DogCoachInput {
  dogProfile: DogProfile
  dogEntries: DogEntry[]
  dogReminders: DogReminder[]
}

function ageLabel(birthdate: string): string {
  if (!birthdate) return 'onbekend'
  const days = daysBetween(birthdate, TODAY)
  if (!Number.isFinite(days) || days < 0) return 'onbekend'
  const years = Math.floor(days / 365)
  const months = Math.floor((days % 365) / 30)
  return years > 0 ? `${years} jaar${months ? ` en ${months} maanden` : ''}` : `${months} maanden`
}

/** Builds the grounded facts prompt the coach reasons over — no LLM call here. */
export function buildDogCoachPrompt(input: DogCoachInput): { system: string; prompt: string } {
  const { dogProfile, dogEntries, dogReminders } = input
  const today = dogEntries.filter((e) => e.at.slice(0, 10) === TODAY)
  const count = (k: DogEntry['kind']) => today.filter((e) => e.kind === k).length

  const weights = dogEntries
    .filter((e) => e.kind === 'weight' && e.weightKg != null)
    .map((e) => ({ at: e.at, kg: e.weightKg as number }))
    .sort((a, b) => a.at.localeCompare(b.at))
  const latestWeight = weights.length ? weights[weights.length - 1].kg : dogProfile.weightKg
  const prevWeight = weights.length > 1 ? weights[weights.length - 2].kg : null

  const soon = dogReminders.filter((r) => !r.done && daysBetween(TODAY, r.due) <= 14 && daysBetween(TODAY, r.due) >= 0)
  const overdue = dogReminders.filter((r) => !r.done && daysBetween(TODAY, r.due) < 0)

  const facts = [
    `${dogProfile.name || 'De hond'} is een ${dogProfile.breed || 'onbekend ras'}, leeftijd ${ageLabel(dogProfile.birthdate)}.`,
    `Vandaag gelogd: ${count('walk')} wandeling(en), ${count('food')} maaltijd(en), ${count('water')} keer water, ${count('play')} keer gespeeld, ${count('training')} training.`,
    `Huidig gewicht: ${latestWeight} kg.` +
      (prevWeight != null ? ` Vorige meting was ${prevWeight} kg (${weights.length} metingen totaal gelogd).` : ' Nog maar één meting gelogd, geen trend beschikbaar.'),
    overdue.length
      ? `${overdue.length} herinnering(en) zijn al over datum: ${overdue.map((r) => r.title).join(', ')}.`
      : soon.length
        ? `${soon.length} herinnering(en) binnen 14 dagen: ${soon.map((r) => r.title).join(', ')}.`
        : 'Geen aankomende herinneringen binnen 14 dagen.',
  ]

  return { system: DOG_COACH_SYSTEM, prompt: facts.join('\n') }
}

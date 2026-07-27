// ── Profile screen: canonical category definitions ───────────────────────────
// Single source of truth for the category keys/labels used by the current
// profile, the desired profile, and the landscape — derived directly from
// Rick's own self-model interview (src/selfModel.ts) and its own spec for
// what the answers become (see that file's closing section). Consumed by
// heyra/identity.ts (prompt/schema keys), store.ts (defaults) and
// views/Profile.tsx (render order/labels) — change the list here, not in
// three places.

import type { IdentitySnapshot, DesiredProfile, Landscape } from './types'

export interface CategoryDef {
  key: string
  label: string
  hint: string
}

/** self/current — first-pass traits, each item a hypothesis until confirmed by real data. */
export const CURRENT_CATEGORIES: CategoryDef[] = [
  { key: 'values', label: 'Waarden', hint: 'Wat je beweert belangrijk te vinden, en wat je gedrag daadwerkelijk terugziet.' },
  { key: 'workstyle', label: 'Werkwijze', hint: 'Hoe je werk er dagelijks daadwerkelijk uitziet — wat trekt, wat sleept.' },
  { key: 'energy_mood', label: 'Energie & stemming', hint: 'Wanneer je scherp bent, wanneer je crasht, wat je in flow brengt of leegzuigt.' },
  { key: 'decision_style', label: 'Beslisstijl', hint: 'Gevoel vs. analyse, hoe je vastloopt en wat dat doorbreekt.' },
  { key: 'anti_patterns', label: 'Valkuilen', hint: 'Terugkerende patronen die je tegenwerken — inclusief de dingen waar je je een beetje voor schaamt.' },
]

/** self/desired — the north-star: an "I am someone who…" sketch, aspirations, and no-gos. */
export const DESIRED_CATEGORIES: CategoryDef[] = [
  { key: 'identity_sketch', label: 'Identiteitsschets', hint: '"Ik ben iemand die…" — de aspiratieversie van jezelf.' },
  { key: 'aspirations', label: 'Aspiraties', hint: 'Wat je consistent zou willen doen, waar je naartoe wilt groeien.' },
  { key: 'no_gos', label: 'Grenzen', hint: 'Wie je nooit wilt worden, en de harde lijnen die je niet overschrijdt.' },
]

/** The environment that bridges current → desired. */
export const LANDSCAPE_CATEGORIES: CategoryDef[] = [
  { key: 'people', label: 'Mensen', hint: 'Type mensen/rollen om je mee te omringen.' },
  { key: 'habits', label: 'Gewoontes', hint: 'Gewoontes om op te bouwen.' },
  { key: 'time', label: 'Tijdsbesteding', hint: 'Hoe je je tijd moet structureren.' },
  { key: 'money', label: 'Financiën', hint: 'Hoe inkomen/geld georganiseerd moet zijn.' },
  { key: 'balance', label: 'Balans', hint: 'Werk/rust, actie/reflectie, sociaal/alleen.' },
  { key: 'focus', label: 'Focus', hint: 'Waar aandacht en energie primair naartoe moeten.' },
  { key: 'environment', label: 'Omgeving', hint: 'Fysieke/structurele omgevingsveranderingen.' },
]

export function emptySnapshot(): IdentitySnapshot {
  return { categories: {}, generatedAt: null, hypothesesAt: null }
}

export function emptyDesired(): DesiredProfile {
  return { categories: {}, generatedAt: null }
}

export function emptyLandscape(): Landscape {
  return { categories: {}, tensions: [], generatedAt: null }
}

/** True when at least one category holds at least one item. */
export function hasAnyItems(categories: Record<string, unknown[]>): boolean {
  return Object.values(categories).some((items) => items.length > 0)
}

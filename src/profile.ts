// ── Profile screen: canonical category definitions ───────────────────────────
// Single source of truth for the category keys/labels used by both the
// current-state persona and the dream persona (same shape, so they render as
// two comparable versions of one persona) and by the landscape. Consumed by
// heyra/identity.ts (brain prompts + schema keys), store.ts (defaults) and
// views/Profile.tsx (render order/labels) — change the list here, not in
// three places.

import type { IdentitySnapshot, Landscape } from './types'

export interface CategoryDef {
  key: string
  label: string
  hint: string
}

/** Current + dream persona share this exact category set so they're directly comparable. */
export const PERSONA_CATEGORIES: CategoryDef[] = [
  { key: 'tools', label: 'Toolstack', hint: 'Apps, systemen en gereedschap dat je gebruikt.' },
  { key: 'habits', label: 'Gewoontes', hint: 'Terugkerende routines en gedrag.' },
  { key: 'strengths', label: 'Sterke punten', hint: 'Waar je aantoonbaar sterk in bent.' },
  { key: 'weaknesses', label: 'Valkuilen', hint: 'Dingen die je vertragen of tegenwerken.' },
  { key: 'interests', label: 'Interesses', hint: 'Onderwerpen waar je oprecht in geïnteresseerd bent.' },
  { key: 'character', label: 'Karakterstijl', hint: 'Karaktertrekken en persoonlijkheidsstijl.' },
  { key: 'workstyle', label: 'Werkwijze', hint: 'Hoe je werkt — plant, structureert, beslist.' },
  { key: 'communication', label: 'Communicatiestijl', hint: 'Hoe je praat, schrijft en reageert.' },
  { key: 'accelerators', label: 'Versnellers', hint: 'Wat, als het er is, je energie/output merkbaar verhoogt.' },
]

/** The environment that bridges current → dream. */
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
  return { categories: {}, generatedAt: null }
}

export function emptyLandscape(): Landscape {
  return { categories: {}, generatedAt: null }
}

/** True when at least one category holds at least one item. */
export function hasAnyItems(categories: Record<string, string[]>): boolean {
  return Object.values(categories).some((items) => items.length > 0)
}

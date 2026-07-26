// OSLIFE · Relaties (rolodex) — tag presets, auto-tag heuristics, and the
// connection-graph helpers shared between the list, form, and detail views.
import type { Person, PersonConnection, PersonKind } from '../../types'

export const PERSON_KIND_LABEL: Record<PersonKind, string> = { network: 'Netwerk', business: 'Zakelijk', both: 'Beide' }
export const PERSON_KIND_HEX: Record<PersonKind, string> = { network: '#60A5FA', business: '#A78BFA', both: '#34D399' }

/** Curated starting set — the tag input still accepts any free-form text. */
export const TAG_PRESETS = [
  'Familie', 'Vriend(in)', 'Collega', 'Klant', 'Leverancier',
  'Investeerder', 'Netwerkcontact', 'Net ontmoet',
] as const

/**
 * Best-effort category guess from whatever fields are already filled in —
 * used when the user hasn't picked a tag manually. Never overrides an
 * existing manual tag; only fills the gap so a contact never sits untagged.
 */
export function suggestTags(p: {
  company: string | null
  clientId: string | null
  instagramUrl: string | null
  linkedinUrl: string | null
  twitterUrl: string | null
  emails: string[]
  phones: string[]
}): string[] {
  const suggestions: string[] = []
  if (p.clientId) suggestions.push('Klant')
  if (p.company && !p.clientId) suggestions.push('Collega')
  const onlySocial = (p.instagramUrl || p.linkedinUrl || p.twitterUrl) && p.emails.length === 0 && p.phones.length === 0 && !p.company
  if (onlySocial) suggestions.push('Net ontmoet')
  return suggestions
}

export type ConnectionWith = { connection: PersonConnection; other: Person }

/** All connections touching `personId`, each paired with the other person in the edge. */
export function connectionsForPerson(personId: string, connections: PersonConnection[], people: Person[]): ConnectionWith[] {
  const byId = new Map(people.map((p) => [p.id, p]))
  const out: ConnectionWith[] = []
  for (const c of connections) {
    let otherId: string | null = null
    if (c.personAId === personId) otherId = c.personBId
    else if (c.personBId === personId) otherId = c.personAId
    if (!otherId) continue
    const other = byId.get(otherId)
    if (other) out.push({ connection: c, other })
  }
  return out
}

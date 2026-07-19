// ── HEYRA agent · Projectkaart ────────────────────────────────────────────────
// Wraps the existing substring project matcher. When that misses — "hoe staat
// het met dat website ding" instead of the exact name — first tries the last
// project mentioned in conversation memory, then asks the brain to resolve the
// reference against the real project list. The brain only ever picks from
// names it's given; it can't invent a project.

import { findProject } from '../cards'
import { askBrain } from '../brainClient'
import { transcript } from '../memory'
import type { Agent } from './types'

export const runProjectAgent: Agent = async (input, ctx) => {
  let project = findProject(input, ctx.store)

  if (!project && ctx.memory.lastEntity) {
    project = ctx.store.projects.find((p) => p.name === ctx.memory.lastEntity) ?? null
  }

  if (!project && ctx.store.projects.length) {
    const names = ctx.store.projects.map((p) => `${p.name} (klant: ${p.client || 'onbekend'})`).join('\n')
    const guess = await askBrain(
      'Je krijgt een lijst met projectnamen, het lopende gesprek, en een nieuwe Nederlandse zin. Antwoord ALLEEN met de EXACTE projectnaam uit de lijst die bedoeld wordt (precies zoals die in de lijst staat), of met het woord "geen" als niets duidelijk past. Geen andere tekst.',
      `Projecten:\n${names}\n\nGesprek tot nu toe:\n${transcript(ctx.memory)}\n\nNieuwe zin: "${input}"`,
      { maxTokens: 60 },
    )
    if (guess && guess.trim().toLowerCase() !== 'geen') {
      const g = guess.trim().toLowerCase()
      project = ctx.store.projects.find((p) => p.name.trim().toLowerCase() === g) ?? null
    }
  }

  if (!project) return { text: '', topic: 'domain' } // router falls through to chatAgent
  return { text: `${project.name} bij ${project.client}:`, topic: 'project', project, entity: project.name }
}

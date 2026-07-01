// ── HEYRA agent · Zoeken ──────────────────────────────────────────────────────
// Wraps the existing keyword search card builder. The brain doesn't rank or
// invent results — it never sees anything the deterministic search didn't
// already surface — but for a non-empty result set it can tighten the summary
// sentence, which is otherwise a generic count.

import { buildSearchCard } from '../cards'
import { askBrain } from '../brainClient'
import type { Agent } from './types'

export const runSearchAgent: Agent = async (input, ctx) => {
  const search = buildSearchCard(input, ctx.store)
  const fallbackText = search.results.length
    ? `Ik vond ${search.results.length} match${search.results.length === 1 ? '' : 'es'} in je geheugen.`
    : 'Ik heb je geheugen doorzocht, maar vond niks bij deze zoekopdracht.'

  if (!search.results.length) return { text: fallbackText, topic: 'domain', search }

  const facts = search.results.map((r) => `- ${r.title} (${r.kind}${r.detail ? `, ${r.detail}` : ''})`).join('\n')
  const brainText = await askBrain(
    'Je bent HEYRA, de Nederlandse assistent van OSLIFE. Je krijgt zoekresultaten uit het geheugen van de gebruiker. Schrijf ÉÉN korte, natuurlijke Nederlandse introzin (max 20 woorden) die samenvat wat er gevonden is. Verzin niets buiten de gegeven resultaten.',
    `Zoekopdracht: "${input}"\n\nResultaten:\n${facts}`,
    { maxTokens: 120 },
  )

  return { text: brainText ?? fallbackText, topic: 'domain', search, fromBrain: !!brainText }
}

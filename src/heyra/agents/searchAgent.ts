// ── HEYRA agent · Zoeken ──────────────────────────────────────────────────────
// Wraps the existing keyword search card builder. The brain doesn't rank or
// invent results — it never sees anything the deterministic search didn't
// already surface — but for a non-empty result set it can tighten the summary
// sentence, which is otherwise a generic count.
//
// graphInsight is a separate, additive source: a best-effort call to the
// cognee knowledge-graph worker (src/heyra/agents/cognee.ts), kept fully
// distinct from `results` so it can never be mistaken for — or dilute — the
// deterministic keyword matches above. Absent whenever the worker isn't
// configured/reachable.

import { buildSearchCard } from '../cards'
import { askBrain } from '../brainClient'
import { cogneeSearch } from './cognee'
import type { Agent } from './types'

export const runSearchAgent: Agent = async (input, ctx) => {
  const search = buildSearchCard(input, ctx.store)
  // Kicked off in parallel with askBrain below (not awaited here) — a slow or
  // unreachable cognee worker must never add its own latency on top of the
  // existing search flow.
  const graphInsightPromise = cogneeSearch(input)

  const fallbackText = search.results.length
    ? `Ik vond ${search.results.length} match${search.results.length === 1 ? '' : 'es'} in je geheugen.`
    : 'Ik heb je geheugen doorzocht, maar vond niks bij deze zoekopdracht.'

  if (!search.results.length) {
    search.graphInsight = await graphInsightPromise
    return { text: fallbackText, topic: 'domain', search }
  }

  const facts = search.results.map((r) => `- ${r.title} (${r.kind}${r.detail ? `, ${r.detail}` : ''})`).join('\n')
  const [brainText, graphInsight] = await Promise.all([
    askBrain(
      'Je bent HEYRA, de Nederlandse assistent van OSLIFE. Je krijgt zoekresultaten uit het geheugen van de gebruiker. Schrijf ÉÉN korte, natuurlijke Nederlandse introzin (max 20 woorden) die samenvat wat er gevonden is. Verzin niets buiten de gegeven resultaten.',
      `Zoekopdracht: "${input}"\n\nResultaten:\n${facts}`,
      { maxTokens: 120 },
    ),
    graphInsightPromise,
  ])
  search.graphInsight = graphInsight

  return { text: brainText ?? fallbackText, topic: 'domain', search, fromBrain: !!brainText }
}

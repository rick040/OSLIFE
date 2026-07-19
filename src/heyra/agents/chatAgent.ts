// ── HEYRA agent · Geheugen (default) ──────────────────────────────────────────
// Everything that isn't a task/project/chart/search/finance/signal/briefing
// falls here. Open-loop queries and task/vent confirmations stay rule-based —
// they're cheap confirmations of what was just captured. But a genuine
// open-ended question ("hoe ziet mijn week eruit?") used to fall through to a
// generic "genoteerd, geclassificeerd..." line with no real answer. That's the
// gap: this now tries a brain-grounded answer first, built from a real memory
// snapshot (heyra/agents/memoryContext.ts), and only falls back to the old
// classification confirmation if the brain is unavailable.

import { DOMAIN_META, TODAY, daysBetween } from '../../domains'
import { buildMemorySnapshot, buildRecallSection, MEMORY_SYSTEM_PROMPT } from './memoryContext'
import { askBrain } from '../brainClient'
import { isOpenLoopQuery } from '../skills'
import type { Agent } from './types'

export const runChatAgent: Agent = async (input, ctx) => {
  const { store, item } = ctx
  const open = store.threads.filter((x) => x.status === 'open')
  const inDomain = open.filter((x) => x.domain === item.domain)

  if (isOpenLoopQuery(input)) {
    const sorted = open
      .slice()
      .sort((a, b) => (a.due ? daysBetween(TODAY, a.due) : 999) - (b.due ? daysBetween(TODAY, b.due) : 999))
    const top = sorted
      .slice(0, 3)
      .map((x) => `• ${x.title} (${DOMAIN_META[x.domain].label}${x.due ? `, due ${x.due.slice(5)}` : ''})`)
      .join('\n')
    return {
      text: open.length ? `Je hebt ${open.length} open loops over alle domeinen. De meest urgente:\n${top}` : 'Geen open loops — alles gesloten. 🎉',
      topic: 'open-loops',
    }
  }

  if (item.kind === 'task') {
    return {
      text: `Opgeslagen als taak in ${DOMAIN_META[item.domain].label} en een loop geopend zodat het niet verloren gaat. Ik laat het zien in Today en de Day Builder.`,
      topic: 'task-note',
    }
  }

  if (item.sentiment === 'stressed' || item.kind === 'vent') {
    return {
      text: `Vent gelogd onder ${DOMAIN_META[item.domain].label}. Je hebt ${inDomain.length} open ${DOMAIN_META[item.domain].label} loop(s), dat is waarschijnlijk deel van de last. Ik kijk of dit samenvalt met je uitgaven-patroon.`,
      topic: 'vent',
    }
  }

  const fallbackText = `Genoteerd, geclassificeerd in ${DOMAIN_META[item.domain].label} als ${item.kind} en aan het geheugen toegevoegd. Je hebt daar ${inDomain.length} andere open loop(s).`

  // A real question ("hoe ziet mijn week eruit?") deserves a real answer, not
  // just a confirmation that it was filed away. Ground the brain in an actual
  // memory snapshot; a plain statement/note still gets a useful answer back
  // since the snapshot is always there, and the honesty rule in the system
  // prompt keeps it from inventing anything the snapshot doesn't cover.
  // buildRecallSection() adds actual semantic/graph search on top of the
  // snapshot's capped, short-horizon dump — e.g. "wat was de deal met X"
  // can now surface an older braindump/interaction the snapshot never held.
  const snapshot = buildMemorySnapshot(store)
  const recall = await buildRecallSection(input)
  const grounding = recall ? `${snapshot}\n\n${recall}` : snapshot
  const brainText = await askBrain(MEMORY_SYSTEM_PROMPT, `Momentopname van het geheugen:\n${grounding}\n\nVraag: "${input}"`, { maxTokens: 220 })

  return { text: brainText ?? fallbackText, topic: 'domain', fromBrain: !!brainText }
}

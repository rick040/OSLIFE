// ── HEYRA agent · Geheugen (default) ──────────────────────────────────────────
// Everything that isn't a task/project/chart/search/finance/signal/briefing
// falls here — the same open-loops query, task/vent confirmations and generic
// domain reply that used to live inline in Heyra.tsx#answer(). No brain call:
// these are cheap confirmations of what was just captured, not questions that
// benefit from synthesis.

import { DOMAIN_META, TODAY, daysBetween } from '../../domains'
import type { Agent } from './types'

export const runChatAgent: Agent = async (input, ctx) => {
  const { store, item } = ctx
  const t = input.toLowerCase()
  const open = store.threads.filter((x) => x.status === 'open')
  const inDomain = open.filter((x) => x.domain === item.domain)

  if (/open|owe|loop|todo|to do|klant|staat/.test(t)) {
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

  return {
    text: `Genoteerd, geclassificeerd in ${DOMAIN_META[item.domain].label} als ${item.kind} en aan het geheugen toegevoegd. Je hebt daar ${inDomain.length} andere open loop(s).`,
    topic: 'domain',
  }
}

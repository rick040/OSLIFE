// ── HEYRA agent · Briefing ────────────────────────────────────────────────────
// New: a proactive daily-briefing agent ("geef me een briefing", "hoe sta ik
// ervoor vandaag") that synthesizes the nudge, open loops and the latest
// Reflect digest into one prioritized paragraph instead of making Rick piece
// it together from three separate screens.

import { TODAY, daysBetween } from '../../domains'
import { askBrain } from '../brainClient'
import type { Agent } from './types'

export const runBriefingAgent: Agent = async (_input, ctx) => {
  const { store } = ctx
  const open = store.threads
    .filter((t) => t.status === 'open')
    .sort((a, b) => (a.due ? daysBetween(TODAY, a.due) : 999) - (b.due ? daysBetween(TODAY, b.due) : 999))
  const top = open.slice(0, 3).map((t) => `• ${t.title}${t.due ? ` (${t.due})` : ''}`).join('\n')

  const fallbackLines = [store.nudge?.text]
  if (open.length) fallbackLines.push(`${open.length} open loop(s), meest urgent:\n${top}`)
  const fallbackText = fallbackLines.filter(Boolean).join('\n\n') || 'Geen bijzonderheden — alles rustig vandaag.'

  const digest = store.lastDigest
  const facts = [
    store.nudge ? `Nudge: ${store.nudge.text}` : 'Nudge: geen.',
    `Open loops (${open.length}):\n${top || 'geen'}`,
    digest?.correlations.length
      ? `Laatste verbanden:\n${digest.correlations.map((c) => `- ${c.title}`).join('\n')}`
      : 'Laatste verbanden: geen.',
    digest?.anomalies.length ? `Afwijkingen:\n${digest.anomalies.map((a) => `- ${a.title}`).join('\n')}` : 'Afwijkingen: geen.',
  ].join('\n\n')

  const brainText = await askBrain(
    'Je bent HEYRA, de dagelijkse briefing-assistent van OSLIFE. Je krijgt de echte nudge, open loops en Reflect-verbanden van vandaag. Schrijf één kort Nederlands briefing-paragraaf (max 4 zinnen): wat vandaag het meest verdient, in welke volgorde, en waarom. Verzin geen feiten die niet gegeven zijn.',
    facts,
    { maxTokens: 260 },
  )

  return { text: brainText ?? fallbackText, topic: 'domain', fromBrain: !!brainText }
}

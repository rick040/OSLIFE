// ── HEYRA agent · Signalen ────────────────────────────────────────────────────
// Extracted from the energy branch of the old Heyra.tsx#answer(), but grounded
// in the REAL cross-domain correlations/anomalies from reflect.ts instead of a
// hardcoded claim ("~50% lower") that may not match what's actually evidenced.
// This is the "patterns are detected, not explained" gap: the brain turns real
// Correlation[]/Anomaly[] into a short, prescriptive Dutch narrative, but only
// ever narrates correlations that were actually computed from live data.

import { computeCorrelations, computeAnomalies } from '../../reflect'
import { deriveDeadlines } from '../../derive'
import { askBrain } from '../brainClient'
import type { Agent } from './types'

export const runSignalAgent: Agent = async (_input, ctx) => {
  const { store } = ctx
  const deadlines = deriveDeadlines(store.projects)
  const correlations = computeCorrelations(store.dayLogs, store.transactions, store.screenDays, store.meetingDays, deadlines, store.habits)
  const anomalies = computeAnomalies(store.dayLogs, store.transactions, store.threads)

  const last = store.dayLogs[store.dayLogs.length - 1]
  const sleepEnergyCorr = correlations.find((c) => c.id === 'c1')

  let fallbackText: string
  if (!last) {
    fallbackText = 'Ik heb nog geen slaap-/energiedata om op te reflecteren.'
  } else {
    fallbackText = `Je sliep ${last.sleepHours}u en energie ${last.energy}/5.`
    if (sleepEnergyCorr) fallbackText += ` Je patroon: ${sleepEnergyCorr.title.toLowerCase()}.`
  }

  if (!correlations.length && !anomalies.length) {
    return { text: fallbackText, topic: 'energy' }
  }

  const facts = [
    last ? `Laatste dag: slaap ${last.sleepHours}u, energie ${last.energy}/5.` : 'Geen dagdata.',
    correlations.length
      ? `Verbanden:\n${correlations.map((c) => `- ${c.title}: ${c.detail} (sterkte ${Math.round(c.strength * 100)}%)`).join('\n')}`
      : 'Verbanden: geen met genoeg data.',
    anomalies.length ? `Afwijkingen:\n${anomalies.map((a) => `- ${a.title}: ${a.detail}`).join('\n')}` : 'Afwijkingen: geen.',
  ].join('\n\n')

  const brainText = await askBrain(
    'Je bent HEYRA, het Reflect-brein van OSLIFE. Je krijgt de daadwerkelijk berekende verbanden en afwijkingen van de gebruiker (nooit verzonnen). Schrijf een kort Nederlands antwoord (max 3 zinnen): benoem het sterkste verband of de belangrijkste afwijking, en geef ÉÉN concreet, uitvoerbaar advies dat daar direct uit volgt. Noem geen percentages of feiten die niet in de gegevens staan.',
    facts,
    { maxTokens: 220 },
  )

  return { text: brainText ?? fallbackText, topic: 'energy', fromBrain: !!brainText }
}

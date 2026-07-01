// ── HEYRA agent · Visualisatie ────────────────────────────────────────────────
// Thin wrap around the existing chart-card builder. Numbers speak for
// themselves once plotted — no brain call needed.

import { buildChartCard } from '../cards'
import type { Agent } from './types'

export const runChartAgent: Agent = async (input, ctx) => {
  const chart = buildChartCard(input, ctx.store)
  return { text: 'Hier is het overzicht:', topic: 'domain', chart }
}

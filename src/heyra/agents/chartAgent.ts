// ── HEYRA agent · Visualisatie ────────────────────────────────────────────────
// Thin wrap around the existing chart-card builder. Numbers speak for
// themselves once plotted — no brain call needed. The reply line names the
// actual metric/comparison shown instead of a fixed "hier is het overzicht"
// every time, and says so honestly when there isn't enough data yet.

import { buildChartCard } from '../cards'
import type { Agent } from './types'

export const runChartAgent: Agent = async (input, ctx) => {
  const chart = buildChartCard(input, ctx.store)
  const text = !chart.points.length
    ? `Nog niet genoeg data voor "${chart.title.toLowerCase()}".`
    : chart.compareLabel
      ? `${chart.title}, vergeleken met ${chart.compareLabel} — hieronder de grafiek.`
      : `${chart.title} — hieronder de grafiek.`
  return { text, topic: 'chart', chart }
}

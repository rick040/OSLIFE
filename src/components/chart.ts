import type { CSSProperties } from 'react'

// Gedeelde recharts-stijlen. Waarden zijn 1:1 overgenomen uit de views —
// niet aanpassen zonder alle grafieken visueel te controleren.
// v3: dark-only — tooltip is the --sunken (elevated) tone, not a white card.

/** <Tooltip contentStyle> — donkere kaart met expliciete inkt-tekstkleur. */
export const CHART_TIP: CSSProperties = { background: '#1f1f1f', border: '1px solid #262626', color: '#f5f5f5', borderRadius: 12, fontSize: 12 }

/** Zelfde tooltip-kaart zonder expliciete tekstkleur (recharts default). */
export const CHART_TIP_BARE: CSSProperties = { background: '#1f1f1f', border: '1px solid #262626', borderRadius: 12, fontSize: 12 }

/** As-ticks. De 10px- en 11px-varianten zijn bewust verschillend — niet samenvoegen. */
export const AXIS_TICK_10 = { fill: '#8c8c8c', fontSize: 10 }
export const AXIS_TICK_11 = { fill: '#8c8c8c', fontSize: 11 }

/** Gridline color for CartesianGrid/PolarGrid — a faint line on dark bg. */
export const CHART_GRID = '#2a2a2a'

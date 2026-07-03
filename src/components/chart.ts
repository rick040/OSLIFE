import type { CSSProperties } from 'react'

// Gedeelde recharts-stijlen. Waarden zijn 1:1 overgenomen uit de views —
// niet aanpassen zonder alle grafieken visueel te controleren.

/** <Tooltip contentStyle> — witte kaart met expliciete inkt-tekstkleur. */
export const CHART_TIP: CSSProperties = { background: '#FFFFFF', border: '1px solid #E7E9DE', color: '#1B1D17', borderRadius: 12, fontSize: 12 }

/** Zelfde tooltip-kaart zonder expliciete tekstkleur (recharts default). */
export const CHART_TIP_BARE: CSSProperties = { background: '#FFFFFF', border: '1px solid #E7E9DE', borderRadius: 12, fontSize: 12 }

/** As-ticks. De 10px- en 11px-varianten zijn bewust verschillend — niet samenvoegen. */
export const AXIS_TICK_10 = { fill: '#8C9080', fontSize: 10 }
export const AXIS_TICK_11 = { fill: '#8C9080', fontSize: 11 }

import type { BodyMetric } from '../types'

/**
 * Smart-scale helpers for the gym wall display. Pure functions over the
 * `bodyMetrics` store slice (health_body_metrics, oldest first).
 */

export type BodyMetricKey = Exclude<keyof BodyMetric, 'at'>

export interface BodyMetricMeta {
  label: string
  /** For tight spots (the wall display's scale readout); the unit disambiguates. */
  short?: string
  unit: string
  decimals: number
}

/** Display order on the scale grid; also the full set of metrics we know about. */
export const BODY_METRICS: Record<BodyMetricKey, BodyMetricMeta> = {
  weightKg: { label: 'Gewicht', unit: 'kg', decimals: 1 },
  musclePct: { label: 'Spierpercentage', unit: '%', decimals: 1 },
  bodyFatPct: { label: 'Vetpercentage', unit: '%', decimals: 1 },
  muscleMassKg: { label: 'Spiermassa', unit: 'kg', decimals: 1 },
  skeletalMusclePct: { label: 'Skeletspier', unit: '%', decimals: 1 },
  skeletalMuscleKg: { label: 'Skeletspiermassa', short: 'Skeletspier', unit: 'kg', decimals: 1 },
  fatFreeMassKg: { label: 'Vetvrije massa', short: 'Vetvrij', unit: 'kg', decimals: 1 },
  bodyWaterPct: { label: 'Lichaamswater', short: 'Water', unit: '%', decimals: 1 },
  proteinPct: { label: 'Eiwit', unit: '%', decimals: 1 },
  boneMassKg: { label: 'Botmassa', unit: 'kg', decimals: 1 },
  subcutaneousFatPct: { label: 'Onderhuids vet', short: 'Onderhuids', unit: '%', decimals: 1 },
  visceralFat: { label: 'Visceraal vet', unit: '', decimals: 1 },
  bmi: { label: 'BMI', unit: '', decimals: 1 },
  bmrKcal: { label: 'Rustverbranding', short: 'BMR', unit: 'kcal', decimals: 0 },
  metabolicAge: { label: 'Metabole leeftijd', short: 'Metab. leeftijd', unit: 'jr', decimals: 0 },
}

const METRIC_KEYS = Object.keys(BODY_METRICS) as BodyMetricKey[]

/** Amsterdam calendar date (YYYY-MM-DD) of an ISO timestamp. */
export function amsterdamDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Europe/Amsterdam' })
}

/**
 * One reading per day. The notification route and the Samsung Health sheet
 * often both log the same weigh-in a few seconds apart, one with just a weight
 * and one with the full composition — merge them (a later non-null value wins)
 * instead of plotting two points. Also fills in muscle % from muscle mass
 * (and skeletal muscle likewise) when the scale only reports kilograms.
 */
export function dailyBodyMetrics(readings: BodyMetric[]): (BodyMetric & { date: string })[] {
  const byDate = new Map<string, BodyMetric & { date: string }>()
  const sorted = [...readings].sort((a, b) => a.at.localeCompare(b.at))
  for (const r of sorted) {
    const date = amsterdamDate(r.at)
    const prev = byDate.get(date)
    if (!prev) {
      byDate.set(date, { ...r, date })
      continue
    }
    const merged = { ...prev, at: r.at }
    for (const k of METRIC_KEYS) if (r[k] != null) merged[k] = r[k]
    byDate.set(date, merged)
  }
  return [...byDate.values()].map((d) => ({
    ...d,
    musclePct: d.musclePct ?? pctOf(d.muscleMassKg, d.weightKg),
    skeletalMusclePct: d.skeletalMusclePct ?? pctOf(d.skeletalMuscleKg, d.weightKg),
  }))
}

function pctOf(partKg: number | null, totalKg: number | null): number | null {
  if (partKg == null || totalKg == null || totalKg <= 0) return null
  return Math.round((partKg / totalKg) * 1000) / 10
}

/** Most recent non-null value of `key`, with the date it was measured. */
export function latestValue(days: (BodyMetric & { date: string })[], key: BodyMetricKey): { value: number; date: string } | null {
  for (let i = days.length - 1; i >= 0; i--) {
    const v = days[i][key]
    if (v != null) return { value: v, date: days[i].date }
  }
  return null
}

/**
 * Change in `key` over roughly `spanDays`: latest value minus the last value
 * measured at least `spanDays` before it. With a shorter history than that, it
 * falls back to the oldest value we have, and `sinceDate` says how far back
 * that actually is — so the label never claims "30 days" for a 6-day history.
 */
export function deltaOver(
  days: (BodyMetric & { date: string })[],
  key: BodyMetricKey,
  spanDays: number,
): { delta: number; sinceDate: string } | null {
  const points = days.filter((d) => d[key] != null)
  if (points.length < 2) return null
  const last = points[points.length - 1]
  const cutoff = shiftDate(last.date, -spanDays)
  let base = points[0]
  for (const p of points) {
    if (p.date <= cutoff) base = p
    else break
  }
  if (base === last) return null
  return { delta: (last[key] as number) - (base[key] as number), sinceDate: base.date }
}

/** Non-null values of `key` within the last `windowDays` (relative to `until`), oldest first. */
export function seriesFor(
  days: (BodyMetric & { date: string })[],
  key: BodyMetricKey,
  windowDays: number,
  until: string,
): { date: string; value: number }[] {
  const from = shiftDate(until, -windowDays)
  return days
    .filter((d) => d.date > from && d.date <= until && d[key] != null)
    .map((d) => ({ date: d.date, value: d[key] as number }))
}

/** Metrics that have at least one reading — the scale grid shows only these. */
export function measuredMetrics(days: (BodyMetric & { date: string })[]): BodyMetricKey[] {
  return METRIC_KEYS.filter((k) => days.some((d) => d[k] != null))
}

/** "82,4" — Dutch decimal comma, fixed decimals per metric. */
export function fmtMetric(key: BodyMetricKey, value: number): string {
  const { decimals } = BODY_METRICS[key]
  return value.toLocaleString('nl-NL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

/** "+0,4" / "−1,2" / "±0" — explicit sign, typographic minus. */
export function fmtDelta(key: BodyMetricKey, delta: number): string {
  const { decimals } = BODY_METRICS[key]
  const rounded = Number(delta.toFixed(decimals))
  if (rounded === 0) return '±0'
  const abs = Math.abs(rounded).toLocaleString('nl-NL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  return (rounded > 0 ? '+' : '−') + abs
}

function shiftDate(date: string, days: number): string {
  const d = new Date(date + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

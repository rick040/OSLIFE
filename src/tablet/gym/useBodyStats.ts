import { useMemo } from 'react'
import { useStore } from '../../store'
import { dailyBodyMetrics } from '../../lib/bodyComposition'
import type { BodyMetric, HealthDay } from '../../types'

export type BodyDay = BodyMetric & { date: string }

export interface BodyStats {
  /** One merged smart-scale reading per day, oldest first. */
  days: BodyDay[]
  /** Today's steps row, or null when nothing has synced yet today. */
  today: HealthDay | null
  /** The last 14 days of steps (up to and including today), oldest first. */
  recentSteps: HealthDay[]
}

const NO_METRICS: Omit<BodyMetric, 'at' | 'weightKg'> = {
  bodyFatPct: null,
  bmi: null,
  muscleMassKg: null,
  musclePct: null,
  skeletalMuscleKg: null,
  skeletalMusclePct: null,
  fatFreeMassKg: null,
  bodyWaterPct: null,
  boneMassKg: null,
  proteinPct: null,
  subcutaneousFatPct: null,
  visceralFat: null,
  bmrKcal: null,
  metabolicAge: null,
}

/** Health-screen data for the gym screens: smart-scale history + steps. */
export function useBodyStats(date: string): BodyStats {
  const bodyMetrics = useStore((s) => s.bodyMetrics)
  const bodyWeight = useStore((s) => s.bodyWeight)
  const healthDays = useStore((s) => s.healthDays)

  return useMemo(() => {
    // A store persisted before the history slice existed still has the latest
    // weight — show that rather than an empty screen until the first sync.
    const readings =
      bodyMetrics.length > 0 ? bodyMetrics : bodyWeight ? [{ ...NO_METRICS, at: bodyWeight.at, weightKg: bodyWeight.weightKg }] : []
    const upToToday = healthDays.filter((h) => h.date <= date)
    return {
      days: dailyBodyMetrics(readings),
      today: upToToday.find((h) => h.date === date) ?? null,
      recentSteps: upToToday.slice(-14),
    }
  }, [bodyMetrics, bodyWeight, healthDays, date])
}

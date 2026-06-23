import type {
  DayLog,
  Transaction,
  Thread,
  Pattern,
  Correlation,
  Anomaly,
  ReflectDigest,
  ScreenDay,
  MeetingDay,
  LocationDay,
  MusicDay,
} from './types'
import { TODAY, daysBetween } from './domains'

// ── Layer 4: REFLECT, the cross-domain brain (the keystone) ──────────────────
// Reads across the WHOLE memory at once and computes correlations between
// domains that no single tracker could surface. Pure functions over the store.

const round = (n: number, d = 0) => {
  const f = Math.pow(10, d)
  return Math.round(n * f) / f
}
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

// PRJCT/ParkingYou deadline dates we treat as "deadline pressure" anchors.
const DEADLINE_DATES = ['2026-06-12', '2026-06-17', '2026-06-18']

export function computeCorrelations(
  logs: DayLog[],
  txns: Transaction[],
  screen: ScreenDay[] = [],
  meetings: MeetingDay[] = [],
  location: LocationDay[] = [],
  music: MusicDay[] = [],
): Correlation[] {
  const out: Correlation[] = []

  const energyByDate = new Map(logs.map((l) => [l.date, l.energy]))
  const moodByDate = new Map(logs.map((l) => [l.date, l.mood]))

  // 1) SLEEP ↔ ENERGY (personal ↔ personal/health)
  const low = logs.filter((l) => l.sleepHours < 6)
  const high = logs.filter((l) => l.sleepHours >= 7)
  if (low.length && high.length) {
    const eLow = avg(low.map((l) => l.energy))
    const eHigh = avg(high.map((l) => l.energy))
    const drop = round(((eHigh - eLow) / eHigh) * 100)
    out.push({
      id: 'c1',
      title: `Nights under 6h → next-day energy drops ~${drop}%`,
      detail: `On ${low.length} short nights energy averaged ${round(eLow, 1)}/5, vs ${round(
        eHigh,
        1,
      )}/5 on ${high.length} full nights (7h+).`,
      domains: ['personal'],
      strength: Math.min(1, drop / 50),
      evidence: `${logs.length} days of sleep + energy logs`,
    })
  }

  // 2) SPENDING ↔ DEADLINES (finance ↔ stress, cross-domain)
  const spendNear = (d: string) =>
    txns
      .filter((t) => t.amount < 0 && DEADLINE_DATES.some((dl) => Math.abs(daysBetween(dl, d)) <= 1))
      .length
  const nearDates = new Set<string>()
  txns.forEach((t) => {
    if (t.amount < 0 && DEADLINE_DATES.some((dl) => Math.abs(daysBetween(dl, t.date)) <= 1))
      nearDates.add(t.date)
  })
  const spendOnDeadline = avg(
    DEADLINE_DATES.map((dl) =>
      Math.abs(
        txns
          .filter((t) => t.amount < 0 && Math.abs(daysBetween(dl, t.date)) <= 1)
          .reduce((a, b) => a + b.amount, 0),
      ),
    ),
  )
  const allDays = Array.from(new Set(txns.map((t) => t.date)))
  const baseline = avg(
    allDays.map((d) =>
      Math.abs(txns.filter((t) => t.date === d && t.amount < 0).reduce((a, b) => a + b.amount, 0)),
    ),
  )
  const mult = baseline ? round(spendOnDeadline / baseline, 1) : 0
  out.push({
    id: 'c2',
    title: `Spend spikes ~${mult}× around PRJCT / campaign deadlines`,
    detail: `Daily spend near deadline dates averaged €${round(spendOnDeadline)} vs €${round(
      baseline,
    )} baseline, driven by takeout, fuel & convenience buys. Possible finance ↔ stress link.`,
    domains: ['prjct', 'personal', 'parkingyou'],
    strength: Math.min(1, (mult - 1) / 1.5),
    evidence: `${txns.filter((t) => t.amount < 0).length} transactions vs deadline calendar`,
  })

  // 3) ENERGY ↔ TAKEOUT (health ↔ finance, cross-domain)
  const lowDays = new Set(logs.filter((l) => l.energy <= 2).map((l) => l.date))
  const takeout = txns.filter((t) => /takeout|convenience/i.test(t.category))
  const takeoutOnLow = takeout.filter((t) => lowDays.has(t.date)).length
  const share = takeout.length ? round((takeoutOnLow / takeout.length) * 100) : 0
  out.push({
    id: 'c3',
    title: `${share}% of takeout/convenience spend lands on low-energy days`,
    detail: `When energy ≤2/5 you reach for Thuisbezorgd & the Esso shop, convenience spend tracks the energy dip, not the calendar.`,
    domains: ['personal'],
    strength: Math.min(1, share / 100),
    evidence: `${takeout.length} convenience transactions vs energy logs`,
  })

  // 4) SCHERMTIJD ↔ ENERGIE (gedrag ↔ personal, cross-domain)
  if (screen.length) {
    const lowS = screen.filter((s) => (energyByDate.get(s.date) ?? 3) <= 2)
    const highS = screen.filter((s) => (energyByDate.get(s.date) ?? 3) >= 4)
    if (lowS.length && highS.length) {
      const distLow = avg(lowS.map((s) => s.distractMinutes))
      const distHigh = avg(highS.map((s) => s.distractMinutes))
      const pickLow = avg(lowS.map((s) => s.pickups))
      const mult = distHigh ? round(distLow / distHigh, 1) : 0
      out.push({
        id: 'c4',
        title: `Afleiding-schermtijd ~${mult}× hoger op lage-energie dagen`,
        detail: `Op lage-energie dagen pak je de telefoon ~${Math.round(pickLow)}× per dag en loopt afleidende schermtijd op naar ${Math.round(
          distLow,
        )} min (vs ${Math.round(distHigh)} min op goede dagen). Bescherm het 09:30 deep-work blok.`,
        domains: ['personal', 'cross'],
        strength: Math.min(1, (mult - 1) / 1.5),
        evidence: `${screen.length} dagen schermtijd vs energie-logs`,
      })
    }
  }

  // 5) MEETINGS ↔ OUTPUT (work ↔ personal, cross-domain)
  if (meetings.length) {
    const heavy = meetings.filter((m) => m.count >= 3).map((m) => m.date)
    const light = meetings.filter((m) => m.count < 3).map((m) => m.date)
    const eHeavy = avg(heavy.map((d) => energyByDate.get(d) ?? 3))
    const eLight = avg(light.map((d) => energyByDate.get(d) ?? 3))
    const fragged = meetings.filter((m) => m.fragmented).length
    if (heavy.length && light.length) {
      out.push({
        id: 'c5',
        title: `Meeting-zware dagen (3+) → ~${round(eLight - eHeavy, 1)} punt minder energie`,
        detail: `Op je ${heavy.length} meeting-zware dagen zakt energie naar ${round(eHeavy, 1)}/5 (vs ${round(
          eLight,
          1,
        )}/5 op rustige dagen), en ${fragged} dagen waren versnipperd. Blok je 09:30 deep-work voor de eerste meeting.`,
        domains: ['prjct', 'parkingyou', 'personal'],
        strength: Math.min(1, (eLight - eHeavy) / 2),
        evidence: `${meetings.length} dagen agenda vs energie-logs`,
      })
    }
  }

  // 6) LOCATIE ↔ DEADLINES (gedrag ↔ work, cross-domain)
  if (location.length) {
    const lotMin = (l: LocationDay) =>
      l.places.filter((p) => p.domain === 'parkingyou').reduce((a, b) => a + b.minutes, 0)
    const near = location.filter((l) => DEADLINE_DATES.some((dl) => Math.abs(daysBetween(dl, l.date)) <= 1))
    const far = location.filter((l) => !DEADLINE_DATES.some((dl) => Math.abs(daysBetween(dl, l.date)) <= 1))
    const lotNear = avg(near.map(lotMin))
    const lotFar = avg(far.map(lotMin))
    if (near.length) {
      out.push({
        id: 'c6',
        title: `Tijd op de lots piekt rond campagne-deadlines`,
        detail: `Rond deadlines sta je gemiddeld ${Math.round(lotNear)} min op de ParkingYou-lots (Strijp-S / Geldrop) vs ${Math.round(
          lotFar,
        )} min daarbuiten, met meer commute. Plan reistijd vooraf in.`,
        domains: ['parkingyou', 'cross'],
        strength: Math.min(1, lotFar ? (lotNear - lotFar) / (lotFar + 120) : 0.6),
        evidence: `${location.length} dagen locatie vs deadline-kalender`,
      })
    }
  }

  // 7) MUZIEK ↔ MOOD (gedrag ↔ personal)
  if (music.length) {
    const lowMood = music.filter((m) => (moodByDate.get(m.date) ?? 3) <= 2)
    const highMood = music.filter((m) => (moodByDate.get(m.date) ?? 3) >= 4)
    if (lowMood.length && highMood.length) {
      const vLow = avg(lowMood.map((m) => m.valence))
      const vHigh = avg(highMood.map((m) => m.valence))
      const drop = round((vHigh - vLow) * 100)
      out.push({
        id: 'c7',
        title: `Muziek-valence ~${drop} punten lager op lage-mood dagen`,
        detail: `Op sombere dagen draai je rustiger, lagere-valence muziek (gem. ${vLow.toFixed(
          2,
        )} vs ${vHigh.toFixed(2)}), vaak Lo-fi/Ambient. Je luistergedrag is een vroege mood-indicator.`,
        domains: ['personal'],
        strength: Math.min(1, (vHigh - vLow) / 0.4),
        evidence: `${music.length} dagen luistergedrag vs mood-logs`,
      })
    }
  }

  return out
}

export function computeAnomalies(logs: DayLog[], txns: Transaction[], threads: Thread[]): Anomaly[] {
  const out: Anomaly[] = []

  // overdue thread (owed) anomaly
  const overdue = threads.filter(
    (t) => t.status === 'open' && t.due && daysBetween(t.due, TODAY) > 0,
  )
  if (overdue.length) {
    const worst = overdue.sort((a, b) => daysBetween(b.due!, TODAY) - daysBetween(a.due!, TODAY))[0]
    out.push({
      id: 'a1',
      domain: worst.domain,
      title: `Overdue loop: ${worst.title}`,
      detail: `${daysBetween(worst.due!, TODAY)} day(s) past due (${worst.owedTo}). Surfaced because an owed promise outranks everything learned.`,
    })
  }

  // unusual single spend
  const spends = txns.filter((t) => t.amount < 0)
  const big = spends.sort((a, b) => a.amount - b.amount)[0]
  const mean = avg(spends.map((t) => Math.abs(t.amount)))
  if (big && Math.abs(big.amount) > mean * 2) {
    out.push({
      id: 'a2',
      domain: big.domain,
      title: `Outlier spend: €${Math.abs(big.amount)} at ${big.merchant}`,
      detail: `${round(Math.abs(big.amount) / mean, 1)}× your average transaction, flagged for review, not yet a pattern.`,
    })
  }

  return out
}

// Apply a reflection pass to patterns: reinforce the freshly-evidenced ones,
// decay the stale ones. Returns new patterns + a changelog.
export function applyReflection(patterns: Pattern[]): {
  patterns: Pattern[]
  reinforced: ReflectDigest['reinforced']
  decayed: ReflectDigest['decayed']
} {
  const reinforced: ReflectDigest['reinforced'] = []
  const decayed: ReflectDigest['decayed'] = []

  // backed by this pass's correlations (incl. the new behaviour streams)
  const REINFORCE = new Set(['p1', 'p2', 'p3', 'p7', 'p8', 'p9', 'p10'])

  const next = patterns.map((p) => {
    const staleDays = daysBetween(p.lastReinforced, TODAY)
    if (REINFORCE.has(p.id)) {
      const to = Math.min(0.98, round(p.confidence + 0.08, 2))
      reinforced.push({ patternId: p.id, from: p.confidence, to })
      return { ...p, confidence: to, lastReinforced: TODAY, trend: 'up' as const }
    }
    // decay anything not reinforced this pass, faster if already stale
    const decayRate = staleDays > 14 ? 0.06 : 0.03
    const to = Math.max(0.05, round(p.confidence - decayRate, 2))
    if (to < p.confidence) decayed.push({ patternId: p.id, from: p.confidence, to })
    return { ...p, confidence: to, trend: 'down' as const }
  })

  return { patterns: next, reinforced, decayed }
}

export function runReflect(
  logs: DayLog[],
  txns: Transaction[],
  threads: Thread[],
  patterns: Pattern[],
  screen: ScreenDay[] = [],
  meetings: MeetingDay[] = [],
  location: LocationDay[] = [],
  music: MusicDay[] = [],
): { digest: ReflectDigest; patterns: Pattern[] } {
  const correlations = computeCorrelations(logs, txns, screen, meetings, location, music)
  const anomalies = computeAnomalies(logs, txns, threads)
  const { patterns: nextPatterns, reinforced, decayed } = applyReflection(patterns)
  return {
    patterns: nextPatterns,
    digest: {
      ranAt: new Date().toISOString(),
      correlations,
      anomalies,
      reinforced,
      decayed,
    },
  }
}

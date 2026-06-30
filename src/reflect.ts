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
} from './types'
import { TODAY, daysBetween } from './domains'
import { hasSleepSignal, hasEnergySignal } from './derive'

// ── Layer 4: REFLECT, the cross-domain brain (the keystone) ──────────────────
// Reads across the WHOLE memory at once and computes correlations between
// domains that no single tracker could surface. Pure functions over the store.
//
// Honesty rule: a correlation is only emitted when the data it needs is actually
// present and carries signal. If sleep isn't being ingested, or energy never
// varies, the related correlation is omitted rather than reported as "~0%".

const round = (n: number, d = 0) => {
  const f = Math.pow(10, d)
  return Math.round(n * f) / f
}
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

export function computeCorrelations(
  logs: DayLog[],
  txns: Transaction[],
  screen: ScreenDay[] = [],
  meetings: MeetingDay[] = [],
  deadlines: string[] = [],
): Correlation[] {
  const out: Correlation[] = []

  const energyByDate = new Map(logs.map((l) => [l.date, l.energy]))
  const sleepOk = hasSleepSignal(logs)
  const energyOk = hasEnergySignal(logs)

  // 1) SLEEP ↔ ENERGY (needs both sleep + a varying energy signal)
  if (sleepOk && energyOk) {
    const low = logs.filter((l) => l.sleepHours > 0 && l.sleepHours < 6)
    const high = logs.filter((l) => l.sleepHours >= 7)
    if (low.length && high.length) {
      const eLow = avg(low.map((l) => l.energy))
      const eHigh = avg(high.map((l) => l.energy))
      const drop = round(((eHigh - eLow) / eHigh) * 100)
      if (drop > 0) {
        out.push({
          id: 'c1',
          title: `Nachten onder 6u → energie de dag erna ~${drop}% lager`,
          detail: `Op ${low.length} korte nachten was energie gemiddeld ${round(eLow, 1)}/5, tegenover ${round(
            eHigh,
            1,
          )}/5 op ${high.length} volle nachten (7u+).`,
          domains: ['personal'],
          strength: Math.min(1, drop / 50),
          evidence: `${logs.length} dagen slaap- + energie-logs`,
        })
      }
    }
  }

  // 2) UITGAVEN ↔ DEADLINES (finance ↔ stress, cross-domain)
  // Only when there are real spends AND real deadlines that overlap the spend window.
  const spends = txns.filter((t) => t.amount < 0)
  const spendDates = new Set(spends.map((t) => t.date))
  const relevantDeadlines = deadlines.filter((dl) =>
    spends.some((t) => Math.abs(daysBetween(dl, t.date)) <= 1),
  )
  if (spends.length >= 5 && relevantDeadlines.length) {
    const spendOnDeadline = avg(
      relevantDeadlines.map((dl) =>
        Math.abs(
          spends.filter((t) => Math.abs(daysBetween(dl, t.date)) <= 1).reduce((a, b) => a + b.amount, 0),
        ),
      ),
    )
    const allDays = Array.from(spendDates)
    const baseline = avg(
      allDays.map((d) => Math.abs(spends.filter((t) => t.date === d).reduce((a, b) => a + b.amount, 0))),
    )
    const mult = baseline ? round(spendOnDeadline / baseline, 1) : 0
    if (mult > 1) {
      out.push({
        id: 'c2',
        title: `Uitgaven pieken ~${mult}× rond projectdeadlines`,
        detail: `Dagbesteding rond deadlinedata was gemiddeld €${round(spendOnDeadline)} tegenover €${round(
          baseline,
        )} normaal. Mogelijk een financiën ↔ stress-verband.`,
        domains: ['prjct', 'personal'],
        strength: Math.min(1, (mult - 1) / 1.5),
        evidence: `${spends.length} uitgaven vs ${relevantDeadlines.length} deadline(s)`,
      })
    }
  }

  // 3) ENERGIE ↔ GEMAKSUITGAVEN (needs a varying energy signal)
  if (energyOk) {
    const lowDays = new Set(logs.filter((l) => l.energy <= 2).map((l) => l.date))
    const takeout = txns.filter((t) => /takeout|convenience|gemak|bezorg/i.test(t.category))
    if (lowDays.size && takeout.length >= 3) {
      const takeoutOnLow = takeout.filter((t) => lowDays.has(t.date)).length
      const share = round((takeoutOnLow / takeout.length) * 100)
      if (share > 0) {
        out.push({
          id: 'c3',
          title: `${share}% van gemaksuitgaven valt op lage-energie dagen`,
          detail: `Bij energie ≤2/5 grijp je vaker naar bezorging en gemak; die uitgaven volgen de energiedip, niet de agenda.`,
          domains: ['personal'],
          strength: Math.min(1, share / 100),
          evidence: `${takeout.length} gemakstransacties vs energie-logs`,
        })
      }
    }
  }

  // 4) SCHERMTIJD ↔ ENERGIE (needs energy signal + screen data)
  if (energyOk && screen.length >= 4) {
    const lowS = screen.filter((s) => (energyByDate.get(s.date) ?? 3) <= 2)
    const highS = screen.filter((s) => (energyByDate.get(s.date) ?? 3) >= 4)
    if (lowS.length && highS.length) {
      const distLow = avg(lowS.map((s) => s.distractMinutes))
      const distHigh = avg(highS.map((s) => s.distractMinutes))
      const pickLow = avg(lowS.map((s) => s.pickups))
      const mult = distHigh ? round(distLow / distHigh, 1) : 0
      if (mult > 1) {
        out.push({
          id: 'c4',
          title: `Afleiding-schermtijd ~${mult}× hoger op lage-energie dagen`,
          detail: `Op lage-energie dagen pak je de telefoon ~${Math.round(
            pickLow,
          )}× per dag en loopt afleidende schermtijd op naar ${Math.round(distLow)} min (vs ${Math.round(
            distHigh,
          )} min op goede dagen).`,
          domains: ['personal', 'cross'],
          strength: Math.min(1, (mult - 1) / 1.5),
          evidence: `${screen.length} dagen schermtijd vs energie-logs`,
        })
      }
    }
  }

  // 5) MEETINGS ↔ ENERGIE (needs energy signal + meetings overlapping logged days)
  if (energyOk && meetings.length) {
    const loggedDates = new Set(logs.map((l) => l.date))
    const overlap = meetings.filter((m) => loggedDates.has(m.date))
    const heavy = overlap.filter((m) => m.count >= 3).map((m) => m.date)
    const light = overlap.filter((m) => m.count < 3).map((m) => m.date)
    if (heavy.length && light.length) {
      const eHeavy = avg(heavy.map((d) => energyByDate.get(d) ?? 3))
      const eLight = avg(light.map((d) => energyByDate.get(d) ?? 3))
      const diff = round(eLight - eHeavy, 1)
      if (diff > 0) {
        out.push({
          id: 'c5',
          title: `Meeting-zware dagen (3+) → ~${diff} punt minder energie`,
          detail: `Op je ${heavy.length} meeting-zware dagen zakt energie naar ${round(
            eHeavy,
            1,
          )}/5 (vs ${round(eLight, 1)}/5 op rustige dagen). Blok je ochtend voor de eerste meeting.`,
          domains: ['prjct', 'parkingyou', 'personal'],
          strength: Math.min(1, diff / 2),
          evidence: `${overlap.length} dagen agenda vs energie-logs`,
        })
      }
    }
  }

  return out
}

export function computeAnomalies(logs: DayLog[], txns: Transaction[], threads: Thread[]): Anomaly[] {
  const out: Anomaly[] = []

  // overdue thread (owed) anomaly
  const overdue = threads.filter((t) => t.status === 'open' && t.due && daysBetween(t.due, TODAY) > 0)
  if (overdue.length) {
    const worst = overdue.sort((a, b) => daysBetween(b.due!, TODAY) - daysBetween(a.due!, TODAY))[0]
    out.push({
      id: 'a1',
      domain: worst.domain,
      title: `Verlopen loop: ${worst.title}`,
      detail: `${daysBetween(worst.due!, TODAY)} dag(en) over de deadline (${worst.owedTo}). Een openstaande belofte weegt zwaarder dan alles wat geleerd is.`,
    })
  }

  // unusual single spend
  const spends = txns.filter((t) => t.amount < 0)
  if (spends.length >= 4) {
    const big = spends.slice().sort((a, b) => a.amount - b.amount)[0]
    const mean = avg(spends.map((t) => Math.abs(t.amount)))
    if (big && mean > 0 && Math.abs(big.amount) > mean * 2) {
      out.push({
        id: 'a2',
        domain: big.domain,
        title: `Uitschieter: €${Math.abs(big.amount)} bij ${big.merchant}`,
        detail: `${round(Math.abs(big.amount) / mean, 1)}× je gemiddelde transactie — gemarkeerd ter controle, nog geen patroon.`,
      })
    }
  }

  return out
}

/** Turn the correlations found this pass into reinforceable Pattern records. */
function correlationPatterns(correlations: Correlation[]): Pattern[] {
  return correlations.map((c) => ({
    id: `pat-${c.id}`,
    domain: c.domains[0] ?? 'cross',
    text: c.title,
    confidence: c.strength,
    lastReinforced: TODAY,
    trend: 'up' as const,
  }))
}

// Apply a reflection pass: anything re-evidenced this pass (a freshly computed
// baseline pattern or correlation) is reinforced; everything else decays. New
// observations are added. This makes the slow loop work on LIVE data — no
// hardcoded pattern ids.
export function applyReflection(
  prev: Pattern[],
  evidenced: Pattern[],
): {
  patterns: Pattern[]
  reinforced: ReflectDigest['reinforced']
  decayed: ReflectDigest['decayed']
} {
  const reinforced: ReflectDigest['reinforced'] = []
  const decayed: ReflectDigest['decayed'] = []
  const evidencedById = new Map(evidenced.map((p) => [p.id, p]))
  const prevById = new Map(prev.map((p) => [p.id, p]))

  const next: Pattern[] = []

  // 1) Update / reinforce patterns that already existed.
  for (const p of prev) {
    const fresh = evidencedById.get(p.id)
    if (fresh) {
      const to = Math.min(0.98, round(p.confidence + 0.08, 2))
      reinforced.push({ patternId: p.id, from: p.confidence, to })
      next.push({ ...p, text: fresh.text, confidence: to, lastReinforced: TODAY, trend: 'up' })
    } else {
      const staleDays = daysBetween(p.lastReinforced, TODAY)
      const decayRate = staleDays > 14 ? 0.06 : 0.03
      const to = Math.max(0.05, round(p.confidence - decayRate, 2))
      if (to < p.confidence) decayed.push({ patternId: p.id, from: p.confidence, to })
      next.push({ ...p, confidence: to, trend: 'down' })
    }
  }

  // 2) Add freshly evidenced patterns that are brand new this pass.
  for (const e of evidenced) {
    if (!prevById.has(e.id)) {
      reinforced.push({ patternId: e.id, from: 0, to: e.confidence })
      next.push(e)
    }
  }

  return { patterns: next, reinforced, decayed }
}

export function runReflect(
  logs: DayLog[],
  txns: Transaction[],
  threads: Thread[],
  patterns: Pattern[],
  evidenced: Pattern[],
  screen: ScreenDay[] = [],
  meetings: MeetingDay[] = [],
  deadlines: string[] = [],
): { digest: ReflectDigest; patterns: Pattern[] } {
  const correlations = computeCorrelations(logs, txns, screen, meetings, deadlines)
  const anomalies = computeAnomalies(logs, txns, threads)
  // Everything that carries signal this pass: live baseline observations + the
  // cross-domain correlations just found.
  const allEvidenced = [...evidenced, ...correlationPatterns(correlations)]
  const { patterns: nextPatterns, reinforced, decayed } = applyReflection(patterns, allEvidenced)
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

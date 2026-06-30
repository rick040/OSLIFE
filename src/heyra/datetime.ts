// ── HEYRA · natural-language date & time parsing (NL + EN) ────────────────────
// A small, transparent parser so the Taakmaker can pull a concrete due date and
// time out of free text ("herinner me vrijdag 14:00", "over 2 weken", "morgen").
// Deliberately rule-based and explainable — no LLM round-trip needed.

export interface ParsedWhen {
  /** ISO date YYYY-MM-DD, or null when nothing date-like was found. */
  date: string | null
  /** HH:MM (24h), or null. */
  time: string | null
  /** Raw substrings that were recognised — stripped from the task title. */
  strip: string[]
}

const WEEKDAYS: Record<string, number> = {
  zondag: 0, maandag: 1, dinsdag: 2, woensdag: 3, donderdag: 4, vrijdag: 5, zaterdag: 6,
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
}

const MONTHS: Record<string, number> = {
  // Dutch
  januari: 0, februari: 1, maart: 2, april: 3, mei: 4, juni: 5, juli: 6,
  augustus: 7, september: 8, oktober: 9, november: 10, december: 11,
  // abbreviations
  jan: 0, feb: 1, mrt: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, okt: 9, nov: 10, dec: 11,
  // English (only those that differ from the Dutch spellings above)
  january: 0, february: 1, march: 2, may: 4, june: 5, july: 6, october: 9,
}

/** Today at local midnight — base for all relative math. */
function todayMidnight(): Date {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate())
}

function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * Extract a due date + time from free text. Returns the parsed values plus the
 * raw matched phrases so the caller can strip them from the task title.
 */
export function parseWhen(text: string): ParsedWhen {
  const base = todayMidnight()
  let date: string | null = null
  let time: string | null = null
  const strip: string[] = []

  const has = (re: RegExp): RegExpMatchArray | null => text.match(re)

  // ── DATE ───────────────────────────────────────────────────────────────────
  // 1) relative day words
  let m: RegExpMatchArray | null
  if ((m = has(/\b(overmorgen|day after tomorrow)\b/i))) {
    date = isoDate(addDays(base, 2)); strip.push(m[0])
  } else if ((m = has(/\b(morgen|tomorrow)\b/i))) {
    date = isoDate(addDays(base, 1)); strip.push(m[0])
  } else if ((m = has(/\b(vandaag|today|vanavond|vanmiddag|vanochtend|vanmorgen|tonight)\b/i))) {
    date = isoDate(base); strip.push(m[0])
  }

  // 2) "over/in N dagen|weken|maanden"
  if (!date && (m = has(/\b(?:over|in)\s+(\d{1,3})\s+(dagen?|days?|weken?|weeks?|maanden?|months?)\b/i))) {
    const n = parseInt(m[1], 10)
    const unit = m[2].toLowerCase()[0] // d=dag/day, w=week/weken, m=maand/month
    if (unit === 'w') date = isoDate(addDays(base, n * 7))
    else if (unit === 'm') {
      const d = new Date(base); d.setMonth(d.getMonth() + n); date = isoDate(d)
    } else date = isoDate(addDays(base, n))
    strip.push(m[0])
  }

  // 3) "volgende/komende/aanstaande/deze/next/this <weekday>"
  if (!date && (m = has(
    new RegExp(`\\b(volgende|komende|aanstaande|deze|next|this)?\\s*(${Object.keys(WEEKDAYS).join('|')})\\b`, 'i'),
  ))) {
    const prefix = (m[1] || '').toLowerCase()
    const target = WEEKDAYS[m[2].toLowerCase()]
    let delta = (target - base.getDay() + 7) % 7
    if (delta === 0) delta = 7
    if (prefix === 'volgende' || prefix === 'next') delta += 7
    date = isoDate(addDays(base, delta))
    strip.push(m[0].trim())
  }

  // 4) "volgende week / volgende maand"
  if (!date && (m = has(/\b(volgende|komende|next)\s+(week|maand|month)\b/i))) {
    if (/week/i.test(m[2])) {
      // next Monday
      let delta = (1 - base.getDay() + 7) % 7
      delta = delta === 0 ? 7 : delta
      date = isoDate(addDays(base, delta + (/(volgende|next)/i.test(m[1]) ? 0 : 0)))
    } else {
      const d = new Date(base); d.setMonth(d.getMonth() + 1, 1); date = isoDate(d)
    }
    strip.push(m[0])
  }

  // 5) "12 juli" / "3 jan" / "juli 12"
  if (!date && (m = has(
    new RegExp(`\\b(\\d{1,2})(?:e|ste|de)?\\s+(${Object.keys(MONTHS).join('|')})\\b`, 'i'),
  ))) {
    date = resolveDayMonth(parseInt(m[1], 10), MONTHS[m[2].toLowerCase()], base)
    strip.push(m[0])
  } else if (!date && (m = has(
    new RegExp(`\\b(${Object.keys(MONTHS).join('|')})\\s+(\\d{1,2})(?:e|ste|de|th|st|nd|rd)?\\b`, 'i'),
  ))) {
    date = resolveDayMonth(parseInt(m[2], 10), MONTHS[m[1].toLowerCase()], base)
    strip.push(m[0])
  }

  // 6) numeric "12-07", "12/07/2026", "12.07"
  if (!date && (m = has(/\b(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?\b/))) {
    const day = parseInt(m[1], 10)
    const month = parseInt(m[2], 10) - 1
    if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
      if (m[3]) {
        let y = parseInt(m[3], 10)
        if (y < 100) y += 2000
        date = isoDate(new Date(y, month, day))
      } else {
        date = resolveDayMonth(day, month, base)
      }
      strip.push(m[0])
    }
  }

  // ── TIME ─────────────────────────────────────────────────────────────────────
  // 1) HH:MM / HH.MM / HHuMM (e.g. "14:00", "9u30", "om 9.15")
  if ((m = has(/\b(?:om\s+|at\s+|@\s*)?([01]?\d|2[0-3])[:.u]([0-5]\d)\b/i))) {
    time = `${pad(parseInt(m[1], 10))}:${m[2]}`
    strip.push(m[0])
  }
  // 2) "om 9 uur", "9u", "9h", "at 9"
  else if ((m = has(/\b(?:om\s+|at\s+)([01]?\d|2[0-3])\s*(?:uur|u|h)?\b/i)) ||
           (m = has(/\b([01]?\d|2[0-3])\s*(?:uur|u|h)\b/i))) {
    time = `${pad(parseInt(m[1], 10))}:00`
    strip.push(m[0])
  }
  // 3) "9am" / "9 pm"
  else if ((m = has(/\b(\d{1,2})\s*(am|pm)\b/i))) {
    let h = parseInt(m[1], 10) % 12
    if (/pm/i.test(m[2])) h += 12
    time = `${pad(h)}:00`
    strip.push(m[0])
  }

  // 4) part-of-day words imply a time when none was given
  if (!time) {
    if (has(/\bvanavond|tonight|'s avonds\b/i)) time = '19:00'
    else if (has(/\bvanmiddag|'s middags\b/i)) time = '14:00'
    else if (has(/\bvanochtend|vanmorgen|'s ochtends|ochtend\b/i)) time = '09:00'
  }

  return { date, time, strip }
}

/** Resolve a day+month to the next future occurrence (bump year if already past). */
function resolveDayMonth(day: number, month: number, base: Date): string {
  let y = base.getFullYear()
  let d = new Date(y, month, day)
  if (d < base) { y += 1; d = new Date(y, month, day) }
  return isoDate(d)
}

/** Human relative label for a due date, e.g. "vandaag", "morgen", "over 3 dagen", "2d te laat". */
export function relativeDue(iso: string | null): { label: string; overdue: boolean; soon: boolean } {
  if (!iso) return { label: 'geen datum', overdue: false, soon: false }
  const base = todayMidnight()
  const target = new Date(iso + 'T00:00:00')
  const diff = Math.round((target.getTime() - base.getTime()) / 86400000)
  if (diff < 0) return { label: `${-diff}d te laat`, overdue: true, soon: false }
  if (diff === 0) return { label: 'vandaag', overdue: false, soon: true }
  if (diff === 1) return { label: 'morgen', overdue: false, soon: true }
  if (diff === 2) return { label: 'overmorgen', overdue: false, soon: true }
  if (diff <= 7) return { label: `over ${diff} dagen`, overdue: false, soon: true }
  return { label: `over ${diff} dagen`, overdue: false, soon: false }
}

// ── Google Calendar "add event" deep link ─────────────────────────────────────
// No OAuth, no secrets, works on desktop + mobile: we build a prefilled event
// template URL. Google opens its own event editor so the user confirms before
// anything lands on their calendar. A later upgrade can swap this for a proper
// Calendar API write via a Supabase edge function.

import type { TaskDraft, PlanBlock } from '../types'

const TZ = 'Europe/Amsterdam'

function stamp(dateIso: string, time: string): string {
  // YYYYMMDDTHHMMSS (floating local time, anchored by ctz=Europe/Amsterdam)
  const d = dateIso.replace(/-/g, '')
  const t = time.replace(':', '') + '00'
  return `${d}T${t}`
}

function addHour(time: string): string {
  const [h, m] = time.split(':').map((n) => parseInt(n, 10))
  const hh = (h + 1) % 24
  return `${String(hh).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function nextDay(dateIso: string): string {
  const d = new Date(dateIso + 'T00:00:00')
  d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

/** Build a Google Calendar template URL from a task draft. */
export function googleCalendarUrl(d: TaskDraft): string {
  const params = new URLSearchParams({ action: 'TEMPLATE', text: d.title, ctz: TZ })

  if (d.due) {
    if (d.time) {
      const start = stamp(d.due, d.time)
      const endTime = addHour(d.time)
      // If +1h wrapped past midnight, the end must fall on the next calendar day,
      // otherwise the event would end before it starts.
      const [startH] = d.time.split(':').map((n) => parseInt(n, 10))
      const wrapped = startH === 23
      const endDate = wrapped ? nextDay(d.due) : d.due.replace(/-/g, '')
      const end = `${endDate}T${endTime.replace(':', '')}00`
      params.set('dates', `${start}/${end}`)
    } else {
      // all-day event: end date is exclusive (next day)
      const start = d.due.replace(/-/g, '')
      params.set('dates', `${start}/${nextDay(d.due)}`)
    }
  }

  const details: string[] = []
  if (d.notes && d.notes !== d.title) details.push(d.notes)
  details.push(`Prioriteit: ${d.priority}`)
  details.push('Aangemaakt door HEYRA · OSLIFE')
  params.set('details', details.join('\n'))

  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

/**
 * Build a Google Calendar template URL from a planned day block. Unlike the task
 * version this always has an explicit start+end on the block's own date, so the
 * event lands at exactly the proposed time. Google still opens its editor first,
 * so nothing is written until Rick confirms.
 */
export function googleCalendarUrlForBlock(b: PlanBlock): string {
  const params = new URLSearchParams({ action: 'TEMPLATE', text: b.title, ctz: TZ })

  const start = stamp(b.date, b.start)
  // If end wraps before start (end past midnight → "00:15"), roll it to next day.
  const endDate = b.end <= b.start ? `${nextDay(b.date)}` : b.date.replace(/-/g, '')
  const end = `${endDate}T${b.end.replace(':', '')}00`
  params.set('dates', `${start}/${end}`)

  const details: string[] = []
  if (b.rationale) details.push(b.rationale)
  details.push('Gepland door HEYRA · OSLIFE')
  params.set('details', details.join('\n'))

  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

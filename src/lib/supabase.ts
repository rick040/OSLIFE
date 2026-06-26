import { createClient } from '@supabase/supabase-js'
import type { HealthDay, Transaction, EmailItem, MeetingDay, Domain, ScreenDay, LocationDay, MusicDay } from '../types'

const SUPABASE_URL = 'https://xdykcdzqpgcjhcibaola.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhkeWtjZHpxcGdjamhjaWJhb2xhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMzg2ODMsImV4cCI6MjA5NzgxNDY4M30.sA9AohBmBiFwrxKuNZLTiGEP2_nZR1glfajVmbnqIbM'

// createClient is called at module level — any throw here kills the whole bundle before
// React mounts, so the error boundary can't catch it. Hard-coded values guarantee no throw.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractMerchant(description: string, counterparty: string): string {
  const gp = description.match(/Google Pay\s+([^,]+)/i)
  if (gp) return gp[1].trim()
  const bea = description.match(/^(?:BEA|GEA),\s+(.+?)(?:,PAS|\s+NR:|$)/i)
  if (bea) return bea[1].trim()
  return (counterparty || description).slice(0, 50)
}

function inferTxCategory(description: string): string {
  if (/jumbo|albert heijn|lidl|dirk|ah\b|supermarkt/i.test(description)) return 'groceries'
  if (/thuisbezorgd|uber eats|mcdonalds|subway|febo|domino/i.test(description)) return 'takeout'
  if (/shell|esso|bp |total energie|q8|tank/i.test(description)) return 'fuel'
  if (/google|apple|spotify|netflix|adobe|anthropic/i.test(description)) return 'software'
  if (/^GEA/i.test(description)) return 'atm'
  return 'other'
}

function inferTxDomain(description: string, counterparty: string): Domain {
  const t = (description + ' ' + counterparty).toLowerCase()
  if (/parkingyou|parking you/i.test(t)) return 'parkingyou'
  if (/prjct|buurtkaart/i.test(t)) return 'prjct'
  return 'personal'
}

function inferEmailDomain(labels: string[]): Domain {
  const l = labels.join(' ')
  if (/parkingyou|🅿️/i.test(l)) return 'parkingyou'
  if (/prjct|buurtkaart/i.test(l)) return 'prjct'
  return 'personal'
}

// ── Fetch functions ───────────────────────────────────────────────────────────

export async function fetchHealthDays(): Promise<HealthDay[]> {
  const { data } = await supabase
    .from('health_days')
    .select('date,steps,step_goal,sleep_hours,resting_hr,active_minutes,energy,mood')
    .order('date', { ascending: false })
    .limit(90)

  return (data ?? []).map((r) => ({
    date: r.date as string,
    steps: (r.steps as number) ?? 0,
    stepGoal: (r.step_goal as number) ?? 8000,
    sleepHours: (r.sleep_hours as number) ?? 0,
    restingHR: (r.resting_hr as number) ?? 0,
    activeMinutes: (r.active_minutes as number) ?? 0,
    energy: (r.energy as number) ?? 3,
    mood: (r.mood as number) ?? 3,
  }))
}

export async function fetchTransactions(): Promise<Transaction[]> {
  const { data } = await supabase
    .from('transactions')
    .select('id,date,amount,merchant,category,domain')
    .order('date', { ascending: false })
    .limit(300)

  return (data ?? []).map((r) => ({
    id: r.id as string,
    date: r.date as string,
    amount: (r.amount as number) ?? 0,
    merchant: (r.merchant as string) ?? '',
    category: (r.category as string) ?? 'other',
    domain: inferTxDomain((r.merchant as string) ?? '', '') as Domain,
  }))
}

export async function fetchEmails(): Promise<EmailItem[]> {
  const { data } = await supabase
    .from('emails')
    .select('id,from_addr,subject,snippet,received_at,unread,important,domain')
    .order('received_at', { ascending: false })
    .limit(50)

  return (data ?? []).map((r) => ({
    id: r.id as string,
    from: (r.from_addr as string) ?? '',
    subject: (r.subject as string) ?? '',
    snippet: (r.snippet as string) ?? '',
    receivedAt: r.received_at as string,
    unread: (r.unread as boolean) ?? true,
    important: (r.important as boolean) ?? false,
    domain: ((r.domain as Domain) ?? 'personal'),
  }))
}

export async function fetchMeetingDays(): Promise<MeetingDay[]> {
  const { data } = await supabase
    .from('blocks')
    .select('title,date,start,end,domain')
    .order('date', { ascending: false })
    .limit(300)

  const byDate = new Map<string, MeetingDay>()
  for (const ev of data ?? []) {
    const localDate = ev.date as string
    if (!localDate) continue
    const [sh, sm] = ((ev.start as string) ?? '00:00').split(':').map(Number)
    const [eh, em] = ((ev.end as string) ?? '00:00').split(':').map(Number)
    const mins = Math.max(0, (eh * 60 + em) - (sh * 60 + sm))
    const existing = byDate.get(localDate)
    if (existing) {
      existing.count++
      existing.minutes += mins
      if (existing.count >= 3) existing.fragmented = true
    } else {
      byDate.set(localDate, { date: localDate, count: 1, minutes: mins, fragmented: false })
    }
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
}

export async function fetchScreenDays(): Promise<ScreenDay[]> {
  const { data } = await supabase
    .from('screen_days')
    .select('date,total_min,app_breakdown,pickups,notifications_received')
    .order('date', { ascending: false })
    .limit(90)

  return (data ?? []).map((r) => {
    const apps: Array<{ app: string; category: string; minutes: number }> = (r.app_breakdown as Array<{ app: string; category: string; minutes: number }>) ?? []
    const focusMinutes = apps.filter((a) => a.category === 'work').reduce((s, a) => s + a.minutes, 0)
    const distractMinutes = apps.filter((a) => a.category === 'social' || a.category === 'media').reduce((s, a) => s + a.minutes, 0)
    return {
      date: r.date as string,
      totalMinutes: (r.total_min as number) ?? 0,
      pickups: (r.pickups as number) ?? 0,
      focusMinutes,
      distractMinutes,
      topApps: apps.map((a) => ({
        name: a.app,
        minutes: a.minutes,
        category: (a.category as 'work' | 'social' | 'media' | 'comms') ?? 'work',
      })),
    }
  })
}

export async function fetchLocationDays(): Promise<LocationDay[]> {
  const { data } = await supabase
    .from('location_days')
    .select('date,places_visited,distance_km,time_home_min,time_out_min')
    .order('date', { ascending: false })
    .limit(90)

  return (data ?? []).map((r) => ({
    date: r.date as string,
    timeHome: (r.time_home_min as number) ?? 0,
    timeOut: (r.time_out_min as number) ?? 0,
    timeCommute: 0,
    distanceKm: (r.distance_km as number) ?? 0,
    places: ((r.places_visited as Array<{ name: string; duration_min: number }>) ?? []).map((p) => ({
      name: p.name,
      domain: 'personal' as Domain,
      minutes: p.duration_min ?? 0,
    })),
  }))
}

export async function fetchMusicDays(): Promise<MusicDay[]> {
  const { data } = await supabase
    .from('spotify_history')
    .select('played_at,ms_played,genres,popularity')
    .order('played_at', { ascending: false })
    .limit(500)

  // Roll up per day; infer mood from genres since audio-features API is deprecated
  const byDate = new Map<string, { minutes: number; genres: string[]; popularity: number[] }>()
  for (const r of data ?? []) {
    const date = (r.played_at as string).slice(0, 10)
    const ms = (r.ms_played as number) ?? 0
    const genres: string[] = (r.genres as string[]) ?? []
    const pop = (r.popularity as number) ?? 50
    const existing = byDate.get(date)
    if (existing) {
      existing.minutes += Math.round(ms / 60000)
      existing.genres.push(...genres)
      existing.popularity.push(pop)
    } else {
      byDate.set(date, { minutes: Math.round(ms / 60000), genres: [...genres], popularity: [pop] })
    }
  }

  return Array.from(byDate.entries())
    .map(([date, d]) => {
      const genreStr = d.genres.join(' ').toLowerCase()
      // Infer valence from genre keywords (replaces deprecated audio-features)
      const valence = /pop|dance|happy|funk|soul|latin|reggaeton/.test(genreStr) ? 0.75
        : /metal|punk|hardcore|rage|angry/.test(genreStr) ? 0.35
        : /ambient|sleep|classical|chill|lo-fi/.test(genreStr) ? 0.55
        : 0.6
      // Infer tempo proxy from genre
      const tempo = /metal|drum|techno|hardstyle|edm|trap/.test(genreStr) ? 145
        : /ambient|classical|acoustic|folk/.test(genreStr) ? 75
        : 110
      const topGenre = d.genres[0] ?? 'unknown'
      return { date, minutes: d.minutes, topGenre, tempo, valence }
    })
    .sort((a, b) => a.date.localeCompare(b.date))
}

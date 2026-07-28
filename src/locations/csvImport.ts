// ── Locaties: geofence CSV import ────────────────────────────────────────────
// Historische MacroDroid-export ("Datum / Tijd, Locatie, Status, Duur
// (Verblijf)") bevat één rij per losse Inside/Outside-trigger. Deze parser
// voegt ze samen tot doorlopende bezoeken volgens dezelfde regels als
// supabase/functions/geofence-ingest/index.ts hanteert voor live triggers:
//  - een "Inside"-trigger terwijl er al een open sessie voor die plek is, is
//    een dubbele/jitter-trigger (geen echte nieuwe aankomst) en wordt genegeerd
//  - een "Outside" gevolgd door een "Inside" op dezelfde plek binnen
//    GRACE_MINUTES is GPS-jitter en heropent de vorige sessie in plaats van
//    een nieuwe te starten
//  - een "Outside" zonder open sessie is een no-op
import { splitCsvLine, detectDelimiter } from '../finance/csvImport'

export interface ImportedLocationVisit {
  placeName: string
  enteredAt: string // ISO datetime
  leftAt: string | null // null = nog open (laatste status in de CSV was "Inside")
}

// Zelfde grace-window als geofence-ingest, zodat een CSV-import en live ingest
// dezelfde sessie-vorm opleveren.
const GRACE_MINUTES = 10

interface RawRow {
  ts: Date
  place: string
  status: 'inside' | 'outside'
}

function parseDateTime(raw: string): Date | null {
  // "24-07-2026 11:31:34" of "25-7-2026 10:36:15" (dag/maand soms zonder leidende nul)
  const m = raw.trim().match(/^(\d{1,2})-(\d{1,2})-(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/)
  if (!m) return null
  const [d, mo, y, h, mi, s] = m.slice(1).map(Number)
  const date = new Date(y, mo - 1, d, h, mi, s)
  return isNaN(date.getTime()) ? null : date
}

export function parseGeofenceCsv(text: string): ImportedLocationVisit[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (!lines.length) return []
  const delim = detectDelimiter(lines[0])

  let dateIdx = 0
  let placeIdx = 1
  let statusIdx = 2
  let startRow = 0
  if (/datum|locatie|status/i.test(lines[0])) {
    const header = splitCsvLine(lines[0], delim)
    const pick = (re: RegExp, fallback: number) => {
      const idx = header.findIndex((h) => re.test(h))
      return idx >= 0 ? idx : fallback
    }
    dateIdx = pick(/datum|tijd|date/i, 0)
    placeIdx = pick(/locatie|place/i, 1)
    statusIdx = pick(/status/i, 2)
    startRow = 1
  }

  const rows: RawRow[] = []
  for (let i = startRow; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i], delim)
    if (cells.length <= Math.max(dateIdx, placeIdx, statusIdx)) continue
    const ts = parseDateTime(cells[dateIdx])
    const place = cells[placeIdx]?.trim()
    const statusRaw = cells[statusIdx]?.trim().toLowerCase()
    if (!ts || !place || (statusRaw !== 'inside' && statusRaw !== 'outside')) continue
    rows.push({ ts, place, status: statusRaw })
  }
  rows.sort((a, b) => a.ts.getTime() - b.ts.getTime())

  const open = new Map<string, ImportedLocationVisit>()
  const lastLeftAt = new Map<string, Date>()
  const visits: ImportedLocationVisit[] = []

  for (const row of rows) {
    if (row.status === 'inside') {
      if (open.has(row.place)) continue // al binnen: dubbele/jitter-trigger, samenvoegen met de open sessie

      const lastLeft = lastLeftAt.get(row.place)
      if (lastLeft) {
        const goneMin = (row.ts.getTime() - lastLeft.getTime()) / 60_000
        if (goneMin >= 0 && goneMin <= GRACE_MINUTES) {
          const reopened = visits
            .slice()
            .reverse()
            .find((v) => v.placeName === row.place && v.leftAt === lastLeft.toISOString())
          if (reopened) {
            reopened.leftAt = null
            open.set(row.place, reopened)
            continue
          }
        }
      }

      const visit: ImportedLocationVisit = { placeName: row.place, enteredAt: row.ts.toISOString(), leftAt: null }
      visits.push(visit)
      open.set(row.place, visit)
    } else {
      const visit = open.get(row.place)
      if (!visit) continue // exit zonder open sessie: no-op
      visit.leftAt = row.ts.toISOString()
      lastLeftAt.set(row.place, row.ts)
      open.delete(row.place)
    }
  }

  return visits
}

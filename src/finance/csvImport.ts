// ── ABN AMRO + generieke CSV parser ───────────────────────────────────────────
// ABN AMRO CSV (komma, gequote) kolommen:
//   accountNumber, mutationcode(EUR), transactiondate(YYYYMMDD), valuedate,
//   startsaldo, endsaldo, amount(NL komma), description(lange vrije tekst)
// Valt terug op een vergevingsgezinde generieke parse per regel.
import type { Transaction } from '../types'
import { TODAY } from '../domains'
import { domainForCategory, isTransferCounterparty } from './categories'

export function guessCategory(desc: string, amount: number): string {
  const d = desc.toLowerCase()
  // Money moving between the user's own accounts (checked before the
  // amount>0 → 'Client income' fallback, since transfers go both ways).
  if (isTransferCounterparty(desc)) return 'Internal transfer'
  if (amount > 0) return 'Client income'
  // Word boundaries throughout: unbounded substrings caused false positives like
  // "shell" matching "Michelle", "bp" matching "ABP", "plus" matching "OnePlus".
  if (/\b(albert heijn|jumbo|lidl|aldi|plus|supermarkt)\b/.test(d)) return 'Groceries'
  if (/\b(thuisbezorg|takeaway|dominos|new york pizza|mcdonald)\b/.test(d)) return 'Takeout'
  if (/\b(adobe|canva|figma|notion|vercel|openai|chatgpt|google|microsoft)\b/.test(d)) return 'Software'
  if (/\b(spotify|netflix|disney|videoland)\b/.test(d)) return 'Subscriptions'
  if (/\b(esso|shell|bp|tango|tankstation)\b/.test(d)) return 'Convenience'
  if (/\b(dier|vet|kyra|hond)\b/.test(d)) return 'Dog'
  if (/\b(ns|trein|ov-|9292|transavia|ovpay)\b/.test(d)) return 'Transport'
  return 'Uncategorized'
}

export function cleanMerchant(desc: string): string {
  // ABN beschrijvingen bevatten vaak "BEA, Betaalpas <naam> ,PAS123" of "/TRTP/..."
  const m =
    desc.match(/Betaalpas\s+(.+?)(?:,|\s{2,}|$)/i)?.[1] ||
    desc.match(/\/NAME\/(.+?)\//i)?.[1] ||
    desc.match(/SEPA.*?\/NAME\/(.+?)\//i)?.[1]
  if (m) return m.trim()
  // anders: langste alfabetische token-groep
  const tokens = desc.replace(/[^A-Za-z0-9 .&'-]/g, ' ').split(/\s{2,}|\s(?=[A-Z]{3,})/).map((t) => t.trim()).filter((t) => t.length > 3)
  return (tokens.sort((a, b) => b.length - a.length)[0] || desc.slice(0, 28) || 'Onbekend').slice(0, 40)
}

export function parseAmount(raw: string): number {
  return parseFloat(raw.replace(/\s/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.'))
}

// Splitst één CSV-regel op het gegeven scheidingsteken, rekening houdend met
// velden tussen dubbele quotes (die zelf het scheidingsteken mogen bevatten).
export function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ } else inQuotes = false
      } else cur += ch
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === delim) {
      out.push(cur.trim()); cur = ''
    } else cur += ch
  }
  out.push(cur.trim())
  return out
}

// Kiest het scheidingsteken dat de meeste kolommen oplevert op de eerste regel.
export function detectDelimiter(line: string): string {
  let best = ','
  let bestCount = -1
  for (const d of [',', ';', '\t']) {
    const count = splitCsvLine(line, d).length
    if (count > bestCount) { bestCount = count; best = d }
  }
  return best
}

export function toIsoDate(raw: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const ymd = raw.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`
  const dmy = raw.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`
  return null
}

export function parseCsv(text: string): Transaction[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (!lines.length) return []
  const delim = detectDelimiter(lines[0])
  const out: Transaction[] = []

  // Header-detectie + kolom-mapping (ABN AMRO en varianten). Zonder header
  // valt de parser terug op een vergevingsgezinde heuristiek per regel.
  let dateIdx = -1
  let amtIdx = -1
  let descIdx = -1
  let startRow = 0
  if (/date|datum|bedrag|amount|omschrijving|description/i.test(lines[0]) && !/\d{8}/.test(lines[0])) {
    const header = splitCsvLine(lines[0], delim)
    const pick = (patterns: RegExp[]) => {
      for (const p of patterns) {
        const idx = header.findIndex((h) => p.test(h))
        if (idx >= 0) return idx
      }
      return -1
    }
    dateIdx = pick([/transactiedatum|boekingsdatum/i, /date/i, /datum/i])
    amtIdx = pick([/transactiebedrag/i, /bedrag|amount/i])
    descIdx = pick([/omschrijving|description|mededeling/i, /naam|tegenrekening/i])
    startRow = 1
  }

  for (let i = startRow; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i], delim)
    if (cells.length < 2) continue

    let date = TODAY
    let amtCell: string | undefined
    let desc: string | undefined

    if (amtIdx >= 0) {
      amtCell = cells[amtIdx]
      if (dateIdx >= 0) date = toIsoDate(cells[dateIdx]) ?? TODAY
      if (descIdx >= 0) desc = cells[descIdx]
    } else {
      const dateCell = cells.find((c) => toIsoDate(c) !== null)
      if (dateCell) date = toIsoDate(dateCell) ?? TODAY
      // Accept grouped thousands ("1.234,56") OR a plain integer part
      // ("1234,56", "1000,08") — the old regex required exactly-3-digit groups and
      // silently dropped ungrouped amounts >= 1000. A decimal is still required so
      // dates / account numbers aren't mistaken for money.
      const isMoney = (v: string) =>
        /^[+-]?\d{1,3}(?:[.,]\d{3})*[.,]\d{1,2}$/.test(v) || /^[+-]?\d+[.,]\d{1,2}$/.test(v)
      const moneyCells = cells.filter((c) => c !== dateCell && isMoney(c.replace(/\s/g, '')))
      // Prefer a signed cell: in a full ABN row the transaction amount carries a
      // +/- sign while the start/end balances don't, so this skips the balances.
      amtCell = moneyCells.find((c) => /^\s*[+-]/.test(c)) ?? moneyCells[0]
    }

    if (!amtCell) continue
    const amount = parseAmount(amtCell)
    if (isNaN(amount)) continue

    if (!desc) {
      const dateCell = dateIdx >= 0 ? cells[dateIdx] : cells.find((c) => toIsoDate(c) !== null)
      desc = cells.filter((c) => c !== dateCell && c !== amtCell).sort((a, b) => b.length - a.length)[0] || 'Onbekend'
    }

    const merchant = cleanMerchant(desc)
    const category = guessCategory(desc, amount)
    out.push({
      id: `imp-${Date.now()}-${i}`,
      date,
      amount,
      merchant,
      category,
      domain: domainForCategory(category, amount),
    })
  }
  return out
}

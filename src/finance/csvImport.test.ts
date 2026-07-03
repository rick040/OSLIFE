import { describe, it, expect } from 'vitest'
import {
  parseCsv,
  parseAmount,
  splitCsvLine,
  detectDelimiter,
  toIsoDate,
  cleanMerchant,
  guessCategory,
} from './csvImport'

describe('splitCsvLine', () => {
  it('splits a simple comma line', () => {
    expect(splitCsvLine('a,b,c', ',')).toEqual(['a', 'b', 'c'])
  })
  it('keeps the delimiter inside quoted fields', () => {
    expect(splitCsvLine('"NL12ABNA0123456789","EUR","1,5",end', ',')).toEqual([
      'NL12ABNA0123456789',
      'EUR',
      '1,5',
      'end',
    ])
  })
  it('unescapes doubled quotes', () => {
    expect(splitCsvLine('"zeg ""hoi""",x', ',')).toEqual(['zeg "hoi"', 'x'])
  })
})

describe('detectDelimiter', () => {
  it('picks the delimiter producing the most columns', () => {
    expect(detectDelimiter('a;b;c;d')).toBe(';')
    expect(detectDelimiter('a,b,c,d')).toBe(',')
    expect(detectDelimiter('a\tb\tc\td')).toBe('\t')
  })
})

describe('parseAmount', () => {
  it('parses NL decimal comma', () => {
    expect(parseAmount('-64,20')).toBe(-64.2)
  })
  it('parses thousands dot with decimal comma', () => {
    expect(parseAmount('1.234,56')).toBe(1234.56)
  })
  it('parses plain dot decimals', () => {
    expect(parseAmount('880.00')).toBe(880)
  })
})

describe('toIsoDate', () => {
  it('passes through ISO dates', () => {
    expect(toIsoDate('2026-07-03')).toBe('2026-07-03')
  })
  it('converts ABN AMRO YYYYMMDD', () => {
    expect(toIsoDate('20260703')).toBe('2026-07-03')
  })
  it('converts DD-MM-YYYY and DD/MM/YYYY', () => {
    expect(toIsoDate('03-07-2026')).toBe('2026-07-03')
    expect(toIsoDate('03/07/2026')).toBe('2026-07-03')
  })
  it('rejects non-dates', () => {
    expect(toIsoDate('EUR')).toBeNull()
  })
})

describe('cleanMerchant', () => {
  it('extracts the Betaalpas merchant', () => {
    expect(cleanMerchant('BEA, Betaalpas Albert Heijn 1376 AMS,PAS123')).toBe('Albert Heijn 1376 AMS')
  })
  it('extracts /NAME/ from SEPA descriptions', () => {
    expect(cleanMerchant('/TRTP/SEPA OVERBOEKING/IBAN/NL12/NAME/Bakkerij van Dijk/REMI/factuur')).toBe(
      'Bakkerij van Dijk',
    )
  })
})

describe('guessCategory', () => {
  it('positive amounts are client income', () => {
    expect(guessCategory('wat dan ook', 880)).toBe('Client income')
  })
  it('recognises supermarkets, subscriptions and transport', () => {
    expect(guessCategory('BEA, Betaalpas Albert Heijn', -12)).toBe('Groceries')
    expect(guessCategory('SEPA Incasso Spotify AB', -10.99)).toBe('Subscriptions')
    expect(guessCategory('NS GROEP OVpay reizen', -4.5)).toBe('Transport')
  })
  it('falls back to Uncategorized', () => {
    expect(guessCategory('volstrekt onbekend bedrijf', -5)).toBe('Uncategorized')
  })
})

describe('parseCsv', () => {
  it('parses a headerless comma-separated export (quoted description)', () => {
    const csv = [
      '"20260701","-64,20","BEA, Betaalpas Albert Heijn 1376,PAS123"',
      '"20260702","880,00","/TRTP/SEPA OVERBOEKING/NAME/Bakkerij van Dijk/REMI/factuur 2026-031"',
    ].join('\n')
    const txns = parseCsv(csv)
    expect(txns).toHaveLength(2)
    expect(txns[0]).toMatchObject({ date: '2026-07-01', amount: -64.2, category: 'Groceries' })
    expect(txns[0].merchant).toMatch(/Albert Heijn/)
    expect(txns[1]).toMatchObject({ date: '2026-07-02', amount: 880, category: 'Client income' })
  })

  // Documents current behavior, not necessarily desired behavior: on a
  // headerless row the amount heuristic takes the FIRST money-looking cell
  // that isn't the date. In a full ABN AMRO row (with start/endsaldo columns)
  // that can be the end balance instead of the transaction amount.
  it('headerless rows with saldo columns pick the first money-like cell', () => {
    const csv =
      '"NL12ABNA0123456789","EUR","20260701","20260701","1000,08","935,80","-64,20","BEA, Betaalpas Albert Heijn 1376,PAS123"'
    const txns = parseCsv(csv)
    expect(txns).toHaveLength(1)
    expect(txns[0].amount).toBe(935.8)
  })

  it('parses a semicolon export with Dutch headers', () => {
    const csv = ['Datum;Omschrijving;Bedrag', '03-07-2026;BEA Betaalpas Jumbo Eindhoven;-23,45'].join('\n')
    const txns = parseCsv(csv)
    expect(txns).toHaveLength(1)
    expect(txns[0]).toMatchObject({ date: '2026-07-03', amount: -23.45, category: 'Groceries' })
  })

  it('skips rows without a parsable amount and handles empty input', () => {
    expect(parseCsv('')).toEqual([])
    expect(parseCsv('just,some,text\nno,amount,here')).toEqual([])
  })
})

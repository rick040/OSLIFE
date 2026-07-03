import { describe, it, expect } from 'vitest'
import { eur, eur0, eurK } from './format'

// nl-NL uses '.' for thousands and ',' for decimals; Intl renders these with
// non-breaking variants in some runtimes, so normalise spaces before comparing.
const plain = (s: string) => s.replace(/ | /g, ' ')

describe('eur (2 decimals, sign before €)', () => {
  it('formats positive amounts', () => expect(plain(eur(64.2))).toBe('€64,20'))
  it('formats negative amounts with the sign before €', () => expect(plain(eur(-64.2))).toBe('-€64,20'))
  it('formats zero', () => expect(plain(eur(0))).toBe('€0,00'))
  it('formats thousands with nl-NL separators', () => expect(plain(eur(1234.5))).toBe('€1.234,50'))
})

describe('eur0 (0 decimals, nl-NL native sign placement)', () => {
  it('formats positive amounts', () => expect(plain(eur0(880))).toBe('€880'))
  it('rounds fractional amounts', () => expect(plain(eur0(1234.5))).toBe('€1.235'))
  it('formats negative amounts with the sign after €', () => expect(plain(eur0(-1234))).toBe('€-1.234'))
  it('formats zero', () => expect(plain(eur0(0))).toBe('€0'))
})

describe('eurK (abbreviated above a thousand)', () => {
  it('keeps small amounts unabbreviated', () => expect(plain(eurK(950))).toBe('€950'))
  it('abbreviates round thousands without a decimal', () => expect(plain(eurK(2000))).toBe('€2k'))
  it('abbreviates non-round thousands with one decimal', () => expect(plain(eurK(1500))).toBe('€1.5k'))
  it('abbreviates negative thousands', () => expect(plain(eurK(-1500))).toBe('€-1.5k'))
  it('formats zero', () => expect(plain(eurK(0))).toBe('€0'))
  it('renders a dash for null/undefined', () => {
    expect(eurK(null)).toBe('–')
    expect(eurK(undefined)).toBe('–')
  })
})

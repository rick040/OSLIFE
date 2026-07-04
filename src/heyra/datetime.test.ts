import { describe, it, expect } from 'vitest'
import { parseWhen } from './datetime'

describe('parseWhen — time', () => {
  it('parses "at 9 pm" as 21:00, not 09:00', () => {
    // Regression: the am/pm branch must run before the bare "at N" branch.
    expect(parseWhen('call client at 9 pm').time).toBe('21:00')
  })

  it('parses "9pm" as 21:00', () => {
    expect(parseWhen('bel om 9pm').time).toBe('21:00')
  })

  it('parses "om 9 uur" as 09:00', () => {
    expect(parseWhen('afspraak om 9 uur').time).toBe('09:00')
  })

  it('parses HH:MM directly', () => {
    expect(parseWhen('herinner me 14:30').time).toBe('14:30')
  })

  it('does not read a numeric date "12.07" as the time 12:07', () => {
    // Regression: the date phrase must be stripped before time matching.
    const r = parseWhen('bel jan 12.07')
    expect(r.date).not.toBeNull()
    expect(r.time).toBeNull()
  })
})

describe('parseWhen — date', () => {
  it('parses relative "morgen"', () => {
    expect(parseWhen('morgen bellen').date).not.toBeNull()
  })
})

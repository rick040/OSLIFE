import { describe, it, expect } from 'vitest'
import { vendorKey } from './categories'

describe('vendorKey', () => {
  it('collapses store/terminal numbers wherever they sit', () => {
    // Regression (M4): a mid-string store number used to survive into the key.
    expect(vendorKey('Albert Heijn 1234 EINDHOVEN')).toBe('albert heijn eindhoven')
    expect(vendorKey('ALBERT HEIJN 5678')).toBe('albert heijn')
    expect(vendorKey('Albert Heijn BV')).toBe('albert heijn')
  })

  it('strips bank/legal noise and punctuation', () => {
    expect(vendorKey('BEA, Betaalpas Spotify AB,PAS123')).toBe('spotify ab')
  })
})

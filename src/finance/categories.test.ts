import { describe, it, expect } from 'vitest'
import { vendorKey, isTransferCounterparty } from './categories'

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

describe('isTransferCounterparty', () => {
  it('matches "van Mierlo" regardless of initials/casing/spacing', () => {
    // Regression: money moved between Rick's own accounts kept landing as
    // "Client income" because the old regex required an "R." prefix — any
    // formatting variant without it (or a different initial, e.g. a joint
    // account) slipped through and inflated income totals.
    expect(isTransferCounterparty('R van Mierlo')).toBe(true)
    expect(isTransferCounterparty('R.J. VAN MIERLO')).toBe(true)
    expect(isTransferCounterparty('Van Mierlo R')).toBe(true)
    expect(isTransferCounterparty('/NAME/Van Mierlo/REMI/eigen rekening')).toBe(true)
  })

  it('matches generic own-account transfer wording even without a name', () => {
    expect(isTransferCounterparty('Overboeking naar eigen rekening')).toBe(true)
    expect(isTransferCounterparty('Overboeking naar uzelf')).toBe(true)
  })

  it('does not match unrelated counterparties', () => {
    expect(isTransferCounterparty('Albert Heijn')).toBe(false)
    expect(isTransferCounterparty('')).toBe(false)
    expect(isTransferCounterparty(null)).toBe(false)
  })
})

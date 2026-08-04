import { describe, it, expect } from 'vitest'
import { vendorKey, isTransferCounterparty, isTransferIban } from './categories'

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
  it('matches the initial-form "R van Mierlo" ABN uses for its own transfers', () => {
    expect(isTransferCounterparty('R van Mierlo')).toBe(true)
    expect(isTransferCounterparty('R VAN MIERLO')).toBe(true)
    expect(isTransferCounterparty('R. van Mierlo')).toBe(true)
    expect(isTransferCounterparty('/NAME/R van Mierlo/REMI/eigen rekening')).toBe(true)
  })

  it('does NOT match Rick\'s full name — that\'s real KNAB business income, not a transfer', () => {
    // Regression: Rick's KNAB business account pays him under his full name
    // ("Rick van Mierlo"), which shares a surname with his own-account
    // transfers ("R VAN MIERLO") but must stay categorised as Client income.
    // A broader "van mierlo" match (an earlier version of this regex) swept
    // real income into Internal transfer just because of the shared surname.
    expect(isTransferCounterparty('Rick van Mierlo')).toBe(false)
    expect(isTransferCounterparty('Rick van Mierlo B.V.')).toBe(false)
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

describe('isTransferIban', () => {
  it('matches Rick\'s own ABN checking/savings IBANs, spaced or unspaced', () => {
    expect(isTransferIban('NL36 ABNA 0574 8561 53')).toBe(true)
    expect(isTransferIban('NL62ABNA0468064117')).toBe(true)
    expect(isTransferIban('/TRTP/SEPA OVERBOEKING/IBAN/NL62ABNA0468064117/NAME/R van Mierlo/')).toBe(true)
  })

  it('does NOT match the KNAB business account — that income is real, not a transfer', () => {
    expect(isTransferIban('NL62 KNAB 0606 8007 19')).toBe(false)
    expect(isTransferIban('/TRTP/SEPA OVERBOEKING/IBAN/NL62KNAB0606800719/NAME/Rick van Mierlo/')).toBe(false)
  })

  it('does not match unrelated or absent IBANs', () => {
    expect(isTransferIban('Albert Heijn 1234 Eindhoven')).toBe(false)
    expect(isTransferIban('')).toBe(false)
    expect(isTransferIban(null)).toBe(false)
  })
})

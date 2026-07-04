import { describe, it, expect } from 'vitest'
import { deriveGmailMessages } from './gmailInbox'
import type { Client, EmailItem } from '../../types'

const client = (patch: Partial<Client>): Client => ({
  id: 'c1', name: 'Studio X', domain: 'prjct', clientStatus: 'Active', ...patch,
})

const email = (patch: Partial<EmailItem>): EmailItem => ({
  id: 'e1', from: 'someone@example.com', subject: 'Hi', snippet: '...',
  receivedAt: '2026-07-01T10:00:00Z', unread: true, important: false, domain: 'prjct', ...patch,
})

describe('deriveGmailMessages matching', () => {
  it('matches by exact client email', () => {
    const out = deriveGmailMessages([email({ from: 'Jan <jan@studio-x.nl>' })], [client({ email: 'jan@studio-x.nl' })])
    expect(out).toHaveLength(1)
    expect(out[0].clientId).toBe('c1')
    expect(out[0].channel).toBe('email')
  })

  it('matches by client email domain even when the address differs', () => {
    const out = deriveGmailMessages([email({ from: 'anna@studio-x.nl' })], [client({ email: 'jan@studio-x.nl' })])
    expect(out).toHaveLength(1)
    expect(out[0].clientId).toBe('c1')
  })

  it('matches by website domain', () => {
    const out = deriveGmailMessages([email({ from: 'info@studio-x.nl' })], [client({ website: 'https://www.studio-x.nl/contact' })])
    expect(out).toHaveLength(1)
    expect(out[0].clientId).toBe('c1')
  })

  it('matches by sender display name', () => {
    const out = deriveGmailMessages([email({ from: 'Studio X <hello@gmail.com>' })], [client({})])
    expect(out).toHaveLength(1)
    expect(out[0].clientId).toBe('c1')
  })

  it('does NOT match on a generic provider domain', () => {
    // sender on gmail.com must not match a client whose email is also on gmail.com
    const out = deriveGmailMessages(
      [email({ from: 'stranger@gmail.com' })],
      [client({ email: 'someclient@gmail.com', name: 'Zzq' })],
    )
    expect(out).toHaveLength(0)
  })

  it('classifies Fiverr-labelled mail as the fiverr channel', () => {
    const out = deriveGmailMessages([email({ from: 'no-reply@fiverr.com', labels: ['Fiverr'] })], [])
    expect(out).toHaveLength(1)
    expect(out[0].channel).toBe('fiverr')
    expect(out[0].clientId).toBeNull()
  })

  it('skips mail that resolves to neither a client nor Fiverr', () => {
    const out = deriveGmailMessages([email({ from: 'newsletter@random-news.com' })], [client({ email: 'jan@studio-x.nl' })])
    expect(out).toHaveLength(0)
  })
})

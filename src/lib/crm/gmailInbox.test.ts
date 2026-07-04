import { describe, it, expect } from 'vitest'
import { deriveGmailMessages, buildMatcher, PRJCT_LABEL, FIVERR_LABEL } from './gmailInbox'
import type { Client, EmailItem, Project } from '../../types'

const client = (patch: Partial<Client>): Client => ({
  id: 'c1', name: 'Studio X', domain: 'prjct', clientStatus: 'Active', ...patch,
})

const project = (patch: Partial<Project>): Project => ({
  id: 'p1', name: 'Website', client: '', clientId: null, domain: 'prjct',
  status: 'active', deadline: null, progress: 0, value: 0, type: [], ...patch,
})

const email = (patch: Partial<EmailItem>): EmailItem => ({
  id: 'e1', from: 'someone@example.com', subject: 'Hi', snippet: '...',
  receivedAt: '2026-07-01T10:00:00Z', unread: true, important: false, domain: 'prjct', ...patch,
})

describe('deriveGmailMessages — inclusion', () => {
  it('includes PRJCT-labelled mail even with no client match, grouped by sender', () => {
    const out = deriveGmailMessages([email({ from: 'New Lead <lead@unknown.co>', labels: [PRJCT_LABEL] })], [])
    expect(out).toHaveLength(1)
    expect(out[0].channel).toBe('email')
    expect(out[0].clientId).toBeNull()
    expect(out[0].contactKey).toBe('email:lead@unknown.co')
  })

  it('classifies fiverr-logged mail as the fiverr channel', () => {
    const out = deriveGmailMessages([email({ from: 'no-reply@fiverr.com', labels: [FIVERR_LABEL] })], [])
    expect(out).toHaveLength(1)
    expect(out[0].channel).toBe('fiverr')
  })

  it('includes unlabelled mail only on a STRONG (email/domain) match', () => {
    const clients = [client({ email: 'jan@studio-x.nl' })]
    // strong: exact email — included
    expect(deriveGmailMessages([email({ from: 'jan@studio-x.nl' })], clients)).toHaveLength(1)
    // strong: same domain — included
    expect(deriveGmailMessages([email({ from: 'anna@studio-x.nl' })], clients)).toHaveLength(1)
    // weak only (name), unlabelled — excluded to avoid noise
    expect(deriveGmailMessages([email({ from: 'Studio X <hi@gmail.com>' })], clients)).toHaveLength(0)
  })

  it('does NOT include on a generic provider domain', () => {
    const out = deriveGmailMessages(
      [email({ from: 'stranger@gmail.com' })],
      [client({ email: 'someclient@gmail.com', name: 'Zzq' })],
    )
    expect(out).toHaveLength(0)
  })

  it('skips unlabelled mail that matches no client', () => {
    const out = deriveGmailMessages([email({ from: 'newsletter@random-news.com' })], [client({ email: 'jan@studio-x.nl' })])
    expect(out).toHaveLength(0)
  })
})

describe('deriveGmailMessages — attribution', () => {
  it('attributes a labelled mail to a client by sender name (weak allowed when labelled)', () => {
    const out = deriveGmailMessages([email({ from: 'Studio X <hi@gmail.com>', labels: [PRJCT_LABEL] })], [client({})])
    expect(out).toHaveLength(1)
    expect(out[0].clientId).toBe('c1')
    expect(out[0].contact).toBe('Studio X')
  })

  it('attributes a labelled Fiverr mail to a client named in the subject', () => {
    const out = deriveGmailMessages(
      [email({ from: 'no-reply@fiverr.com', subject: 'New message from studio x', labels: [FIVERR_LABEL] })],
      [client({})],
    )
    expect(out).toHaveLength(1)
    expect(out[0].clientId).toBe('c1')
  })

  it('attaches the client’s primary (active) project', () => {
    const clients = [client({ email: 'jan@studio-x.nl' })]
    const projects = [project({ id: 'pOld', name: 'Old', clientId: 'c1', status: 'done' }), project({ id: 'pNew', name: 'Rebrand', clientId: 'c1', status: 'active' })]
    const out = deriveGmailMessages([email({ from: 'jan@studio-x.nl' })], clients, projects)
    expect(out[0].projectId).toBe('pNew')
    expect(out[0].projectName).toBe('Rebrand')
  })

  it('links project by name-in-project-name when there is no client relation', () => {
    const clients = [client({ email: 'jan@studio-x.nl' })]
    const projects = [project({ id: 'pF', name: 'Logo design - studio x', clientId: null })]
    const out = deriveGmailMessages([email({ from: 'jan@studio-x.nl' })], clients, projects)
    expect(out[0].projectId).toBe('pF')
  })
})

describe('deriveGmailMessages — learned aliases (Notion-free)', () => {
  it('matches an unlabelled sender via a learned email alias', () => {
    const clients = [client({ email: null, aliases: ['jan@studio-x.nl'] })]
    const out = deriveGmailMessages([email({ from: 'jan@studio-x.nl' })], clients)
    expect(out).toHaveLength(1)
    expect(out[0].clientId).toBe('c1')
  })

  it('matches any address at a learned company domain alias', () => {
    const clients = [client({ email: null, aliases: ['studio-x.nl'] })]
    const out = deriveGmailMessages([email({ from: 'anyone@studio-x.nl' })], clients)
    expect(out).toHaveLength(1)
    expect(out[0].clientId).toBe('c1')
  })
})

describe('buildMatcher', () => {
  it('exposes strong/weak/projectFor', () => {
    const m = buildMatcher([client({ email: 'jan@studio-x.nl' })], [project({ clientId: 'c1' })])
    expect(m.strong('jan@studio-x.nl')?.id).toBe('c1')
    expect(m.strong('nobody@gmail.com')).toBeNull()
    expect(m.weak('Studio X', '')?.id).toBe('c1')
    expect(m.projectFor('c1')?.id).toBe('p1')
  })

  it('weak match requires a shared whole token, not a substring', () => {
    // Regression (M13): "denmark" must not match a client keyed "mark".
    const m = buildMatcher([client({ id: 'cm', name: 'Mark' })], [])
    expect(m.weak('Denmark Tourism', '')).toBeNull()
    expect(m.weak('Mark Jansen', '')?.id).toBe('cm')
  })
})

import { describe, it, expect } from 'vitest'
import { classifyImportance, emailTags } from './emailClassify'
import type { EmailItem } from '../../types'

const email = (patch: Partial<EmailItem>): EmailItem => ({
  id: 'e', from: 'a@b.com', subject: '', snippet: '', receivedAt: '2026-07-01T10:00:00Z',
  unread: true, important: false, domain: 'personal', labels: [], ...patch,
})

describe('classifyImportance', () => {
  it('demotes social/marketing bulk senders to low, even when PRJCT-labelled', () => {
    expect(classifyImportance(email({ from: 'Facebook <reminders@facebookmail.com>', subject: 'Je hebt 15 meldingen', labels: ['Rick - PRJCT Agency'] }))).toBe('low')
    expect(classifyImportance(email({ from: 'Instagram <posts-recaps@mail.instagram.com>', labels: ['Rick - PRJCT Agency'] }))).toBe('low')
    expect(classifyImportance(email({ from: 'Whoppah <newsletter@mail.whoppah.com>', labels: ['Rick - PRJCT Agency'] }))).toBe('low')
    expect(classifyImportance(email({ from: 'Meta for Business <advertise-noreply@global.metamail.com>', labels: ['Rick - PRJCT Agency'] }))).toBe('low')
  })

  it('keeps Fiverr client pings high', () => {
    expect(classifyImportance(email({ from: 'Fiverr <noreply@e.fiverr.com>', subject: "You've got new messages", labels: ['Rick - PRJCT Agency', 'fiverr-logged'] }))).toBe('high')
  })

  it('promotes real reply threads', () => {
    expect(classifyImportance(email({ from: 'Marina Meens <marina@zhb.nl>', subject: 'Re: Signage P+R Schiedam', labels: ['Rick - PRJCT Agency'] }))).toBe('high')
  })

  it('promotes invoices / money-trouble mail', () => {
    expect(classifyImportance(email({ from: 'Youfone <betalen@info.youfone.nl>', subject: 'Mislukte incasso', labels: ['💵 Betalen'] }))).toBe('high')
    expect(classifyImportance(email({ from: 'ParkingYou <olaf@parkingyou.nl>', subject: 'FW: Openstaande factuur', labels: ['🅿️ ParkingYou'] }))).toBe('high')
    expect(classifyImportance(email({ from: 'Coeo <info@coeo-incasso.nl>', subject: 'Aanmaning 98572560 inzake Odido' }))).toBe('high')
  })

  it('leaves order confirmations / receipts as med (not high)', () => {
    expect(classifyImportance(email({ from: 'POL Heteren BV <info@pol.nl>', subject: 'Bevestiging van uw bestelling 000025436' }))).toBe('med')
    expect(classifyImportance(email({ from: 'Iemand <iemand@bedrijf.nl>', subject: 'Vraagje over de planning' }))).toBe('med')
  })

  it('demotes e-commerce/receipt no-reply senders to low', () => {
    expect(classifyImportance(email({ from: 'Google Play <googleplay-noreply@google.com>', subject: 'De bevestiging van je Google Play-bestelling', labels: ['💵 Betalen'] }))).toBe('low')
    expect(classifyImportance(email({ from: 'PostNL <notificatie@edm.postnl.nl>', subject: 'Afgeleverd: je pakket' }))).toBe('low')
  })

  it('separates Fiverr client messages from Fiverr marketing', () => {
    expect(classifyImportance(email({ from: 'Fiverr <noreply@e.fiverr.com>', subject: "You've got new messages from suzanne_qxd", labels: ['fiverr-logged'] }))).toBe('high')
    expect(classifyImportance(email({ from: 'Fiverr <noreply@e.fiverr.com>', subject: 'A recap of your Fiverr Ads monthly activity' }))).toBe('low')
  })
})

describe('emailTags', () => {
  it('maps labels to domain tags', () => {
    expect(emailTags(email({ labels: ['🅿️ ParkingYou'] })).map((t) => t.key)).toEqual(['parkingyou'])
    expect(emailTags(email({ labels: ['Rick - PRJCT Agency'] })).map((t) => t.key)).toEqual(['prjct'])
    expect(emailTags(email({ labels: ['fiverr-logged', 'Rick - PRJCT Agency'] })).map((t) => t.key)).toEqual(['fiverr', 'prjct'])
    expect(emailTags(email({ labels: ['💵 Betalen', '💵 Betalen/Gelogd'] })).map((t) => t.key)).toEqual(['finance'])
  })

  it('falls back to Persoonlijk when unlabelled', () => {
    expect(emailTags(email({ labels: [] })).map((t) => t.key)).toEqual(['personal'])
  })
})

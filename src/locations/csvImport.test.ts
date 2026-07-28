import { describe, it, expect } from 'vitest'
import { parseGeofenceCsv } from './csvImport'

const HEADER = 'Datum / Tijd,Locatie,Status,Duur (Verblijf)'

describe('parseGeofenceCsv', () => {
  it('merges consecutive Inside triggers for the same place into one open session', () => {
    const csv = [
      HEADER,
      '28-07-2026 15:52:51,Huis,Outside,',
      '28-07-2026 18:38:01,Huis,Inside,',
      '28-07-2026 21:49:19,Huis,Inside,',
      '28-07-2026 22:33:51,Huis,Inside,',
    ].join('\n')

    const visits = parseGeofenceCsv(csv)

    expect(visits).toHaveLength(1)
    expect(visits[0]).toMatchObject({ placeName: 'Huis', leftAt: null })
    expect(visits[0].enteredAt).toBe(new Date(2026, 6, 28, 18, 38, 1).toISOString())
  })

  it('closes a session on the matching Outside trigger', () => {
    const csv = [
      HEADER,
      '24-07-2026 11:31:34,Huis,Outside,',
      '24-07-2026 11:33:49,Huis,Inside,00:27:04',
      '24-07-2026 12:00:54,Huis,Outside,',
    ].join('\n')

    const visits = parseGeofenceCsv(csv)

    expect(visits).toHaveLength(1)
    expect(visits[0].enteredAt).toBe(new Date(2026, 6, 24, 11, 33, 49).toISOString())
    expect(visits[0].leftAt).toBe(new Date(2026, 6, 24, 12, 0, 54).toISOString())
  })

  it('reopens a session when a same-place exit + re-entry happens within the grace window (GPS jitter)', () => {
    const csv = [
      HEADER,
      '25-07-2026 00:23:05,Huis,Inside,',
      '25-07-2026 10:36:16,Huis,Outside,',
      '25-07-2026 10:45:22,Huis,Inside,', // 9m06s later — within GRACE_MINUTES
      '25-07-2026 11:16:47,Huis,Outside,',
    ].join('\n')

    const visits = parseGeofenceCsv(csv)

    expect(visits).toHaveLength(1)
    expect(visits[0].enteredAt).toBe(new Date(2026, 6, 25, 0, 23, 5).toISOString())
    expect(visits[0].leftAt).toBe(new Date(2026, 6, 25, 11, 16, 47).toISOString())
  })

  it('starts a new session when the gap exceeds the grace window', () => {
    const csv = [
      HEADER,
      '25-07-2026 00:23:05,Huis,Inside,',
      '25-07-2026 10:36:16,Huis,Outside,',
      '25-07-2026 10:50:16,Huis,Inside,', // 14 minutes later — beyond GRACE_MINUTES
      '25-07-2026 11:16:47,Huis,Outside,',
    ].join('\n')

    const visits = parseGeofenceCsv(csv)

    expect(visits).toHaveLength(2)
    expect(visits[0].leftAt).toBe(new Date(2026, 6, 25, 10, 36, 16).toISOString())
    expect(visits[1].enteredAt).toBe(new Date(2026, 6, 25, 10, 50, 16).toISOString())
  })

  it('keeps sessions for different places independent', () => {
    const csv = [
      HEADER,
      '25-07-2026 10:36:15,Albert Heijn 1,Inside,',
      '25-07-2026 10:36:16,Huis,Outside,',
      '25-07-2026 10:45:22,Huis,Inside,',
      '25-07-2026 10:45:22,Albert Heijn 1,Outside,',
    ].join('\n')

    const visits = parseGeofenceCsv(csv)

    expect(visits).toHaveLength(2)
    const ah = visits.find((v) => v.placeName === 'Albert Heijn 1')
    expect(ah?.leftAt).toBe(new Date(2026, 6, 25, 10, 45, 22).toISOString())
  })

  it('ignores an Outside trigger with no open session', () => {
    const csv = [HEADER, '24-07-2026 12:00:54,Huis,Outside,'].join('\n')
    expect(parseGeofenceCsv(csv)).toHaveLength(0)
  })
})

import { describe, it, expect } from 'vitest'
import { suggestTodayBlocks, toMin, toHHMM, type BlockSuggestionContext } from './blockSuggestions'

function baseCtx(overrides: Partial<BlockSuggestionContext> = {}): BlockSuggestionContext {
  return {
    nowMinutes: toMin('08:00'),
    busy: [],
    todaysBlockTitles: [],
    habitsOpen: [],
    dogDue: [],
    overduePayments: [],
    unreadImportantMailCount: 0,
    focusTasks: [],
    clientsNeedingFollowUp: [],
    nextMilestone: null,
    sleepHours: null,
    ...overrides,
  }
}

describe('toMin / toHHMM', () => {
  it('round-trip', () => {
    expect(toMin('09:30')).toBe(570)
    expect(toHHMM(570)).toBe('09:30')
  })
})

describe('suggestTodayBlocks', () => {
  it('suggests nothing on a genuinely clear day', () => {
    expect(suggestTodayBlocks(baseCtx())).toEqual([])
  })

  it('proposes a money block for overdue payments', () => {
    const out = suggestTodayBlocks(baseCtx({ overduePayments: [{ domain: 'buurtkaart' }] }))
    expect(out).toHaveLength(1)
    expect(out[0].title).toContain('Betalingen')
    expect(out[0].domain).toBe('buurtkaart')
  })

  it('skips the money suggestion when a block today already covers it', () => {
    const out = suggestTodayBlocks(
      baseCtx({ overduePayments: [{ domain: 'buurtkaart' }], todaysBlockTitles: ['betalingen afhandelen'] }),
    )
    expect(out).toEqual([])
  })

  it('proposes one block per open habit, carrying its own emoji/name', () => {
    const out = suggestTodayBlocks(
      baseCtx({
        habitsOpen: [
          { id: 'h1', name: 'Mediteren', emoji: '🧘', streak: 4 },
          { id: 'h2', name: 'Lezen', emoji: '📖', streak: 0 },
        ],
      }),
    )
    expect(out.map((s) => s.title)).toEqual(expect.arrayContaining(['🧘 Mediteren', '📖 Lezen']))
  })

  // Regression: a habit used to always be proposed at "right now" — so
  // checking at 08:00 in the morning, a bedtime-named habit ("voor
  // middernacht naar bed") got suggested at 08:00 too, the same as any other
  // open habit, instead of near the end of the day.
  it('proposes an evening/bedtime-named habit late in the day even when checked in the morning', () => {
    const out = suggestTodayBlocks(
      baseCtx({
        nowMinutes: toMin('08:00'),
        habitsOpen: [{ id: 'h1', name: 'Voor middernacht naar bed', emoji: '🛏️', streak: 2 }],
      }),
    )
    expect(out).toHaveLength(1)
    expect(toMin(out[0].start)).toBeGreaterThanOrEqual(toMin('18:00'))
  })

  it('skips a dog reminder already covered by an existing walk block', () => {
    const out = suggestTodayBlocks(
      baseCtx({
        dogDue: [{ id: 'd1', title: 'Avondwandeling' }],
        todaysBlockTitles: ['wandeling met kyra'],
      }),
    )
    expect(out).toEqual([])
  })

  it('proposes a dog reminder block when nothing today covers it', () => {
    const out = suggestTodayBlocks(baseCtx({ dogDue: [{ id: 'd1', title: 'Vet-afspraak' }] }))
    expect(out).toHaveLength(1)
    expect(out[0].title).toBe('🐾 Vet-afspraak')
  })

  it('proposes a short-sleep rest block only when sleep was actually short', () => {
    expect(suggestTodayBlocks(baseCtx({ sleepHours: 5.5 }))[0]?.title).toContain('rust')
    expect(suggestTodayBlocks(baseCtx({ sleepHours: 7.5 }))).toEqual([])
    expect(suggestTodayBlocks(baseCtx({ sleepHours: null }))).toEqual([])
  })

  it('never overlaps an existing busy block', () => {
    const out = suggestTodayBlocks(
      baseCtx({
        busy: [[toMin('08:00'), toMin('23:59')]], // day fully booked
        overduePayments: [{ domain: 'personal' }],
      }),
    )
    expect(out).toEqual([])
  })

  it('places suggestions back-to-back without colliding with each other', () => {
    const out = suggestTodayBlocks(
      baseCtx({
        overduePayments: [{ domain: 'personal' }],
        unreadImportantMailCount: 2,
        habitsOpen: [{ id: 'h1', name: 'Stretchen', emoji: '🤸', streak: 1 }],
      }),
    )
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i]
        const b = out[j]
        const overlap = toMin(a.start) < toMin(b.end) && toMin(b.start) < toMin(a.end)
        expect(overlap).toBe(false)
      }
    }
  })

  it('still proposes blocks late in the evening instead of going silent', () => {
    // Regression: DAY_END used to cut off at 22:00, so a 22:48 check-in with
    // plenty pending (overdue payment, unread mail) got zero suggestions.
    const out = suggestTodayBlocks(
      baseCtx({
        nowMinutes: toMin('22:48'),
        overduePayments: [{ domain: 'personal' }],
        unreadImportantMailCount: 3,
      }),
    )
    expect(out.length).toBeGreaterThan(0)
    for (const s of out) expect(toMin(s.start)).toBeGreaterThanOrEqual(toMin('22:48'))
  })

  it('caps the number of suggestions at `max`', () => {
    const out = suggestTodayBlocks(
      baseCtx({
        overduePayments: [{ domain: 'personal' }],
        unreadImportantMailCount: 1,
        habitsOpen: [
          { id: 'h1', name: 'A', emoji: '✅', streak: 0 },
          { id: 'h2', name: 'B', emoji: '✅', streak: 0 },
        ],
        dogDue: [{ id: 'd1', title: 'Wandeling' }],
        clientsNeedingFollowUp: [{ id: 'c1', name: 'Acme', domain: 'prjct' }],
      }),
      2,
    )
    expect(out).toHaveLength(2)
  })
})

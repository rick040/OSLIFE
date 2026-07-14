import { describe, it, expect, vi } from 'vitest'
import { assembleContext, renderContext } from './context'
import type { Thread, Goal, Block, MemoryHit } from '../types'
import type { LearnedFact } from './learning'

const facts: LearnedFact[] = [{ id: 'f1', text: 'ParkingYou draait op abonnementen', category: 'context', createdAt: '2026-07-01' }]
const threads: Thread[] = [
  { id: 't1', domain: 'prjct', title: 'Factuur sturen', owedTo: 'klant X', due: '2026-07-10', status: 'open', createdAt: '2026-07-01' },
  { id: 't2', domain: 'personal', title: 'Afgesloten', owedTo: 'self', due: null, status: 'closed', createdAt: '2026-07-01' },
]
const goals: Goal[] = [{ id: 'g1', title: '€10k/maand', metric: 'EUR', target: 10000, current: 6000, deadline: '2026-12-31', domain: 'cross' }]
const blocks: Block[] = [{ id: 'b1', title: 'Diep werk', domain: 'prjct', start: '09:00', end: '11:00', status: 'planned', rationale: '' }]

describe('assembleContext', () => {
  it('loads always-on slices and only open loops', async () => {
    const search = vi.fn(async () => [] as MemoryHit[])
    const ctx = await assembleContext('hoe staat het met klant X?', { learnedFacts: facts, threads, goals, blocks }, search)
    expect(ctx.facts).toEqual(['ParkingYou draait op abonnementen'])
    expect(ctx.openLoops).toHaveLength(1) // closed thread excluded
    expect(ctx.openLoops[0]).toContain('Factuur sturen')
    expect(ctx.goals[0]).toContain('6000/10000 EUR')
    expect(ctx.today).toEqual(['09:00 Diep werk'])
    expect(search).toHaveBeenCalledWith('hoe staat het met klant X?', 6)
  })

  it('skips recall on an empty message', async () => {
    const search = vi.fn(async () => [] as MemoryHit[])
    const ctx = await assembleContext('   ', { learnedFacts: facts, threads, goals, blocks }, search)
    expect(search).not.toHaveBeenCalled()
    expect(ctx.recall).toEqual([])
  })

  it('renderContext omits empty sections', () => {
    const rendered = renderContext({ facts: ['x'], openLoops: [], goals: [], today: [], recall: [] })
    expect(rendered).toContain('# Wat ik over je weet')
    expect(rendered).not.toContain('# Open loops')
  })
})

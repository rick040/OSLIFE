import { describe, it, expect, vi, beforeEach } from 'vitest'
import { followUpSuggestions, actionFollowUpSuggestion, brainFollowUps, type HeyraContext } from './suggestions'
import { askBrain } from './brainClient'

vi.mock('./brainClient', () => ({ askBrain: vi.fn() }))
const mockAskBrain = vi.mocked(askBrain)

function ctx(partial: Partial<HeyraContext> = {}): HeyraContext {
  return {
    projects: [], threads: [], payments: [], emails: [], habits: [],
    dogReminders: [], clients: [], checkins: [], goals: [], milestones: [],
    ...partial,
  }
}

describe('followUpSuggestions — repeat deprioritization', () => {
  const moneyCtx = ctx({ payments: [{ id: 'p1', payee: 'Iemand', amount: 100, direction: 'incoming', status: 'open', due: null, domain: 'prjct' } as any] })

  it('ranks the highest-scoring candidate first when nothing was recently shown', () => {
    const result = followUpSuggestions('money', moneyCtx)
    expect(result[0]).toBe('Welke facturen zijn nog niet betaald?')
  })

  it('deprioritizes (but does not remove) a chip that was shown recently', () => {
    const result = followUpSuggestions('money', moneyCtx, undefined, ['Welke facturen zijn nog niet betaald?'])
    expect(result[0]).toBe('Hoeveel heb ik deze maand uitgegeven?')
    expect(result).toContain('Welke facturen zijn nog niet betaald?')
    expect(result.indexOf('Welke facturen zijn nog niet betaald?')).toBe(result.length - 1)
  })
})

describe('actionFollowUpSuggestion', () => {
  it('returns a kind-specific follow-up', () => {
    expect(actionFollowUpSuggestion('mark_invoice_paid')).toBe('Nog een factuur bijwerken?')
    expect(actionFollowUpSuggestion('create_task')).toBe('Nog een taak toevoegen?')
  })

  it('substitutes the entity label when the template uses one', () => {
    expect(actionFollowUpSuggestion('update_project_status', 'Buurtkaart')).toBe('Wat is de volgende stap voor Buurtkaart?')
    expect(actionFollowUpSuggestion('update_project_status', null)).toBe('Wat is de volgende stap?')
  })

  it('returns null for a kind with no natural next step', () => {
    expect(actionFollowUpSuggestion('search_result')).toBeNull()
    expect(actionFollowUpSuggestion('chart')).toBeNull()
  })
})

describe('brainFollowUps', () => {
  beforeEach(() => {
    mockAskBrain.mockReset()
  })

  it('returns null when the brain is unavailable', async () => {
    mockAskBrain.mockResolvedValue(null)
    const result = await brainFollowUps('wat staat er open', 'niets, alles is afgerond')
    expect(result).toBeNull()
  })

  it('returns null on a malformed (non-JSON) brain response', async () => {
    mockAskBrain.mockResolvedValue('gewoon platte tekst, geen json')
    const result = await brainFollowUps('wat staat er open', 'niets, alles is afgerond')
    expect(result).toBeNull()
  })

  it('parses grounded suggestions out of a fenced json response', async () => {
    mockAskBrain.mockResolvedValue('```json\n{"suggestions":["Wil je die 3 facturen nu markeren?","Nog iets anders bekijken?"]}\n```')
    const result = await brainFollowUps('welke facturen staan open', 'Er staan 3 facturen open bij Buurtkaart.')
    expect(result).toEqual(['Wil je die 3 facturen nu markeren?', 'Nog iets anders bekijken?'])
  })

  it('drops non-string or empty entries and caps at 3', async () => {
    mockAskBrain.mockResolvedValue('```json\n{"suggestions":["a","","  ","b",42,"c","d"]}\n```')
    const result = await brainFollowUps('x', 'y')
    expect(result).toEqual(['a', 'b', 'c'])
  })

  it('returns an empty array when the brain genuinely has nothing to add', async () => {
    mockAskBrain.mockResolvedValue('```json\n{"suggestions":[]}\n```')
    const result = await brainFollowUps('x', 'y')
    expect(result).toEqual([])
  })
})

import { describe, it, expect } from 'vitest'
import { followUpSuggestions, actionFollowUpSuggestion, type HeyraContext } from './suggestions'

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

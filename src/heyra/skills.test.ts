import { describe, it, expect } from 'vitest'
import { detectSkill, isOpenLoopQuery } from './skills'

describe('detectSkill — trigger word boundaries', () => {
  it('does not fire the "bel " task trigger inside "tabel"', () => {
    // No imperative-verb start, no chart trigger — the only thing that could
    // route this to 'task' is a spurious "bel " match inside "tabel".
    expect(detectSkill('ik wil een tabel van mijn uitgaven').skill).not.toBe('task')
  })

  it('does not fire the "mail " task trigger inside "email"', () => {
    expect(detectSkill('lees mijn laatste email voor').skill).not.toBe('task')
  })

  it('still routes a real "bel " instruction to task', () => {
    expect(detectSkill('bel de klant morgen').skill).toBe('task')
  })

  it('still routes an explicit reminder to task', () => {
    expect(detectSkill('herinner me aan de deadline vrijdag').skill).toBe('task')
  })
})

describe('detectSkill — business idea pitches route to Strategie HQ', () => {
  it('routes an explicit "nieuw idee" pitch to idea', () => {
    expect(detectSkill('nieuw idee: een abonnement voor hondenoppas in Geldrop').skill).toBe('idea')
  })

  it('routes a "wat als we" brainstorm opener to idea', () => {
    expect(detectSkill('wat als we een tweede Buurtkaart voor Eindhoven starten').skill).toBe('idea')
  })

  it('does not fire on an ordinary task', () => {
    expect(detectSkill('bel de klant morgen').skill).not.toBe('idea')
  })
})

describe('isOpenLoopQuery — phrase-level, not bare "klant"/"staat" substrings', () => {
  it('does not fire on a plain client question', () => {
    expect(isOpenLoopQuery('Hoe gaat het met de klant van gisteren?')).toBe(false)
  })

  it('does not fire on words that merely contain "staat"', () => {
    expect(isOpenLoopQuery('Wat is de achterstand op dit contract?')).toBe(false)
    expect(isOpenLoopQuery('Wat staat er in dit contract?')).toBe(false)
  })

  it('still fires on a real open-loop question', () => {
    expect(isOpenLoopQuery('Wat staat er nog open?')).toBe(true)
    expect(isOpenLoopQuery('Wat moet ik nog doen deze week?')).toBe(true)
    expect(isOpenLoopQuery('Laat mijn open loops zien')).toBe(true)
  })
})

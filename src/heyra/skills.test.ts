import { describe, it, expect } from 'vitest'
import { detectSkill } from './skills'

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

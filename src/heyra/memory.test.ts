import { describe, it, expect } from 'vitest'
import { emptyMemory, rememberSuggestions } from './memory'

describe('rememberSuggestions', () => {
  it('adds shown chips to recentSuggestions', () => {
    const mem = rememberSuggestions(emptyMemory(), ['a', 'b'])
    expect(mem.recentSuggestions).toEqual(['a', 'b'])
  })

  it('moves a repeated chip to the end instead of duplicating it', () => {
    let mem = rememberSuggestions(emptyMemory(), ['a', 'b'])
    mem = rememberSuggestions(mem, ['a', 'c'])
    expect(mem.recentSuggestions).toEqual(['b', 'a', 'c'])
  })

  it('caps at the most recent 12 entries', () => {
    let mem = emptyMemory()
    for (let i = 0; i < 20; i++) mem = rememberSuggestions(mem, [`chip-${i}`])
    expect(mem.recentSuggestions).toHaveLength(12)
    expect(mem.recentSuggestions[11]).toBe('chip-19')
    expect(mem.recentSuggestions).not.toContain('chip-0')
  })

  it('is a no-op for an empty list', () => {
    const mem = rememberSuggestions(emptyMemory(), [])
    expect(mem.recentSuggestions).toEqual([])
  })
})

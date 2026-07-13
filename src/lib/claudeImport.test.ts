import { describe, it, expect } from 'vitest'
import { parseClaudeExport } from './claudeImport'

describe('parseClaudeExport — export shapes', () => {
  it('reads the old text-string message shape', () => {
    const raw = [
      {
        uuid: 'c1',
        name: 'Reisplan Japan',
        created_at: '2025-01-02T10:00:00Z',
        updated_at: '2025-01-02T10:05:00Z',
        chat_messages: [
          { sender: 'human', text: 'Wat is een goede route door Japan?' },
          { sender: 'assistant', text: 'Begin in Tokio, dan Kyoto...' },
        ],
      },
    ]
    const [rec] = parseClaudeExport(raw)
    expect(rec.conversationId).toBe('c1')
    expect(rec.title).toBe('Reisplan Japan')
    expect(rec.messageCount).toBe(2)
    expect(rec.markdown).toContain('# Reisplan Japan')
    expect(rec.markdown).toContain('**Jij:**')
    expect(rec.markdown).toContain('**Claude:**')
    expect(rec.markdown).toContain('Begin in Tokio')
    expect(rec.tags).toContain('claude')
    expect(rec.summary).toContain('Reisplan Japan')
  })

  it('reads the newer content[]-block message shape', () => {
    const raw = [
      {
        uuid: 'c2',
        name: 'Skill schrijven',
        created_at: '2025-02-01T10:00:00Z',
        chat_messages: [
          { sender: 'human', content: [{ type: 'text', text: 'Schrijf een skill voor mij' }] },
          {
            sender: 'assistant',
            content: [
              { type: 'thinking', thinking: 'intern' },
              { type: 'text', text: 'Hier is je skill:' },
              { type: 'text', text: '## Doel\nDoe X' },
            ],
          },
        ],
      },
    ]
    const [rec] = parseClaudeExport(raw)
    expect(rec.messageCount).toBe(2)
    expect(rec.markdown).toContain('Schrijf een skill voor mij')
    expect(rec.markdown).toContain('Hier is je skill:')
    expect(rec.markdown).toContain('Doe X')
    // non-text blocks (thinking) must not leak into the transcript
    expect(rec.markdown).not.toContain('intern')
  })

  it('accepts a wrapper object with a conversations array', () => {
    const raw = { conversations: [{ uuid: 'c3', name: 'X', chat_messages: [{ sender: 'human', text: 'hoi' }] }] }
    expect(parseClaudeExport(raw)).toHaveLength(1)
  })

  it('skips conversations with no readable messages, keeps the rest', () => {
    const raw = [
      { uuid: 'empty', name: 'Leeg', chat_messages: [] },
      { uuid: 'nomsgs', name: 'Geen array' },
      { uuid: 'blank', name: 'Blanco', chat_messages: [{ sender: 'human', text: '   ' }] },
      { uuid: 'ok', name: 'Goed', chat_messages: [{ sender: 'human', text: 'echte tekst' }] },
    ]
    const recs = parseClaudeExport(raw)
    expect(recs).toHaveLength(1)
    expect(recs[0].conversationId).toBe('ok')
  })

  it('returns [] for unrecognisable input instead of throwing', () => {
    expect(parseClaudeExport(null)).toEqual([])
    expect(parseClaudeExport('nonsense')).toEqual([])
    expect(parseClaudeExport({ foo: 'bar' })).toEqual([])
    expect(parseClaudeExport(42)).toEqual([])
  })

  it('falls back to a title and id when they are missing', () => {
    const raw = [{ chat_messages: [{ sender: 'human', text: 'hallo' }] }]
    const [rec] = parseClaudeExport(raw)
    expect(rec.title).toBe('Claude-gesprek')
    expect(rec.conversationId).toBeTruthy()
  })

  it('sorts newest first', () => {
    const raw = [
      { uuid: 'old', name: 'Oud', created_at: '2024-01-01T00:00:00Z', chat_messages: [{ sender: 'human', text: 'a' }] },
      { uuid: 'new', name: 'Nieuw', created_at: '2025-01-01T00:00:00Z', chat_messages: [{ sender: 'human', text: 'b' }] },
    ]
    const recs = parseClaudeExport(raw)
    expect(recs.map((r) => r.conversationId)).toEqual(['new', 'old'])
  })

  it('caps an enormous conversation and flags the truncation', () => {
    const huge = 'x'.repeat(30000)
    const raw = [{ uuid: 'big', name: 'Groot', chat_messages: [{ sender: 'assistant', text: huge }] }]
    const [rec] = parseClaudeExport(raw)
    expect(rec.markdown.length).toBeLessThan(20000)
    expect(rec.markdown).toContain('ingekort bij import')
  })
})

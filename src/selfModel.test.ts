import { describe, it, expect } from 'vitest'
import { parseLegacyInterviewText, INTERVIEW, TOTAL_QUESTIONS } from './selfModel'

// Synthetic fixture mirroring the real template's exact structure (section
// header + blurb + numbered "N.N — prompt" markers + multi-paragraph answers
// + a "________________" separator + the closing footer) — deliberately not
// real personal content, just the same shape the parser has to handle.
const FIXTURE = `Self-Model Onboarding Interview
Fill this in at your own pace.
How to use this
* No right answers.

1 · Identity & values
What you're made of and what you won't bend on.

1.1 — When have you felt most like yourself?

First paragraph of the answer.

Second paragraph of the answer.

1.2 — What do you refuse to compromise on?


A short single-line answer.

1.3 — Name 2-3 values.


…
________________


2 · How you think & decide
Your wiring — how choices actually happen for you.


2.1 — Walk me through the last real decision.


Decision answer text.

10 · Free brain-dump
Anything the questions didn't reach.


Loose free-dump content, no question marker.
Second line of it.
What happens when you send this back (or drop it in the vault)
Once ingested, your answers become boilerplate that must never leak in.
`

describe('parseLegacyInterviewText', () => {
  it('extracts multi-paragraph answers under the right question id', () => {
    const answers = parseLegacyInterviewText(FIXTURE)
    expect(answers['1.1']).toBe('First paragraph of the answer.\n\nSecond paragraph of the answer.')
  })

  it('extracts a short single-line answer', () => {
    const answers = parseLegacyInterviewText(FIXTURE)
    expect(answers['1.2']).toBe('A short single-line answer.')
  })

  it('treats a lone "…" placeholder as unanswered (no entry)', () => {
    const answers = parseLegacyInterviewText(FIXTURE)
    expect(answers['1.3']).toBeUndefined()
  })

  it('resumes correctly after a section header + separator into the next section', () => {
    const answers = parseLegacyInterviewText(FIXTURE)
    expect(answers['2.1']).toBe('Decision answer text.')
  })

  it('captures the unnumbered free-dump section under 10.1', () => {
    const answers = parseLegacyInterviewText(FIXTURE)
    expect(answers['10.1']).toBe('Loose free-dump content, no question marker.\nSecond line of it.')
  })

  it('never leaks the closing footer boilerplate into any answer', () => {
    const answers = parseLegacyInterviewText(FIXTURE)
    for (const text of Object.values(answers)) {
      expect(text).not.toMatch(/What happens when you send this back/)
      expect(text).not.toMatch(/boilerplate/)
    }
  })

  it('ignores template intro/instructions before the first section', () => {
    const answers = parseLegacyInterviewText(FIXTURE)
    expect(Object.values(answers).some((t) => t.includes('No right answers'))).toBe(false)
  })
})

describe('INTERVIEW schema', () => {
  it('has 10 sections with unique keys', () => {
    expect(INTERVIEW).toHaveLength(10)
    expect(new Set(INTERVIEW.map((s) => s.key)).size).toBe(10)
  })

  it('has 39 total questions with unique ids', () => {
    const ids = INTERVIEW.flatMap((s) => s.questions.map((q) => q.id))
    expect(ids).toHaveLength(39)
    expect(new Set(ids).size).toBe(39)
    expect(TOTAL_QUESTIONS).toBe(39)
  })
})

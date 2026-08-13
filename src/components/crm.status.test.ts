import { describe, it, expect } from 'vitest'
import { projectStatusStyle, CRM_STATUS, STATUS_HEX } from './crm'
import { normalizeHex } from './ui'

// Regression guard for the Projecten page crash: `projects.status` is free text
// in Postgres, so the Fiverr intake's `draft` (and any future value) reached
// `STATUS_HEX[CRM_STATUS[status]]` as `undefined`, hit `hex.replace()` inside
// the solid-Pill contrast helper, and blanked the whole page behind the error
// boundary. Both layers must now degrade to a neutral colour instead.

describe('projectStatusStyle', () => {
  it('maps every known status to a label with a real hex', () => {
    for (const status of Object.keys(CRM_STATUS) as (keyof typeof CRM_STATUS)[]) {
      const { label, hex } = projectStatusStyle(status)
      expect(label).toBe(CRM_STATUS[status])
      expect(hex).toBe(STATUS_HEX[label])
      expect(hex).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('labels the Fiverr intake draft status', () => {
    expect(projectStatusStyle('draft').label).toBe('Concept')
  })

  it('falls back to a neutral hex for a status this build does not know', () => {
    const { label, hex } = projectStatusStyle('some_future_status')
    expect(label).toBe('some_future_status') // shows the raw value, never "undefined"
    expect(hex).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('never returns an undefined hex for empty input', () => {
    for (const bad of [undefined, null, '']) {
      const { label, hex } = projectStatusStyle(bad)
      expect(label).toBe('—')
      expect(hex).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})

describe('normalizeHex', () => {
  it('passes through valid 6-digit hex, with or without #', () => {
    expect(normalizeHex('#34D399')).toBe('#34D399')
    expect(normalizeHex('34D399')).toBe('#34D399')
  })

  it('expands 3-digit shorthand', () => {
    expect(normalizeHex('#abc')).toBe('#aabbcc')
  })

  it('falls back instead of throwing on junk', () => {
    for (const bad of [undefined, null, '', 'not-a-colour', '#12345']) {
      expect(normalizeHex(bad)).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})

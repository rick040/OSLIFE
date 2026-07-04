import { describe, it, expect } from 'vitest'
import { googleCalendarUrl } from './gcal'
import type { TaskDraft } from '../types'

function datesParam(url: string): string {
  return new URL(url).searchParams.get('dates') ?? ''
}

const base: TaskDraft = { title: 'Test', priority: 'Medium', domain: 'personal', due: '2026-07-04', time: null, notes: '' }

describe('googleCalendarUrl', () => {
  it('makes a 1-hour timed event', () => {
    expect(datesParam(googleCalendarUrl({ ...base, time: '14:30' })))
      .toBe('20260704T143000/20260704T153000')
  })

  it('rolls the end date to the next day when +1h crosses midnight', () => {
    // Regression: a 23:30 task must not end at 00:30 on the SAME day.
    expect(datesParam(googleCalendarUrl({ ...base, time: '23:30' })))
      .toBe('20260704T233000/20260705T003000')
  })

  it('makes an all-day event with an exclusive next-day end', () => {
    expect(datesParam(googleCalendarUrl({ ...base, time: null })))
      .toBe('20260704/20260705')
  })
})

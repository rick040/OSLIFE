// ── HEYRA agent · Taakmaker ───────────────────────────────────────────────────
// Thin wrap around the existing rule-based task-draft parser. Rule-based date/
// title/priority extraction is already reliable and instant — no brain call
// needed here; kept as its own agent so the router treats it like the others.
// The reply line names what was actually understood (deadline, priority)
// instead of one fixed sentence for every task.

import { parseTaskDraft } from '../skills'
import type { Agent } from './types'

export const runTaskAgent: Agent = async (input) => {
  const draft = parseTaskDraft(input)

  const bits: string[] = []
  if (draft.due) bits.push(`gepland op ${draft.due}${draft.time ? ` om ${draft.time}` : ''}`)
  if (draft.priority === 'High') bits.push('hoge prioriteit')
  else if (draft.priority === 'Low') bits.push('lage prioriteit')
  const detail = bits.length ? ` (${bits.join(', ')})` : ' — nog geen deadline herkend'

  return {
    text: `"${draft.title}"${detail}. Kijk de kaart na, pas aan waar nodig, en zet 'm in je taken of in Google Agenda.`,
    topic: 'task-draft',
    draft,
  }
}

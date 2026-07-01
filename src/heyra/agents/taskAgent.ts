// ── HEYRA agent · Taakmaker ───────────────────────────────────────────────────
// Thin wrap around the existing rule-based task-draft parser. Rule-based date/
// title/priority extraction is already reliable and instant — no brain call
// needed here; kept as its own agent so the router treats it like the others.

import { parseTaskDraft } from '../skills'
import type { Agent } from './types'

export const runTaskAgent: Agent = async (input) => {
  const draft = parseTaskDraft(input)
  return {
    text: 'Ik heb dit als taak begrepen. Kijk de kaart na, pas aan waar nodig, en zet ’m in je taken of in Google Agenda.',
    topic: 'task-draft',
    draft,
  }
}

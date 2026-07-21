// ── HEYRA agent · Strategie HQ (business-idea capture) ──────────────────────
// Recognizes a business-idea pitch dropped into ordinary HEYRA chat and turns
// it into an editable capture draft — title + domain guess — for
// IdeaCaptureCard to review. Nothing is written here: creating the
// business_ideas row (and kicking off idea-elaborate, the same pipeline
// Strategie HQ's own "Nieuw idee" button uses) only happens once Rick
// confirms the card, mirroring clientIntakeAgent's draft-first contract.

import type { Agent } from './types'
import type { IdeaCaptureDraft } from '../cards'

/** A short working title from the raw pitch — idea-elaborate rewrites this anyway once it has the full analysis. */
function guessTitle(text: string): string {
  const clean = text.trim().replace(/\s+/g, ' ')
  const firstSentence = clean.split(/(?<=[.!?])\s/)[0] ?? clean
  const title = firstSentence.length > 60 ? `${firstSentence.slice(0, 57)}…` : firstSentence
  return title.charAt(0).toUpperCase() + title.slice(1)
}

export const runIdeaAgent: Agent = async (input, ctx) => {
  const draft: IdeaCaptureDraft = {
    title: guessTitle(input),
    rawInput: input.trim(),
    domain: ctx.item.domain,
    source: ctx.item.kind === 'voice' ? 'voice' : 'text',
    fromBrain: true,
  }

  return {
    text: 'Dit klinkt als een nieuw business-idee. Check de titel en het domein, en laat HEYRA het uitwerken tot een volledige analyse in Strategie HQ.',
    topic: 'idea',
    ideaDraft: draft,
    entity: draft.title,
  }
}

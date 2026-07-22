// ── Project detail · meeting transcript intake ───────────────────────────────
// Paste a call/video-meeting transcript and this drafts a summary, new action
// items (checked against the project's already-open tasks so it doesn't
// propose duplicates), and notes to append to the project — reviewed and
// edited in the UI before anything is written. Runs on HEYRA's Haiku brain;
// on any brain failure it falls back to a plain truncation so the tab still
// shows *something* usable rather than an error.

import { askBrain } from '../../heyra/brainClient'
import { parseBrainJson } from '../../heyra/brainJson'
import type { Project, ProjectTask } from '../../types'

export interface TranscriptAnalysis {
  summary: string
  newTasks: string[]
  notesToAdd: string
  fromBrain: boolean
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : []
}

function fallback(transcript: string): TranscriptAnalysis {
  const trimmed = transcript.trim()
  return {
    summary: trimmed.length > 400 ? `${trimmed.slice(0, 400)}…` : trimmed,
    newTasks: [],
    notesToAdd: '',
    fromBrain: false,
  }
}

/**
 * Parses a raw call/meeting transcript into a summary + new action items +
 * notes for the given project. Never throws — on a brain miss it returns a
 * truncated-transcript fallback so the review step always has something.
 */
export async function runTranscriptAnalysis(transcript: string, project: Project, openTasks: ProjectTask[]): Promise<TranscriptAnalysis> {
  const openTaskNames = openTasks.map((t) => t.name)

  const system = `Je bent het "Gespreksverslag" brein van HEYRA, voor Rick van Mierlo (PRJCT Agency). Rick plakt een transcript van een call of videomeeting over het project "${project.name}"${project.client ? ` (klant: ${project.client})` : ''} en jij verwerkt dit tot een bruikbaar verslag:
1. Schrijf een korte samenvatting (3-5 zinnen) van waar het gesprek over ging en welke besluiten er zijn genomen.
2. Stel nieuwe concrete actiepunten voor die uit het gesprek volgen — ALLEEN taken die nog niet op de bestaande open-takenlijst staan: ${openTaskNames.length ? openTaskNames.join(', ') : '(nog geen open taken)'}. Laat leeg als er geen nieuwe actiepunten zijn.
3. Vat nieuwe informatie, besluiten of opmerkingen samen die het waard zijn om bij het project te bewaren (notesToAdd) — bullet-achtige losse zinnen, kort en concreet. Laat leeg als er niets nieuws te bewaren is.

Antwoord ALLEEN met een fenced \`\`\`json blok, geen andere tekst, exact dit schema:
{"summary":string,"newTasks":string[],"notesToAdd":string}`

  const guess = await askBrain(system, `Transcript:\n"""\n${transcript}\n"""`, { maxTokens: 1200, timeoutMs: 16000 })

  if (guess) {
    const parsed = parseBrainJson(guess)
    const summary = parsed && typeof parsed.summary === 'string' ? parsed.summary.trim() : ''
    if (summary) {
      return {
        summary,
        newTasks: asStringArray(parsed!.newTasks),
        notesToAdd: typeof parsed!.notesToAdd === 'string' ? parsed!.notesToAdd.trim() : '',
        fromBrain: true,
      }
    }
  }

  return fallback(transcript)
}

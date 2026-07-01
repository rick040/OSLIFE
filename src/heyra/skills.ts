// ── HEYRA · skill router ──────────────────────────────────────────────────────
// Jarvis-style "function switching": HEYRA reads what you typed, decides which
// skill best fits, and (for now) switches into the Taakmaker when it hears a
// task/reminder. The detector is transparent keyword scoring so the demo is
// instant and explainable; swap detectSkill() for an LLM call later without
// touching the UI.

import type { Domain, Priority, TaskDraft } from '../types'
import { classify } from '../understand'
import { parseWhen } from './datetime'

export type SkillId = 'task' | 'project' | 'chart' | 'search' | 'chat'

export interface SkillMeta {
  id: SkillId
  label: string // shown in the "function switched" banner
  blurb: string // one-line description of what the skill does
}

export const SKILLS: Record<SkillId, SkillMeta> = {
  task: { id: 'task', label: 'Taakmaker', blurb: 'Zet je gedachte om in een taak met deadline' },
  project: { id: 'project', label: 'Projectkaart', blurb: 'Laat de status van een project zien' },
  chart: { id: 'chart', label: 'Visualisatie', blurb: 'Zet cijfers uit je geheugen om in een grafiek' },
  search: { id: 'search', label: 'Zoeken', blurb: 'Doorzoekt je ene geheugen op een steekwoord' },
  chat: { id: 'chat', label: 'Geheugen', blurb: 'Antwoordt uit je ene geheugen' },
}

// Phrases that signal "this is a thing to do / remember", NL + EN.
const TASK_TRIGGERS = [
  'taak', 'to-do', 'todo', 'to do', 'herinner', 'herinnering', 'reminder', 'remind me',
  'onthoud', 'niet vergeten', 'vergeet niet', 'moet ', 'moet nog', 'zet op', 'voeg toe',
  'plan ', 'inplannen', 'afspraak', 'deadline', 'maak een taak', 'add a task', 'need to',
  'have to', 'schedule', 'book ', 'bel ', 'mail ', 'stuur ', 'follow up', 'opvolgen',
  'regel ', 'fix ', 'afmaken', 'afronden', 'betalen', 'factuur sturen',
]

// Phrases that ask for the status of a specific project — deliberately narrow:
// bare words like "project " or "klant " matched almost any sentence that
// mentioned a client, stealing intent from task/search.
const PROJECT_TRIGGERS = [
  'status van project', 'hoe staat het met', 'voortgang van project', 'project status',
  'over project', 'voor project', 'welk project',
]

// Phrases that ask for numbers over time — a chart answers better than prose.
const CHART_TRIGGERS = [
  'grafiek', 'chart', 'trend', 'trends', 'overzicht van', 'vergelijk', 'vergelijking',
  'hoeveel heb ik', 'hoeveel uur', 'over tijd', 'progressie', 'voortgang', 'visualiseer',
  'laat de cijfers zien', 'per dag', 'per week', 'per maand', 'ontwikkeling van',
]

// Phrases that ask HEYRA to look something up rather than answer from a script.
const SEARCH_TRIGGERS = [
  'zoek ', 'zoek naar', 'zoeken naar', 'wat weet je over', 'wat heb ik over', 'find ',
  'search ', 'look up', 'opzoeken', 'zoek op', 'wat staat er over', 'heb ik iets over',
]

export interface SkillDetection {
  skill: SkillId
  score: number
  trigger: string | null
}

function scoreTriggers(t: string, triggers: string[]): { score: number; best: string | null } {
  let best: string | null = null
  let score = 0
  for (const w of triggers) {
    if (t.includes(w)) {
      score += 1
      if (!best || w.length > best.length) best = w
    }
  }
  return { score, best }
}

/** Decide which skill should handle the message. */
export function detectSkill(text: string): SkillDetection {
  const t = ` ${text.toLowerCase()} `

  const toDetection = (skill: SkillId, r: { score: number; best: string | null }): SkillDetection => ({
    skill,
    score: r.score,
    trigger: r.best,
  })

  // Order doubles as the tie-break: an explicit "zoek …" should win over a
  // softer project-status guess, but an explicit task trigger still wins over
  // both (e.g. "herinner me te zoeken naar X" is a task, not a search).
  const candidates: SkillDetection[] = [
    toDetection('task', scoreTriggers(t, TASK_TRIGGERS)),
    toDetection('search', scoreTriggers(t, SEARCH_TRIGGERS)),
    toDetection('project', scoreTriggers(t, PROJECT_TRIGGERS)),
    toDetection('chart', scoreTriggers(t, CHART_TRIGGERS)),
  ]

  const best = candidates.reduce((a, b) => (b.score > a.score ? b : a))

  if (best.score > 0) return best

  // An imperative verb at the very start ("bel marco", "stuur de offerte") also
  // reads as a task even without an explicit trigger word.
  if (/^(bel|mail|stuur|maak|regel|plan|koop|boek|vraag|check|betaal|afronden)\b/i.test(text.trim())) {
    return { skill: 'task', score: 1, trigger: 'imperatief' }
  }

  return { skill: 'chat', score: 0, trigger: null }
}

const PRIORITY_HINTS: { p: Priority; words: string[] }[] = [
  { p: 'High', words: ['urgent', 'asap', 'spoed', 'belangrijk', 'hoge prioriteit', 'high', 'meteen', 'direct', 'vandaag nog'] },
  { p: 'Low', words: ['ooit', 'geen haast', 'low', 'lage prioriteit', 'wanneer', 'als er tijd is'] },
]

// Leading fragments to peel off the title so it reads like a clean task.
const TITLE_PREFIXES = [
  /^herinner( me| mij)?( aan| om| eraan om| dat ik)?\s*/i,
  /^remind me( to| about)?\s*/i,
  /^(kun je |wil je |ga )?onthoud(en)?( dat ik| dat| om)?\s*/i,
  /^(maak|voeg)( een)? (taak|to-?do)( toe)?( om| voor| :|:)?\s*/i,
  /^(ik )?moet( nog| even)?\s*/i,
  /^(i )?(need|have) to\s*/i,
  /^(zet|plan)( dit| het| op de lijst)?( in| op)?( om)?\s*/i,
  /^niet vergeten( om| te)?\s*/i,
  /^vergeet niet( om| te)?\s*/i,
  /^taak:?\s*/i,
  /^to-?do:?\s*/i,
]

function detectPriority(text: string): Priority {
  const t = text.toLowerCase()
  for (const h of PRIORITY_HINTS) {
    if (h.words.some((w) => t.includes(w))) return h.p
  }
  return 'Medium'
}

function cleanTitle(text: string, strip: string[]): string {
  let s = text.trim()
  // remove recognised date/time/priority phrases
  const extra = ['urgent', 'asap', 'spoed', 'belangrijk', 'hoge prioriteit', 'lage prioriteit', 'geen haast']
  for (const frag of [...strip, ...extra]) {
    if (!frag) continue
    s = s.replace(new RegExp(frag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), ' ')
  }
  // peel leading trigger fragments
  for (const re of TITLE_PREFIXES) s = s.replace(re, '')
  // tidy leftover whitespace + punctuation left behind by the strips
  s = s.replace(/\s{2,}/g, ' ').replace(/\s+([,.])/g, '$1').trim()
  s = s.replace(/^[\s:;,–—-]+/, '').trim() // leading colon/dash after a peeled prefix
  s = s.replace(/^(om|te|aan|op|voor|de|het|een)\s+/i, '').trim()
  s = s.replace(/[,;:\s]+$/g, '').trim()
  if (!s) s = text.trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Turn free text into a concrete, editable task draft. */
export function parseTaskDraft(text: string): TaskDraft {
  const when = parseWhen(text)
  const domain: Domain = classify(text, 'chat').domain
  const priority = detectPriority(text)
  const title = cleanTitle(text, when.strip)
  return {
    title,
    due: when.date,
    time: when.time,
    domain,
    priority,
    notes: text.trim(),
  }
}

// ── HEYRA · skill router ──────────────────────────────────────────────────────
// Jarvis-style "function switching": HEYRA reads what you typed, decides which
// skill best fits, and (for now) switches into the Taakmaker when it hears a
// task/reminder. The detector is transparent keyword scoring so the demo is
// instant and explainable; swap detectSkill() for an LLM call later without
// touching the UI.

import type { Domain, Priority, TaskDraft } from '../types'
import { classify } from '../understand'
import { parseWhen } from './datetime'

export type SkillId = 'task' | 'project' | 'chart' | 'search' | 'clientIntake' | 'chat'

// Agent ids the router (heyra/router.ts) can dispatch to — a superset of the
// rule-based SkillId pre-filter above, plus the brain-assisted agents that
// live under heyra/agents/ (financeAgent, signalAgent, briefingAgent).
export type AgentId = SkillId | 'finance' | 'signal' | 'briefing'

export interface SkillMeta {
  id: AgentId
  label: string // shown in the "function switched" banner
  blurb: string // one-line description of what the skill does
}

export const SKILLS: Record<AgentId, SkillMeta> = {
  task: { id: 'task', label: 'Taakmaker', blurb: 'Zet je gedachte om in een taak met deadline' },
  project: { id: 'project', label: 'Projectkaart', blurb: 'Laat de status van een project zien' },
  chart: { id: 'chart', label: 'Visualisatie', blurb: 'Zet cijfers uit je geheugen om in een grafiek' },
  search: { id: 'search', label: 'Zoeken', blurb: 'Doorzoekt je ene geheugen op een steekwoord' },
  clientIntake: { id: 'clientIntake', label: 'Klant-intake', blurb: 'Verwerkt een klantbericht tot een reply + CRM-record' },
  finance: { id: 'finance', label: 'Financiën', blurb: 'Beantwoordt geld-vragen uit je facturen en transacties' },
  signal: { id: 'signal', label: 'Signalen', blurb: 'Legt patronen en verbanden uit je Reflect-brein uit' },
  briefing: { id: 'briefing', label: 'Briefing', blurb: 'Vat je dag samen uit nudge, loops en patronen' },
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

// Explicit phrases that signal "this is a raw client message, process it" —
// paste a WhatsApp/email/Fiverr message straight into HEYRA and it drafts a
// reply + a CRM draft instead of treating the paste as a note-to-self.
const CLIENT_TRIGGERS = [
  'nieuwe klant', 'nieuwe lead', 'nieuwe aanvraag', 'nieuwe opdracht', 'nieuwe intake',
  'klant schreef', 'klant vraagt', 'klantbericht', 'verwerk dit bericht', 'verwerk deze mail',
  'verwerk dit gesprek', 'fiverr order', 'fiverr bericht', 'new client', 'new lead',
  'new inquiry', 'client message', 'process this message',
]

// Words that show up in an inbound client message asking about price/timing —
// used only as a last-resort heuristic below, never to steal intent from the
// higher-priority triggers above.
const CLIENT_MESSAGE_HINTS = ['prijs', 'budget', 'offerte', 'kost', 'wanneer', 'deadline', 'price', 'quote', 'when can']

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

  // When the message is an instruction that wraps a quoted/pasted block
  // ('Maak een nieuw project obv dit klantbericht: "Hey Rick, ... ik stuur je
  // ... brandbook ..."'), score trigger words only against the instruction
  // itself — a client's own message can easily contain incidental words like
  // "stuur"/"brandbook" that would otherwise outscore Rick's actual explicit
  // instruction. Only kicks in when a colon is directly followed by a quote
  // mark; ordinary messages (no quoted block) are scored in full, unchanged.
  const quoteStart = text.search(/:\s*["'„“‘]/)
  const scoredText = quoteStart > 0 ? ` ${text.slice(0, quoteStart).toLowerCase()} ` : t

  const toDetection = (skill: SkillId, r: { score: number; best: string | null }): SkillDetection => ({
    skill,
    score: r.score,
    trigger: r.best,
  })

  const candidates: SkillDetection[] = [
    toDetection('task', scoreTriggers(scoredText, TASK_TRIGGERS)),
    toDetection('search', scoreTriggers(scoredText, SEARCH_TRIGGERS)),
    toDetection('project', scoreTriggers(scoredText, PROJECT_TRIGGERS)),
    toDetection('chart', scoreTriggers(scoredText, CHART_TRIGGERS)),
    toDetection('clientIntake', scoreTriggers(scoredText, CLIENT_TRIGGERS)),
  ]

  // On a tie, the more specific (longer) matched phrase wins rather than
  // array position.
  const best = candidates.reduce((a, b) => {
    if (b.score !== a.score) return b.score > a.score ? b : a
    return (b.trigger?.length ?? 0) > (a.trigger?.length ?? 0) ? b : a
  })

  if (best.score > 0) return best

  // An imperative verb at the very start ("bel marco", "stuur de offerte") also
  // reads as a task even without an explicit trigger word.
  if (/^(bel|mail|stuur|maak|regel|plan|koop|boek|vraag|check|betaal|afronden)\b/i.test(text.trim())) {
    return { skill: 'task', score: 1, trigger: 'imperatief' }
  }

  // Zero-friction fallback: nothing else claimed this text, but it's long and
  // reads like an inbound client message (a question, or a price/timing
  // word) rather than a note-to-self — treat it as a client message to
  // process instead of falling through to plain chat.
  if (text.trim().length > 120 && (text.includes('?') || CLIENT_MESSAGE_HINTS.some((w) => t.includes(w)))) {
    return { skill: 'clientIntake', score: 1, trigger: 'klantbericht (auto)' }
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

/**
 * Turn free text into a concrete, editable task draft. Deliberately stays on
 * the rule-based classify() rather than classifyWithBrain() — taskAgent's
 * whole design point is an instant, zero-brain-call reply once routing has
 * already resolved to 'task'; spending a second brain call here would undo that.
 */
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

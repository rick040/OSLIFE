// ── HEYRA · context-assemblage-recept (PM-201 Slice 3, fase 4.6) ──────────────
// Gegeven een bericht van Rick: welke lange-termijn-context laden we, en waarom.
// Volgorde = prioriteit bij een tokenbudget: eerst wie-is-Rick + open loops +
// doelen + vandaag (altijd), dan semantische recall uit het geheugen.
//
// GEHEIM blijft er per constructie buiten: search_memory() sluit tier=geheim uit,
// en de altijd-laden-slices (facts/loops/doelen/vandaag) bevatten geen ruwe
// geheime notities. Zo kan deze bundel veilig naar een cloud-AI.

import type { Thread, Goal, Block, MemoryHit } from '../types'
import type { LearnedFact } from './learning'

export interface ContextSnapshot {
  learnedFacts: LearnedFact[]
  threads: Thread[]
  goals: Goal[]
  blocks: Block[] // vandaag-plan (Block heeft geen datum: het IS de dag van vandaag)
}

export interface AssembledContext {
  facts: string[]
  openLoops: string[]
  goals: string[]
  today: string[]
  recall: MemoryHit[]
}

/**
 * Bouw de contextbundel. `search` wordt geïnjecteerd (searchMemory) zodat dit
 * puur en testbaar blijft. Alleen bij een niet-lege boodschap wordt recall gedaan.
 */
export async function assembleContext(
  message: string,
  snap: ContextSnapshot,
  search: (q: string, limit: number) => Promise<MemoryHit[]>,
  opts?: { recallLimit?: number },
): Promise<AssembledContext> {
  const facts = snap.learnedFacts.slice(0, 20).map((f) => f.text)
  const openLoops = snap.threads
    .filter((t) => t.status === 'open')
    .slice(0, 10)
    .map((t) => `${t.title}${t.due ? ` (deadline ${t.due})` : ''}${t.owedTo ? ` — ${t.owedTo}` : ''}`)
  const goals = snap.goals.slice(0, 8).map((g) => `${g.title} (${g.current}/${g.target} ${g.metric})`)
  const today = snap.blocks.map((b) => `${b.start} ${b.title}`.trim())
  const recall = message.trim() ? await search(message, opts?.recallLimit ?? 6) : []
  return { facts, openLoops, goals, today, recall }
}

/** Render de bundel tot een prompt-blok. Bevat per constructie geen geheime data. */
export function renderContext(ctx: AssembledContext): string {
  const lines: string[] = []
  const section = (title: string, items: string[]) => {
    if (!items.length) return
    if (lines.length) lines.push('')
    lines.push(`# ${title}`, ...items.map((i) => `- ${i}`))
  }
  section('Wat ik over je weet', ctx.facts)
  section('Open loops', ctx.openLoops)
  section('Doelen', ctx.goals)
  section('Vandaag', ctx.today)
  section('Mogelijk relevant (geheugen)', ctx.recall.map((r) => `[${r.source}] ${r.title}: ${r.snippet}`))
  return lines.join('\n')
}

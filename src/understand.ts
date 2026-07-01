import type { Domain, ItemKind, Sentiment, CaptureSource } from './types'
import { askBrain } from './heyra/brainClient'
import { parseBrainJson } from './heyra/brainJson'

// ── Layer 2: UNDERSTAND ───────────────────────────────────────────────────────
// classify() is the deliberately simple, transparent keyword fallback: kept
// exactly as-is so HEYRA still works with no brain configured. classifyWithBrain()
// is the primary path — real understanding instead of substring luck (e.g. it
// won't mistake "callsheets" for a phone call or "rebranding" for a task the
// way keyword-hint scoring can).

export interface Classification {
  domain: Domain
  kind: ItemKind
  sentiment: Sentiment
  summary: string
}

export const VALID_DOMAINS: Domain[] = ['parkingyou', 'prjct', 'buurtkaart', 'personal', 'cross']
export const VALID_KINDS: ItemKind[] = ['task', 'note', 'vent', 'link', 'voice', 'transaction', 'event', 'health', 'email', 'idea']
export const VALID_SENTIMENTS: Sentiment[] = ['positive', 'neutral', 'negative', 'stressed']

/** Validates a brain-returned object against the real enum values. Null on any invalid/missing field — callers fall back to the rule-based classify(). */
export function validateClassification(parsed: Record<string, unknown>): Classification | null {
  const domain = VALID_DOMAINS.includes(parsed.domain as Domain) ? (parsed.domain as Domain) : null
  const kind = VALID_KINDS.includes(parsed.kind as ItemKind) ? (parsed.kind as ItemKind) : null
  const sentiment = VALID_SENTIMENTS.includes(parsed.sentiment as Sentiment) ? (parsed.sentiment as Sentiment) : null
  const summary = typeof parsed.summary === 'string' && parsed.summary.trim() ? parsed.summary.trim() : null
  if (!domain || !kind || !sentiment || !summary) return null
  return { domain, kind, sentiment, summary: summary.charAt(0).toUpperCase() + summary.slice(1) }
}

const DOMAIN_HINTS: { domain: Domain; words: string[] }[] = [
  { domain: 'parkingyou', words: ['parking', 'parkingyou', 'host', 'signage', 'lot', 'gate', 'marco', 'strijp', 'campaign'] },
  { domain: 'prjct', words: ['prjct', 'invoice', 'client', 'logo', 'branding', 'website', 'mural', 'lana', 'design', 'offerte', 'deliver', 'bakkerij', 'de groot'] },
  { domain: 'buurtkaart', words: ['buurtkaart', 'flyer', 'qr', 'merchant', 'wijk', 'braakhuizen', 'kroon', 'distro', 'geldrop'] },
  { domain: 'personal', words: ['sleep', 'slept', 'tired', 'dog', 'nox', 'walk', 'gym', 'mood', 'energy', 'vet', 'groceries', 'spent', 'bought', 'eur', '€'] },
]

const KIND_HINTS: { kind: ItemKind; words: string[] }[] = [
  { kind: 'task', words: ['need to', 'todo', 'must', 'have to', 'remember to', 'book', 'send', 'finish', 'chase', 'follow up', 'call'] },
  { kind: 'link', words: ['http', 'www.', '.com', '.nl'] },
  { kind: 'transaction', words: ['spent', 'paid', 'bought', 'eur', '€', 'invoice'] },
  { kind: 'vent', words: ['annoyed', 'stressed', 'frustrated', 'hate', 'exhausted', 'overwhelmed', 'ugh', 'sick of'] },
  { kind: 'idea', words: ['idea', 'what if', 'maybe we', 'could', 'concept'] },
  { kind: 'event', words: ['meeting', 'appointment', 'at 1', 'at 2', 'tomorrow', 'monday', 'tuesday'] },
]

const NEG = ['annoyed', 'stressed', 'frustrated', 'hate', 'exhausted', 'overwhelmed', 'ugh', 'late', 'broken', 'tired', 'behind', 'sick of', 'unpaid']
const POS = ['done', 'finished', 'paid', 'great', 'nice', 'happy', 'shipped', 'win', 'landed', 'closed']
const STRESS = ['stressed', 'overwhelmed', 'exhausted', 'too much', 'can’t', 'cant', 'deadline', 'panic']

function scoreWords(text: string, words: string[]): number {
  return words.reduce((n, w) => (text.includes(w) ? n + 1 : n), 0)
}

export function classify(text: string, source: CaptureSource): Classification {
  const t = text.toLowerCase()

  // domain
  let domain: Domain = 'personal'
  let best = 0
  for (const h of DOMAIN_HINTS) {
    const s = scoreWords(t, h.words)
    if (s > best) {
      best = s
      domain = h.domain
    }
  }

  // kind, source can override
  let kind: ItemKind = 'note'
  if (source === 'link') kind = 'link'
  else if (source === 'voice') kind = 'voice'
  else if (source === 'task') kind = 'task'
  else {
    let kbest = 0
    for (const h of KIND_HINTS) {
      const s = scoreWords(t, h.words)
      if (s > kbest) {
        kbest = s
        kind = h.kind
      }
    }
  }

  // sentiment
  let sentiment: Sentiment = 'neutral'
  if (scoreWords(t, STRESS) > 0) sentiment = 'stressed'
  else if (scoreWords(t, NEG) > scoreWords(t, POS)) sentiment = 'negative'
  else if (scoreWords(t, POS) > 0) sentiment = 'positive'

  // one-line summary: trim + capitalize, cap length
  const clean = text.trim().replace(/\s+/g, ' ')
  const summary = clean.length > 64 ? clean.slice(0, 61) + '…' : clean

  return { domain, kind, sentiment, summary: summary.charAt(0).toUpperCase() + summary.slice(1) }
}

const CLASSIFY_SYSTEM = `Je bent de "Begrijpen"-laag van HEYRA (OSLIFE). Gegeven een los stukje tekst (notitie, gedachte, chatbericht) classificeer je het kort en accuraat, op basis van de BETEKENIS van de tekst, niet op losse woorden die toevallig voorkomen (bijvoorbeeld: "callsheets" is geen telefoontje, "rebranding" is geen taak).
- domain: een van ${VALID_DOMAINS.join(', ')} — welk levensgebied dit raakt (parkingyou/prjct/buurtkaart zijn Ricks bedrijven, personal = privé, cross = raakt meerdere).
- kind: een van ${VALID_KINDS.join(', ')}.
- sentiment: een van ${VALID_SENTIMENTS.join(', ')}.
- summary: een korte, natuurlijke one-line samenvatting (max ~12 woorden), geen letterlijke kopie van de hele tekst.
Antwoord ALLEEN met een fenced \`\`\`json blok: {"domain":"...","kind":"...","sentiment":"...","summary":"..."}`

/**
 * Brain-first classification. Sources that already force a deterministic
 * `kind` in classify() ('link'/'voice'/'task') skip the brain call entirely —
 * that determinism is intentional and shouldn't become brain-dependent. Falls
 * back to the exact rule-based classify() on any brain failure or invalid output.
 */
export async function classifyWithBrain(text: string, source: CaptureSource): Promise<Classification> {
  const fallback = classify(text, source)
  if (source === 'link' || source === 'voice' || source === 'task') return fallback

  const guess = await askBrain(CLASSIFY_SYSTEM, `Tekst:\n"""\n${text}\n"""`, { maxTokens: 200, timeoutMs: 8000 })
  if (!guess) return fallback

  const parsed = parseBrainJson(guess)
  if (!parsed) return fallback

  return validateClassification(parsed) ?? fallback
}

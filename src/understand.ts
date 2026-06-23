import type { Domain, ItemKind, Sentiment, CaptureSource } from './types'

// ── Layer 2: UNDERSTAND ───────────────────────────────────────────────────────
// A deliberately simple, transparent keyword classifier. In a real build this is
// an LLM call; here it's rules so the demo is instant and explainable.

interface Classification {
  domain: Domain
  kind: ItemKind
  sentiment: Sentiment
  summary: string
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

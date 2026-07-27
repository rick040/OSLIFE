// ── Self-model onboarding interview ──────────────────────────────────────────
// The canonical 10-section, 39-question interview Rick fills in at his own
// pace (see the "Self-Model Onboarding Interview" doc he authored). Question
// prompts are kept verbatim (his own wording); section titles get a light
// Dutch gloss to match the rest of the app's UI chrome. This is the single
// source of truth for the Droom tab's structured interview UI and for what
// heyra/identity.ts reads to distill hypotheses/aspirations from.

export interface InterviewQuestion {
  id: string
  prompt: string
}

export interface InterviewSection {
  key: string
  title: string
  blurb: string
  questions: InterviewQuestion[]
}

export const INTERVIEW: InterviewSection[] = [
  {
    key: 'identity',
    title: '1 · Identiteit & waarden',
    blurb: "What you're made of and what you won't bend on.",
    questions: [
      {
        id: '1.1',
        prompt:
          'When have you felt most like yourself — genuinely alive, absorbed, time slipping away? Take me into one specific moment. What were you doing, who was around, how did it feel in your body?',
      },
      { id: '1.2', prompt: 'What do you refuse to compromise on, even when it costs you money, time, or approval?' },
      {
        id: '1.3',
        prompt:
          "Name 2-3 values you'd claim out loud. Then, honestly: which of them does your actual behaviour back up, and which is more aspiration than fact right now?",
      },
      {
        id: '1.4',
        prompt: 'Whose life, work, or way of being do you quietly envy? Be specific about what exactly — not the whole person, the particular thing.',
      },
      { id: '1.5', prompt: "What are you proud of that most people wouldn't notice or credit you for?" },
    ],
  },
  {
    key: 'decide',
    title: '2 · Hoe je denkt & beslist',
    blurb: 'Your wiring — how choices actually happen for you.',
    questions: [
      { id: '2.1', prompt: 'Walk me through the last real decision you made. Not the tidy version — how did you actually land on it?' },
      { id: '2.2', prompt: 'Do you trust your gut or your analysis more? Tell me about a time each one betrayed you.' },
      {
        id: '2.3',
        prompt:
          'When you get stuck, what does "stuck" feel like from the inside — and what usually breaks it (be honest, even if it\'s avoidance, a deadline, or someone else pushing)?',
      },
      { id: '2.4', prompt: 'How do you handle having many options vs. few? Does more choice free you or freeze you?' },
      { id: '2.5', prompt: 'What kind of thinking comes easily to you, and what kind feels like pushing a boulder?' },
    ],
  },
  {
    key: 'energy',
    title: '3 · Energie, aandacht & je brein',
    blurb: 'The rhythms the coach needs to respect.',
    questions: [
      { id: '3.1', prompt: 'When in the day and week are you sharpest? When do you reliably crash or go foggy?' },
      { id: '3.2', prompt: 'What kind of work makes you lose track of time? What kind drains you almost instantly?' },
      { id: '3.3', prompt: "What derails you most? Name the real patterns — including the ones you're a bit ashamed of." },
      {
        id: '3.4',
        prompt:
          "When your attention is scattered, what actually helps you land it again? What have you tried that doesn't work for you (even if it works for everyone else)?",
      },
      { id: '3.5', prompt: 'What does a genuinely good day look like, start to finish? And a bad one?' },
    ],
  },
  {
    key: 'love_hate',
    title: '4 · Houden van / haten / tolereren',
    blurb: 'Direction hides in your likes and your gritted teeth.',
    questions: [
      { id: '4.1', prompt: "What do you love doing that you don't do nearly enough of?" },
      { id: '4.2', prompt: 'What do you tolerate day to day that you secretly hate?' },
      { id: '4.3', prompt: 'What could you talk about or do for hours without being paid or pushed?' },
      { id: '4.4', prompt: 'What drains or repels you so fast you avoid it at all costs?' },
    ],
  },
  {
    key: 'struggle',
    title: '5 · Worsteling & verandering',
    blurb: 'Where the gap already lives.',
    questions: [
      {
        id: '5.1',
        prompt: "What have you tried to change about yourself repeatedly and not managed to? Why do you think it didn't stick — really?",
      },
      { id: '5.2', prompt: "What's one pattern you can already feel is holding you back, even if you don't know how to fix it?" },
      { id: '5.3', prompt: 'When you have successfully changed something in the past, what made that time different?' },
      { id: '5.4', prompt: 'What do you keep starting and not finishing? What tends to be true when you do finish something?' },
    ],
  },
  {
    key: 'future_self',
    title: '6 · Het toekomstige zelf',
    blurb: "You don't have to know who that is — these come at it sideways.",
    questions: [
      { id: '6.1', prompt: "If nothing were in the way — money, time, fear — who would you be in 3 years? Vague is fine; we'll triangulate." },
      { id: '6.2', prompt: 'Finish this: "I\'d respect myself more if I consistently…"' },
      { id: '6.3', prompt: 'The version of you that you admire — what would they do this week that you probably won\'t?' },
      {
        id: '6.4',
        prompt:
          'What would "enough" look like — the point where you\'d feel you\'d genuinely arrived somewhere? (Not the ceiling — the floor of feeling okay.)',
      },
      {
        id: '6.5',
        prompt:
          "If a wise friend who knew you completely described the best realistic version of you, what would they say you'd finally let go of, and what you'd finally lean into?",
      },
    ],
  },
  {
    key: 'no_gos',
    title: '7 · No-gos',
    blurb: "Who you never want to become — a boundary the system will protect.",
    questions: [
      { id: '7.1', prompt: 'Who do you never want to turn into? (a person you know, a type, a former version of yourself…)' },
      { id: '7.2', prompt: 'What "success" that others chase would actually feel like failure to you?' },
      { id: '7.3', prompt: "What are your hard lines — things you won't do to get ahead, no matter what?" },
    ],
  },
  {
    key: 'work_money',
    title: '8 · Werk, geld & het freelance leven',
    blurb: 'Your specific context as a freelancer with a lot to manage.',
    questions: [
      { id: '8.1', prompt: 'What does your work actually consist of day to day, and which parts light you up vs. grind you down?' },
      { id: '8.2', prompt: "What's your relationship with money — anxious, avoidant, ambitious, indifferent? How does it show up in your choices?" },
      { id: '8.3', prompt: 'What kind of client or project do you thrive with? Which kind should you probably stop taking?' },
      { id: '8.4', prompt: 'Where do you want your work to be in a few years — bigger, smaller, different, freer, more stable?' },
    ],
  },
  {
    key: 'people_environment',
    title: '9 · Mensen & omgeving',
    blurb: 'Context shapes who you become.',
    questions: [
      { id: '9.1', prompt: 'Who brings out your best self, and who brings out the version you don\'t like?' },
      { id: '9.2', prompt: 'What in your physical or digital environment helps you, and what quietly sabotages you?' },
      { id: '9.3', prompt: 'How much of who you want to become is about doing differently vs. being around different people/things?' },
    ],
  },
  {
    key: 'braindump',
    title: '10 · Vrije brain-dump',
    blurb: "Anything the questions didn't reach — worries, hopes, half-thoughts, a rant, a dream, something you've never said out loud. No structure needed.",
    questions: [{ id: '10.1', prompt: 'Anything else on your mind.' }],
  },
]

export const TOTAL_QUESTIONS = INTERVIEW.reduce((n, s) => n + s.questions.length, 0)

/**
 * Deterministic (no AI) split of the legacy pasted interview blob into
 * per-question answers, keyed by question id. Matches on the exact
 * "`<id>` — " markers the template uses at the start of a line — reliable
 * for this one known, stable template, not a general-purpose parser.
 * Section 10 (the free-dump) has no numbered sub-question in the template —
 * its content is captured under '10.1' directly. Stops at the template's own
 * closing "What happens when you send this back" footer so that boilerplate
 * never leaks into an answer.
 */
export function parseLegacyInterviewText(raw: string): Record<string, string> {
  const QUESTION_RE = /^(\d{1,2}\.\d{1,2})\s+—\s+/
  const SECTION_HEADER_RE = /^\d{1,2}\s+·\s+/
  const SEPARATOR_RE = /^_{3,}$/
  const FOOTER_RE = /^What happens when you send this back/i

  const answers: Record<string, string> = {}
  let currentId: string | null = null
  let buf: string[] = []
  let skipNextLine = false // the one blurb line right after a section header

  const flush = () => {
    if (currentId) {
      const text = buf.join('\n').trim()
      // "…" (or bare "...") is the template's own placeholder for "not answered yet" — not a real answer.
      if (text && !/^(…|\.{3,})$/.test(text)) answers[currentId] = text
    }
    buf = []
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (SEPARATOR_RE.test(trimmed)) continue
    if (FOOTER_RE.test(trimmed)) break

    const qm = line.match(QUESTION_RE)
    if (qm) {
      flush()
      currentId = qm[1]
      skipNextLine = false
      continue
    }
    if (SECTION_HEADER_RE.test(trimmed)) {
      flush()
      currentId = /free brain-dump/i.test(trimmed) ? '10.1' : null
      skipNextLine = true
      continue
    }
    if (skipNextLine) {
      skipNextLine = false
      continue
    }
    if (currentId) buf.push(line)
  }
  flush()
  return answers
}

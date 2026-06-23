import { useState, useRef, useEffect } from 'react'
import { useStore } from '../store'
import { DOMAIN_META } from '../domains'
import { DomainChip, SentimentChip, KindChip } from '../components/ui'
import type { StructuredItem } from '../types'
import { Send, Sparkles, Database } from 'lucide-react'

interface Msg {
  id: string
  role: 'rick' | 'jarvis'
  text: string
  classified?: StructuredItem
}

const SUGGESTIONS = [
  'What do I owe people right now?',
  'Why am I so tired today?',
  'I’m stressed about the van Dijk invoice',
  'Remind me to order new signage bolts',
]

export default function Jarvis() {
  const store = useStore()
  const [input, setInput] = useState('')
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      id: 'm0',
      role: 'jarvis',
      text:
        'I’m reading from your one memory across ParkingYou, PRJCT, Buurtkaart and personal life. Ask me anything, or just dump a thought, I’ll classify and file it for you, no decision needed.',
    },
  ])
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs])

  function reply(item: StructuredItem): string {
    const t = item.text.toLowerCase()
    const open = store.threads.filter((x) => x.status === 'open')
    const inDomain = open.filter((x) => x.domain === item.domain)

    if (/owe|open|thread|loop|todo|to do|owed/.test(t)) {
      const top = open
        .slice(0, 3)
        .map((x) => `• ${x.title} (${DOMAIN_META[x.domain].label}${x.due ? `, due ${x.due.slice(5)}` : ''})`)
        .join('\n')
      return `You have ${open.length} open loops across all domains. The most pressing:\n${top}`
    }
    if (/tired|sleep|energy|exhausted/.test(t)) {
      const last = store.dayLogs[store.dayLogs.length - 1]
      return `You logged ${last.sleepHours}h last night and energy ${last.energy}/5. Your reinforced pattern: under 6h, next-day energy drops ~50%. I’ve kept your 09:30 deep-work block protected and pushed admin to the afternoon.`
    }
    if (/invoice|paid|van dijk|money|spend|spent/.test(t)) {
      return `On PRJCT money: invoice #2026-031 (€880, Bakkerij van Dijk) is overdue, F&B clients in your history run 7–10 days late. Reflect also flagged that your spend spikes ~2× around deadlines. Want me to keep the chase on today’s plan?`
    }
    if (item.kind === 'task') {
      return `Filed as a task in ${DOMAIN_META[item.domain].label} and opened a loop so it can’t get lost. I’ll surface it in Today and the Day Builder.`
    }
    if (item.sentiment === 'stressed' || item.kind === 'vent') {
      return `Logged the vent under ${DOMAIN_META[item.domain].label}. You have ${inDomain.length} open ${DOMAIN_META[item.domain].label} loop(s), that’s likely part of the weight. I’ll watch whether this clusters with your spend pattern.`
    }
    return `Got it, classified into ${DOMAIN_META[item.domain].label} as a ${item.kind} and added to memory. You have ${inDomain.length} other open loop(s) there.`
  }

  function send(text: string) {
    const clean = text.trim()
    if (!clean) return
    const item = store.capture(clean, 'chat')
    const rickMsg: Msg = { id: 'r' + item.id, role: 'rick', text: clean, classified: item }
    setMsgs((m) => [...m, rickMsg])
    setInput('')
    // jarvis answers from memory
    setTimeout(() => {
      setMsgs((m) => [...m, { id: 'j' + item.id, role: 'jarvis', text: reply(item) }])
    }, 400)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="h-5 w-5 text-prjct" />
        <h1 className="text-xl font-semibold">Jarvis</h1>
        <span className="chip bg-sunken text-muted">answers from one memory</span>
      </div>

      <div className="flex-1 overflow-auto space-y-4 pr-1">
        {msgs.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'rick' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] ${m.role === 'rick' ? 'order-2' : ''}`}>
              <div
                className={`rounded-2xl px-4 py-2.5 text-sm whitespace-pre-line ${
                  m.role === 'rick'
                    ? 'bg-forest text-white rounded-br-sm'
                    : 'card rounded-bl-sm text-ink'
                }`}
              >
                {m.text}
              </div>
              {/* live UNDERSTAND output under the user's message */}
              {m.classified && (
                <div className="mt-1.5 animate-fade-up">
                  <div className="card p-2.5 bg-surface/80">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-faint mb-1.5">
                      <Database className="h-3 w-3" /> understood → filed in memory
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <DomainChip domain={m.classified.domain} small />
                      <KindChip kind={m.classified.kind} />
                      <SentimentChip sentiment={m.classified.sentiment} />
                    </div>
                    <p className="text-xs text-muted mt-1.5">“{m.classified.summary}”</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* suggestions */}
      <div className="flex flex-wrap gap-2 mt-3">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => send(s)}
            className="text-xs rounded-full border border-line px-3 py-1 text-muted hover:text-ink hover:border-line transition-colors"
          >
            {s}
          </button>
        ))}
      </div>

      {/* input */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
        className="mt-3 flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask, vent, or dump a thought…"
          className="flex-1 rounded-xl bg-surface border border-line px-4 py-3 text-sm outline-none focus:border-prjct/60"
        />
        <button type="submit" className="btn-primary px-4" disabled={!input.trim()}>
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  )
}

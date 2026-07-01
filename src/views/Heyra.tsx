import { useState, useRef, useEffect, useMemo } from 'react'
import { useStore } from '../store'
import { DOMAIN_META, TODAY, fmtDate, daysBetween } from '../domains'
import { DomainChip, SentimentChip, KindChip } from '../components/ui'
import type { StructuredItem, TaskDraft } from '../types'
import { detectSkill, parseTaskDraft, SKILLS, type SkillId } from '../heyra/skills'
import { contextualSuggestions, followUpSuggestions, type Topic } from '../heyra/suggestions'
import TaskCard from '../components/TaskCard'
import { Send, Sparkles, Database, Mic, MicOff, Wand2, Lightbulb } from 'lucide-react'

interface Msg {
  id: string
  role: 'rick' | 'heyra'
  text: string
  classified?: StructuredItem
  skill?: SkillId
  trigger?: string | null
  draft?: TaskDraft
  taskAdded?: boolean
  topic?: Topic
}

// Minimal typings for the Web Speech API (not in TS lib by default).
type SpeechRec = { start: () => void; stop: () => void; onresult: ((e: any) => void) | null; onend: (() => void) | null; lang: string; interimResults: boolean; continuous: boolean }

export default function Heyra() {
  const store = useStore()
  const [input, setInput] = useState('')
  const [listening, setListening] = useState(false)
  const recRef = useRef<SpeechRec | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      id: 'm0',
      role: 'heyra',
      text:
        'Ik lees uit je ene geheugen over ParkingYou, PRJCT, Buurtkaart en je persoonlijke leven. Vraag me iets, praat tegen me, of dump een gedachte. Hoor ik een taak of herinnering, dan schakel ik over naar de Taakmaker en maak ik er een kaart van — met deadline en knoppen om ’m in je taken of Google Agenda te zetten.',
    },
  ])
  const endRef = useRef<HTMLDivElement>(null)

  // Suggestions before the first exchange: built live from projects, loops,
  // payments, inbox, habits, Kyra and goals — whatever actually needs
  // attention today. Recomputed whenever the underlying data changes.
  const openingSuggestions = useMemo(
    () => contextualSuggestions(store),
    [store.projects, store.threads, store.payments, store.emails, store.habits, store.dogReminders, store.clients, store.checkins, store.goals, store.milestones],
  )
  const [suggestions, setSuggestions] = useState<string[]>(openingSuggestions)
  const conversationStarted = msgs.length > 1

  useEffect(() => {
    if (!conversationStarted) setSuggestions(openingSuggestions)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openingSuggestions, conversationStarted])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs])

  const speechSupported =
    typeof window !== 'undefined' &&
    ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)

  function toggleMic() {
    if (!speechSupported) return
    if (listening) {
      recRef.current?.stop()
      return
    }
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    const rec: SpeechRec = new Ctor()
    rec.lang = 'nl-NL'
    rec.interimResults = true
    rec.continuous = false
    rec.onresult = (e: any) => {
      const text = Array.from(e.results)
        .map((r: any) => r[0].transcript)
        .join('')
      setInput(text)
    }
    rec.onend = () => setListening(false)
    recRef.current = rec
    setListening(true)
    rec.start()
  }

  function answer(item: StructuredItem): { text: string; topic: Topic } {
    const t = item.text.toLowerCase()
    const open = store.threads.filter((x) => x.status === 'open')
    const inDomain = open.filter((x) => x.domain === item.domain)

    if (/open|owe|loop|todo|to do|klant|staat/.test(t)) {
      const sorted = open
        .slice()
        .sort((a, b) => (a.due ? daysBetween(TODAY, a.due) : 999) - (b.due ? daysBetween(TODAY, b.due) : 999))
      const top = sorted
        .slice(0, 3)
        .map((x) => `• ${x.title} (${DOMAIN_META[x.domain].label}${x.due ? `, due ${x.due.slice(5)}` : ''})`)
        .join('\n')
      return {
        text: open.length
          ? `Je hebt ${open.length} open loops over alle domeinen. De meest urgente:\n${top}`
          : `Geen open loops — alles gesloten. 🎉`,
        topic: 'open-loops',
      }
    }
    if (/moe|slaap|energie|uitgeput|tired/.test(t)) {
      const last = store.dayLogs[store.dayLogs.length - 1]
      return {
        text: last
          ? `Je sliep ${last.sleepHours}u en energie ${last.energy}/5. Je versterkte patroon: onder 6u zakt je energie ~50%. Ik hou je 09:30 deep-work blok beschermd en schuif admin naar de middag.`
          : `Ik heb nog geen slaap-/energiedata om op te reflecteren.`,
        topic: 'energy',
      }
    }
    if (/factuur|betaald|van dijk|geld|uitgaven|betalen/.test(t)) {
      const openPayments = store.payments.filter((p) => p.status === 'open').sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'))
      const outgoing = openPayments.filter((p) => p.direction === 'outgoing')
      const incoming = openPayments.filter((p) => p.direction === 'incoming')
      if (!outgoing.length && !incoming.length) {
        return { text: `Geen openstaande betalingen — alles is afgehandeld.`, topic: 'money' }
      }
      const lines: string[] = []
      if (outgoing.length) {
        const top = outgoing.slice(0, 3).map((p) => `• ${p.payee} · €${p.amount}${p.due ? ` · ${fmtDate(p.due)}` : ''}`).join('\n')
        lines.push(`${outgoing.length} te betalen:\n${top}`)
      }
      if (incoming.length) {
        const total = incoming.reduce((a, p) => a + p.amount, 0)
        lines.push(`${incoming.length} nog te ontvangen, samen €${total}.`)
      }
      return { text: lines.join('\n\n'), topic: 'money' }
    }
    if (item.kind === 'task') {
      return {
        text: `Opgeslagen als taak in ${DOMAIN_META[item.domain].label} en een loop geopend zodat het niet verloren gaat. Ik laat het zien in Today en de Day Builder.`,
        topic: 'task-note',
      }
    }
    if (item.sentiment === 'stressed' || item.kind === 'vent') {
      return {
        text: `Vent gelogd onder ${DOMAIN_META[item.domain].label}. Je hebt ${inDomain.length} open ${DOMAIN_META[item.domain].label} loop(s), dat is waarschijnlijk deel van de last. Ik kijk of dit samenvalt met je uitgaven-patroon.`,
        topic: 'vent',
      }
    }
    return {
      text: `Genoteerd, geclassificeerd in ${DOMAIN_META[item.domain].label} als ${item.kind} en aan het geheugen toegevoegd. Je hebt daar ${inDomain.length} andere open loop(s).`,
      topic: 'domain',
    }
  }

  function addTaskFromCard(msgId: string, draft: TaskDraft) {
    store.addTask(draft)
    setMsgs((m) => m.map((x) => (x.id === msgId ? { ...x, draft, taskAdded: true } : x)))
  }

  function send(text: string) {
    const clean = text.trim()
    if (!clean) return
    setInput('')

    const detection = detectSkill(clean)

    if (detection.skill === 'task') {
      // Function switch → Taakmaker. Still log the raw thought to memory, but
      // don't auto-open a loop — the card's "Toevoegen" button does that.
      const item = store.capture(clean, 'chat', { openThread: false })
      const draft = parseTaskDraft(clean)
      setMsgs((m) => [...m, { id: 'r' + item.id, role: 'rick', text: clean, classified: item }])
      setTimeout(() => {
        setMsgs((m) => [
          ...m,
          {
            id: 'h' + item.id,
            role: 'heyra',
            text: 'Ik heb dit als taak begrepen. Kijk de kaart na, pas aan waar nodig, en zet ’m in je taken of in Google Agenda.',
            skill: 'task',
            trigger: detection.trigger,
            draft,
            topic: 'task-draft',
          },
        ])
        setSuggestions(followUpSuggestions('task-draft', store, { domain: draft.domain }))
      }, 400)
      return
    }

    // Default → answer from memory.
    const item = store.capture(clean, 'chat')
    setMsgs((m) => [...m, { id: 'r' + item.id, role: 'rick', text: clean, classified: item }])
    setTimeout(() => {
      const { text: replyText, topic } = answer(item)
      setMsgs((m) => [...m, { id: 'h' + item.id, role: 'heyra', text: replyText, topic }])
      setSuggestions(followUpSuggestions(topic, store, { domain: item.domain }))
    }, 400)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="h-5 w-5 text-prjct" />
        <h1 className="text-xl font-semibold">HEYRA</h1>
        <span className="chip bg-sunken text-muted">antwoordt uit één geheugen</span>
      </div>

      <div className="flex-1 overflow-auto space-y-4 pr-1">
        {msgs.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'rick' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] ${m.role === 'rick' ? 'order-2' : ''}`}>
              {m.skill === 'task' && (
                <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-prjct-deep animate-fade-up">
                  <span className="inline-flex items-center gap-1 rounded-full bg-prjct/12 px-2 py-0.5 font-medium">
                    <Wand2 className="h-3 w-3" /> Functie gewisseld → {SKILLS.task.label}
                  </span>
                  {m.trigger && m.trigger !== 'imperatief' && (
                    <span className="text-faint">herkende “{m.trigger.trim()}”</span>
                  )}
                </div>
              )}
              <div
                className={`rounded-2xl px-4 py-2.5 text-sm whitespace-pre-line ${
                  m.role === 'rick' ? 'bg-forest text-white rounded-br-sm' : 'card rounded-bl-sm text-ink'
                }`}
              >
                {m.text}
              </div>
              {m.draft && (
                <div className="mt-2">
                  <TaskCard
                    draft={m.draft}
                    added={!!m.taskAdded}
                    onAdd={(d) => addTaskFromCard(m.id, d)}
                  />
                </div>
              )}
              {m.classified && (
                <div className="mt-1.5 animate-fade-up">
                  <div className="card p-2.5 bg-surface/80">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-faint mb-1.5">
                      <Database className="h-3 w-3" /> begrepen → in geheugen
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

      {suggestions.length > 0 && (
        <div className="mt-3">
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-faint mb-1.5">
            <Lightbulb className="h-3 w-3" />
            {conversationStarted ? 'vervolgvragen' : 'op basis van je geheugen'}
          </div>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="text-xs rounded-full border border-line px-3 py-1 text-muted hover:text-ink hover:border-prjct/40 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
        className="mt-3 flex gap-2"
      >
        {speechSupported && (
          <button
            type="button"
            onClick={toggleMic}
            className={`btn px-3 ${listening ? 'bg-cross text-white animate-pulse-ring' : 'btn-ghost'}`}
            aria-label={listening ? 'Stop opname' : 'Spraakinvoer'}
          >
            {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
        )}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={listening ? 'Luisteren…' : 'Vraag, vent, of dump een gedachte…'}
          className="flex-1 rounded-xl bg-surface border border-line px-4 py-3 text-sm outline-none focus:border-prjct/60"
        />
        <button type="submit" className="btn-primary px-4" disabled={!input.trim()}>
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  )
}

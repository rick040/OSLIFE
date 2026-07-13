import { useState, useRef, useEffect, useMemo } from 'react'
import { useStore } from '../store'
import { SKILLS, type AgentId } from '../heyra/skills'
import { contextualSuggestions, followUpSuggestions, type Topic } from '../heyra/suggestions'
import { routeMessage } from '../heyra/router'
import { emptyMemory, remember, type ConversationMemory } from '../heyra/memory'
import type { LearnedFact } from '../heyra/learning'
import type { SearchCardData, ChartCardData, ClientIntakeDraft } from '../heyra/cards'
import { DomainChip, SentimentChip, KindChip } from '../components/ui'
import type { StructuredItem, TaskDraft, Project, Client, Message } from '../types'
import TaskCard from '../components/TaskCard'
import SearchResultCard from '../components/SearchResultCard'
import DataVizCard from '../components/DataVizCard'
import ProjectCard from '../components/ProjectCard'
import ClientIntakeCard, { type ClientIntakeCommitOptions, type ClientIntakeResult } from '../components/ClientIntakeCard'
import { Send, Sparkles, Database, Mic, MicOff, Wand2, Lightbulb, Brain } from 'lucide-react'

interface Msg {
  id: string
  role: 'rick' | 'heyra'
  text: string
  pending?: boolean
  classified?: StructuredItem
  skill?: AgentId
  trigger?: string | null
  draft?: TaskDraft
  taskAdded?: boolean
  search?: SearchCardData
  chart?: ChartCardData
  project?: Project
  clientIntake?: ClientIntakeDraft
  clientIntakeResult?: ClientIntakeResult | null
  topic?: Topic
  learned?: LearnedFact[]
}

// Minimal typings for the Web Speech API (not in TS lib by default).
type SpeechRec = { start: () => void; stop: () => void; onresult: ((e: any) => void) | null; onend: (() => void) | null; lang: string; interimResults: boolean; continuous: boolean }

export default function Heyra({ onNav }: { onNav?: (v: string) => void } = {}) {
  const store = useStore()
  const [input, setInput] = useState('')
  const [listening, setListening] = useState(false)
  const recRef = useRef<SpeechRec | null>(null)
  const memoryRef = useRef<ConversationMemory>(emptyMemory())
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      id: 'm0',
      role: 'heyra',
      text:
        'Ik lees uit je ene geheugen over ParkingYou, PRJCT, Buurtkaart en je persoonlijke leven. Vraag me iets, praat tegen me, of dump een gedachte. Hoor ik een taak, dan maak ik een taakkaart. Vraag je naar een project, cijfers of iets specifieks, dan krijg je een projectkaart, grafiek of zoekresultaat terug. En voor alles daarbuiten — iets uitleggen, meedenken, een e-mail, skill of prompt schrijven, code — schakel ik naar mijn assistent-modus, zodat je hier niet meer naar Claude hoeft.',
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

  function addTaskFromCard(msgId: string, draft: TaskDraft) {
    store.addTask(draft)
    setMsgs((m) => m.map((x) => (x.id === msgId ? { ...x, draft, taskAdded: true } : x)))
  }

  async function commitClientIntake(msgId: string, draft: ClientIntakeDraft, opts: ClientIntakeCommitOptions) {
    const useExisting = Boolean(draft.matchedClientId) && !opts.forceNewClient && opts.createClient
    const today = new Date().toISOString().slice(0, 10)

    const clientPayload: Omit<Client, 'id'> | null =
      !opts.createClient || useExisting
        ? null
        : {
            name: draft.clientName,
            domain: 'prjct',
            clientStatus: opts.createProject ? 'Active' : 'Lead',
            email: draft.email,
            scope: draft.budgetGuess,
            firstContact: today,
          }

    const projectPayload: Omit<Project, 'id'> | null = !opts.createProject
      ? null
      : {
          name: `${draft.clientName} - ${draft.projectType[0] ?? 'Project'}`,
          client: draft.clientName,
          domain: 'prjct',
          status: 'lead',
          deadline: draft.deadlineGuess,
          progress: 0,
          value: draft.budgetGuess ?? 0,
          type: draft.projectType,
          deliverables: draft.deliverables,
        }

    const message: Omit<Message, 'id'> = {
      contact: draft.clientName,
      contactKey: draft.email ?? draft.clientName,
      channel: draft.channelGuess,
      direction: 'in',
      subject: null,
      snippet: draft.sourceText.slice(0, 140),
      body: draft.sourceText,
      ts: new Date().toISOString(),
      unread: false,
      source: 'manual',
    }

    const result = await store.createClientIntake({
      client: clientPayload,
      existingClientId: useExisting ? draft.matchedClientId : null,
      project: projectPayload,
      tasks: opts.createProject ? draft.deliverables : [],
      message,
    })
    setMsgs((m) => m.map((x) => (x.id === msgId ? { ...x, clientIntakeResult: result } : x)))
  }

  async function send(text: string) {
    const clean = text.trim()
    if (!clean) return
    setInput('')

    const rickId = crypto.randomUUID()
    const heyraId = crypto.randomUUID()
    // The user's own bubble shows instantly (no classification chip yet — that
    // lands once the brain-first routeMessage() call resolves), and a pending
    // HEYRA bubble covers the real latency a brain call now takes.
    setMsgs((m) => [
      ...m,
      { id: rickId, role: 'rick', text: clean },
      { id: heyraId, role: 'heyra', text: '', pending: true },
    ])
    memoryRef.current = remember(memoryRef.current, { role: 'rick', text: clean })

    try {
      const { agent, trigger, result, item } = await routeMessage(clean, { store, memory: memoryRef.current })

      setMsgs((m) => m.map((x) => (x.id === rickId ? { ...x, classified: item } : x)))

      memoryRef.current = remember(memoryRef.current, { role: 'heyra', text: result.text }, {
        topic: result.topic,
        domain: item.domain,
        entity: result.entity,
      })

      setMsgs((m) =>
        m.map((x) =>
          x.id === heyraId
            ? {
                ...x,
                text: result.text,
                pending: false,
                skill: agent === 'chat' ? undefined : agent,
                trigger,
                draft: result.draft,
                search: result.search,
                chart: result.chart,
                project: result.project,
                clientIntake: result.clientIntake,
                topic: result.topic,
              }
            : x,
        ),
      )
      setSuggestions(followUpSuggestions(result.topic, store, { domain: item.domain }))

      // Learn as we speak: distil any durable fact from this exchange in the
      // background and, if HEYRA learned something new, tag the reply so the
      // "onthouden" chip shows what it picked up. Best-effort — a failure here
      // never affects the reply that already rendered.
      void store
        .learnFromExchange(clean, result.text)
        .then((learned) => {
          if (learned.length) {
            setMsgs((m) => m.map((x) => (x.id === heyraId ? { ...x, learned } : x)))
          }
        })
        .catch(() => {})
    } catch {
      setMsgs((m) =>
        m.map((x) => (x.id === heyraId ? { ...x, pending: false, text: 'Er ging iets mis — probeer het nog eens.' } : x)),
      )
    }
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
              {m.skill && (
                <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-prjct-deep animate-fade-up">
                  <span className="inline-flex items-center gap-1 rounded-full bg-prjct/12 px-2 py-0.5 font-medium">
                    <Wand2 className="h-3 w-3" /> Functie gewisseld → {SKILLS[m.skill].label}
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
                {m.pending ? (
                  <span className="inline-flex items-center gap-1 text-faint">
                    <span className="h-1.5 w-1.5 rounded-full bg-faint animate-pulse" />
                    <span className="h-1.5 w-1.5 rounded-full bg-faint animate-pulse [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-faint animate-pulse [animation-delay:300ms]" />
                  </span>
                ) : (
                  m.text
                )}
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
              {m.search && (
                <div className="mt-2">
                  <SearchResultCard data={m.search} onNav={onNav} />
                </div>
              )}
              {m.chart && (
                <div className="mt-2">
                  <DataVizCard data={m.chart} />
                </div>
              )}
              {m.project && (
                <div className="mt-2">
                  <ProjectCard project={m.project} onNav={onNav} />
                </div>
              )}
              {m.clientIntake && (
                <div className="mt-2">
                  <ClientIntakeCard
                    draft={m.clientIntake}
                    result={m.clientIntakeResult}
                    onCommit={(draft, opts) => commitClientIntake(m.id, draft, opts)}
                    onNav={onNav}
                  />
                </div>
              )}
              {m.learned && m.learned.length > 0 && (
                <div className="mt-1.5 animate-fade-up">
                  <div className="card p-2.5 bg-prjct/8 border-prjct/20">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-prjct-deep mb-1.5">
                      <Brain className="h-3 w-3" /> onthouden — leert terwijl we praten
                    </div>
                    <ul className="space-y-1">
                      {m.learned.map((f) => (
                        <li key={f.id} className="text-xs text-muted">• {f.text}</li>
                      ))}
                    </ul>
                  </div>
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
          void send(input)
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

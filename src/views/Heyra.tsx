import { useState, useRef, useEffect, useMemo } from 'react'
import { useStore } from '../store'
import { SKILLS, type AgentId } from '../heyra/skills'
import { contextualSuggestions, followUpSuggestions, actionFollowUpSuggestion, type Topic } from '../heyra/suggestions'
import { routeMessage } from '../heyra/router'
import { emptyMemory, remember, rememberSuggestions, type ConversationMemory } from '../heyra/memory'
import type { LearnedFact } from '../heyra/learning'
import type { SearchCardData, ChartCardData, ClientIntakeDraft, IdeaCaptureDraft } from '../heyra/cards'
import { DomainChip, SentimentChip, KindChip } from '../components/ui'
import type { StructuredItem, TaskDraft, Project, Client, Message } from '../types'
import TaskCard from '../components/TaskCard'
import SearchResultCard from '../components/SearchResultCard'
import DataVizCard from '../components/DataVizCard'
import ProjectCard from '../components/ProjectCard'
import ClientIntakeCard, { type ClientIntakeCommitOptions, type ClientIntakeResult } from '../components/ClientIntakeCard'
import IdeaCaptureCard from '../components/IdeaCaptureCard'
import ActionCardView from '../components/ActionCardView'
import VoiceInputPanel from '../components/VoiceInputPanel'
import { dispatchAction } from '../heyra/actions/registry'
import type { ActionCard, EntityRef } from '../heyra/actions/types'
import { Send, Sparkles, Database, Mic, Wand2, Lightbulb, Brain } from 'lucide-react'

interface Msg {
  id: string
  role: 'rick' | 'heyra'
  text: string
  pending?: boolean
  classified?: StructuredItem
  skill?: AgentId
  trigger?: string | null
  /** Generic dynamic cards (Phase 2+ agents) — rendered through ActionCardView, one component for any action kind. */
  cards?: ActionCard[]
  draft?: TaskDraft
  taskAdded?: boolean
  search?: SearchCardData
  chart?: ChartCardData
  project?: Project
  clientIntake?: ClientIntakeDraft
  clientIntakeResult?: ClientIntakeResult | null
  ideaDraft?: IdeaCaptureDraft
  ideaCreatedId?: string | null
  topic?: Topic
  learned?: LearnedFact[]
}

// A brain-routed reply can take a few sequential round-trips (routing, the
// agent's own answer, semantic recall) — a static "..." reads as "did this
// break?" past a couple of seconds. Cheap, honest staging: we don't know the
// real stage, but a rotating label at least signals it's still working.
const PENDING_LABELS = ['Denkt na…', 'Zoekt in je geheugen…', 'Bijna klaar…']

export default function Heyra({ onNav }: { onNav?: (v: string) => void } = {}) {
  const store = useStore()
  const [input, setInput] = useState('')
  const [voicePanelOpen, setVoicePanelOpen] = useState(false)
  const [pendingLabel, setPendingLabel] = useState(PENDING_LABELS[0])
  const pendingTimers = useRef<number[]>([])
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
    () => contextualSuggestions(store, memoryRef.current.recentSuggestions),
    [store.projects, store.threads, store.payments, store.emails, store.habits, store.dogReminders, store.clients, store.checkins, store.goals, store.milestones],
  )
  const [suggestions, setSuggestions] = useState<string[]>(openingSuggestions)
  const conversationStarted = msgs.length > 1

  /** setSuggestions() + records what was shown, so the next pass can deprioritize repeats — every suggestion update should go through this, not setSuggestions directly. */
  function showSuggestions(list: string[]) {
    setSuggestions(list)
    memoryRef.current = rememberSuggestions(memoryRef.current, list)
  }

  useEffect(() => {
    if (!conversationStarted) showSuggestions(openingSuggestions)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openingSuggestions, conversationStarted])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs])

  useEffect(() => () => { pendingTimers.current.forEach(clearTimeout) }, [])

  const speechSupported =
    typeof window !== 'undefined' &&
    Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)

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
            researchNote: draft.researchNote ?? null,
            researchedAt: draft.researchNote ? new Date().toISOString() : null,
          }

    // Existing client, freshly researched: cache the note so it isn't re-fetched
    // next time (clientIntakeAgent already skips this when a cached note exists).
    if (useExisting && draft.researchNote && draft.matchedClientId) {
      const existing = store.clients.find((c) => c.id === draft.matchedClientId)
      if (existing && !existing.researchNote) {
        store.updateClient(draft.matchedClientId, {
          researchNote: draft.researchNote,
          researchedAt: new Date().toISOString(),
        })
      }
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

  async function commitIdea(msgId: string, draft: IdeaCaptureDraft) {
    const row = await store.captureBusinessIdea({
      title: draft.title,
      source: draft.source,
      rawInput: draft.rawInput,
      domain: draft.domain,
    })
    setMsgs((m) => m.map((x) => (x.id === msgId ? { ...x, ideaCreatedId: row?.id ?? null } : x)))
  }

  /** Applies a patch to one card within one message's `cards` array — every action-card interaction (confirm/cancel/disambiguate) goes through this. */
  function patchCard(msgId: string, cardId: string, patch: Partial<ActionCard>) {
    setMsgs((m) =>
      m.map((x) =>
        x.id === msgId ? { ...x, cards: x.cards?.map((c) => (c.id === cardId ? { ...c, ...patch } : c)) } : x,
      ),
    )
  }

  async function confirmCard(msgId: string, card: ActionCard) {
    patchCard(msgId, card.id, { status: 'confirmed' })
    const outcome = await dispatchAction(store, card)
    patchCard(msgId, card.id, outcome.ok ? { status: 'dispatched' } : { status: 'failed', error: outcome.error })

    // A just-completed action is a stronger next-step signal than the generic
    // topic follow-ups — surface it alongside whatever's already suggested.
    if (outcome.ok) {
      const followUp = actionFollowUpSuggestion(card.kind, card.entity?.label)
      if (followUp) showSuggestions([followUp, ...suggestions.filter((s) => s !== followUp)].slice(0, 4))
    }
  }

  function cancelCard(msgId: string, card: ActionCard) {
    patchCard(msgId, card.id, { status: 'dismissed' })
  }

  function selectCardCandidate(msgId: string, card: ActionCard, entity: EntityRef) {
    patchCard(msgId, card.id, { entity, candidates: [] })
  }

  function startPendingLabels() {
    pendingTimers.current.forEach(clearTimeout)
    setPendingLabel(PENDING_LABELS[0])
    pendingTimers.current = [
      window.setTimeout(() => setPendingLabel(PENDING_LABELS[1]), 2200),
      window.setTimeout(() => setPendingLabel(PENDING_LABELS[2]), 5500),
    ]
  }
  function stopPendingLabels() {
    pendingTimers.current.forEach(clearTimeout)
    pendingTimers.current = []
  }

  async function send(text: string, opts?: { viaVoice?: boolean }) {
    const clean = text.trim()
    if (!clean) return
    setInput('')
    startPendingLabels()

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
                cards: result.cards,
                draft: result.draft,
                search: result.search,
                chart: result.chart,
                project: result.project,
                clientIntake: result.clientIntake,
                ideaDraft: result.ideaDraft,
                topic: result.topic,
              }
            : x,
        ),
      )
      showSuggestions(
        followUpSuggestions(
          result.topic,
          store,
          {
            domain: item.domain,
            projectName: result.project?.name,
            searchQuery: result.search?.query,
            chartTitle: result.chart?.title,
            clientName: result.clientIntake?.clientName,
          },
          memoryRef.current.recentSuggestions,
        ),
      )

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

      // Voice turns get a second, DURABLE log beyond the distilled facts above:
      // the raw exchange goes into the braindump/embeddings pipeline (tagged
      // heyra-voice) so it's fully recall-searchable via search_memory(), not
      // just reduced to whatever fact extractFacts() happened to keep.
      // Best-effort — never affects the reply that already rendered.
      if (opts?.viaVoice) {
        void store.braindumpCapture({
          sourceKind: 'text',
          title: 'HEYRA (spraak)',
          text: `Rick (spraak): ${clean}\n\nHEYRA: ${result.text}`,
          domain: item.domain,
          sourceTag: 'heyra-voice',
        })
      }
    } catch {
      // Give the text back — losing what you just typed on a failed send is a
      // real dead-end, especially for a longer thought dumped in one go.
      setInput(clean)
      setMsgs((m) =>
        m.map((x) =>
          x.id === heyraId
            ? { ...x, pending: false, text: 'Er ging iets mis — je bericht staat weer in het invoerveld, probeer het nog eens.' }
            : x,
        ),
      )
    } finally {
      stopPendingLabels()
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sunken">
          <Sparkles className="h-5 w-5 text-ink-soft" />
        </span>
        <div>
          <h1 className="text-xl font-medium text-ink">HEYRA</h1>
          <p className="text-sm text-muted mt-0.5">antwoordt uit één geheugen</p>
        </div>
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
                  <span className="inline-flex items-center gap-1.5 text-faint">
                    <span className="inline-flex gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-faint animate-pulse" />
                      <span className="h-1.5 w-1.5 rounded-full bg-faint animate-pulse [animation-delay:150ms]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-faint animate-pulse [animation-delay:300ms]" />
                    </span>
                    <span className="text-xs">{pendingLabel}</span>
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
              {m.ideaDraft && (
                <div className="mt-2">
                  <IdeaCaptureCard
                    draft={m.ideaDraft}
                    createdId={m.ideaCreatedId}
                    onCommit={(draft) => commitIdea(m.id, draft)}
                    onNav={onNav}
                  />
                </div>
              )}
              {m.cards?.map((card) => (
                <div className="mt-2" key={card.id}>
                  <ActionCardView
                    card={card}
                    onNav={onNav}
                    onConfirm={(c) => confirmCard(m.id, c)}
                    onCancel={(c) => cancelCard(m.id, c)}
                    onSelectCandidate={(c, entity) => selectCardCandidate(m.id, c, entity)}
                  />
                </div>
              ))}
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
            onClick={() => setVoicePanelOpen(true)}
            className="btn px-3 btn-ghost"
            aria-label="Spraakinvoer"
          >
            <Mic className="h-4 w-4" />
          </button>
        )}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Vraag, vent, of dump een gedachte…"
          className="flex-1 rounded-xl bg-surface border border-line px-4 py-3 text-sm outline-none focus:border-prjct/60"
        />
        <button type="submit" className="btn-primary px-4" disabled={!input.trim()}>
          <Send className="h-4 w-4" />
        </button>
      </form>

      {voicePanelOpen && (
        <VoiceInputPanel
          onSend={(text) => void send(text, { viaVoice: true })}
          onClose={() => setVoicePanelOpen(false)}
        />
      )}
    </div>
  )
}

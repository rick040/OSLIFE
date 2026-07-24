import { useState, useRef, useEffect, useMemo } from 'react'
import { useStore } from '../store'
import { SKILLS, type AgentId } from '../heyra/skills'
import { contextualSuggestions, followUpSuggestions, actionFollowUpSuggestion, brainFollowUps, type Topic } from '../heyra/suggestions'
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
import HeyraOrb from '../components/HeyraOrb'
import { Markdown, MarkdownInline } from '../components/Markdown'
import { dispatchAction } from '../heyra/actions/registry'
import type { ActionCard, EntityRef } from '../heyra/actions/types'
import { Send, Database, Mic, Wand2, Lightbulb, Brain } from 'lucide-react'

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

// A short confirmation/prompt reads well blown up to text-2xl and centered
// (the "ambient" look); a multi-sentence answer doesn't — past this length
// it falls back to normal readable body text instead.
const AMBIENT_TEXT_LIMIT = 100

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
      text: 'Vraag me iets, praat tegen me, of dump een gedachte.',
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
      // Instant, rule-based follow-ups first (topic-shaped, always available) —
      // then, best-effort, upgrade to suggestions actually grounded in what
      // HEYRA just said (not just its topic). Never blocks the reply that
      // already rendered; a brain failure just leaves the rule-based chips.
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
      void brainFollowUps(clean, result.text, memoryRef.current.recentSuggestions)
        .then((grounded) => {
          if (grounded && grounded.length) showSuggestions(grounded)
        })
        .catch(() => {})

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

  // Every past message stays fully visible and scrollable — only the very
  // latest HEYRA reply gets the ambient orb+big-text treatment; everything
  // before it renders as normal, fully readable chat history so you can
  // always scroll back and read exactly what was said.
  const lastIdx = msgs.length - 1
  const orbState = msgs[lastIdx]?.pending ? 'thinking' : 'idle'

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] max-w-3xl mx-auto">
      <div className="flex-1 overflow-auto flex flex-col gap-3 pr-1">
        {msgs.map((m, idx) => {
          const isCurrent = idx === lastIdx && m.role === 'heyra'

          if (m.role === 'rick') {
            return (
              <div key={m.id} className="flex flex-col items-end gap-1.5">
                <span className="max-w-[80%] rounded-2xl bg-forest text-white px-4 py-2.5 text-sm whitespace-pre-line">
                  {m.text}
                </span>
                {m.classified && (
                  <div className="card p-2.5 bg-surface/80 text-left max-w-[85%] animate-fade-up">
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
                )}
              </div>
            )
          }

          return (
            <div key={m.id} className={isCurrent ? 'relative flex flex-col items-center gap-3 py-8 text-center' : 'flex flex-col items-start gap-2'}>
              {isCurrent && <HeyraOrb state={orbState} />}
              <div className={isCurrent ? 'relative z-10 w-full max-w-md mx-auto flex flex-col items-center gap-3' : 'w-full max-w-[85%]'}>
                {m.skill && (
                  <div className={`flex items-center gap-1.5 text-[11px] text-prjct-deep animate-fade-up ${isCurrent ? 'justify-center' : ''}`}>
                    <span className="inline-flex items-center gap-1 rounded-full bg-prjct/12 px-2 py-0.5 font-medium">
                      <Wand2 className="h-3 w-3" /> Functie gewisseld → {SKILLS[m.skill].label}
                    </span>
                    {m.trigger && m.trigger !== 'imperatief' && (
                      <span className="text-faint">herkende “{m.trigger.trim()}”</span>
                    )}
                  </div>
                )}

                {m.pending ? (
                  isCurrent ? (
                    <span className="text-sm text-muted animate-fade-up">{pendingLabel}</span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-2xl card px-4 py-2.5 text-faint">
                      <span className="inline-flex gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-faint animate-pulse" />
                        <span className="h-1.5 w-1.5 rounded-full bg-faint animate-pulse [animation-delay:150ms]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-faint animate-pulse [animation-delay:300ms]" />
                      </span>
                      <span className="text-xs">{pendingLabel}</span>
                    </span>
                  )
                ) : isCurrent && m.text.length <= AMBIENT_TEXT_LIMIT ? (
                  <p className="text-2xl font-medium text-ink leading-snug animate-fade-up whitespace-pre-line">
                    <MarkdownInline text={m.text} />
                  </p>
                ) : isCurrent ? (
                  // A long answer (a summary, a detailed explanation) doesn't
                  // read well blown up and centered — normal body text in a
                  // soft card instead, still inside the same centered column.
                  <div className="w-full card p-4 text-left animate-fade-up">
                    <Markdown text={m.text} />
                  </div>
                ) : (
                  <div className="rounded-2xl card rounded-bl-sm px-4 py-2.5 text-sm text-ink">
                    <Markdown text={m.text} />
                  </div>
                )}

                {!m.pending && (
                  <>
                    {m.draft && (
                      <TaskCard draft={m.draft} added={!!m.taskAdded} onAdd={(d) => addTaskFromCard(m.id, d)} />
                    )}
                    {m.search && <SearchResultCard data={m.search} onNav={onNav} />}
                    {m.chart && <DataVizCard data={m.chart} />}
                    {m.project && <ProjectCard project={m.project} onNav={onNav} />}
                    {m.clientIntake && (
                      <ClientIntakeCard
                        draft={m.clientIntake}
                        result={m.clientIntakeResult}
                        onCommit={(draft, opts) => commitClientIntake(m.id, draft, opts)}
                        onNav={onNav}
                      />
                    )}
                    {m.ideaDraft && (
                      <IdeaCaptureCard
                        draft={m.ideaDraft}
                        createdId={m.ideaCreatedId}
                        onCommit={(draft) => commitIdea(m.id, draft)}
                        onNav={onNav}
                      />
                    )}
                    {m.cards?.map((card) => (
                      <ActionCardView
                        key={card.id}
                        card={card}
                        onNav={onNav}
                        onConfirm={(c) => confirmCard(m.id, c)}
                        onCancel={(c) => cancelCard(m.id, c)}
                        onSelectCandidate={(c, entity) => selectCardCandidate(m.id, c, entity)}
                      />
                    ))}
                    {m.learned && m.learned.length > 0 && (
                      <div className="card p-2.5 bg-prjct/8 border-prjct/20 text-left animate-fade-up">
                        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-prjct-deep mb-1.5">
                          <Brain className="h-3 w-3" /> onthouden — leert terwijl we praten
                        </div>
                        <ul className="space-y-1">
                          {m.learned.map((f) => (
                            <li key={f.id} className="text-xs text-muted">• {f.text}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )
        })}
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
        className="mt-3 flex items-center gap-1 rounded-full bg-surface border border-line pl-1.5 pr-1.5 py-1.5"
      >
        {speechSupported && (
          <button
            type="button"
            onClick={() => setVoicePanelOpen(true)}
            className="shrink-0 rounded-full p-2.5 text-muted hover:text-ink hover:bg-sunken transition-colors"
            aria-label="Spraakinvoer"
          >
            <Mic className="h-4 w-4" />
          </button>
        )}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Vraag, vent, of dump een gedachte…"
          className="flex-1 bg-transparent outline-none text-sm px-2"
        />
        <button
          type="submit"
          className="shrink-0 rounded-full bg-forest text-canvas p-2.5 disabled:opacity-30 transition-opacity"
          disabled={!input.trim()}
          aria-label="Versturen"
        >
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

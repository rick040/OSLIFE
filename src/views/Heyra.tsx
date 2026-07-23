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
import HeyraOrb from '../components/HeyraOrb'
import HistoryTrail from '../components/HistoryTrail'
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

  // The screen only ever shows the CURRENT exchange in full (large, centered)
  // — everything before it collapses into HistoryTrail's compact pill list.
  // Messages are always pushed in rick→heyra pairs (send()), so the last
  // message is always heyra's (the current reply/pending state) and the one
  // before it is the rick message that triggered it.
  const current = msgs[msgs.length - 1]
  const currentRick = msgs.length >= 2 ? msgs[msgs.length - 2] : undefined
  const historyMessages = msgs
    .slice(0, Math.max(0, msgs.length - 2))
    .filter((m) => m.role === 'rick')
    .map((m) => ({ id: m.id, text: m.text }))
  const orbState = current?.pending ? 'thinking' : 'idle'

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] max-w-2xl mx-auto">
      <div className="flex-1 overflow-auto flex flex-col items-center px-2">
        <div className="w-full max-w-md pt-2">
          <HistoryTrail messages={historyMessages} />
        </div>

        {/* The ambient glow sits BEHIND this whole block as a background
            layer — same "haze fills the middle, text sits on top of it"
            treatment as the reference screens, not a separate icon above
            the text. */}
        <div className="relative w-full max-w-md flex flex-col items-center gap-4 py-10 text-center min-h-[260px]">
          <HeyraOrb state={orbState} />

          <div className="relative z-10 w-full flex flex-col items-center gap-4">
            {currentRick && (
              <span className="rounded-2xl bg-sunken px-3 py-1.5 text-xs text-ink-soft">{currentRick.text}</span>
            )}

            {current?.pending ? (
              <span className="text-sm text-muted animate-fade-up">{pendingLabel}</span>
            ) : current && current.text.length <= AMBIENT_TEXT_LIMIT ? (
              <p className="text-2xl font-medium text-ink leading-snug animate-fade-up whitespace-pre-line">
                {current.text}
              </p>
            ) : (
              // A long answer (a summary, a detailed explanation) doesn't read
              // well blown up and centered — normal body text in a soft card
              // instead, still inside the same centered column.
              <div className="w-full card p-4 text-left animate-fade-up">
                <p className="text-sm text-ink leading-relaxed whitespace-pre-line">{current?.text}</p>
              </div>
            )}
          </div>
        </div>

          {current && !current.pending && (
            <div className="w-full max-w-md space-y-3">
              {current.skill && (
                <div className="flex items-center justify-center gap-1.5 text-[11px] text-prjct-deep animate-fade-up">
                  <span className="inline-flex items-center gap-1 rounded-full bg-prjct/12 px-2 py-0.5 font-medium">
                    <Wand2 className="h-3 w-3" /> Functie gewisseld → {SKILLS[current.skill].label}
                  </span>
                  {current.trigger && current.trigger !== 'imperatief' && (
                    <span className="text-faint">herkende “{current.trigger.trim()}”</span>
                  )}
                </div>
              )}
              {current.draft && (
                <TaskCard draft={current.draft} added={!!current.taskAdded} onAdd={(d) => addTaskFromCard(current.id, d)} />
              )}
              {current.search && <SearchResultCard data={current.search} onNav={onNav} />}
              {current.chart && <DataVizCard data={current.chart} />}
              {current.project && <ProjectCard project={current.project} onNav={onNav} />}
              {current.clientIntake && (
                <ClientIntakeCard
                  draft={current.clientIntake}
                  result={current.clientIntakeResult}
                  onCommit={(draft, opts) => commitClientIntake(current.id, draft, opts)}
                  onNav={onNav}
                />
              )}
              {current.ideaDraft && (
                <IdeaCaptureCard
                  draft={current.ideaDraft}
                  createdId={current.ideaCreatedId}
                  onCommit={(draft) => commitIdea(current.id, draft)}
                  onNav={onNav}
                />
              )}
              {current.cards?.map((card) => (
                <ActionCardView
                  key={card.id}
                  card={card}
                  onNav={onNav}
                  onConfirm={(c) => confirmCard(current.id, c)}
                  onCancel={(c) => cancelCard(current.id, c)}
                  onSelectCandidate={(c, entity) => selectCardCandidate(current.id, c, entity)}
                />
              ))}
              {current.learned && current.learned.length > 0 && (
                <div className="card p-2.5 bg-prjct/8 border-prjct/20 text-left animate-fade-up">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-prjct-deep mb-1.5">
                    <Brain className="h-3 w-3" /> onthouden — leert terwijl we praten
                  </div>
                  <ul className="space-y-1">
                    {current.learned.map((f) => (
                      <li key={f.id} className="text-xs text-muted">• {f.text}</li>
                    ))}
                  </ul>
                </div>
              )}
              {currentRick?.classified && (
                <div className="card p-2.5 bg-surface/80 text-left animate-fade-up">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-faint mb-1.5">
                    <Database className="h-3 w-3" /> begrepen → in geheugen
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <DomainChip domain={currentRick.classified.domain} small />
                    <KindChip kind={currentRick.classified.kind} />
                    <SentimentChip sentiment={currentRick.classified.sentiment} />
                  </div>
                  <p className="text-xs text-muted mt-1.5">“{currentRick.classified.summary}”</p>
                </div>
              )}
            </div>
          )}
        <div ref={endRef} />
      </div>

      {suggestions.length > 0 && (
        <div className="mt-3">
          <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wider text-faint mb-1.5">
            <Lightbulb className="h-3 w-3" />
            {conversationStarted ? 'vervolgvragen' : 'op basis van je geheugen'}
          </div>
          <div className="flex flex-wrap justify-center gap-2">
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

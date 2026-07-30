import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { SectionTitle, Empty, DomainChip } from '../components/ui'
import { BraindumpCard, BraindumpDetail, SOURCE_LABEL } from '../components/BraindumpCard'
import { detectTextShare } from '../lib/braindump'
import { uploadBraindumpFile } from '../lib/supabase'
import { isClaudeConversationEntry } from '../lib/claudeImport'
import type { BraindumpEntry, BraindumpSourceKind, Domain } from '../types'
import { Inbox, Search, Share2, Loader2, Mic, Square } from 'lucide-react'

// Recording longer than this auto-stops and submits — keeps a slip of the
// finger from turning into an hour-long upload; matches the worker's own
// ffmpeg transcode timeout (20 min) with headroom to spare.
const MAX_RECORD_SECS = 15 * 60

const DOMAINS: Domain[] = ['parkingyou', 'prjct', 'buurtkaart', 'personal', 'cross']

export default function Capture() {
  const {
    braindumpEntries: allBraindumpEntries, braindumpCapture, deleteBraindumpEntry, retryBraindumpEntry, updateBraindumpEntry,
    braindumpLinks, linkBraindumpEntry, unlinkBraindumpEntry, threads, wikiEntries,
  } = useStore()
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState<BraindumpEntry | null>(null)

  // Claude conversations (live-logged or imported) get their own screen — see
  // views/ClaudeLog.tsx — so this grid excludes them rather than mixing two
  // very differently-shaped kinds of "capture" into one feed.
  const braindumpEntries = useMemo(
    () => allBraindumpEntries.filter((e) => !isClaudeConversationEntry(e)),
    [allBraindumpEntries],
  )

  // filters
  const [q, setQ] = useState('')
  const [kindFilter, setKindFilter] = useState<BraindumpSourceKind | 'all'>('all')
  const [domainFilter, setDomainFilter] = useState<Domain | 'all'>('all')

  async function submit() {
    const clean = text.trim()
    if (!clean || saving) return
    setSaving(true)
    setText('')
    const { kind, url } = detectTextShare(clean)
    await braindumpCapture({ sourceKind: kind, text: kind === 'text' ? clean : null, sourceUrl: url })
    setSaving(false)
  }

  // Voice capture: record in-browser with MediaRecorder, upload the raw audio,
  // and let the existing braindump-worker pipeline (ffmpeg → Groq Whisper →
  // Claude) transcribe + summarise it server-side — the same accurate path
  // already used for shared audio/video, instead of the flaky browser
  // Speech Recognition API HEYRA's voice input relies on.
  const [recording, setRecording] = useState(false)
  const [recordSecs, setRecordSecs] = useState(0)
  const [uploadingVoice, setUploadingVoice] = useState(false)
  const [micError, setMicError] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<number | null>(null)
  const secsRef = useRef(0)

  useEffect(() => () => {
    // Stop any open mic + timer if the user navigates away mid-recording.
    if (timerRef.current) window.clearInterval(timerRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
  }, [])

  async function startRecording() {
    setMicError(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicError('Opnemen wordt niet ondersteund in deze browser.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : ''
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      chunksRef.current = []
      mr.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data) }
      mr.onstop = onRecordingStop
      mr.start()
      mediaRecorderRef.current = mr
      setRecording(true)
      secsRef.current = 0
      setRecordSecs(0)
      // Ticks a plain ref + a same-value state set, rather than deriving the
      // next value inside setRecordSecs's updater — React 18 StrictMode
      // double-invokes updaters to catch impure ones, which would double-fire
      // the side-effecting stopRecording() call below.
      timerRef.current = window.setInterval(() => {
        secsRef.current += 1
        setRecordSecs(secsRef.current)
        if (secsRef.current >= MAX_RECORD_SECS) stopRecording()
      }, 1000)
    } catch {
      setMicError('Kon niet bij de microfoon — check de toestemming in je browser.')
    }
  }

  function stopRecording() {
    if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null }
    mediaRecorderRef.current?.stop()
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setRecording(false)
  }

  async function onRecordingStop() {
    const blob = new Blob(chunksRef.current, { type: mediaRecorderRef.current?.mimeType || 'audio/webm' })
    chunksRef.current = []
    if (blob.size < 800) return // accidental tap, nothing worth transcribing
    setUploadingVoice(true)
    try {
      const path = await uploadBraindumpFile(blob, `voice-${Date.now()}.webm`)
      if (!path) { setMicError('Uploaden van de opname is mislukt — probeer het nog eens.'); return }
      const row = await braindumpCapture({ sourceKind: 'audio', storagePath: path, sourceTag: 'voice-record' })
      if (!row) setMicError('Opslaan van de opname is mislukt — probeer het nog eens.')
    } finally {
      setUploadingVoice(false)
    }
  }

  function fmtSecs(s: number) {
    const m = Math.floor(s / 60)
    const r = s % 60
    return `${m}:${r.toString().padStart(2, '0')}`
  }

  // kinds actually present, for the filter chip row
  const presentKinds = useMemo(() => {
    const set = new Set<BraindumpSourceKind>()
    braindumpEntries.forEach((e) => set.add(e.sourceKind))
    return [...set]
  }, [braindumpEntries])

  // every tag used across your own braindumps, for the tag-editor's autocomplete
  const allTags = useMemo(() => {
    const set = new Set<string>()
    braindumpEntries.forEach((e) => e.tags.forEach((t) => set.add(t)))
    return [...set].sort()
  }, [braindumpEntries])

  // "apply this to somewhere" — pick lists for the link editor
  const taskOptions = useMemo(
    () => threads.filter((t) => t.status === 'open').map((t) => ({ id: t.id, title: t.title })),
    [threads],
  )
  const wikiOptions = useMemo(() => wikiEntries.map((w) => ({ id: w.id, title: w.title })), [wikiEntries])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return braindumpEntries.filter((e) => {
      if (kindFilter !== 'all' && e.sourceKind !== kindFilter) return false
      if (domainFilter !== 'all' && e.domain !== domainFilter) return false
      if (!needle) return true
      const hay = [e.title, e.summary, e.markdown, e.tags.join(' '), e.sourceUrl].filter(Boolean).join(' ').toLowerCase()
      return hay.includes(needle)
    })
  }, [braindumpEntries, q, kindFilter, domainFilter])

  // keep the open modal in sync as realtime enrichment updates the row
  const openLive = open ? braindumpEntries.find((e) => e.id === open.id) ?? open : null

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-7">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sunken">
          <Inbox className="h-5 w-5 text-ink-soft" />
        </span>
        <h1 className="text-xl font-medium text-ink">Braindump</h1>
      </div>

      {/* quick capture */}
      <div className="card p-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit() }}
          rows={3}
          placeholder="Wat er ook in je hoofd zit… (plak gerust een link)"
          disabled={recording}
          className="w-full rounded-xl bg-surface border border-line px-4 py-3 text-sm outline-none focus:border-buurtkaart/50 resize-none disabled:opacity-50"
        />

        {recording && (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-cross/10 px-3 py-2 text-sm text-cross-deep">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-cross opacity-75 animate-ping" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-cross" />
            </span>
            Aan het opnemen… {fmtSecs(recordSecs)}
          </div>
        )}
        {micError && !recording && (
          <p className="mt-3 text-xs text-cross-deep">{micError}</p>
        )}

        <div className="flex items-center justify-between mt-3">
          <span className="text-[11px] text-faint flex items-center gap-1.5">
            <Share2 className="h-3.5 w-3.5" /> Of deel iets vanaf je telefoon naar “Braindump”.
          </span>
          <div className="flex items-center gap-2">
            <button
              className={recording ? 'btn-primary !bg-cross' : 'btn-ghost'}
              onClick={recording ? stopRecording : startRecording}
              disabled={uploadingVoice}
              title={recording ? 'Opname stoppen' : 'Spraakmemo opnemen'}
            >
              {uploadingVoice ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : recording ? (
                <Square className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
              {recording ? 'Stop' : uploadingVoice ? 'Opslaan…' : 'Spreek in'}
            </button>
            <button className="btn-primary" onClick={submit} disabled={!text.trim() || saving || recording}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Opslaan
            </button>
          </div>
        </div>
      </div>

      {/* filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Zoek in je braindumps…"
            className="w-full rounded-xl bg-surface border border-line pl-9 pr-3 py-2.5 text-sm outline-none focus:border-buurtkaart/50"
          />
        </div>

        {(presentKinds.length > 1 || domainFilter !== 'all') && (
          <div className="flex flex-wrap gap-1.5">
            <FilterChip active={kindFilter === 'all'} onClick={() => setKindFilter('all')}>Alles</FilterChip>
            {presentKinds.map((k) => (
              <FilterChip key={k} active={kindFilter === k} onClick={() => setKindFilter(k)}>
                {SOURCE_LABEL[k]}
              </FilterChip>
            ))}
            <span className="w-px bg-line mx-1 self-stretch" />
            {DOMAINS.filter((d) => braindumpEntries.some((e) => e.domain === d)).map((d) => (
              <button key={d} onClick={() => setDomainFilter(domainFilter === d ? 'all' : d)}
                className={`rounded-full transition-opacity ${domainFilter === d ? 'ring-2 ring-buurtkaart/50' : 'opacity-70 hover:opacity-100'}`}>
                <DomainChip domain={d} small />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* grid */}
      <div>
        <SectionTitle>{filtered.length} vastgelegd</SectionTitle>
        {filtered.length ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {filtered.map((e) => (
              <BraindumpCard key={e.id} entry={e} onOpen={() => setOpen(e)} />
            ))}
          </div>
        ) : (
          <Empty>
            {braindumpEntries.length ? 'Niks gevonden met deze filters.' : 'Nog niks vastgelegd — gooi je eerste gedachte of link erin.'}
          </Empty>
        )}
      </div>

      {openLive && (
        <BraindumpDetail
          entry={openLive}
          onClose={() => setOpen(null)}
          onDelete={deleteBraindumpEntry}
          onRetry={retryBraindumpEntry}
          onUpdate={updateBraindumpEntry}
          allTags={allTags}
          links={braindumpLinks.filter((l) => l.braindumpEntryId === openLive.id)}
          taskOptions={taskOptions}
          wikiOptions={wikiOptions}
          onLink={linkBraindumpEntry}
          onUnlink={unlinkBraindumpEntry}
        />
      )}
    </div>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`chip text-xs ${active ? 'bg-buurtkaart/15 text-buurtkaart-deep border border-buurtkaart/40' : 'bg-sunken text-muted'}`}
    >
      {children}
    </button>
  )
}

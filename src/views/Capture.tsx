import { useState } from 'react'
import { useStore } from '../store'
import { fmtDate } from '../domains'
import { DomainChip, SentimentChip, KindChip, SectionTitle, Empty } from '../components/ui'
import type { CaptureSource, StructuredItem } from '../types'
import { Mic, Link2, ListTodo, Type, Check, ArrowDown, Inbox } from 'lucide-react'

const SOURCES: { id: CaptureSource; label: string; icon: typeof Type }[] = [
  { id: 'capture', label: 'Note', icon: Type },
  { id: 'voice', label: 'Voice', icon: Mic },
  { id: 'link', label: 'Link', icon: Link2 },
  { id: 'task', label: 'Task', icon: ListTodo },
]

export default function Capture() {
  const store = useStore()
  const [text, setText] = useState('')
  const [source, setSource] = useState<CaptureSource>('capture')
  const [stage, setStage] = useState<0 | 1 | 2 | 3>(0)
  const [last, setLast] = useState<StructuredItem | null>(null)

  function submit() {
    const clean = text.trim()
    if (!clean) return
    const item = store.capture(clean, source)
    setLast(item)
    setText('')
    // animate the pipeline: intake → understand → remember
    setStage(1)
    setTimeout(() => setStage(2), 450)
    setTimeout(() => setStage(3), 950)
  }

  const recent = store.items.slice(0, 8)

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Inbox className="h-5 w-5 text-buurtkaart" /> Capture
        </h1>
        <p className="text-sm text-muted mt-1">
          One mouth. Throw anything in, no folder, no tag, no filing decision. The system files it.
        </p>
      </div>

      <div className="card p-4">
        <div className="flex flex-wrap gap-2 mb-3">
          {SOURCES.map((s) => {
            const Icon = s.icon
            return (
              <button
                key={s.id}
                onClick={() => setSource(s.id)}
                className={`flex-1 min-w-0 btn !px-3 ${
                  source === s.id ? 'bg-buurtkaart/15 text-buurtkaart border border-buurtkaart/40' : 'bg-sunken text-muted'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" /> {s.label}
              </button>
            )
          })}
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
          }}
          rows={3}
          placeholder={
            source === 'voice'
              ? 'Speak your mind… (typed here for the demo)'
              : source === 'link'
              ? 'Paste a link and a note…'
              : source === 'task'
              ? 'Something to do…'
              : 'Anything on your mind…'
          }
          className="w-full rounded-xl bg-surface border border-line px-4 py-3 text-sm outline-none focus:border-buurtkaart/50 resize-none"
        />
        <div className="flex items-center justify-between mt-3">
          <span className="text-[11px] text-faint">⌘/Ctrl + Enter to drop it in</span>
          <button className="btn-primary" onClick={submit} disabled={!text.trim()}>
            Drop it in
          </button>
        </div>
      </div>

      {/* pipeline visualization */}
      {last && (
        <div className="card p-4 animate-fade-up">
          <SectionTitle hint="Watch it move through the layers, you didn't choose any of this.">
            Intake → Understand → Remember
          </SectionTitle>
          <div className="space-y-2">
            <PipeStep active={stage >= 1} label="INTAKE" note="raw item received">
              <p className="text-sm text-ink-soft">“{last.text}”</p>
            </PipeStep>
            <div className="flex justify-center">
              <ArrowDown className={`h-4 w-4 ${stage >= 2 ? 'text-buurtkaart' : 'text-faint'}`} />
            </div>
            <PipeStep active={stage >= 2} label="UNDERSTAND" note="classified & summarized">
              <div className="flex flex-wrap gap-1.5">
                <DomainChip domain={last.domain} small />
                <KindChip kind={last.kind} />
                <SentimentChip sentiment={last.sentiment} />
              </div>
              <p className="text-xs text-muted mt-1.5">“{last.summary}”</p>
            </PipeStep>
            <div className="flex justify-center">
              <ArrowDown className={`h-4 w-4 ${stage >= 3 ? 'text-buurtkaart' : 'text-faint'}`} />
            </div>
            <PipeStep active={stage >= 3} label="REMEMBER" note="filed, findable forever">
              <p className="text-sm text-ink-soft">
                Stored in your one memory{last.kind === 'task' ? ' and opened as a thread (loop).' : '.'}
              </p>
            </PipeStep>
          </div>
        </div>
      )}

      <div>
        <SectionTitle>Recently captured</SectionTitle>
        {recent.length ? (
          <div className="space-y-2">
            {recent.map((i) => (
              <div key={i.id} className="card p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <DomainChip domain={i.domain} small />
                  <KindChip kind={i.kind} />
                  <span className="text-[11px] text-faint ml-auto">{fmtDate(i.createdAt)}</span>
                </div>
                <p className="text-sm text-ink-soft">{i.summary}</p>
              </div>
            ))}
          </div>
        ) : (
          <Empty>Nothing captured yet.</Empty>
        )}
      </div>
    </div>
  )
}

function PipeStep({
  active,
  label,
  note,
  children,
}: {
  active: boolean
  label: string
  note: string
  children: React.ReactNode
}) {
  return (
    <div
      className={`rounded-xl border p-3 transition-all duration-500 ${
        active ? 'border-buurtkaart/40 bg-buurtkaart/5 opacity-100' : 'border-line opacity-40'
      }`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className={`h-4 w-4 rounded-full flex items-center justify-center ${
            active ? 'bg-buurtkaart text-white' : 'bg-line'
          }`}
        >
          {active && <Check className="h-3 w-3" />}
        </span>
        <span className="text-[10px] uppercase tracking-wider font-semibold text-muted">{label}</span>
        <span className="text-[10px] text-faint">· {note}</span>
      </div>
      <div className="pl-6">{children}</div>
    </div>
  )
}

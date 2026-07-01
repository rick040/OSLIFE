import { useState } from 'react'
import { useStore } from '../store'
import { fmtDate } from '../domains'
import { DomainChip, SentimentChip, KindChip, SectionTitle, Empty } from '../components/ui'
import type { CaptureSource, StructuredItem } from '../types'
import { Mic, Link2, ListTodo, Type, Check, ArrowDown, Inbox } from 'lucide-react'

const SOURCES: { id: CaptureSource; label: string; icon: typeof Type }[] = [
  { id: 'capture', label: 'Notitie', icon: Type },
  { id: 'voice', label: 'Spraak', icon: Mic },
  { id: 'link', label: 'Link', icon: Link2 },
  { id: 'task', label: 'Taak', icon: ListTodo },
]

export default function Capture() {
  const store = useStore()
  const [text, setText] = useState('')
  const [source, setSource] = useState<CaptureSource>('capture')
  const [stage, setStage] = useState<0 | 1 | 2 | 3>(0)
  const [last, setLast] = useState<StructuredItem | null>(null)

  async function submit() {
    const clean = text.trim()
    if (!clean) return
    setText('')
    // Show INTAKE immediately with a provisional item (only .text matters for
    // that stage) — classify() is now brain-first and can take a second or
    // two, and the whole point of this screen is to reveal each stage as it
    // actually happens, not all at once once the promise resolves.
    setLast({ id: crypto.randomUUID(), text: clean, source, createdAt: new Date().toISOString(), domain: 'personal', kind: 'note', sentiment: 'neutral', summary: clean })
    setStage(1)
    const item = await store.capture(clean, source)
    setLast(item)
    setTimeout(() => setStage(2), 300)
    setTimeout(() => setStage(3), 800)
  }

  const recent = store.items.slice(0, 8)

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Inbox className="h-5 w-5 text-buurtkaart" /> Vastleggen
        </h1>
        <p className="text-sm text-muted mt-1">
          Één ingang. Gooi alles erin, geen map, geen tag, geen archieerbeslissing. Het systeem regelt het.
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
              ? 'Spreek je gedachten uit… (typ hier voor de demo)'
              : source === 'link'
              ? 'Plak een link en een notitie…'
              : source === 'task'
              ? 'Iets te doen…'
              : 'Wat er ook in je hoofd zit…'
          }
          className="w-full rounded-xl bg-surface border border-line px-4 py-3 text-sm outline-none focus:border-buurtkaart/50 resize-none"
        />
        <div className="flex items-center justify-between mt-3">
          <span className="text-[11px] text-faint">⌘/Ctrl + Enter om op te slaan</span>
          <button className="btn-primary" onClick={submit} disabled={!text.trim()}>
            Opslaan
          </button>
        </div>
      </div>

      {/* pipeline visualization */}
      {last && (
        <div className="card p-4 animate-fade-up">
          <SectionTitle hint="Zie hoe het door de lagen beweegt -- jij koos hier niks van.">
            Intake {'->'} Begrijpen {'->'} Onthouden
          </SectionTitle>
          <div className="space-y-2">
            <PipeStep active={stage >= 1} label="INTAKE" note="onbewerkt item ontvangen">
              <p className="text-sm text-ink-soft">"{last.text}"</p>
            </PipeStep>
            <div className="flex justify-center">
              <ArrowDown className={`h-4 w-4 ${stage >= 2 ? 'text-buurtkaart' : 'text-faint'}`} />
            </div>
            <PipeStep active={stage >= 2} label="BEGRIJPEN" note="geclassificeerd & samengevat">
              <div className="flex flex-wrap gap-1.5">
                <DomainChip domain={last.domain} small />
                <KindChip kind={last.kind} />
                <SentimentChip sentiment={last.sentiment} />
              </div>
              <p className="text-xs text-muted mt-1.5">"{last.summary}"</p>
            </PipeStep>
            <div className="flex justify-center">
              <ArrowDown className={`h-4 w-4 ${stage >= 3 ? 'text-buurtkaart' : 'text-faint'}`} />
            </div>
            <PipeStep active={stage >= 3} label="ONTHOUDEN" note="opgeslagen, altijd vindbaar">
              <p className="text-sm text-ink-soft">
                Opgeslagen in je geheugen{last.kind === 'task' ? ' en geopend als een thread (loop).' : '.'}
              </p>
            </PipeStep>
          </div>
        </div>
      )}

      <div>
        <SectionTitle>Onlangs vastgelegd</SectionTitle>
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
          <Empty>Nog niks vastgelegd.</Empty>
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

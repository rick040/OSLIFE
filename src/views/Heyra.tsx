import { useState, useRef, useEffect } from 'react'
import { useStore } from '../store'
import { DOMAIN_META } from '../domains'
import { DomainChip, SentimentChip, KindChip } from '../components/ui'
import type { StructuredItem } from '../types'
import { Send, Sparkles, Database, Mic, MicOff } from 'lucide-react'

interface Msg {
  id: string
  role: 'rick' | 'heyra'
  text: string
  classified?: StructuredItem
}

const SUGGESTIONS = [
  'Wat staat er nog open bij klanten?',
  'Waarom ben ik vandaag zo moe?',
  'Ik baal van de factuur van Bakkerij van Dijk',
  'Herinner me aan de jaarlijkse vet-check van Kyra',
]

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
        'Ik lees uit je ene geheugen over ParkingYou, PRJCT, Buurtkaart en je persoonlijke leven. Vraag me iets, praat tegen me, of dump een gedachte. Ik classificeer en archiveer het voor je, geen beslissing nodig.',
    },
  ])
  const endRef = useRef<HTMLDivElement>(null)

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

  function reply(item: StructuredItem): string {
    const t = item.text.toLowerCase()
    const open = store.threads.filter((x) => x.status === 'open')
    const inDomain = open.filter((x) => x.domain === item.domain)

    if (/open|owe|loop|todo|to do|klant|staat/.test(t)) {
      const top = open
        .slice(0, 3)
        .map((x) => `• ${x.title} (${DOMAIN_META[x.domain].label}${x.due ? `, due ${x.due.slice(5)}` : ''})`)
        .join('\n')
      return `Je hebt ${open.length} open loops over alle domeinen. De meest urgente:\n${top}`
    }
    if (/moe|slaap|energie|uitgeput|tired/.test(t)) {
      const last = store.dayLogs[store.dayLogs.length - 1]
      return `Je sliep ${last.sleepHours}u en energie ${last.energy}/5. Je versterkte patroon: onder 6u zakt je energie ~50%. Ik hou je 09:30 deep-work blok beschermd en schuif admin naar de middag.`
    }
    if (/factuur|betaald|van dijk|geld|uitgaven/.test(t)) {
      return `PRJCT geld: factuur #2026-031 (€880, Bakkerij van Dijk) is te laat, F&B klanten lopen 7–10 dagen achter. Reflect zag ook dat je uitgaven ~2× pieken rond deadlines. Zal ik de herinnering op het plan van vandaag houden?`
    }
    if (item.kind === 'task') {
      return `Opgeslagen als taak in ${DOMAIN_META[item.domain].label} en een loop geopend zodat het niet verloren gaat. Ik laat het zien in Today en de Day Builder.`
    }
    if (item.sentiment === 'stressed' || item.kind === 'vent') {
      return `Vent gelogd onder ${DOMAIN_META[item.domain].label}. Je hebt ${inDomain.length} open ${DOMAIN_META[item.domain].label} loop(s), dat is waarschijnlijk deel van de last. Ik kijk of dit samenvalt met je uitgaven-patroon.`
    }
    return `Genoteerd, geclassificeerd in ${DOMAIN_META[item.domain].label} als ${item.kind} en aan het geheugen toegevoegd. Je hebt daar ${inDomain.length} andere open loop(s).`
  }

  function send(text: string) {
    const clean = text.trim()
    if (!clean) return
    const item = store.capture(clean, 'chat')
    setMsgs((m) => [...m, { id: 'r' + item.id, role: 'rick', text: clean, classified: item }])
    setInput('')
    setTimeout(() => {
      setMsgs((m) => [...m, { id: 'h' + item.id, role: 'heyra', text: reply(item) }])
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
              <div
                className={`rounded-2xl px-4 py-2.5 text-sm whitespace-pre-line ${
                  m.role === 'rick' ? 'bg-forest text-white rounded-br-sm' : 'card rounded-bl-sm text-ink'
                }`}
              >
                {m.text}
              </div>
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

      <div className="flex flex-wrap gap-2 mt-3">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => send(s)}
            className="text-xs rounded-full border border-line px-3 py-1 text-muted hover:text-ink transition-colors"
          >
            {s}
          </button>
        ))}
      </div>

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

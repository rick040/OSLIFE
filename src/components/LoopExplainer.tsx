import { X } from 'lucide-react'
import { Overlay } from './ui'

const LAYERS = [
  { id: 'intake', label: 'Intake', x: 90, sub: 'capture + sense' },
  { id: 'understand', label: 'Understand', x: 250, sub: 'classify' },
  { id: 'remember', label: 'Remember', x: 410, sub: 'facts / loops / patterns' },
  { id: 'surface', label: 'Surface', x: 570, sub: 'today / plan / nudge' },
  { id: 'act', label: 'Act', x: 700, sub: 'do + record' },
]

export default function LoopExplainer({ onClose }: { onClose: () => void }) {
  return (
    <Overlay
      tone="scrim-blur"
      onClose={onClose}
      className="flex items-center justify-center p-4 animate-fade-up"
      panelClassName="card shadow-card-lg max-w-3xl w-full p-6"
    >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Two loops, one memory</h2>
            <p className="text-sm text-muted mt-1">
              Same spine, two speeds. The fast loop runs your day; the slow loop makes it smarter.
            </p>
          </div>
          <button className="text-muted hover:text-ink" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <svg viewBox="0 0 780 320" className="w-full mt-4">
          {/* fast loop path (top, left→right) */}
          <path
            d="M 90 120 H 700"
            fill="none"
            stroke="#6E8CA8"
            strokeWidth="2"
            strokeDasharray="6 6"
            className="animate-flow-dash"
          />
          {/* act → reflect (down) */}
          <path d="M 700 120 V 200 H 410" fill="none" stroke="#C58392" strokeWidth="2" strokeDasharray="6 6" className="animate-flow-dash" />
          {/* reflect → remember (up, write-back) */}
          <path d="M 410 200 V 138" fill="none" stroke="#C58392" strokeWidth="2" strokeDasharray="6 6" className="animate-flow-dash" />
          {/* act → intake (outcomes become new signals) */}
          <path d="M 700 120 V 250 H 90 V 138" fill="none" stroke="#6FA07C" strokeWidth="1.5" strokeDasharray="4 6" className="animate-flow-dash" opacity="0.7" />

          {/* layer nodes */}
          {LAYERS.map((l) => (
            <g key={l.id}>
              <rect x={l.x - 55} y={100} width={110} height={40} rx={12} fill="#FFFFFF" stroke="#E7E9DE" />
              <text x={l.x} y={118} textAnchor="middle" fill="#1B1D17" fontSize="13" fontWeight="600">
                {l.label}
              </text>
              <text x={l.x} y={132} textAnchor="middle" fill="#8C9080" fontSize="9">
                {l.sub}
              </text>
            </g>
          ))}

          {/* reflect node */}
          <g>
            <rect x={355} y={200} width={110} height={40} rx={12} fill="#F6ECEE" stroke="#C58392" />
            <text x={410} y={218} textAnchor="middle" fill="#8A5260" fontSize="13" fontWeight="600">
              Reflect
            </text>
            <text x={410} y={232} textAnchor="middle" fill="#B07E8B" fontSize="9">
              cross-domain brain
            </text>
          </g>

          {/* labels */}
          <text x={395} y={88} textAnchor="middle" fill="#3F586E" fontSize="11" fontWeight="600">
            ▸ fast loop (today)
          </text>
          <text x={250} y={195} textAnchor="middle" fill="#8A5260" fontSize="11" fontWeight="600">
            ◂ slow loop (learning)
          </text>
        </svg>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2 text-sm">
          <div className="rounded-2xl p-3 bg-parkingyou/10">
            <span className="text-parkingyou-deep font-medium">Fast loop · daily</span>
            <p className="text-muted text-xs mt-1">
              Intake → Understand → Remember → Surface → Act. Something captured this morning shapes today’s view.
            </p>
          </div>
          <div className="rounded-2xl p-3 bg-cross/10">
            <span className="text-cross-deep font-medium">Slow loop · learning</span>
            <p className="text-muted text-xs mt-1">
              Reflect reads everything, writes refined patterns back to Remember, and silently reshapes what
              Surface shows tomorrow. Your done/skip rates are the training signal.
            </p>
          </div>
        </div>
    </Overlay>
  )
}

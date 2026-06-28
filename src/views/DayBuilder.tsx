import { useStore } from '../store'
import { DOMAIN_META } from '../domains'
import { DomainChip, Empty } from '../components/ui'
import {
  CalendarRange,
  CheckCircle2,
  SkipForward,
  RotateCcw,
  ChevronUp,
  ChevronDown,
  Sparkles,
  Sun,
} from 'lucide-react'

export default function DayBuilder() {
  const { blocks, planAdapted, completeBlock, skipBlock, resetBlock, moveBlock, acceptPlan } = useStore()

  const done = blocks.filter((b) => b.status === 'done').length
  const skipped = blocks.filter((b) => b.status === 'skipped').length

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <CalendarRange className="h-5 w-5 text-personal" /> Dagplanner
          </h1>
          <p className="text-sm text-muted mt-1 max-w-xl">
            Een plan afgestemd op jouw <span className="text-ink">aangeleerde</span> ritme: diep werk zit in jouw
            echte focuspiek van 09:30–12:30, niet een standaard 9u.
          </p>
        </div>
        <button className="btn-primary" onClick={acceptPlan}>
          <CheckCircle2 className="h-4 w-4" /> Plan accepteren
        </button>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <span className="chip bg-buurtkaart/15 text-buurtkaart">{done} gedaan</span>
        <span className="chip bg-orange-500/15 text-orange-300">{skipped} overgeslagen</span>
        <span className="chip bg-sunken text-muted">{blocks.length - done - skipped} gepland</span>
      </div>

      {planAdapted && (
        <div className="card p-3 border-cross/40 bg-cross/5 flex items-start gap-2 animate-fade-up">
          <Sparkles className="h-4 w-4 text-cross mt-0.5 shrink-0" />
          <p className="text-sm text-ink-soft">
            Reflectie heeft dit plan aangepast: er is een avond <b>wind-down</b> blok toegevoegd om de slaap van morgen te beschermen
            (slaap↔energie patroon versterkt). De trage loop veranderde zojuist je dag.
          </p>
        </div>
      )}

      {/* learned-window banner */}
      <div className="card p-3 flex items-center gap-2 text-sm text-ink-soft">
        <Sun className="h-4 w-4 text-personal" />
        Aangeleerd hoog-energie venster: <b className="text-personal">09:30 – 12:30</b>. Diep werk is hier beschermd.
      </div>

      {blocks.length ? (
        <div className="space-y-2">
          {blocks.map((b, i) => {
            const meta = DOMAIN_META[b.domain]
            const inPeak = b.start >= '09:30' && b.start < '12:30'
            return (
              <div
                key={b.id}
                className={`card p-3 flex items-stretch gap-3 transition-all ${
                  b.status === 'done'
                    ? 'opacity-60 border-buurtkaart/30'
                    : b.status === 'skipped'
                    ? 'opacity-50'
                    : inPeak
                    ? 'border-personal/40'
                    : ''
                }`}
              >
                {/* time rail */}
                <div className="flex flex-col items-center justify-center w-14 shrink-0">
                  <span className="text-sm font-medium tabular-nums">{b.start}</span>
                  <span className="text-[10px] text-faint tabular-nums">{b.end}</span>
                </div>
                <div className={`w-1 rounded-full ${meta.dot}`} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <DomainChip domain={b.domain} small />
                    {inPeak && <span className="chip bg-personal/15 text-personal">focuspiek</span>}
                    {b.status === 'done' && <span className="chip bg-buurtkaart/15 text-buurtkaart">gedaan</span>}
                    {b.status === 'skipped' && <span className="chip bg-orange-500/15 text-orange-300">overgeslagen</span>}
                  </div>
                  <p
                    className={`text-sm mt-1 ${
                      b.status === 'done' ? 'line-through text-faint' : 'text-ink'
                    }`}
                  >
                    {b.title}
                  </p>
                  <p className="text-[11px] text-faint mt-0.5">{b.rationale}</p>

                  {/* actions */}
                  <div className="flex items-center gap-1.5 mt-2">
                    {b.status === 'planned' ? (
                      <>
                        <button className="btn-ghost !py-1 !px-2.5 text-xs" onClick={() => completeBlock(b.id)}>
                          <CheckCircle2 className="h-3.5 w-3.5" /> Gedaan
                        </button>
                        <button className="btn-ghost !py-1 !px-2.5 text-xs" onClick={() => skipBlock(b.id)}>
                          <SkipForward className="h-3.5 w-3.5" /> Overslaan
                        </button>
                      </>
                    ) : (
                      <button className="btn-ghost !py-1 !px-2.5 text-xs" onClick={() => resetBlock(b.id)}>
                        <RotateCcw className="h-3.5 w-3.5" /> Reset
                      </button>
                    )}
                  </div>
                </div>

                {/* reorder */}
                <div className="flex flex-col justify-center gap-1">
                  <button
                    className="text-faint hover:text-ink disabled:opacity-20"
                    disabled={i === 0}
                    onClick={() => moveBlock(b.id, -1)}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    className="text-faint hover:text-ink disabled:opacity-20"
                    disabled={i === blocks.length - 1}
                    onClick={() => moveBlock(b.id, 1)}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <Empty>Geen blokken gepland.</Empty>
      )}

      <p className="text-[11px] text-faint">
        Overgeslagen en voltooide blokken worden teruggeschreven als trainingssignalen. Na verloop van tijd plant de planner niet meer in wat je consequent overslaat.
      </p>
    </div>
  )
}

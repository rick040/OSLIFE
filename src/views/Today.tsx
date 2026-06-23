import { useStore } from '../store'
import { TODAY, DOMAIN_META, fmtDate, daysBetween } from '../domains'
import { DomainChip, SectionTitle, Empty } from '../components/ui'
import { Sun, Bell, CheckCircle2, SkipForward, Flame, Clock, ArrowRight } from 'lucide-react'

export default function Today({ onNav }: { onNav: (v: string) => void }) {
  const { threads, blocks, habits, nudge, completeBlock, skipBlock, tickHabit, activity } = useStore()

  const openThreads = threads
    .filter((t) => t.status === 'open')
    .sort((a, b) => {
      const ad = a.due ? daysBetween(TODAY, a.due) : 999
      const bd = b.due ? daysBetween(TODAY, b.due) : 999
      return ad - bd
    })
  const pending = blocks.filter((b) => b.status === 'planned')
  const nextBlock = pending[0]

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="animate-fade-up">
        <div className="flex items-center gap-2 text-muted text-sm">
          <Sun className="h-4 w-4 text-personal" />
          Sunday, {fmtDate(TODAY)} · Geldrop
        </div>
        <h1 className="text-2xl font-semibold mt-1">Good morning, Rick.</h1>
        <p className="text-muted text-sm mt-1">
          {openThreads.length} open loops · {pending.length} blocks planned ·{' '}
          {habits.filter((h) => h.doneToday).length}/{habits.length} habits done
        </p>
      </div>

      {/* nudge */}
      <div
        className="card p-4 border-cross/40 bg-cross/5 animate-fade-up"
        style={{ animationDelay: '40ms' }}
      >
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-cross/15 p-2 animate-pulse-ring">
            <Bell className="h-4 w-4 text-cross" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-cross font-semibold">Today’s nudge</div>
            <p className="text-sm text-ink mt-1">{nudge.text}</p>
            <p className="text-[11px] text-faint mt-1">why: {nudge.reason}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* left: next + plan */}
        <div className="lg:col-span-2 space-y-6">
          <div className="animate-fade-up" style={{ animationDelay: '80ms' }}>
            <SectionTitle hint="Surface composes this from memory. Acting writes straight back (fast loop).">
              What matters now
            </SectionTitle>
            {nextBlock ? (
              <div className="card p-4">
                <div className="flex items-center justify-between">
                  <DomainChip domain={nextBlock.domain} />
                  <span className="text-xs text-muted flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {nextBlock.start}–{nextBlock.end}
                  </span>
                </div>
                <h3 className="text-lg font-medium mt-2">{nextBlock.title}</h3>
                <p className="text-xs text-faint mt-1">{nextBlock.rationale}</p>
                <div className="flex gap-2 mt-3">
                  <button className="btn-primary" onClick={() => completeBlock(nextBlock.id)}>
                    <CheckCircle2 className="h-4 w-4" /> Complete
                  </button>
                  <button className="btn-ghost" onClick={() => skipBlock(nextBlock.id)}>
                    <SkipForward className="h-4 w-4" /> Skip
                  </button>
                </div>
              </div>
            ) : (
              <Empty>Nothing planned left today. Open the Day Builder to plan more.</Empty>
            )}
          </div>

          {/* threads */}
          <div className="animate-fade-up" style={{ animationDelay: '120ms' }}>
            <div className="flex items-center justify-between mb-1">
              <SectionTitle>Open loops needing closure</SectionTitle>
              <button className="text-xs text-muted hover:text-ink flex items-center gap-1" onClick={() => onNav('memory')}>
                all in Memory <ArrowRight className="h-3 w-3" />
              </button>
            </div>
            {openThreads.length ? (
              <div className="space-y-2">
                {openThreads.slice(0, 4).map((t) => {
                  const dd = t.due ? daysBetween(TODAY, t.due) : null
                  const overdue = dd !== null && dd < 0
                  return (
                    <div key={t.id} className="card p-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <DomainChip domain={t.domain} small />
                          <span
                            className={`text-[11px] ${
                              overdue ? 'text-cross font-medium' : 'text-faint'
                            }`}
                          >
                            {t.due ? (overdue ? `${-dd!}d overdue` : `due ${fmtDate(t.due)}`) : 'no date'}
                          </span>
                        </div>
                        <p className="text-sm text-ink truncate mt-0.5">{t.title}</p>
                        <p className="text-[11px] text-faint">→ {t.owedTo}</p>
                      </div>
                      <button
                        className="btn-ghost shrink-0 !py-1.5"
                        onClick={() => useStore.getState().closeThread(t.id)}
                      >
                        <CheckCircle2 className="h-4 w-4" /> Close
                      </button>
                    </div>
                  )
                })}
              </div>
            ) : (
              <Empty>All loops closed. Nothing owed right now. 🎉</Empty>
            )}
          </div>
        </div>

        {/* right: habits + activity */}
        <div className="space-y-6">
          <div className="animate-fade-up" style={{ animationDelay: '120ms' }}>
            <SectionTitle>Habits</SectionTitle>
            <div className="space-y-2">
              {habits.map((h) => (
                <button
                  key={h.id}
                  onClick={() => tickHabit(h.id)}
                  className={`card w-full p-3 flex items-center justify-between transition-colors ${
                    h.doneToday ? 'border-buurtkaart/50 bg-buurtkaart/5' : 'hover:border-line'
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm">
                    <span className="text-lg">{h.emoji}</span> {h.name}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-muted flex items-center gap-0.5">
                      <Flame className="h-3 w-3 text-personal" /> {h.streak}
                    </span>
                    <CheckCircle2
                      className={`h-5 w-5 ${h.doneToday ? 'text-buurtkaart' : 'text-faint'}`}
                    />
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="animate-fade-up" style={{ animationDelay: '160ms' }}>
            <SectionTitle hint="Every action becomes a new signal.">Loop activity</SectionTitle>
            {activity.length ? (
              <div className="space-y-1.5 max-h-72 overflow-auto pr-1">
                {activity.map((a) => (
                  <div key={a.id} className="text-xs flex items-start gap-2 py-1">
                    <span
                      className={`mt-1 h-1.5 w-1.5 rounded-full shrink-0 ${
                        a.loop === 'slow' ? 'bg-cross' : DOMAIN_META[a.domain].dot
                      }`}
                    />
                    <span className="text-ink-soft">
                      {a.text}
                      <span className="text-faint"> · {a.loop} loop</span>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <Empty>No actions yet. Complete a block or tick a habit.</Empty>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

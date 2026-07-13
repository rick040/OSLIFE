import { useMemo } from 'react'
import { useStore } from '../store'
import { TODAY, DOMAIN_META, fmtDate, daysBetween } from '../domains'
import { dueLabel } from '../lib/dates'
import { DomainChip, SectionTitle, Empty } from '../components/ui'
import CheckinCard from '../components/CheckinCard'
import DopamineBar from '../components/DopamineBar'
import NudgeCard, { storeNudgeToDash } from '../components/NudgeCard'
import { useWeather, weatherMeta } from '../hooks/useWeather'
import { Sun, CheckCircle2, SkipForward, Flame, Clock, ArrowRight, Check } from 'lucide-react'

export default function Today({ onNav }: { onNav: (v: string) => void }) {
  const { threads, blocks, habits, nudge, completeBlock, skipBlock, tickHabit, activity, projects, projectTasks, toggleProjectTask } = useStore()

  // Live location + temperature for the header (falls back to Geldrop if denied).
  const weather = useWeather()
  const { Icon: WeatherIcon } = weatherMeta(weather.code, weather.isDay ?? true)
  const locationLabel = weather.place ?? 'Geldrop'
  const dashNudge = storeNudgeToDash(nudge)

  const openThreads = threads
    .filter((t) => t.status === 'open')
    .sort((a, b) => {
      const ad = a.due ? daysBetween(TODAY, a.due) : 999
      const bd = b.due ? daysBetween(TODAY, b.due) : 999
      return ad - bd
    })
  const pending = blocks.filter((b) => b.status === 'planned')
  const nextBlock = pending[0]

  // ── Focus mode: project tasks due today (cap 5) + the Dopamine bar ──────────
  // Waiting-on-client projects (status 'blocked' / "Gepauzeerd") are excluded so
  // the list only holds things actually in your control today.
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const notBlocked = (projectId: string) => projectById.get(projectId)?.status !== 'blocked'
  const dueToday = projectTasks.filter((t) => !t.done && t.dueDate && t.dueDate <= TODAY && notBlocked(t.projectId))
  const doneToday = projectTasks.filter((t) => t.lastDoneOn === TODAY && notBlocked(t.projectId))
  const assignedToday = dueToday.length + doneToday.length
  const focusTasks = [...dueToday].sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '')).slice(0, 5)

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="animate-fade-up">
        <div className="flex flex-wrap items-center gap-2 text-muted text-sm">
          <Sun className="h-4 w-4 text-personal" />
          <span>
            {new Date().toLocaleDateString('nl-NL', { weekday: 'long', timeZone: 'Europe/Amsterdam' }).replace(/^\w/, c => c.toUpperCase())}, {fmtDate(TODAY)} · {locationLabel}
          </span>
          {weather.tempC != null && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-parkingyou/12 text-parkingyou-deep px-2 py-0.5 text-xs font-medium"
              title={weather.usedFallback ? 'Weer op standaardlocatie (Geldrop)' : `Weer in ${locationLabel}`}
            >
              <WeatherIcon className="h-3.5 w-3.5" /> {weather.tempC}°C
            </span>
          )}
        </div>
        <h1 className="text-2xl font-semibold mt-1">{new Date().toLocaleTimeString('nl-NL', { timeZone: 'Europe/Amsterdam', hour: '2-digit' }) < '12' ? 'Goedemorgen' : new Date().toLocaleTimeString('nl-NL', { timeZone: 'Europe/Amsterdam', hour: '2-digit' }) < '18' ? 'Goedemiddag' : 'Goedenavond'}, Rick.</h1>
        <p className="text-muted text-sm mt-1">
          {openThreads.length} open loops · {pending.length} blokken gepland ·{' '}
          {habits.filter((h) => h.doneToday).length}/{habits.length} gewoonten gedaan
        </p>
      </div>

      {/* nudge — only when a Reflect pass has actually authored one; otherwise the
          store nudge is empty and the card would render with a blank body. */}
      {nudge.text?.trim() && <NudgeCard nudge={dashNudge} onNav={onNav} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* left: next + plan */}
        <div className="lg:col-span-2 space-y-6">
          {assignedToday > 0 && (
            <div className="animate-fade-up" style={{ animationDelay: '60ms' }}>
              <SectionTitle hint="Projecttaken die vandaag afmoeten — max 5, klein en behapbaar.">Vandaag afmaken</SectionTitle>
              <div className="space-y-2">
                <DopamineBar done={doneToday.length} total={assignedToday} />
                {focusTasks.length === 0 ? (
                  <Empty>Alle taken van vandaag zijn af. 🎉</Empty>
                ) : (
                  focusTasks.map((t) => {
                    const p = projectById.get(t.projectId)
                    const due = dueLabel(t.dueDate ?? null, { prefix: 'deadline ' })
                    return (
                      <div key={t.id} className="card p-3 flex items-center gap-3">
                        <button
                          onClick={() => toggleProjectTask(t.id, true)}
                          title="Afvinken"
                          className="shrink-0 h-5 w-5 rounded-md border border-line flex items-center justify-center text-transparent hover:border-forest hover:text-forest transition-colors"
                        >
                          <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-ink truncate">{t.name}</p>
                          <p className="text-[11px] text-faint truncate">
                            {p?.name ?? 'Project'} · <span className={due.overdue ? 'text-cross font-medium' : ''}>{due.label}</span>
                          </p>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}

          <div className="animate-fade-up" style={{ animationDelay: '80ms' }}>
            <SectionTitle hint="Overzicht stelt dit samen vanuit het geheugen. Acties schrijven direct terug (snelle loop).">
              Wat telt nu
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
                    <CheckCircle2 className="h-4 w-4" /> Klaar
                  </button>
                  <button className="btn-ghost" onClick={() => skipBlock(nextBlock.id)}>
                    <SkipForward className="h-4 w-4" /> Overslaan
                  </button>
                </div>
              </div>
            ) : (
              <Empty>Niks meer gepland vandaag. Open de Dagplanner om meer in te plannen.</Empty>
            )}
          </div>

          {/* threads */}
          <div className="animate-fade-up" style={{ animationDelay: '120ms' }}>
            <div className="flex items-center justify-between mb-1">
              <SectionTitle>Open loops</SectionTitle>
              <button className="text-xs text-muted hover:text-ink flex items-center gap-1" onClick={() => onNav('memory')}>
                alles in Geheugen <ArrowRight className="h-3 w-3" />
              </button>
            </div>
            {openThreads.length ? (
              <div className="space-y-2">
                {openThreads.slice(0, 4).map((t) => {
                  const due = dueLabel(t.due, { prefix: 'deadline ' })
                  return (
                    <div key={t.id} className="card p-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <DomainChip domain={t.domain} small />
                          <span
                            className={`text-[11px] ${
                              due.overdue ? 'text-cross font-medium' : 'text-faint'
                            }`}
                          >
                            {due.label}
                          </span>
                        </div>
                        <p className="text-sm text-ink truncate mt-0.5">{t.title}</p>
                        <p className="text-[11px] text-faint">→ {t.owedTo}</p>
                      </div>
                      <button
                        className="btn-ghost shrink-0 !py-1.5"
                        onClick={() => useStore.getState().closeThread(t.id)}
                      >
                        <CheckCircle2 className="h-4 w-4" /> Sluiten
                      </button>
                    </div>
                  )
                })}
              </div>
            ) : (
              <Empty>Alle loops gesloten. Niks meer openstaand. 🎉</Empty>
            )}
          </div>
        </div>

        {/* right: check-in + habits + activity */}
        <div className="space-y-6">
          <div className="animate-fade-up" style={{ animationDelay: '100ms' }}>
            <CheckinCard compact />
          </div>

          <div className="animate-fade-up" style={{ animationDelay: '120ms' }}>
            <SectionTitle>Gewoonten</SectionTitle>
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
            <SectionTitle hint="Elke actie wordt een nieuw signaal.">Loop-activiteit</SectionTitle>
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
                      <span className="text-faint"> · {a.loop === 'slow' ? 'trage' : 'snelle'} loop</span>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <Empty>Nog geen acties. Voltooi een blok of vink een gewoonte aan.</Empty>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

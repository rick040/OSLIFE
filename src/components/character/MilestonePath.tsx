import { Check, Circle, Lock } from 'lucide-react'
import { Empty } from '../ui'
import { domainMeta, DOMAIN_HEX, fmtDate } from '../../domains'
import type { MilestoneStep } from '../../character'

/**
 * The long-term half of the loop: every milestone across every goal, laid
 * out chronologically as a single connected path — done steps behind you,
 * one current step per active goal glowing, the rest still ahead.
 */
export function MilestonePath({ steps }: { steps: MilestoneStep[] }) {
  if (steps.length === 0) {
    return (
      <div className="card p-4">
        <Empty>Nog geen mijlpalen — voeg er een toe aan een doel in North Star.</Empty>
      </div>
    )
  }

  return (
    <div className="card p-4">
      <div className="relative">
        <div className="flex items-start gap-0 overflow-x-auto pb-2">
          {steps.map((step, i) => {
            const hex = DOMAIN_HEX[step.domain]
            const meta = domainMeta(step.domain)
            const Icon = step.status === 'done' ? Check : step.status === 'current' ? Circle : Lock
            return (
              <div key={step.id} className="flex items-start shrink-0">
                <div className="flex flex-col items-center w-20 sm:w-28">
                  <div
                    className={`flex h-7 w-7 items-center justify-center rounded-full shrink-0 ${
                      step.status === 'done'
                        ? 'border-2'
                        : step.status === 'current'
                          ? 'border-2 border-dashed animate-pulse'
                          : 'border border-dashed border-line opacity-50'
                    }`}
                    style={step.status !== 'upcoming' ? { borderColor: hex, backgroundColor: step.status === 'done' ? `${hex}22` : undefined } : {}}
                  >
                    <Icon className="h-3.5 w-3.5" style={step.status !== 'upcoming' ? { color: hex } : undefined} aria-hidden="true" />
                  </div>
                  <p
                    className="text-[11px] text-ink-soft text-center mt-1.5 leading-snug line-clamp-2 px-1"
                    title={step.requiresTitle ? `${step.title} — vereist: ${step.requiresTitle}` : step.title}
                  >
                    {step.title}
                  </p>
                  <span className={`text-[10px] mt-0.5 ${meta.color}`}>{meta.label}</span>
                  <span className="text-[9px] text-faint uppercase tracking-wide">{step.difficulty}</span>
                  {step.dueDate && <span className="text-[10px] text-faint">{fmtDate(step.dueDate)}</span>}
                </div>
                {i < steps.length - 1 && <div className="h-0.5 w-4 sm:w-6 mt-3.5 shrink-0 bg-line" aria-hidden="true" />}
              </div>
            )
          })}
        </div>
        <div
          className="pointer-events-none absolute right-0 top-0 bottom-2 w-8 bg-gradient-to-l from-surface to-transparent"
          aria-hidden="true"
        />
      </div>
    </div>
  )
}

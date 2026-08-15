import { ARCHIVED_SCREENS } from '../nav'
import type { View } from '../nav'

/**
 * Index of parked screens.
 *
 * Nothing here is deleted — no code removed, no tables dropped, no rows
 * touched. These screens simply stopped earning their place in navigation:
 * each one had a write loop that went quiet and stayed quiet (see
 * docs/APP-TRUTH.md §2). They stay one tap away, and they come back the
 * moment they're used again.
 *
 * Up for review on 2026-09-15, when `screen_views` has enough read telemetry
 * to judge the read-only ones fairly — a screen whose value is in looking
 * leaves no trace in a write count.
 */
export default function Archief({ onNav }: { onNav: (v: View) => void }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="card p-4">
        <p className="text-xs uppercase tracking-wider text-faint mb-1.5">Geparkeerd</p>
        <p className="text-sm text-ink-soft leading-relaxed">
          Deze schermen zijn uit de navigatie gehaald, niet verwijderd. Alles staat er nog: de code,
          de tabellen, je data. Ga je er weer mee werken, dan komt het scherm terug.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {ARCHIVED_SCREENS.map((s) => {
          const Icon = s.icon
          return (
            <button
              key={s.id}
              onClick={() => onNav(s.id)}
              className="card flex flex-col items-center gap-2 px-2 py-4 text-center"
            >
              <span className="h-11 w-11 rounded-2xl bg-sunken flex items-center justify-center">
                <Icon className={`h-5 w-5 ${s.accent}`} />
              </span>
              <span className="text-[11px] font-medium text-ink leading-tight">{s.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

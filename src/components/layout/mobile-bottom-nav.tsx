import { Gauge, CheckSquare, Inbox, Activity, Grid2x2 } from 'lucide-react'
import { type View } from '@/nav'

// Mobile bottom tab bar — the primary way to move around on a phone. Capped
// at 5 items (Apple/Google HIG guidance: beyond that, touch targets shrink
// and choice overload sets in) rather than cramming in every `primary`
// screen from nav.ts. "Meer" opens the existing AppGrid, which already
// covers all 22 screens grouped, so nothing is actually unreachable —
// these 5 are just the everyday ones that deserve a one-tap slot.
const ITEMS: { id: View | 'more'; label: string; icon: typeof Gauge }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: Gauge },
  { id: 'tasks', label: 'Taken', icon: CheckSquare },
  { id: 'capture', label: 'Vastleggen', icon: Inbox },
  { id: 'vitals', label: 'Gezondheid', icon: Activity },
  { id: 'more', label: 'Meer', icon: Grid2x2 },
]

export function MobileBottomNav({
  view,
  onNav,
  onShowGrid,
}: {
  view: View
  onNav: (v: View) => void
  onShowGrid: () => void
}) {
  return (
    <nav
      aria-label="Hoofdnavigatie"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-between px-1">
        {ITEMS.map((item) => {
          const Icon = item.icon
          const active = item.id === view
          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => (item.id === 'more' ? onShowGrid() : onNav(item.id))}
              className="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas rounded-2xl"
            >
              <span className={`flex h-8 w-11 items-center justify-center rounded-2xl transition-colors ${active ? 'bg-forest/12 text-forest' : 'text-faint'}`}>
                <Icon className="h-5 w-5" />
              </span>
              <span className={`text-[10px] leading-none ${active ? 'text-forest font-semibold' : 'text-faint'}`}>
                {item.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

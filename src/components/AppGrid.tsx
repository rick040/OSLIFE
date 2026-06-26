import { useEffect } from 'react'
import { X } from 'lucide-react'
import { SCREENS, GROUP_ORDER, type View } from '../nav'

/** Full-screen app launcher: every screen as a tappable tile, grouped by layer. */
export default function AppGrid({
  active,
  onNav,
  onClose,
}: {
  active: View
  onNav: (v: View) => void
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      <div className="absolute inset-0 bg-scrim/55 backdrop-blur-md" onClick={onClose} />

      <div className="relative mt-auto md:mt-0 md:m-auto w-full md:max-w-3xl max-h-[88dvh] overflow-y-auto bg-canvas md:rounded-4xl rounded-t-4xl border border-line shadow-pop p-5 md:p-7 animate-fade-up">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-2xl bg-gradient-to-br from-forest to-lime" />
            <div>
              <div className="font-semibold leading-tight">Alle schermen</div>
              <div className="text-[11px] text-faint leading-tight">HEYRA · tik om te navigeren</div>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost !rounded-full !p-2" aria-label="Sluiten">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-6">
          {GROUP_ORDER.map((group) => {
            const screens = SCREENS.filter((s) => s.group === group)
            if (!screens.length) return null
            return (
              <div key={group}>
                <div className="text-xs font-semibold uppercase tracking-wider text-faint mb-2.5">{group}</div>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                  {screens.map((s) => {
                    const Icon = s.icon
                    const isActive = s.id === active
                    return (
                      <button
                        key={s.id}
                        onClick={() => {
                          onNav(s.id)
                          onClose()
                        }}
                        className={`flex flex-col items-center gap-2 rounded-3xl px-2 py-3.5 border transition-colors ${
                          isActive
                            ? 'bg-forest/10 border-forest/30'
                            : 'bg-surface border-line hover:bg-sunken'
                        }`}
                      >
                        <span className="h-11 w-11 rounded-2xl bg-sunken flex items-center justify-center">
                          <Icon className={`h-5 w-5 ${s.accent}`} />
                        </span>
                        <span className="text-[11px] font-medium text-ink text-center leading-tight">{s.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

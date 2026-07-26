import { TABLET_SCREENS } from './screens'

/**
 * Shown at bare /tablet (or an unknown screen key) — pick which kiosk view
 * this device should show, then bookmark/pin /tablet/<key> as its home page.
 */
export default function TabletScreenPicker() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 px-10 text-center">
      <div>
        <div className="text-2xl md:text-4xl font-medium text-ink">OSLIFE tablet</div>
        <p className="text-sm md:text-lg text-faint mt-2">Kies welk scherm dit apparaat moet tonen.</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 md:gap-6 w-full max-w-2xl">
        {TABLET_SCREENS.map((s) => (
          <a
            key={s.key}
            href={`/tablet/${s.key}`}
            className="card flex flex-col items-center gap-3 py-8 md:py-12 hover:bg-sunken transition-colors"
          >
            <s.icon className="h-8 w-8 md:h-12 md:w-12 text-ink-soft" />
            <span className="text-base md:text-xl font-medium text-ink">{s.label}</span>
          </a>
        ))}
      </div>
    </div>
  )
}

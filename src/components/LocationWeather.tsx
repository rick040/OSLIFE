import { MapPin, Wind, Droplets, Thermometer, RefreshCw, Loader2 } from 'lucide-react'
import { weatherMeta, type WeatherState } from '../hooks/useWeather'

/**
 * Live location + current temperature card for the dashboard header. Shows a big
 * temperature with a weather glyph, the resolved place name, and a compact strip
 * of feels-like / wind / humidity. Degrades gracefully: a loading shimmer while
 * locating, and a "opnieuw proberen" retry if the fix was denied/failed.
 *
 * The weather state is owned by the Dashboard (single geolocation request) and
 * passed in, so the header greeting and this card stay in sync.
 */
export default function LocationWeather({
  weather: w,
  onRefresh,
}: {
  weather: WeatherState
  onRefresh: () => void
}) {
  const { label, Icon } = weatherMeta(w.code, w.isDay ?? true)
  const loading = w.status === 'locating' || w.status === 'loading'

  return (
    <div className="card p-4 h-full flex flex-col justify-between overflow-hidden relative">
      {/* soft weather glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-parkingyou/15 blur-2xl"
      />

      <div className="flex items-start justify-between gap-2 relative">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted font-semibold">
            <MapPin className="h-3.5 w-3.5 text-parkingyou" />
            Jouw locatie
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="text-base font-semibold text-ink truncate">
              {w.place ?? (loading ? 'Locatie bepalen…' : 'Onbekend')}
            </span>
            {w.usedFallback && w.status === 'ready' && (
              <span className="chip bg-sunken text-faint !py-0 !text-[10px]" title="Standaardlocatie — locatietoegang geweigerd of niet beschikbaar">
                standaard
              </span>
            )}
          </div>
          {w.region && w.region !== w.place && (
            <div className="text-xs text-faint truncate">{w.region}</div>
          )}
        </div>

        <button
          onClick={onRefresh}
          className="shrink-0 rounded-lg p-1.5 text-faint hover:text-ink hover:bg-sunken transition-colors"
          title="Vernieuw locatie & weer"
          aria-label="Vernieuwen"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </button>
      </div>

      {w.status === 'error' && !w.updatedAt ? (
        <div className="relative mt-3">
          <p className="text-xs text-faint">{w.error}</p>
          <button onClick={onRefresh} className="btn-ghost mt-2 !py-1.5 text-xs">
            Opnieuw proberen
          </button>
        </div>
      ) : (
        <div className="relative mt-3">
          <div className="flex items-center gap-3">
            <Icon className={`h-11 w-11 shrink-0 text-parkingyou ${loading ? 'opacity-40' : ''}`} strokeWidth={1.5} />
            <div className="min-w-0">
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-semibold tabular-nums leading-none text-ink">
                  {w.tempC != null ? w.tempC : '—'}
                </span>
                <span className="text-xl text-muted leading-none">°C</span>
              </div>
              <div className="text-xs text-muted mt-1 truncate">{w.tempC != null ? label : 'Weer laden…'}</div>
            </div>
          </div>

          {w.tempC != null && (
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <Metric icon={Thermometer} label="voelt" value={w.feelsLikeC != null ? `${w.feelsLikeC}°` : '—'} />
              <Metric icon={Wind} label="wind" value={w.windKmh != null ? `${w.windKmh}` : '—'} unit="km/u" />
              <Metric icon={Droplets} label="vocht" value={w.humidity != null ? `${w.humidity}%` : '—'} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Metric({
  icon: Icon,
  label,
  value,
  unit,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  unit?: string
}) {
  return (
    <div className="rounded-xl bg-sunken/70 py-1.5 px-1">
      <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wide text-faint">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="text-sm font-medium tabular-nums mt-0.5">
        {value}
        {unit && value !== '—' && <span className="text-[10px] text-faint ml-0.5">{unit}</span>}
      </div>
    </div>
  )
}

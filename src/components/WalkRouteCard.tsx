// ── Kyra walk-tracker route map ──────────────────────────────────────────────
// Renders the GPS route of a dog walk tracked by the standalone Android app
// (see /android — auto-detected via home-geofence / car-ride triggers, posted
// once via walk-ingest). Uses Leaflet + OpenStreetMap tiles: free, no API key,
// unlike Google Maps — matches the "leanest, free" brief for this feature.
import { useMemo, useState } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Footprints, Timer, Car, Home } from 'lucide-react'
import { useStore } from '../store'
import { SectionTitle, Empty } from './ui'
import type { Walk } from '../types'

const TRIGGER_META: Record<string, { label: string; icon: typeof Home }> = {
  home: { label: 'vanaf huis', icon: Home },
  car_forest: { label: 'met de auto ergens heen', icon: Car },
  manual: { label: 'handmatig', icon: Footprints },
}

function fmtDuration(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h > 0 ? `${h}u ${m}m` : `${m} min`
}

function fmtWhen(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('nl-NL', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Amsterdam',
  })
}

function RouteMap({ walk }: { walk: Walk }) {
  const positions = useMemo(() => walk.points.map((p) => [p.lat, p.lon] as [number, number]), [walk.points])
  if (positions.length < 2) {
    return <Empty>Deze wandeling heeft geen routepunten.</Empty>
  }
  const bounds = L.latLngBounds(positions)
  return (
    <MapContainer
      key={walk.id}
      bounds={bounds}
      boundsOptions={{ padding: [24, 24] }}
      scrollWheelZoom={false}
      style={{ height: 220, width: '100%', borderRadius: '1rem' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Polyline positions={positions} pathOptions={{ color: '#34D399', weight: 4 }} />
      <CircleMarker center={positions[0]} radius={6} pathOptions={{ color: '#34D399', fillColor: '#34D399', fillOpacity: 1 }} />
      <CircleMarker center={positions[positions.length - 1]} radius={6} pathOptions={{ color: '#F87171', fillColor: '#F87171', fillOpacity: 1 }} />
    </MapContainer>
  )
}

export default function WalkRouteCard() {
  const walks = useStore((s) => s.walks)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  if (walks.length === 0) {
    return (
      <div className="card p-4">
        <SectionTitle hint="Wandelingen die de Android walk-tracker app automatisch herkent en logt komen hier binnen — zie /android.">
          <span className="flex items-center gap-2"><Footprints className="h-4 w-4 text-personal" /> Wandelroutes</span>
        </SectionTitle>
        <Empty>Nog geen wandeling automatisch gelogd.</Empty>
      </div>
    )
  }

  const recent = walks.slice(0, 10)
  const selected = recent.find((w) => w.id === selectedId) ?? recent[0]
  const meta = TRIGGER_META[selected.triggerSource ?? ''] ?? { label: selected.triggerSource ?? 'onbekend', icon: Footprints }
  const TriggerIcon = meta.icon

  return (
    <div className="card p-4">
      <SectionTitle>
        <span className="flex items-center gap-2"><Footprints className="h-4 w-4 text-personal" /> Wandelroutes</span>
      </SectionTitle>

      <RouteMap walk={selected} />

      <div className="flex items-center justify-between mt-3 text-sm">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 font-semibold text-ink">
            <Footprints className="h-3.5 w-3.5" /> {selected.distanceKm.toFixed(1)} km
          </span>
          <span className="flex items-center gap-1 text-muted">
            <Timer className="h-3.5 w-3.5" /> {fmtDuration(selected.durationMin)}
          </span>
        </div>
        <span className="flex items-center gap-1 text-xs text-faint">
          <TriggerIcon className="h-3 w-3" /> {meta.label}
        </span>
      </div>
      <div className="text-xs text-faint mt-1">{fmtWhen(selected.startedAt)}</div>

      {recent.length > 1 && (
        <div className="flex gap-1.5 mt-3 overflow-x-auto pb-1">
          {recent.map((w) => (
            <button
              key={w.id}
              onClick={() => setSelectedId(w.id)}
              className={`shrink-0 px-2.5 py-1 rounded-xl text-xs font-medium border transition-colors ${
                w.id === selected.id ? 'border-transparent text-white bg-personal' : 'border-line text-muted bg-sunken'
              }`}
            >
              {fmtWhen(w.startedAt)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

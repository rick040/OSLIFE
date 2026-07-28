// ── Locaties: bezochte plekken uit de geofence-triggers (MacroDroid) ─────────
// Elke rij in `locationVisits` is één doorlopend bezoek (entered_at → left_at)
// aan een plek — geofence-ingest voegt al GPS-jitter-flapping samen server-
// side, dus wat hier binnenkomt is al schoon. Deze schermweergave aggregeert
// per plek (aantal bezoeken, totale tijd, laatst bezocht) en toont dat op een
// Leaflet-kaart (zelfde aanpak als WalkRouteCard: OpenStreetMap, geen API-key)
// met cirkels die groter worden naarmate een plek vaker bezocht is.
import { useMemo, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Tooltip as LeafletTooltip } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapPin, Clock } from 'lucide-react'
import { useStore } from '../store'
import { SectionTitle, Empty } from '../components/ui'
import type { LocationVisit } from '../types'

const MARKER_COLOR = '#60A5FA'

interface PlaceStat {
  key: string
  placeName: string
  placeType: string | null
  lat: number
  lon: number
  visitCount: number
  totalMinutes: number
  lastVisited: string
  currentlyThere: boolean
}

function aggregate(visits: LocationVisit[]): PlaceStat[] {
  const byPlace = new Map<string, PlaceStat & { latSum: number; lonSum: number; coordCount: number }>()

  for (const v of visits) {
    const key = v.placeId ?? v.placeName
    const durationMin = v.leftAt
      ? Math.max(0, (new Date(v.leftAt).getTime() - new Date(v.enteredAt).getTime()) / 60_000)
      : 0

    const existing = byPlace.get(key)
    if (!existing) {
      byPlace.set(key, {
        key,
        placeName: v.placeName,
        placeType: v.placeType,
        lat: v.lat ?? 0,
        lon: v.lon ?? 0,
        latSum: v.lat ?? 0,
        lonSum: v.lon ?? 0,
        coordCount: v.lat != null && v.lon != null ? 1 : 0,
        visitCount: 1,
        totalMinutes: durationMin,
        lastVisited: v.enteredAt,
        currentlyThere: v.leftAt === null,
      })
    } else {
      existing.visitCount += 1
      existing.totalMinutes += durationMin
      if (v.enteredAt > existing.lastVisited) existing.lastVisited = v.enteredAt
      if (v.leftAt === null) existing.currentlyThere = true
      if (v.lat != null && v.lon != null) {
        existing.latSum += v.lat
        existing.lonSum += v.lon
        existing.coordCount += 1
      }
    }
  }

  return [...byPlace.values()]
    .map((p) => ({
      ...p,
      lat: p.coordCount > 0 ? p.latSum / p.coordCount : p.lat,
      lon: p.coordCount > 0 ? p.lonSum / p.coordCount : p.lon,
    }))
    .filter((p) => p.lat !== 0 || p.lon !== 0)
    .sort((a, b) => b.visitCount - a.visitCount)
}

function fmtDuration(min: number): string {
  if (min < 1) return '< 1 min'
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h > 0 ? `${h}u ${m}m` : `${m} min`
}

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString('nl-NL', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Amsterdam',
  })
}

function radiusFor(visitCount: number): number {
  return Math.min(10 + Math.sqrt(visitCount) * 7, 42)
}

function PlacesMap({ places }: { places: PlaceStat[] }) {
  const positions = useMemo(() => places.map((p) => [p.lat, p.lon] as [number, number]), [places])
  const single = positions.length === 1

  return (
    <MapContainer
      {...(single
        ? { center: positions[0], zoom: 15 }
        : { bounds: L.latLngBounds(positions), boundsOptions: { padding: [32, 32] } })}
      scrollWheelZoom={false}
      style={{ height: 280, width: '100%', borderRadius: '1rem' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {places.map((p) => (
        <CircleMarker
          key={p.key}
          center={[p.lat, p.lon]}
          radius={radiusFor(p.visitCount)}
          pathOptions={{
            color: MARKER_COLOR,
            fillColor: MARKER_COLOR,
            fillOpacity: p.currentlyThere ? 0.55 : 0.3,
            weight: p.currentlyThere ? 2.5 : 1.5,
          }}
        >
          <LeafletTooltip>
            {p.placeName} · {p.visitCount}x
          </LeafletTooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}

export default function Locations() {
  const locationVisits = useStore((s) => s.locationVisits)
  const [showAll, setShowAll] = useState(false)

  const places = useMemo(() => aggregate(locationVisits), [locationVisits])

  if (places.length === 0) {
    return (
      <div className="flex flex-col gap-7 max-w-3xl mx-auto">
        <SectionTitle hint="Bezoeken die MacroDroid's geofence-triggers doorgeven (via geofence-ingest) komen hier binnen.">
          <span className="flex items-center gap-2"><MapPin className="h-4 w-4 text-parkingyou" /> Locaties</span>
        </SectionTitle>
        <Empty>Nog geen locatiebezoek gelogd.</Empty>
      </div>
    )
  }

  const visible = showAll ? places : places.slice(0, 8)

  return (
    <div className="flex flex-col gap-4 max-w-3xl mx-auto">
      <SectionTitle hint="Cirkelgrootte = aantal bezoeken. Meer geofences kunnen later toegevoegd worden.">
        <span className="flex items-center gap-2"><MapPin className="h-4 w-4 text-parkingyou" /> Locaties</span>
      </SectionTitle>

      <div className="card p-2">
        <PlacesMap places={places} />
      </div>

      <div className="card divide-y divide-line">
        {visible.map((p) => (
          <div key={p.key} className="flex items-center gap-3 p-3.5">
            <span className="h-9 w-9 rounded-2xl flex items-center justify-center shrink-0" style={{ background: `${MARKER_COLOR}22` }}>
              <MapPin className="h-4 w-4" style={{ color: MARKER_COLOR }} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-ink font-medium flex items-center gap-1.5">
                {p.placeName}
                {p.currentlyThere && <span className="h-1.5 w-1.5 rounded-full bg-forest" title="Nu hier" />}
              </div>
              <div className="text-[11px] text-faint">
                {p.visitCount}x bezocht · laatst {fmtWhen(p.lastVisited)}
              </div>
            </div>
            {p.totalMinutes > 0 && (
              <span className="flex items-center gap-1 text-xs text-muted shrink-0">
                <Clock className="h-3.5 w-3.5" /> {fmtDuration(p.totalMinutes)}
              </span>
            )}
          </div>
        ))}
      </div>

      {places.length > 8 && (
        <button className="btn-ghost self-center !py-1.5" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Minder tonen' : `Alle ${places.length} plekken tonen`}
        </button>
      )}
    </div>
  )
}

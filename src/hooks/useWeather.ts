import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Sun,
  Moon,
  Cloud,
  CloudSun,
  CloudMoon,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  CloudSnow,
  CloudLightning,
  type LucideIcon,
} from 'lucide-react'

// ── Live location + weather ───────────────────────────────────────────────────
// Client-side only: the browser asks for geolocation, then we hit two free,
// key-less, CORS-enabled endpoints — Open-Meteo for the current conditions and
// BigDataCloud for a human place name. If the user blocks location (or it fails)
// we fall back to Rick's home town so the card is never empty.

/** Geldrop — the app's home base, used when geolocation is unavailable/denied. */
const HOME = { lat: 51.4212, lon: 5.5589, place: 'Geldrop', region: 'Noord-Brabant' }

export interface WeatherState {
  status: 'locating' | 'loading' | 'ready' | 'error'
  place?: string
  region?: string
  tempC?: number
  feelsLikeC?: number
  humidity?: number
  windKmh?: number
  code?: number
  isDay?: boolean
  /** true when we couldn't get a real fix and fell back to the home location */
  usedFallback: boolean
  updatedAt?: number
  error?: string
}

interface WmoMeta {
  label: string
  icon: LucideIcon
  /** icon shown at night for the clear/partly-clear codes */
  nightIcon?: LucideIcon
}

// WMO weather interpretation codes → Dutch label + Lucide icon.
const WMO: Record<number, WmoMeta> = {
  0: { label: 'Helder', icon: Sun, nightIcon: Moon },
  1: { label: 'Overwegend helder', icon: Sun, nightIcon: Moon },
  2: { label: 'Half bewolkt', icon: CloudSun, nightIcon: CloudMoon },
  3: { label: 'Bewolkt', icon: Cloud },
  45: { label: 'Mist', icon: CloudFog },
  48: { label: 'IJzel-mist', icon: CloudFog },
  51: { label: 'Lichte motregen', icon: CloudDrizzle },
  53: { label: 'Motregen', icon: CloudDrizzle },
  55: { label: 'Dichte motregen', icon: CloudDrizzle },
  56: { label: 'IJzel-motregen', icon: CloudDrizzle },
  57: { label: 'Dichte ijzel-motregen', icon: CloudDrizzle },
  61: { label: 'Lichte regen', icon: CloudRain },
  63: { label: 'Regen', icon: CloudRain },
  65: { label: 'Zware regen', icon: CloudRain },
  66: { label: 'IJzel', icon: CloudRain },
  67: { label: 'Zware ijzel', icon: CloudRain },
  71: { label: 'Lichte sneeuw', icon: CloudSnow },
  73: { label: 'Sneeuw', icon: CloudSnow },
  75: { label: 'Zware sneeuw', icon: CloudSnow },
  77: { label: 'Sneeuwkorrels', icon: CloudSnow },
  80: { label: 'Lichte buien', icon: CloudRain },
  81: { label: 'Buien', icon: CloudRain },
  82: { label: 'Zware buien', icon: CloudRain },
  85: { label: 'Sneeuwbuien', icon: CloudSnow },
  86: { label: 'Zware sneeuwbuien', icon: CloudSnow },
  95: { label: 'Onweer', icon: CloudLightning },
  96: { label: 'Onweer met hagel', icon: CloudLightning },
  99: { label: 'Zwaar onweer met hagel', icon: CloudLightning },
}

/** Resolve a WMO code (+ day/night) to a label and the icon to render. */
export function weatherMeta(code?: number, isDay = true): { label: string; Icon: LucideIcon } {
  const meta = (code != null && WMO[code]) || { label: 'Onbekend', icon: Cloud }
  const Icon = !isDay && meta.nightIcon ? meta.nightIcon : meta.icon
  return { label: meta.label, Icon }
}

async function fetchWeather(lat: number, lon: number, signal: AbortSignal) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m` +
    `&wind_speed_unit=kmh&timezone=auto`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error('weather ' + res.status)
  const json = await res.json()
  const c = json.current ?? {}
  return {
    tempC: Math.round(c.temperature_2m),
    feelsLikeC: Math.round(c.apparent_temperature),
    humidity: Math.round(c.relative_humidity_2m),
    windKmh: Math.round(c.wind_speed_10m),
    code: c.weather_code as number,
    isDay: c.is_day === 1,
  }
}

async function fetchPlace(lat: number, lon: number, signal: AbortSignal) {
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=nl`,
      { signal },
    )
    if (!res.ok) throw new Error()
    const j = await res.json()
    return {
      place: j.city || j.locality || j.principalSubdivision || undefined,
      region: j.principalSubdivision || undefined,
    }
  } catch {
    return { place: undefined, region: undefined }
  }
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('no-geolocation'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 8000,
      maximumAge: 10 * 60 * 1000,
    })
  })
}

/**
 * Live location + current temperature for the dashboard. Requests geolocation on
 * mount, refreshes the reading every 15 minutes, and exposes `refresh()` so the
 * UI can offer a retry after a denied/failed permission.
 */
export function useWeather(): WeatherState & { refresh: () => void } {
  const [state, setState] = useState<WeatherState>({ status: 'locating', usedFallback: false })
  const abortRef = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    setState((s) => ({ ...s, status: s.updatedAt ? 'loading' : 'locating' }))

    let lat = HOME.lat
    let lon = HOME.lon
    let usedFallback = false
    try {
      const pos = await getPosition()
      lat = pos.coords.latitude
      lon = pos.coords.longitude
    } catch {
      usedFallback = true
    }

    try {
      const [weather, place] = await Promise.all([
        fetchWeather(lat, lon, ac.signal),
        fetchPlace(lat, lon, ac.signal),
      ])
      if (ac.signal.aborted) return
      setState({
        status: 'ready',
        usedFallback,
        place: place.place ?? (usedFallback ? HOME.place : undefined),
        region: place.region ?? (usedFallback ? HOME.region : undefined),
        updatedAt: Date.now(),
        ...weather,
      })
    } catch (e) {
      if (ac.signal.aborted) return
      setState((s) => ({
        ...s,
        status: s.updatedAt ? 'ready' : 'error',
        error: 'Weer kon niet worden opgehaald',
      }))
    }
  }, [])

  useEffect(() => {
    load()
    const id = window.setInterval(load, 15 * 60 * 1000)
    return () => {
      window.clearInterval(id)
      abortRef.current?.abort()
    }
  }, [load])

  return { ...state, refresh: load }
}

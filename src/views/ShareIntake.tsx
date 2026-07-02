import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { uploadBraindumpFile } from '../lib/supabase'
import { detectTextShare, detectFileKind } from '../lib/braindump'
import type { BraindumpSourceKind, Domain } from '../types'
import { SOURCE_LABEL } from '../components/BraindumpCard'
import { Inbox, Loader2, Check, Share2 } from 'lucide-react'
import { DomainChip } from '../components/ui'

const DOMAINS: Domain[] = ['personal', 'prjct', 'parkingyou', 'buurtkaart', 'cross']

interface SharedItem {
  kind: BraindumpSourceKind
  text?: string | null
  url?: string | null
  file?: File | null
  label: string
}

/**
 * Landing screen for the PWA Web Share Target. The service worker (public/sw.js)
 * intercepts the POST /share, stashes files in a Cache and text/url in the query
 * string, then redirects here. We read the payload, let the user confirm (+ pick
 * a domain), and hand each item to store.braindumpCapture().
 */
export default function ShareIntake({ onDone }: { onDone: () => void }) {
  const { braindumpCapture } = useStore()
  const [items, setItems] = useState<SharedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [domain, setDomain] = useState<Domain | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const params = new URLSearchParams(window.location.search)
      const collected: SharedItem[] = []

      // Files stashed by the service worker in the 'bd-share' cache.
      const nFiles = Number(params.get('files') || 0)
      if (nFiles > 0 && 'caches' in window) {
        try {
          const cache = await caches.open('bd-share')
          for (let i = 0; i < nFiles; i++) {
            const res = await cache.match(`/__bd_share_file_${i}`)
            if (!res) continue
            const blob = await res.blob()
            const rawName = res.headers.get('x-filename')
            const name = rawName ? decodeURIComponent(rawName) : `bestand-${i + 1}`
            const type = res.headers.get('content-type') || blob.type || 'application/octet-stream'
            const file = new File([blob], name, { type })
            collected.push({ kind: detectFileKind(type), file, label: name })
            await cache.delete(`/__bd_share_file_${i}`)
          }
        } catch { /* ignore */ }
      }

      // Text / URL / title from the query string.
      const url = params.get('url')
      const text = params.get('text')
      const title = params.get('title')
      const raw = [url, text].filter(Boolean).join(' ').trim()
      if (raw) {
        const d = detectTextShare(raw)
        collected.push({
          kind: d.kind,
          text: d.kind === 'text' ? d.text : null,
          url: d.url,
          label: title || d.url || d.text.slice(0, 60),
        })
      } else if (title && !collected.length) {
        collected.push({ kind: 'text', text: title, label: title })
      }

      if (alive) { setItems(collected); setLoading(false) }
    })()
    return () => { alive = false }
  }, [])

  async function save() {
    if (!items.length || saving) return
    setSaving(true)
    for (const it of items) {
      let storagePath: string | null = null
      if (it.file) storagePath = await uploadBraindumpFile(it.file, it.file.name)
      await braindumpCapture({
        sourceKind: it.kind,
        text: it.text ?? null,
        sourceUrl: it.url ?? null,
        title: it.label || null,
        storagePath,
        domain,
      })
    }
    setSaving(false)
    setDone(true)
    // Clear the /share URL so a refresh doesn't re-import, then open the grid.
    window.history.replaceState({}, '', '/')
    setTimeout(onDone, 700)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas p-4">
      <div className="card w-full max-w-md p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Inbox className="h-5 w-5 text-buurtkaart" />
          <h1 className="text-lg font-semibold">Naar Braindump</h1>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted py-6">
            <Loader2 className="h-4 w-4 animate-spin" /> Gedeelde inhoud lezen…
          </div>
        ) : done ? (
          <div className="flex items-center gap-2 text-sm text-forest py-6">
            <Check className="h-4 w-4" /> Opgeslagen in je Braindump.
          </div>
        ) : items.length ? (
          <>
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="rounded-xl bg-sunken px-3 py-2 flex items-center gap-2">
                  <span className="chip bg-line text-muted text-[11px] shrink-0">{SOURCE_LABEL[it.kind]}</span>
                  <span className="text-sm text-ink-soft truncate">{it.label}</span>
                </div>
              ))}
            </div>

            <div>
              <p className="text-xs text-muted mb-1.5">Levensdomein (optioneel)</p>
              <div className="flex flex-wrap gap-1.5">
                {DOMAINS.map((d) => (
                  <button key={d} onClick={() => setDomain(domain === d ? null : d)}
                    className={`rounded-full transition-opacity ${domain === d ? 'ring-2 ring-buurtkaart/50' : 'opacity-70 hover:opacity-100'}`}>
                    <DomainChip domain={d} small />
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={onDone} className="btn-ghost flex-1">Annuleren</button>
              <button onClick={save} disabled={saving} className="btn-primary flex-1">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />} Opslaan
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted">Geen gedeelde inhoud gevonden.</p>
            <button onClick={onDone} className="btn-primary w-full">Naar Braindump</button>
          </div>
        )}
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import type { BraindumpEntry, BraindumpSourceKind } from '../types'
import { DomainChip, Overlay } from './ui'
import { fmtDate } from '../domains'
import { braindumpThumbUrl } from '../lib/braindump'
import {
  Type, Link2, Image as ImageIcon, FileText, Youtube, Instagram, Video, Mic, File as FileIcon,
  Loader2, AlertTriangle, Copy, X, ExternalLink, Trash2, RotateCcw,
} from 'lucide-react'

const KIND_ICON: Record<BraindumpSourceKind, typeof Type> = {
  text: Type,
  link: Link2,
  image: ImageIcon,
  pdf: FileText,
  youtube: Youtube,
  instagram: Instagram,
  pinterest: ImageIcon,
  video: Video,
  audio: Mic,
  file: FileIcon,
}

export const SOURCE_LABEL: Record<BraindumpSourceKind, string> = {
  text: 'Tekst',
  link: 'Link',
  image: 'Afbeelding',
  pdf: 'PDF',
  youtube: 'YouTube',
  instagram: 'Instagram',
  pinterest: 'Pinterest',
  video: 'Video',
  audio: 'Audio',
  file: 'Bestand',
}

/** Resolve a stored thumbnail path/URL to something the <img> can load. */
function useThumb(raw: string | null): string | null {
  const [url, setUrl] = useState<string | null>(raw && /^https?:\/\//i.test(raw) ? raw : null)
  useEffect(() => {
    let alive = true
    if (raw && !/^https?:\/\//i.test(raw)) braindumpThumbUrl(raw).then((u) => alive && setUrl(u))
    else setUrl(raw)
    return () => { alive = false }
  }, [raw])
  return url
}

export function BraindumpCard({ entry, onOpen }: { entry: BraindumpEntry; onOpen: () => void }) {
  const Icon = KIND_ICON[entry.sourceKind] ?? FileIcon
  const thumb = useThumb(entry.thumbUrl)
  const busy = entry.status === 'pending' || entry.status === 'processing'

  return (
    <button
      onClick={onOpen}
      className="card overflow-hidden text-left flex flex-col hover:border-buurtkaart/40 transition-colors group"
    >
      <div className="relative aspect-[16/10] bg-sunken flex items-center justify-center overflow-hidden">
        {thumb ? (
          <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <Icon className="h-8 w-8 text-faint" />
        )}
        <span className="absolute top-2 left-2 flex items-center gap-1 rounded-lg bg-canvas/85 backdrop-blur px-1.5 py-0.5 text-[10px] font-medium text-muted">
          <Icon className="h-3 w-3" /> {SOURCE_LABEL[entry.sourceKind]}
        </span>
        {busy && (
          <span className="absolute top-2 right-2 rounded-lg bg-canvas/85 backdrop-blur p-1">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-buurtkaart" />
          </span>
        )}
        {entry.status === 'failed' && (
          <span className="absolute top-2 right-2 rounded-lg bg-canvas/85 backdrop-blur p-1" title={entry.error ?? 'Mislukt'}>
            <AlertTriangle className="h-3.5 w-3.5 text-orange-600" />
          </span>
        )}
        {entry.status === 'duplicate' && (
          <span className="absolute top-2 right-2 rounded-lg bg-canvas/85 backdrop-blur p-1" title="Dit zat er al in — dubbele capture">
            <Copy className="h-3.5 w-3.5 text-muted" />
          </span>
        )}
      </div>
      <div className="p-3 flex-1 flex flex-col gap-1.5">
        <div className="text-sm font-medium text-ink line-clamp-2 leading-snug">
          {entry.title || entry.summary || (busy ? 'Verwerken…' : entry.status === 'duplicate' ? 'Dubbele capture' : 'Zonder titel')}
        </div>
        {entry.summary && entry.title && (
          <p className="text-xs text-muted line-clamp-2">{entry.summary}</p>
        )}
        <div className="mt-auto flex items-center gap-1.5 pt-1">
          {entry.domain && <DomainChip domain={entry.domain} small />}
          <span className="text-[11px] text-faint ml-auto">{fmtDate(entry.createdAt)}</span>
        </div>
      </div>
    </button>
  )
}

/** Detail modal: renders the entry's Markdown + source link + delete/retry. */
export function BraindumpDetail({
  entry,
  onClose,
  onDelete,
  onRetry,
}: {
  entry: BraindumpEntry
  onClose: () => void
  onDelete: (id: string) => void
  onRetry: (id: string) => void
}) {
  const Icon = KIND_ICON[entry.sourceKind] ?? FileIcon
  const thumb = useThumb(entry.thumbUrl)

  return (
    <Overlay
      tone="black"
      onClose={onClose}
      className="flex items-end md:items-center justify-center p-0 md:p-4"
      panelClassName="bg-canvas w-full md:max-w-2xl md:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto shadow-xl"
    >
        <div className="sticky top-0 bg-canvas/90 backdrop-blur border-b border-line px-4 py-3 flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted shrink-0" />
          <span className="text-xs text-muted">{SOURCE_LABEL[entry.sourceKind]} · {fmtDate(entry.createdAt)}</span>
          <button onClick={onClose} className="ml-auto text-faint hover:text-ink p-1 rounded-lg hover:bg-sunken">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {thumb && (
            <img src={thumb} alt="" className="w-full rounded-xl max-h-72 object-cover" />
          )}

          {entry.status === 'failed' && (
            <div className="rounded-xl bg-orange-500/10 border border-orange-500/30 p-3 text-sm text-orange-700 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-medium">Verwerken mislukt</p>
                {entry.error && <p className="text-xs mt-0.5 opacity-80">{entry.error}</p>}
              </div>
              <button onClick={() => onRetry(entry.id)} className="btn-ghost !py-1 text-xs shrink-0">
                <RotateCcw className="h-3.5 w-3.5" /> Opnieuw
              </button>
            </div>
          )}

          {entry.status === 'duplicate' && (
            <div className="rounded-xl bg-sunken border border-line p-3 text-sm text-muted flex items-start gap-2">
              <Copy className="h-4 w-4 mt-0.5 shrink-0" />
              <p>Dit zat er al in — herkend als dubbele capture, dus niet opnieuw verwerkt of meegenomen in zoekresultaten.</p>
            </div>
          )}

          {(entry.status === 'pending' || entry.status === 'processing') && (
            <div className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin text-buurtkaart" /> Wordt omgezet naar een notitie…
            </div>
          )}

          {entry.markdown ? (
            <Markdown text={entry.markdown} />
          ) : entry.summary ? (
            <p className="text-sm text-ink-soft">{entry.summary}</p>
          ) : null}

          {entry.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {entry.tags.map((t) => (
                <span key={t} className="chip bg-line text-muted text-[11px]">#{t}</span>
              ))}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-canvas/90 backdrop-blur border-t border-line px-4 py-3 flex items-center gap-2">
          {entry.sourceUrl && (
            <a href={entry.sourceUrl} target="_blank" rel="noreferrer" className="btn-ghost !py-1.5 text-xs">
              <ExternalLink className="h-3.5 w-3.5" /> Bron openen
            </a>
          )}
          <button
            onClick={() => { onDelete(entry.id); onClose() }}
            className="btn-ghost !py-1.5 text-xs text-orange-600 ml-auto"
          >
            <Trash2 className="h-3.5 w-3.5" /> Verwijderen
          </button>
        </div>
    </Overlay>
  )
}

/**
 * Deliberately tiny Markdown renderer — no new dependency. Handles the shapes the
 * ingest pipeline actually emits: #/##/### headings, - bullets, [links](url),
 * **bold**, and paragraphs. Everything else renders as plain text.
 */
export function Markdown({ text }: { text: string }) {
  const lines = text.split('\n')
  const out: JSX.Element[] = []
  let list: string[] = []
  const flush = () => {
    if (list.length) {
      out.push(
        <ul key={`ul-${out.length}`} className="list-disc pl-5 space-y-1 text-sm text-ink-soft">
          {list.map((li, i) => <li key={i}>{inline(li)}</li>)}
        </ul>,
      )
      list = []
    }
  }
  lines.forEach((raw, i) => {
    const line = raw.trimEnd()
    if (/^###\s+/.test(line)) { flush(); out.push(<h4 key={i} className="text-sm font-semibold text-ink mt-2">{inline(line.replace(/^###\s+/, ''))}</h4>) }
    else if (/^##\s+/.test(line)) { flush(); out.push(<h3 key={i} className="text-base font-semibold text-ink mt-2">{inline(line.replace(/^##\s+/, ''))}</h3>) }
    else if (/^#\s+/.test(line)) { flush(); out.push(<h2 key={i} className="text-lg font-semibold text-ink">{inline(line.replace(/^#\s+/, ''))}</h2>) }
    else if (/^[-*]\s+/.test(line)) { list.push(line.replace(/^[-*]\s+/, '')) }
    else if (line.trim() === '') { flush() }
    else { flush(); out.push(<p key={i} className="text-sm text-ink-soft leading-relaxed">{inline(line)}</p>) }
  })
  flush()
  return <div className="space-y-1.5">{out}</div>
}

/** Inline formatting: [text](url) links and **bold**. */
function inline(text: string): (string | JSX.Element)[] {
  const parts: (string | JSX.Element)[] = []
  const re = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)|\*\*([^*]+)\*\*/g
  let last = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    if (m[2]) parts.push(<a key={k++} href={m[2]} target="_blank" rel="noreferrer" className="text-buurtkaart underline">{m[1]}</a>)
    else if (m[3]) parts.push(<strong key={k++} className="font-semibold text-ink">{m[3]}</strong>)
    last = re.lastIndex
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

import { useEffect, useMemo, useState } from 'react'
import type { BraindumpEntry, BraindumpLink, BraindumpLinkType, BraindumpSourceKind, Domain, ItemKind } from '../types'
import { DomainChip, Overlay } from './ui'
import { Markdown } from './Markdown'
import { fmtDate } from '../domains'
import { braindumpThumbUrl } from '../lib/braindump'
import {
  Type, Link2, Image as ImageIcon, FileText, Youtube, Instagram, Video, Mic, File as FileIcon,
  Loader2, AlertTriangle, Copy, X, ExternalLink, Trash2, RotateCcw, CheckSquare, BookOpen,
} from 'lucide-react'

/** A pickable link target ({@link BraindumpLink.linkedId} + a display title). */
export interface LinkOption { id: string; title: string }

const DOMAINS: Domain[] = ['parkingyou', 'prjct', 'buurtkaart', 'personal', 'cross']

const KIND_OPTIONS: ItemKind[] = ['task', 'note', 'idea', 'vent', 'link', 'voice', 'transaction', 'event', 'health', 'email']

const KIND_LABEL: Record<ItemKind, string> = {
  task: 'Taak',
  note: 'Notitie',
  idea: 'Idee',
  vent: 'Ventileren',
  link: 'Link',
  voice: 'Spraak',
  transaction: 'Transactie',
  event: 'Afspraak',
  health: 'Gezondheid',
  email: 'E-mail',
}

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
            <AlertTriangle className="h-3.5 w-3.5 text-personal-deep" />
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
          {entry.title || entry.summary || (busy
            ? entry.sourceKind === 'audio' ? 'Wordt getranscribeerd…' : 'Verwerken…'
            : entry.status === 'duplicate' ? 'Dubbele capture' : 'Zonder titel')}
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
  onUpdate,
  allTags = [],
  links = [],
  taskOptions = [],
  wikiOptions = [],
  onLink,
  onUnlink,
}: {
  entry: BraindumpEntry
  onClose: () => void
  onDelete: (id: string) => void
  onRetry: (id: string) => void
  onUpdate?: (id: string, patch: Partial<Pick<BraindumpEntry, 'domain' | 'kind' | 'tags'>>) => void
  allTags?: string[]
  /** This entry's own links (pre-filtered by the caller). */
  links?: BraindumpLink[]
  taskOptions?: LinkOption[]
  wikiOptions?: LinkOption[]
  onLink?: (braindumpEntryId: string, linkedType: BraindumpLinkType, linkedId: string) => void
  onUnlink?: (linkId: string) => void
}) {
  const Icon = KIND_ICON[entry.sourceKind] ?? FileIcon
  const thumb = useThumb(entry.thumbUrl)
  const busy = entry.status === 'pending' || entry.status === 'processing'

  // A worker crash/timeout mid-job leaves a row stuck on "processing" forever
  // — there's no failure event to flip it to `failed`, so the ordinary retry
  // button (which only shows on `failed`) never appears. Tick every 30s while
  // busy so this banner can offer a manual retry once it's clearly been too long.
  const [nowTick, setNowTick] = useState(() => Date.now())
  useEffect(() => {
    if (!busy) return
    const t = window.setInterval(() => setNowTick(Date.now()), 30_000)
    return () => window.clearInterval(t)
  }, [busy])
  const stale = busy && nowTick - new Date(entry.createdAt).getTime() > 5 * 60 * 1000

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
          <button onClick={onClose} className="ml-auto text-faint hover:text-ink p-1 rounded-lg hover:bg-sunken" aria-label="Sluiten">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {thumb && (
            <img src={thumb} alt="" className="w-full rounded-xl max-h-72 object-cover" />
          )}

          {entry.status === 'failed' && (
            <div className="rounded-xl bg-personal/10 p-3 text-sm text-personal-deep flex items-start gap-2">
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

          {busy && (
            <div className="flex items-center gap-2 text-sm text-muted flex-wrap">
              <Loader2 className="h-4 w-4 animate-spin text-buurtkaart" />
              {entry.sourceKind === 'audio' ? 'Spraakmemo wordt getranscribeerd en samengevat…' : 'Wordt omgezet naar een notitie…'}
              {stale && (
                <span className="flex items-center gap-2 text-xs text-faint">
                  · Dit duurt ongewoon lang
                  <button onClick={() => onRetry(entry.id)} className="btn-ghost !py-1 !px-2 text-xs">
                    <RotateCcw className="h-3.5 w-3.5" /> Opnieuw
                  </button>
                </span>
              )}
            </div>
          )}

          {entry.markdown ? (
            <Markdown text={entry.markdown} />
          ) : entry.summary ? (
            <p className="text-sm text-ink-soft">{entry.summary}</p>
          ) : null}

          {onUpdate ? (
            <div className="space-y-3 pt-2 border-t border-line">
              <div>
                <p className="text-xs text-muted mb-1.5">Levensdomein</p>
                <div className="flex flex-wrap gap-1.5">
                  {DOMAINS.map((d) => (
                    <button
                      key={d}
                      onClick={() => onUpdate(entry.id, { domain: entry.domain === d ? null : d })}
                      className={`rounded-full transition-opacity ${entry.domain === d ? 'ring-2 ring-buurtkaart/50' : 'opacity-60 hover:opacity-100'}`}
                    >
                      <DomainChip domain={d} small />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs text-muted mb-1.5">Soort</p>
                <select
                  value={entry.kind ?? ''}
                  onChange={(e) => onUpdate(entry.id, { kind: (e.target.value || null) as ItemKind | null })}
                  className="rounded-lg bg-surface border border-line px-2.5 py-1.5 text-xs outline-none focus:border-buurtkaart/50"
                >
                  <option value="">— geen —</option>
                  {KIND_OPTIONS.map((k) => (
                    <option key={k} value={k}>{KIND_LABEL[k]}</option>
                  ))}
                </select>
              </div>

              <TagEditor tags={entry.tags} allTags={allTags} onChange={(tags) => onUpdate(entry.id, { tags })} />

              {onLink && onUnlink && (
                <LinkEditor
                  entryId={entry.id}
                  links={links}
                  taskOptions={taskOptions}
                  wikiOptions={wikiOptions}
                  onLink={onLink}
                  onUnlink={onUnlink}
                />
              )}
            </div>
          ) : entry.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {entry.tags.map((t) => (
                <span key={t} className="chip bg-line text-muted text-[11px]">#{t}</span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="sticky bottom-0 bg-canvas/90 backdrop-blur border-t border-line px-4 py-3 flex items-center gap-2">
          {entry.sourceUrl && (
            <a href={entry.sourceUrl} target="_blank" rel="noreferrer" className="btn-ghost !py-1.5 text-xs">
              <ExternalLink className="h-3.5 w-3.5" /> Bron openen
            </a>
          )}
          <button
            onClick={() => { onDelete(entry.id); onClose() }}
            className="btn-ghost !py-1.5 text-xs text-cross-deep ml-auto"
          >
            <Trash2 className="h-3.5 w-3.5" /> Verwijderen
          </button>
        </div>
    </Overlay>
  )
}

/** Freeform tag editor: removable chips + an input that suggests tags already
 *  used elsewhere (no fixed/curated list to maintain — just your own history). */
function TagEditor({
  tags,
  allTags,
  onChange,
}: {
  tags: string[]
  allTags: string[]
  onChange: (tags: string[]) => void
}) {
  const [value, setValue] = useState('')

  const suggestions = useMemo(() => {
    const needle = value.trim().toLowerCase()
    return allTags
      .filter((t) => !tags.includes(t) && (!needle || t.includes(needle)))
      .slice(0, 8)
  }, [allTags, tags, value])

  function add(raw: string) {
    const t = raw.trim().toLowerCase().replace(/\s+/g, '-')
    if (t && !tags.includes(t)) onChange([...tags, t])
    setValue('')
  }

  return (
    <div>
      <p className="text-xs text-muted mb-1.5">Tags</p>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {tags.map((t) => (
            <span key={t} className="chip bg-line text-muted text-[11px] gap-1">
              #{t}
              <button onClick={() => onChange(tags.filter((x) => x !== t))} className="text-faint hover:text-cross-deep" aria-label={`${t} verwijderen`}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(value) } }}
        placeholder="Nieuwe tag + Enter…"
        className="w-full rounded-lg bg-surface border border-line px-2.5 py-1.5 text-xs outline-none focus:border-buurtkaart/50"
      />
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {suggestions.map((s) => (
            <button key={s} onClick={() => add(s)} className="chip bg-sunken text-muted text-[11px] hover:bg-line">
              #{s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** "Apply this to somewhere": file this capture under an existing open task or
 *  Kennisbank entry, beyond just tagging/domaining it. Two plain <select>s
 *  (not a full search box) — the option lists are short enough that a native
 *  dropdown is simpler and more accessible than reinventing autocomplete. */
function LinkEditor({
  entryId,
  links,
  taskOptions,
  wikiOptions,
  onLink,
  onUnlink,
}: {
  entryId: string
  links: BraindumpLink[]
  taskOptions: LinkOption[]
  wikiOptions: LinkOption[]
  onLink: (braindumpEntryId: string, linkedType: BraindumpLinkType, linkedId: string) => void
  onUnlink: (linkId: string) => void
}) {
  const titleFor = (type: BraindumpLinkType, id: string) =>
    (type === 'task' ? taskOptions : wikiOptions).find((o) => o.id === id)?.title
      ?? (type === 'task' ? 'Taak' : 'Kennisbank-item')

  const availableTasks = taskOptions.filter((t) => !links.some((l) => l.linkedType === 'task' && l.linkedId === t.id))
  const availableWiki = wikiOptions.filter((w) => !links.some((l) => l.linkedType === 'wiki_entry' && l.linkedId === w.id))

  return (
    <div>
      <p className="text-xs text-muted mb-1.5">Koppelen aan</p>
      {links.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {links.map((l) => (
            <span key={l.id} className="chip bg-line text-muted text-[11px] gap-1">
              {l.linkedType === 'task' ? <CheckSquare className="h-3 w-3" /> : <BookOpen className="h-3 w-3" />}
              {titleFor(l.linkedType, l.linkedId)}
              <button onClick={() => onUnlink(l.id)} className="text-faint hover:text-cross-deep" aria-label="Koppeling verwijderen">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <select
          value=""
          onChange={(e) => { if (e.target.value) onLink(entryId, 'task', e.target.value) }}
          disabled={!availableTasks.length}
          className="flex-1 min-w-[9rem] rounded-lg bg-surface border border-line px-2.5 py-1.5 text-xs outline-none focus:border-buurtkaart/50 disabled:opacity-50"
        >
          <option value="">+ Koppelen aan taak…</option>
          {availableTasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select>
        <select
          value=""
          onChange={(e) => { if (e.target.value) onLink(entryId, 'wiki_entry', e.target.value) }}
          disabled={!availableWiki.length}
          className="flex-1 min-w-[9rem] rounded-lg bg-surface border border-line px-2.5 py-1.5 text-xs outline-none focus:border-buurtkaart/50 disabled:opacity-50"
        >
          <option value="">+ Koppelen aan Kennisbank…</option>
          {availableWiki.map((w) => <option key={w.id} value={w.id}>{w.title}</option>)}
        </select>
      </div>
    </div>
  )
}


import { useMemo, useState } from 'react'
import { Overlay, SectionTitle, Empty } from '../components/ui'
import { DOMAIN_META } from '../domains'
import { TX_CATEGORIES, domainForCategory } from './categories'
import type { Domain, VendorTag } from '../types'
import { X, Sparkles, Tag, Trash2, Pencil, Globe, CheckCircle2 } from 'lucide-react'

// The learned vendor cache, moved out of the tab bar into a header-triggered
// sheet — it's a power-user/admin tool (re-tag every past transaction from a
// merchant), not something you check day to day like the budgeting tabs.
export function VendorsSheet({
  vendorTags,
  untagged,
  tagging,
  onAutoTag,
  onSave,
  onDelete,
  onClose,
}: {
  vendorTags: VendorTag[]
  untagged: number
  tagging: boolean
  onAutoTag: () => void
  onSave: (key: string, patch: Partial<Omit<VendorTag, 'vendorKey' | 'updatedAt'>>) => void
  onDelete: (key: string) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [editKey, setEditKey] = useState<string | null>(null)

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return vendorTags
      .filter((v) => !needle || v.vendorName.toLowerCase().includes(needle) || v.category.toLowerCase().includes(needle))
      .sort((a, b) => a.vendorName.localeCompare(b.vendorName))
  }, [vendorTags, q])

  return (
    <Overlay tone="black" onClose={onClose} panelClassName="card w-full max-w-lg max-h-[85vh] overflow-y-auto p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <SectionTitle>
            <span className="flex items-center gap-2"><Tag className="h-4 w-4 text-prjct" /> Vendor-geheugen</span>
          </SectionTitle>
          <p className="text-xs text-faint -mt-2">
            {vendorTags.length} onthouden{untagged ? ` · ${untagged} nog niet gecategoriseerd` : ''}
          </p>
        </div>
        <button onClick={onClose} className="text-faint hover:text-ink p-1 shrink-0" aria-label="Sluiten">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        {vendorTags.length > 8 && (
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Zoek winkelier of categorie…"
            className="flex-1 rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none focus:border-prjct/60"
          />
        )}
        <button className="btn-primary !py-1.5 shrink-0" onClick={onAutoTag} disabled={tagging}>
          <Sparkles className={`h-4 w-4 ${tagging ? 'animate-pulse' : ''}`} /> {tagging ? 'Bezig…' : 'Auto-tag'}
        </button>
      </div>

      {shown.length === 0 ? (
        <Empty>
          {vendorTags.length === 0
            ? 'Nog geen vendors onthouden.'
            : 'Geen resultaten.'}
        </Empty>
      ) : (
        <div className="card divide-y divide-line">
          {shown.map((v) =>
            editKey === v.vendorKey ? (
              <VendorEditRow
                key={v.vendorKey}
                tag={v}
                onCancel={() => setEditKey(null)}
                onSave={(patch) => {
                  onSave(v.vendorKey, patch)
                  setEditKey(null)
                }}
              />
            ) : (
              <div key={v.vendorKey} className="flex items-center gap-3 p-3">
                <span className={`h-9 w-9 rounded-2xl flex items-center justify-center shrink-0 ${DOMAIN_META[v.domain].soft}`}>
                  {v.source === 'ai' ? <Globe className="h-4 w-4" /> : <Tag className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-ink truncate">{v.vendorName}</div>
                  <div className="text-xs text-faint truncate">
                    {v.category} · {DOMAIN_META[v.domain].label}
                    {v.source === 'ai' ? ` · AI ${Math.round(v.confidence * 100)}%` : ' · handmatig'}
                  </div>
                </div>
                <button onClick={() => setEditKey(v.vendorKey)} className="text-faint hover:text-ink shrink-0 p-1" aria-label="Bewerk">
                  <Pencil className="h-4 w-4" />
                </button>
                <button onClick={() => onDelete(v.vendorKey)} className="text-faint hover:text-cross shrink-0 p-1" aria-label="Verwijder">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ),
          )}
        </div>
      )}
    </Overlay>
  )
}

function VendorEditRow({
  tag,
  onCancel,
  onSave,
}: {
  tag: VendorTag
  onCancel: () => void
  onSave: (patch: Partial<Omit<VendorTag, 'vendorKey' | 'updatedAt'>>) => void
}) {
  const [category, setCategory] = useState(tag.category)
  const [domain, setDomain] = useState<Domain>(tag.domain)
  const [info, setInfo] = useState(tag.info)

  return (
    <div className="p-3 space-y-2 bg-sunken/40">
      <div className="text-sm font-medium text-ink">{tag.vendorName}</div>
      <div className="flex flex-wrap gap-2">
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value)
            setDomain(domainForCategory(e.target.value, -1))
          }}
          className="flex-[1_1_140px] rounded-xl bg-surface border border-line px-3 py-2 text-sm outline-none"
        >
          {TX_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          value={domain}
          onChange={(e) => setDomain(e.target.value as Domain)}
          className="flex-[1_1_120px] rounded-xl bg-surface border border-line px-3 py-2 text-sm outline-none"
        >
          {(['personal', 'prjct', 'parkingyou', 'buurtkaart'] as const).map((d) => (
            <option key={d} value={d}>{DOMAIN_META[d].label}</option>
          ))}
        </select>
      </div>
      <input
        value={info}
        onChange={(e) => setInfo(e.target.value)}
        placeholder="Info / notitie over deze winkelier…"
        className="w-full rounded-xl bg-surface border border-line px-3 py-2 text-sm outline-none"
      />
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="btn-ghost !py-1.5">Annuleer</button>
        <button onClick={() => onSave({ category, domain, info, source: 'manual', confidence: 1 })} className="btn-primary !py-1.5">
          <CheckCircle2 className="h-4 w-4" /> Opslaan
        </button>
      </div>
    </div>
  )
}

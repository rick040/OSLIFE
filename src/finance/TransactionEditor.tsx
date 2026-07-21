import { useState } from 'react'
import { Overlay } from '../components/ui'
import { DOMAIN_META, fmtDate } from '../domains'
import { eur } from '../lib/format'
import { TX_CATEGORIES, domainForCategory } from './categories'
import type { Domain, Transaction } from '../types'
import { X, Tag, Trash2, CheckCircle2 } from 'lucide-react'

// Change a single transaction's category / domain / note. By default the change
// also teaches the vendor cache so the next transaction from this merchant tags
// itself — untick "onthouden" to change just this one row.
export function TransactionEditor({
  tx,
  onClose,
  onSave,
  onDelete,
}: {
  tx: Transaction
  onClose: () => void
  onSave: (patch: Partial<Pick<Transaction, 'category' | 'domain' | 'note'>>, learnVendor: boolean) => void
  onDelete: () => void
}) {
  const [category, setCategory] = useState(TX_CATEGORIES.includes(tx.category as never) ? tx.category : 'Other')
  const [domain, setDomain] = useState<Domain>(tx.domain)
  const [note, setNote] = useState(tx.note ?? '')
  const [remember, setRemember] = useState(true)

  return (
    <Overlay tone="black" onClose={onClose} panelClassName="card w-full max-w-md p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-ink truncate">{tx.merchant}</div>
          <div className="text-xs text-faint">{fmtDate(tx.date)} · {eur(tx.amount)}</div>
        </div>
        <button onClick={onClose} className="text-faint hover:text-ink p-1 shrink-0" aria-label="Sluiten">
          <X className="h-4 w-4" />
        </button>
      </div>

      <label className="block">
        <span className="text-xs uppercase tracking-wider text-muted">Categorie</span>
        <select
          value={category}
          onChange={(e) => {
            const c = e.target.value
            setCategory(c)
            setDomain(domainForCategory(c, tx.amount))
          }}
          className="mt-1 w-full rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none focus:border-prjct/60"
        >
          {TX_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-xs uppercase tracking-wider text-muted">Domein</span>
        <select
          value={domain}
          onChange={(e) => setDomain(e.target.value as Domain)}
          className="mt-1 w-full rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none"
        >
          {(['personal', 'prjct', 'parkingyou', 'buurtkaart'] as const).map((d) => (
            <option key={d} value={d}>{DOMAIN_META[d].label}</option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-xs uppercase tracking-wider text-muted">Notitie</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Meer info bij deze transactie…"
          className="mt-1 w-full rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none focus:border-prjct/60 resize-none"
        />
      </label>

      <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="accent-forest" />
        <Tag className="h-3.5 w-3.5" /> Onthoud dit voor <span className="font-medium text-ink">{tx.merchant}</span>
      </label>

      <div className="flex items-center justify-between gap-2 pt-1">
        <button onClick={onDelete} className="btn-ghost text-cross hover:text-cross-deep">
          <Trash2 className="h-4 w-4" /> Verwijder
        </button>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">Annuleer</button>
          <button onClick={() => onSave({ category, domain, note }, remember)} className="btn-primary">
            <CheckCircle2 className="h-4 w-4" /> Opslaan
          </button>
        </div>
      </div>
    </Overlay>
  )
}


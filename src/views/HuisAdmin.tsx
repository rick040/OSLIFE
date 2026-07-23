import { useState } from 'react'
import { useStore } from '../store'
import { Empty, Overlay } from '../components/ui'
import { Plus, Trash2, CalendarClock, Home, X } from 'lucide-react'
import type { AdminCategory } from '../types'

const CAT_LABEL: Record<AdminCategory, string> = {
  insurance: 'Verzekering',
  contract: 'Contract',
  warranty: 'Garantie',
  vehicle: 'Voertuig',
  house: 'Huis',
  subscription_admin: 'Abonnement',
  document: 'Document',
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  const then = new Date(iso + 'T00:00:00').getTime()
  return Math.ceil((then - Date.now()) / 86_400_000)
}

function fmt(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}-${m}-${y}`
}

export default function HuisAdmin() {
  const { adminItems, addAdminItem, deleteAdminItem } = useStore()
  const [showAdd, setShowAdd] = useState(false)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<AdminCategory>('contract')
  const [renewalOn, setRenewalOn] = useState('')
  const [amount, setAmount] = useState('')

  const submit = () => {
    if (!title.trim()) return
    addAdminItem({
      title: title.trim(),
      category,
      provider: null,
      renewalOn: renewalOn || null,
      noticePeriodDays: 30,
      amount: amount ? Number(amount) : null,
      cancellable: false,
      notes: null,
      tier: 'normaal',
    })
    setTitle(''); setRenewalOn(''); setAmount(''); setCategory('contract')
    setShowAdd(false)
  }

  const yearlyTotal = adminItems.reduce((s, a) => s + (a.amount ?? 0), 0)

  return (
    <div className="flex flex-col gap-7 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sunken">
            <Home className="h-5 w-5 text-ink-soft" />
          </span>
          <h1 className="text-xl font-medium text-ink">Huis &amp; Admin</h1>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> Item toevoegen
        </button>
      </div>

      {showAdd && (
        <Overlay tone="black" onClose={() => setShowAdd(false)} panelClassName="card w-full max-w-md p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium">Item toevoegen</div>
            <button onClick={() => setShowAdd(false)} className="text-faint hover:text-ink p-1 shrink-0" aria-label="Sluiten">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titel (bv. Autoverzekering)" className="input" autoFocus />
            <select value={category} onChange={(e) => setCategory(e.target.value as AdminCategory)} className="input">
              {(Object.keys(CAT_LABEL) as AdminCategory[]).map((c) => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
            </select>
            <label className="text-xs text-faint flex flex-col gap-1.5">
              Verloopt / verlengt op
              <input type="date" value={renewalOn} onChange={(e) => setRenewalOn(e.target.value)} className="input" />
            </label>
            <label className="text-xs text-faint flex flex-col gap-1.5">
              Jaarlast (€)
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className="input" />
            </label>
          </div>
          <button onClick={submit} disabled={!title.trim()} className="btn-primary w-full">
            <Plus className="h-4 w-4" /> Toevoegen
          </button>
        </Overlay>
      )}

      {adminItems.length === 0 ? (
        <Empty>Nog niets vastgelegd. Voeg je eerste contract of verzekering toe.</Empty>
      ) : (
        <>
          <div className="text-xs text-faint">Totale jaarlast: <span className="text-ink font-medium">€{yearlyTotal.toLocaleString('nl-NL')}</span> over {adminItems.length} item(s).</div>
          <div className="space-y-2 animate-fade-up">
            {adminItems.map((a) => {
              const d = daysUntil(a.renewalOn)
              const soon = d != null && d >= 0 && d <= (a.noticePeriodDays ?? 30)
              return (
                <div key={a.id} className="card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{a.title}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-line text-muted">{CAT_LABEL[a.category]}</span>
                      </div>
                      <div className={`text-xs mt-1 flex items-center gap-1 ${soon ? 'text-cross' : 'text-muted'}`}>
                        <CalendarClock className="h-3 w-3" />
                        {a.renewalOn ? `Verloopt ${fmt(a.renewalOn)}${d != null ? ` (${d} dag(en))` : ''}` : 'Geen verloopdatum'}
                        {soon && ' — binnen opzegtermijn'}
                      </div>
                      {a.amount != null && <div className="text-xs text-faint mt-0.5">€{a.amount.toLocaleString('nl-NL')}/jaar</div>}
                    </div>
                    <button title="Verwijderen" onClick={() => deleteAdminItem(a.id)} className="p-2 rounded-lg hover:bg-sunken text-muted shrink-0">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

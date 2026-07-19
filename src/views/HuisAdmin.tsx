import { useState } from 'react'
import { useStore } from '../store'
import { Empty } from '../components/ui'
import { Plus, Trash2, CalendarClock } from 'lucide-react'
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
  }

  const yearlyTotal = adminItems.reduce((s, a) => s + (a.amount ?? 0), 0)

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold">Huis &amp; Admin</h1>
        <p className="text-sm text-muted mt-1">
          Saai maar duur als je het vergeet. Contracten, verzekeringen, garanties en verlengingen,
          met een seintje voordat de opzegtermijn verloopt.
        </p>
      </div>

      <div className="card p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium"><Plus className="h-4 w-4 text-buurtkaart" /> Item toevoegen</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titel (bv. Autoverzekering)"
            className="rounded-lg border border-line bg-transparent px-3 py-2 text-sm" />
          <select value={category} onChange={(e) => setCategory(e.target.value as AdminCategory)}
            className="rounded-lg border border-line bg-transparent px-3 py-2 text-sm">
            {(Object.keys(CAT_LABEL) as AdminCategory[]).map((c) => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
          </select>
          <label className="text-xs text-faint flex flex-col gap-1">
            Verloopt / verlengt op
            <input type="date" value={renewalOn} onChange={(e) => setRenewalOn(e.target.value)}
              className="rounded-lg border border-line bg-transparent px-3 py-2 text-sm text-ink" />
          </label>
          <label className="text-xs text-faint flex flex-col gap-1">
            Jaarlast (€)
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0"
              className="rounded-lg border border-line bg-transparent px-3 py-2 text-sm text-ink" />
          </label>
        </div>
        <button onClick={submit} disabled={!title.trim()}
          className="rounded-lg bg-buurtkaart/10 text-buurtkaart-deep border border-buurtkaart/40 px-4 py-2 text-sm font-medium hover:bg-buurtkaart/15 disabled:opacity-50">
          Toevoegen
        </button>
      </div>

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
                    <button title="Verwijderen" onClick={() => deleteAdminItem(a.id)} className="p-2 rounded-lg hover:bg-line text-muted shrink-0">
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

import { useMemo, useRef, useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from 'recharts'
import { CHART_TIP, AXIS_TICK_10 } from '../components/chart'
import { useStore } from '../store'
import { TODAY, DOMAIN_META, DOMAIN_HEX, fmtDate, daysBetween } from '../domains'
import { dueLabel } from '../lib/dates'
import { OPENING_BALANCE } from '../mockData'
import { DomainChip, SectionTitle, Empty, Overlay, ConfirmDialog, Sparkline } from '../components/ui'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
import type { Domain, Transaction, Cadence, Subscription, VendorTag, Payment } from '../types'
import { TX_CATEGORIES, CATEGORY_DOMAIN, domainForCategory } from '../finance/categories'
import { parseCsv } from '../finance/csvImport'
import {
  Wallet,
  Upload,
  Target,
  TrendingUp,
  TrendingDown,
  Plus,
  Receipt,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Repeat,
  X,
  Pause,
  Play,
  Sparkles,
  Pencil,
  Tag,
  Trash2,
  Globe,
} from 'lucide-react'

import { eur, eur0 } from '../lib/format'

// Category → domain colour map for the chart (shared taxonomy).
const CAT_DOMAIN = CATEGORY_DOMAIN

// ── subscription helpers ──────────────────────────────────────────────────────
const CADENCE_NL: Record<Cadence, string> = {
  weekly: 'per week',
  monthly: 'per maand',
  quarterly: 'per kwartaal',
  yearly: 'per jaar',
}
function monthly(amount: number, cadence: Cadence): number {
  switch (cadence) {
    case 'weekly': return (amount * 52) / 12
    case 'monthly': return amount
    case 'quarterly': return amount / 3
    case 'yearly': return amount / 12
  }
}

type Tab = 'overzicht' | 'tebetalen' | 'abonnementen' | 'vendors'

export default function Money() {
  const {
    transactions,
    goals,
    payments,
    subscriptions,
    vendorTags,
    addTransactions,
    importTransactions,
    markPaymentPaid,
    deletePayment,
    deleteTransaction,
    updateTransaction,
    autoTagTransactions,
    setVendorTag,
    deleteVendorTag,
    addSubscription,
    toggleSubscription,
    deleteSubscription,
  } = useStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [tab, setTab] = useState<Tab>('overzicht')
  const [filter, setFilter] = useState<Domain | 'all'>('all')
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [tagging, setTagging] = useState(false)
  const [confirmPayment, setConfirmPayment] = useState<Payment | null>(null)
  const [confirmDeleteTx, setConfirmDeleteTx] = useState(false)

  const untagged = useMemo(
    () => transactions.filter((t) => /^(other|uncategorized|uncategorised|onbekend|)$/i.test(t.category.trim())).length,
    [transactions],
  )

  const runAutoTag = async () => {
    setTagging(true)
    try {
      await autoTagTransactions()
    } finally {
      setTagging(false)
    }
  }

  const openPayments = payments
    .filter((p) => p.status === 'open')
    .sort((a, b) => (a.due ? a.due : '9999').localeCompare(b.due ? b.due : '9999'))
  const toReceive = openPayments.filter((p) => p.direction === 'incoming').reduce((a, p) => a + p.amount, 0)
  const toPay = openPayments.filter((p) => p.direction === 'outgoing').reduce((a, p) => a + p.amount, 0)

  const balance = OPENING_BALANCE + transactions.reduce((a, t) => a + t.amount, 0)
  // 14-day running-balance trend for the saldo hero card's sparkline.
  const balanceTrend = useMemo(() => {
    const days = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(TODAY + 'T00:00:00')
      d.setDate(d.getDate() - (13 - i))
      return d.toISOString().slice(0, 10)
    })
    return days.map((date) => OPENING_BALANCE + transactions.filter((t) => t.date <= date).reduce((a, t) => a + t.amount, 0))
  }, [transactions])
  const month = TODAY.slice(0, 7)
  const monthTx = transactions.filter((t) => t.date.slice(0, 7) === month)
  const earned = monthTx.filter((t) => t.amount > 0).reduce((a, t) => a + t.amount, 0)
  const spent = monthTx.filter((t) => t.amount < 0).reduce((a, t) => a + t.amount, 0)
  // seeded revenue goal if present, otherwise the first live goal in EUR (live ids are generated)
  const revenueGoal = goals.find((g) => g.id === 'g1') ?? goals.find((g) => g.metric === 'EUR') ?? goals[0]

  const subsMonthly = subscriptions.filter((s) => s.active).reduce((a, s) => a + monthly(s.amount, s.cadence), 0)

  const byCategory = useMemo(() => {
    const map = new Map<string, number>()
    monthTx.forEach((t) => {
      if (t.amount < 0) map.set(t.category, (map.get(t.category) || 0) + Math.abs(t.amount))
    })
    return [...map.entries()]
      .map(([cat, v]) => ({ cat, v: Math.round(v), domain: (CAT_DOMAIN[cat] ?? 'personal') as Domain }))
      .sort((a, b) => b.v - a.v)
  }, [monthTx])

  const filtered = filter === 'all' ? transactions : transactions.filter((t) => t.domain === filter)
  const grouped = useMemo(() => {
    const map = new Map<string, Transaction[]>()
    filtered.forEach((t) => {
      const arr = map.get(t.date) || []
      arr.push(t)
      map.set(t.date, arr)
    })
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [filtered])

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    f.text().then(async (txt) => {
      const txns = parseCsv(txt)
      if (!txns.length) {
        alert('Geen herkenbare transacties gevonden in dit bestand.')
        return
      }
      const { inserted, duplicates } = await importTransactions(txns)
      alert(
        `${inserted} transactie(s) geïmporteerd` +
          (duplicates ? `, ${duplicates} al bekend (overgeslagen).` : '.'),
      )
    })
    e.target.value = ''
  }

  const demoImport = () =>
    addTransactions([
      { id: `imp-${Date.now()}-a`, date: TODAY, amount: 880, merchant: 'Bakkerij van Dijk (factuur 2026-031)', category: 'Client income', domain: 'prjct' },
      { id: `imp-${Date.now()}-b`, date: TODAY, amount: -64.2, merchant: 'Albert Heijn', category: 'Groceries', domain: 'personal' },
      { id: `imp-${Date.now()}-c`, date: TODAY, amount: -12.99, merchant: 'NS (trein Eindhoven)', category: 'Transport', domain: 'personal' },
    ])

  const TABS: { id: Tab; label: string }[] = [
    { id: 'overzicht', label: 'Overzicht' },
    { id: 'tebetalen', label: 'Te betalen' },
    { id: 'abonnementen', label: 'Abonnementen' },
    { id: 'vendors', label: 'Vendors' },
  ]

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Wallet className="h-5 w-5 text-buurtkaart" /> Money
          </h1>
          <p className="text-sm text-muted mt-1">ABN AMRO · transacties, betalingen en abonnementen.</p>
        </div>
        <div className="flex gap-2">
          <button
            className="btn-ghost"
            onClick={runAutoTag}
            disabled={tagging}
            title="Laat HEYRA (Haiku) onbekende winkeliers opzoeken en categoriseren"
          >
            <Sparkles className={`h-4 w-4 ${tagging ? 'animate-pulse' : ''}`} />
            {tagging ? 'Bezig…' : `Auto-tag${untagged ? ` (${untagged})` : ''}`}
          </button>
          <button className="btn-ghost" onClick={demoImport}>
            <Plus className="h-4 w-4" /> Demo-import
          </button>
          <button className="btn-primary" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" /> Importeer CSV
          </button>
          <input ref={fileRef} type="file" accept=".csv,.txt,.tab" hidden onChange={onFile} />
        </div>
      </div>

      {/* Radix Tabs — proper tablist/tab/tabpanel semantics and arrow-key/
          Home/End keyboard navigation for free, replacing hand-rolled
          buttons that only supported a mouse click. */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>
              {t.label}
              {t.id === 'tebetalen' && openPayments.length > 0 && (
                <span className="ml-1.5 text-xs text-faint">{openPayments.length}</span>
              )}
              {t.id === 'vendors' && vendorTags.length > 0 && (
                <span className="ml-1.5 text-xs text-faint">{vendorTags.length}</span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

      <TabsContent value="overzicht" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* the one hero number on this screen — everything else on this
                tab is detail you check, this is the thing you glance at */}
            <div className="card-hero relative p-4">
              {transactions.length >= 2 && (
                <span className="absolute right-4 top-4">
                  <Sparkline values={balanceTrend} className="text-[#16210f]" width={56} height={24} />
                </span>
              )}
              <div className="text-xs font-semibold uppercase tracking-wider">Saldo</div>
              <div className="text-2xl font-bold tabular-nums mt-1">{eur(balance)}</div>
              <div className="text-xs font-medium mt-1">incl. {transactions.length} transacties</div>
            </div>
            <div className="card p-4">
              <div className="text-xs uppercase tracking-wider text-muted">Deze maand</div>
              <div className="mt-1 space-y-0.5">
                <div className="flex items-center gap-1.5 text-buurtkaart text-sm font-medium">
                  <TrendingUp className="h-3.5 w-3.5" /> {eur0(earned)} in
                </div>
                <div className="flex items-center gap-1.5 text-cross text-sm font-medium">
                  <TrendingDown className="h-3.5 w-3.5" /> {eur0(spent)} uit
                </div>
              </div>
              <div className="text-xs text-faint mt-1">netto {eur0(earned + spent)}</div>
            </div>
            {revenueGoal && (
              <div className="card p-4">
                <div className="text-xs uppercase tracking-wider text-muted flex items-center gap-1 truncate">
                  <Target className="h-3.5 w-3.5 text-prjct shrink-0" /> Doel {eur0(revenueGoal.target)}
                </div>
                <div className="text-2xl font-bold tabular-nums mt-1">{Math.round((revenueGoal.current / revenueGoal.target) * 100)}%</div>
                <div className="h-1.5 w-full rounded-full bg-line overflow-hidden mt-2">
                  <div className="h-full rounded-full bg-prjct" style={{ width: `${Math.min(1, revenueGoal.current / revenueGoal.target) * 100}%` }} />
                </div>
                <div className="text-xs text-faint mt-1">nog {eur0(revenueGoal.target - revenueGoal.current)} te gaan</div>
              </div>
            )}
          </div>

          {byCategory.length > 0 && (
            <div className="card p-4">
              <SectionTitle hint="Uitgaven deze maand per categorie.">Waar gaat het heen</SectionTitle>
              <ResponsiveContainer width="100%" height={Math.max(140, byCategory.length * 30)}>
                <BarChart data={byCategory} layout="vertical" margin={{ top: 0, right: 16, left: 24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E7E9DE" horizontal={false} />
                  <XAxis type="number" tick={AXIS_TICK_10} />
                  <YAxis type="category" dataKey="cat" width={90} tick={{ fill: '#5C6150', fontSize: 11 }} />
                  <Tooltip
                    cursor={{ fill: '#F4F5EE' }}
                    contentStyle={CHART_TIP}
                    formatter={(v: number) => [`€${v}`, 'uitgegeven']}
                  />
                  <Bar dataKey="v" radius={[0, 4, 4, 0]}>
                    {byCategory.map((c) => (
                      <Cell key={c.cat} fill={DOMAIN_HEX[c.domain]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <SectionTitle>Transacties</SectionTitle>
              <div className="flex flex-wrap gap-1">
                {(['all', 'prjct', 'parkingyou', 'buurtkaart', 'personal'] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setFilter(d)}
                    className={`chip ${filter === d ? 'bg-forest text-white' : 'bg-surface border border-line text-muted hover:text-ink'}`}
                  >
                    {d === 'all' ? 'alles' : DOMAIN_META[d].label}
                  </button>
                ))}
              </div>
            </div>
            {grouped.length ? (
              <div className="space-y-4">
                {grouped.map(([date, txns]) => (
                  <div key={date}>
                    <div className="text-xs text-faint mb-1.5">{fmtDate(date)}</div>
                    <div className="card divide-y divide-line/50">
                      {txns.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => setEditing(t)}
                          className="w-full flex items-center gap-3 p-3 text-left hover:bg-sunken/60 transition-colors group"
                        >
                          <span className={`h-2 w-2 rounded-full shrink-0 ${DOMAIN_META[t.domain].dot}`} />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm text-ink truncate">{t.merchant}</div>
                            <div className="text-xs text-faint flex items-center gap-1">
                              <span>{t.category}</span>
                              {t.autoTagged && <Sparkles className="h-3 w-3 text-prjct" aria-label="Auto-getagd" />}
                              {t.note && <span className="truncate">· {t.note}</span>}
                            </div>
                          </div>
                          <Pencil className="h-3.5 w-3.5 text-faint opacity-0 group-hover:opacity-100 shrink-0" />
                          <span className={`text-sm font-medium tabular-nums shrink-0 ${t.amount > 0 ? 'text-buurtkaart' : 'text-ink'}`}>
                            {t.amount > 0 ? '+' : ''}
                            {eur(t.amount)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Empty>Geen transacties in dit filter.</Empty>
            )}
          </div>
      </TabsContent>

      <TabsContent value="tebetalen" className="mt-6">
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <SectionTitle hint="Gelogd in je betalingen-agenda. Te ontvangen van klanten en zelf te betalen.">
              <span className="flex items-center gap-2"><Receipt className="h-4 w-4 text-personal" /> Openstaande betalingen</span>
            </SectionTitle>
            <div className="flex gap-2 shrink-0">
              <span className="chip bg-buurtkaart/12 text-buurtkaart-deep">+{eur0(toReceive)} in</span>
              <span className="chip bg-cross/12 text-cross-deep">-{eur0(toPay)} uit</span>
            </div>
          </div>
          {openPayments.length ? (
            <div className="divide-y divide-line">
              {openPayments.map((p) => {
                const due = dueLabel(p.due, { prefix: 'vervalt ' })
                return (
                  <div key={p.id} className="flex items-center gap-3 py-2.5">
                    <span className={`shrink-0 ${p.direction === 'incoming' ? 'text-buurtkaart' : 'text-cross'}`}>
                      {p.direction === 'incoming' ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-ink truncate">{p.payee}</div>
                      <div className="flex items-center gap-1.5">
                        <DomainChip domain={p.domain} small />
                        <span className={`text-xs ${due.overdue ? 'text-cross font-medium' : 'text-faint'}`}>
                          {due.label}
                        </span>
                      </div>
                    </div>
                    <span className={`text-sm font-medium tabular-nums shrink-0 ${p.direction === 'incoming' ? 'text-buurtkaart-deep' : 'text-ink'}`}>
                      {p.direction === 'incoming' ? '+' : '-'}
                      {eur(p.amount)}
                    </span>
                    <button className="btn-ghost shrink-0 !py-1.5" onClick={() => markPaymentPaid(p.id)}>
                      <CheckCircle2 className="h-4 w-4" /> {p.direction === 'incoming' ? 'Ontvangen' : 'Betaald'}
                    </button>
                    <button
                      className="text-faint hover:text-cross shrink-0 p-1"
                      onClick={() => setConfirmPayment(p)}
                      aria-label="Verwijder betaling"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )
              })}
            </div>
          ) : (
            <Empty>Geen openstaande betalingen.</Empty>
          )}
        </div>
      </TabsContent>

      <TabsContent value="abonnementen" className="mt-6">
        <Abonnementen
          subscriptions={subscriptions}
          monthlyTotal={subsMonthly}
          onAdd={addSubscription}
          onToggle={toggleSubscription}
          onDelete={deleteSubscription}
        />
      </TabsContent>

      <TabsContent value="vendors" className="mt-6">
        <Vendors
          vendorTags={vendorTags}
          untagged={untagged}
          tagging={tagging}
          onAutoTag={runAutoTag}
          onSave={(key, patch) => setVendorTag(key, patch, { reapply: true })}
          onDelete={deleteVendorTag}
        />
      </TabsContent>
      </Tabs>

      {editing && (
        <TransactionEditor
          tx={editing}
          onClose={() => { setEditing(null); setConfirmDeleteTx(false) }}
          onSave={(patch, learnVendor) => {
            updateTransaction(editing.id, patch, { learnVendor })
            setEditing(null)
          }}
          onDelete={() => setConfirmDeleteTx(true)}
        />
      )}

      {editing && confirmDeleteTx && (
        <ConfirmDialog
          title={`Transactie "${editing.merchant}" verwijderen?`}
          onCancel={() => setConfirmDeleteTx(false)}
          onConfirm={() => {
            deleteTransaction(editing.id)
            setConfirmDeleteTx(false)
            setEditing(null)
          }}
        />
      )}

      {confirmPayment && (
        <ConfirmDialog
          title={`Betaling "${confirmPayment.payee}" verwijderen?`}
          onCancel={() => setConfirmPayment(null)}
          onConfirm={() => { deletePayment(confirmPayment.id); setConfirmPayment(null) }}
        />
      )}
    </div>
  )
}

// ── Transaction editor ─────────────────────────────────────────────────────────
// Change a single transaction's category / domain / note. By default the change
// also teaches the vendor cache so the next transaction from this merchant tags
// itself — untick "onthouden" to change just this one row.
function TransactionEditor({
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
            className="mt-1 w-full rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none focus:border-prjct/60"
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
          <button
            onClick={onDelete}
            className="btn-ghost text-cross hover:text-cross-deep"
          >
            <Trash2 className="h-4 w-4" /> Verwijder
          </button>
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="btn-ghost">Annuleer</button>
            <button
              onClick={() => onSave({ category, domain, note }, remember)}
              className="btn-primary"
            >
              <CheckCircle2 className="h-4 w-4" /> Opslaan
            </button>
          </div>
        </div>
    </Overlay>
  )
}

// ── Vendors manager ──────────────────────────────────────────────────────────
// The learned vendor cache: every merchant HEYRA (or Rick) has categorised once.
// Editing a vendor here re-tags every past transaction from that merchant.
function Vendors({
  vendorTags,
  untagged,
  tagging,
  onAutoTag,
  onSave,
  onDelete,
}: {
  vendorTags: VendorTag[]
  untagged: number
  tagging: boolean
  onAutoTag: () => void
  onSave: (key: string, patch: Partial<Omit<VendorTag, 'vendorKey' | 'updatedAt'>>) => void
  onDelete: (key: string) => void
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
    <div className="space-y-4">
      <div className="card p-4 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <SectionTitle hint="Elke winkelier die HEYRA één keer heeft opgezocht — daarna gratis herbruikt.">
            <span className="flex items-center gap-2"><Tag className="h-4 w-4 text-prjct" /> Vendor-geheugen</span>
          </SectionTitle>
          <p className="text-xs text-faint mt-1">
            {vendorTags.length} onthouden{untagged ? ` · ${untagged} transactie(s) nog niet gecategoriseerd` : ' · alles getagd'}
          </p>
        </div>
        <button className="btn-primary !py-1.5" onClick={onAutoTag} disabled={tagging}>
          <Sparkles className={`h-4 w-4 ${tagging ? 'animate-pulse' : ''}`} /> {tagging ? 'Bezig…' : 'Auto-tag nu'}
        </button>
      </div>

      {vendorTags.length > 8 && (
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Zoek winkelier of categorie…"
          className="w-full rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none focus:border-prjct/60"
        />
      )}

      {shown.length === 0 ? (
        <Empty>
          {vendorTags.length === 0
            ? 'Nog geen vendors onthouden. Importeer transacties en druk op Auto-tag.'
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
                    {v.info ? ` · ${v.info}` : ''}
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
    </div>
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

// ── Abonnementen-manager ──────────────────────────────────────────────────────
function Abonnementen({
  subscriptions,
  monthlyTotal,
  onAdd,
  onToggle,
  onDelete,
}: {
  subscriptions: Subscription[]
  monthlyTotal: number
  onAdd: (sub: Omit<Subscription, 'id'>) => void
  onToggle: (id: string) => void
  onDelete: (id: string) => void
}) {
  const [show, setShow] = useState<'active' | 'paused' | 'all'>('active')
  const [form, setForm] = useState(false)
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [cadence, setCadence] = useState<Cadence>('monthly')
  const [next, setNext] = useState('')
  const [domain, setDomain] = useState<Domain>('prjct')

  const shown = subscriptions
    .filter((s) => (show === 'all' ? true : show === 'active' ? s.active : !s.active))
    .sort((a, b) => monthly(b.amount, b.cadence) - monthly(a.amount, a.cadence))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const amt = parseFloat(amount.replace(',', '.'))
    if (!name.trim() || isNaN(amt)) return
    onAdd({ name: name.trim(), amount: amt, cadence, nextCharge: next || null, active: true, category: 'Overig', domain })
    setName(''); setAmount(''); setNext(''); setCadence('monthly'); setForm(false)
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wider text-muted">Per maand</div>
          <div className="text-2xl font-bold tabular-nums mt-1">{eur(monthlyTotal)}</div>
          <div className="text-xs text-faint mt-1">{subscriptions.filter((s) => s.active).length} actief</div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wider text-muted">Per jaar</div>
          <div className="text-2xl font-bold tabular-nums mt-1">{eur(monthlyTotal * 12)}</div>
          <div className="text-xs text-faint mt-1">geschat op actieve abonnementen</div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1 rounded-2xl bg-sunken p-1">
          {(['active', 'paused', 'all'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setShow(v)}
              className={`rounded-xl px-3 py-1.5 text-sm font-medium ${show === v ? 'bg-surface shadow-sm text-ink' : 'text-muted'}`}
            >
              {v === 'active' ? 'Actief' : v === 'paused' ? 'Gestopt' : 'Alles'}
            </button>
          ))}
        </div>
        <button className="btn-primary !py-1.5" onClick={() => setForm((f) => !f)}>
          <Plus className="h-4 w-4" /> Nieuw
        </button>
      </div>

      {form && (
        <form onSubmit={submit} className="card p-4 space-y-3">
          <SectionTitle>Nieuw abonnement</SectionTitle>
          <div className="flex flex-wrap gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Naam (bv. Netflix)" required className="flex-[2_1_160px] rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none focus:border-prjct/60" />
            <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Bedrag" required inputMode="decimal" className="flex-[0_0_96px] rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none focus:border-prjct/60" />
            <select value={cadence} onChange={(e) => setCadence(e.target.value as Cadence)} className="flex-[1_1_120px] rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none">
              <option value="weekly">per week</option>
              <option value="monthly">per maand</option>
              <option value="quarterly">per kwartaal</option>
              <option value="yearly">per jaar</option>
            </select>
            <input value={next} onChange={(e) => setNext(e.target.value)} type="date" className="flex-[1_1_130px] rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none" />
            <select value={domain} onChange={(e) => setDomain(e.target.value as Domain)} className="flex-[1_1_120px] rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none">
              {(['prjct', 'parkingyou', 'buurtkaart', 'personal'] as const).map((d) => (
                <option key={d} value={d}>{DOMAIN_META[d].label}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-primary !py-1.5"><Plus className="h-4 w-4" /> Toevoegen</button>
        </form>
      )}

      {shown.length === 0 ? (
        <Empty>Niks hier.</Empty>
      ) : (
        <div className="card divide-y divide-line">
          {shown.map((s) => {
            const m = monthly(s.amount, s.cadence)
            const dd = s.nextCharge ? daysBetween(TODAY, s.nextCharge) : null
            const parts = [`${eur(s.amount)} ${CADENCE_NL[s.cadence]}`]
            if (s.cadence !== 'monthly') parts.push(`${eur(m)} p/m`)
            if (s.nextCharge) parts.push(dd !== null && dd >= 0 ? `volgende over ${dd}d` : `volgende ${fmtDate(s.nextCharge)}`)
            if (s.notes) parts.push(s.notes)
            return (
              <div key={s.id} className={`flex items-center gap-3 p-3 ${s.active ? '' : 'opacity-50'}`}>
                <span className={`h-9 w-9 rounded-2xl flex items-center justify-center shrink-0 ${s.active ? `${DOMAIN_META[s.domain].soft}` : 'bg-sunken text-faint'}`}>
                  <Repeat className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-ink truncate">{s.name}</div>
                  <div className="text-xs text-faint truncate">{parts.join(' · ')}</div>
                </div>
                <span className="text-sm font-semibold tabular-nums shrink-0">{eur(s.amount)}</span>
                <button
                  onClick={() => onToggle(s.id)}
                  className={`chip shrink-0 ${s.active ? 'bg-sunken text-muted hover:text-ink' : 'bg-buurtkaart/15 text-buurtkaart-deep'}`}
                  aria-label={s.active ? 'Pauzeer' : 'Activeer'}
                >
                  {s.active ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                  {s.active ? 'Stop' : 'Actief'}
                </button>
                <button onClick={() => onDelete(s.id)} className="text-faint hover:text-cross shrink-0 p-1" aria-label="Verwijder">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

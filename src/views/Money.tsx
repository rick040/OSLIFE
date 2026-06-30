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
import { useStore } from '../store'
import { TODAY, DOMAIN_META, DOMAIN_HEX, fmtDate, daysBetween } from '../domains'
import { OPENING_BALANCE } from '../mockData'
import { DomainChip, SectionTitle, Empty } from '../components/ui'
import type { Domain, Transaction, Cadence, Subscription } from '../types'
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
} from 'lucide-react'

const eur = (n: number) =>
  `${n < 0 ? '-' : ''}€${Math.abs(n).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const eur0 = (n: number) =>
  `${n < 0 ? '-' : ''}€${Math.abs(n).toLocaleString('nl-NL', { maximumFractionDigits: 0 })}`

const CAT_DOMAIN: Record<string, Domain> = {
  Groceries: 'personal',
  Takeout: 'personal',
  Convenience: 'personal',
  Dog: 'personal',
  Subscriptions: 'personal',
  Software: 'prjct',
  Gear: 'prjct',
  'Client income': 'prjct',
  'Stock media': 'parkingyou',
}

// ── ABN AMRO + generieke CSV parser ───────────────────────────────────────────
// ABN AMRO CSV (komma, gequote) kolommen:
//   accountNumber, mutationcode(EUR), transactiondate(YYYYMMDD), valuedate,
//   startsaldo, endsaldo, amount(NL komma), description(lange vrije tekst)
// Valt terug op een vergevingsgezinde generieke parse per regel.
function guessCategory(desc: string, amount: number): string {
  const d = desc.toLowerCase()
  if (amount > 0) return 'Client income'
  if (/albert heijn|jumbo|lidl|aldi|plus|supermarkt/.test(d)) return 'Groceries'
  if (/thuisbezorg|takeaway|dominos|new york pizza|mcdonald/.test(d)) return 'Takeout'
  if (/adobe|canva|figma|notion|vercel|openai|chatgpt|google|microsoft/.test(d)) return 'Software'
  if (/spotify|netflix|disney|videoland/.test(d)) return 'Subscriptions'
  if (/esso|shell|bp|tango|tankstation/.test(d)) return 'Convenience'
  if (/dier|vet|kyra|hond/.test(d)) return 'Dog'
  if (/ns |trein|ov-|9292|transavia|ovpay/.test(d)) return 'Transport'
  return 'Uncategorized'
}

function cleanMerchant(desc: string): string {
  // ABN beschrijvingen bevatten vaak "BEA, Betaalpas <naam> ,PAS123" of "/TRTP/..."
  const m =
    desc.match(/Betaalpas\s+(.+?)(?:,|\s{2,}|$)/i)?.[1] ||
    desc.match(/\/NAME\/(.+?)\//i)?.[1] ||
    desc.match(/SEPA.*?\/NAME\/(.+?)\//i)?.[1]
  if (m) return m.trim()
  // anders: langste alfabetische token-groep
  const tokens = desc.replace(/[^A-Za-z0-9 .&'-]/g, ' ').split(/\s{2,}|\s(?=[A-Z]{3,})/).map((t) => t.trim()).filter((t) => t.length > 3)
  return (tokens.sort((a, b) => b.length - a.length)[0] || desc.slice(0, 28) || 'Onbekend').slice(0, 40)
}

function parseAmount(raw: string): number {
  return parseFloat(raw.replace(/\s/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.'))
}

function parseCsv(text: string): Transaction[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  const out: Transaction[] = []
  lines.forEach((line, i) => {
    const cells = line.split(/[;\t]|","/).map((c) => c.trim().replace(/^"|"$/g, ''))
    if (cells.length < 2) return
    if (i === 0 && /date|datum|bedrag|amount|omschrijving|description/i.test(line) && !/\d{8}/.test(line)) return

    const dateCell = cells.find((c) => /^\d{4}-\d{2}-\d{2}$/.test(c) || /^\d{8}$/.test(c))
    let date = TODAY
    if (dateCell) {
      const iso = dateCell.match(/^\d{4}-\d{2}-\d{2}$/)?.[0]
      const ymd = dateCell.match(/^(\d{4})(\d{2})(\d{2})$/)
      date = iso ?? (ymd ? `${ymd[1]}-${ymd[2]}-${ymd[3]}` : TODAY)
    }
    const amtCell = cells.find((c) => c !== dateCell && /^[+-]?\s*\d{1,3}([.,]\d{3})*([.,]\d{1,2})$/.test(c.replace(/\s/g, '')))
    if (!amtCell) return
    const amount = parseAmount(amtCell)
    if (isNaN(amount)) return
    const desc =
      cells.filter((c) => c !== dateCell && c !== amtCell).sort((a, b) => b.length - a.length)[0] || 'Onbekend'
    const merchant = cleanMerchant(desc)
    const category = guessCategory(desc, amount)
    out.push({
      id: `imp-${Date.now()}-${i}`,
      date,
      amount,
      merchant,
      category,
      domain: CAT_DOMAIN[category] ?? (amount > 0 ? 'prjct' : 'personal'),
    })
  })
  return out
}

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

type Tab = 'overzicht' | 'tebetalen' | 'abonnementen'

export default function Money() {
  const {
    transactions,
    goals,
    payments,
    subscriptions,
    addTransactions,
    markPaymentPaid,
    addSubscription,
    toggleSubscription,
    deleteSubscription,
  } = useStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [tab, setTab] = useState<Tab>('overzicht')
  const [filter, setFilter] = useState<Domain | 'all'>('all')

  const openPayments = payments
    .filter((p) => p.status === 'open')
    .sort((a, b) => (a.due ? a.due : '9999').localeCompare(b.due ? b.due : '9999'))
  const toReceive = openPayments.filter((p) => p.direction === 'incoming').reduce((a, p) => a + p.amount, 0)
  const toPay = openPayments.filter((p) => p.direction === 'outgoing').reduce((a, p) => a + p.amount, 0)

  const balance = OPENING_BALANCE + transactions.reduce((a, t) => a + t.amount, 0)
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
    f.text().then((txt) => {
      const txns = parseCsv(txt)
      if (txns.length) addTransactions(txns)
      else alert('Geen herkenbare transacties gevonden in dit bestand.')
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
          <button className="btn-ghost" onClick={demoImport}>
            <Plus className="h-4 w-4" /> Demo-import
          </button>
          <button className="btn-primary" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" /> Importeer CSV
          </button>
          <input ref={fileRef} type="file" accept=".csv,.txt,.tab" hidden onChange={onFile} />
        </div>
      </div>

      {/* tab nav */}
      <div className="flex gap-1 rounded-2xl bg-sunken p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.id ? 'bg-surface shadow-sm text-ink' : 'text-muted hover:text-ink'
            }`}
          >
            {t.label}
            {t.id === 'tebetalen' && openPayments.length > 0 && (
              <span className="ml-1.5 text-[11px] text-faint">{openPayments.length}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'overzicht' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card p-4">
              <div className="text-xs uppercase tracking-wider text-muted">Saldo</div>
              <div className="text-2xl font-semibold mt-1">{eur(balance)}</div>
              <div className="text-[11px] text-faint mt-1">incl. {transactions.length} transacties</div>
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
              <div className="text-[11px] text-faint mt-1">netto {eur0(earned + spent)}</div>
            </div>
            {revenueGoal && (
              <div className="card p-4">
                <div className="text-xs uppercase tracking-wider text-muted flex items-center gap-1 truncate">
                  <Target className="h-3.5 w-3.5 text-prjct shrink-0" /> Doel {eur0(revenueGoal.target)}
                </div>
                <div className="text-2xl font-semibold mt-1">{Math.round((revenueGoal.current / revenueGoal.target) * 100)}%</div>
                <div className="h-1.5 w-full rounded-full bg-line overflow-hidden mt-2">
                  <div className="h-full rounded-full bg-prjct" style={{ width: `${Math.min(1, revenueGoal.current / revenueGoal.target) * 100}%` }} />
                </div>
                <div className="text-[11px] text-faint mt-1">nog {eur0(revenueGoal.target - revenueGoal.current)} te gaan</div>
              </div>
            )}
          </div>

          {byCategory.length > 0 && (
            <div className="card p-4">
              <SectionTitle hint="Uitgaven deze maand per categorie.">Waar gaat het heen</SectionTitle>
              <ResponsiveContainer width="100%" height={Math.max(140, byCategory.length * 30)}>
                <BarChart data={byCategory} layout="vertical" margin={{ top: 0, right: 16, left: 24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E7E9DE" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#8C9080', fontSize: 10 }} />
                  <YAxis type="category" dataKey="cat" width={90} tick={{ fill: '#5C6150', fontSize: 11 }} />
                  <Tooltip
                    cursor={{ fill: '#F4F5EE' }}
                    contentStyle={{ background: '#FFFFFF', border: '1px solid #E7E9DE', color: '#1B1D17', borderRadius: 12, fontSize: 12 }}
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
                        <div key={t.id} className="flex items-center gap-3 p-3">
                          <span className={`h-2 w-2 rounded-full shrink-0 ${DOMAIN_META[t.domain].dot}`} />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm text-ink truncate">{t.merchant}</div>
                            <div className="text-[11px] text-faint">{t.category}</div>
                          </div>
                          <span className={`text-sm font-medium tabular-nums shrink-0 ${t.amount > 0 ? 'text-buurtkaart' : 'text-ink'}`}>
                            {t.amount > 0 ? '+' : ''}
                            {eur(t.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Empty>Geen transacties in dit filter.</Empty>
            )}
          </div>
        </>
      )}

      {tab === 'tebetalen' && (
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
                const dd = p.due ? daysBetween(TODAY, p.due) : null
                const overdue = dd !== null && dd < 0
                return (
                  <div key={p.id} className="flex items-center gap-3 py-2.5">
                    <span className={`shrink-0 ${p.direction === 'incoming' ? 'text-buurtkaart' : 'text-cross'}`}>
                      {p.direction === 'incoming' ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-ink truncate">{p.payee}</div>
                      <div className="flex items-center gap-1.5">
                        <DomainChip domain={p.domain} small />
                        <span className={`text-[11px] ${overdue ? 'text-cross font-medium' : 'text-faint'}`}>
                          {p.due ? (overdue ? `${-dd!}d te laat` : `vervalt ${fmtDate(p.due)}`) : 'geen datum'}
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
                  </div>
                )
              })}
            </div>
          ) : (
            <Empty>Geen openstaande betalingen.</Empty>
          )}
        </div>
      )}

      {tab === 'abonnementen' && (
        <Abonnementen
          subscriptions={subscriptions}
          monthlyTotal={subsMonthly}
          onAdd={addSubscription}
          onToggle={toggleSubscription}
          onDelete={deleteSubscription}
        />
      )}
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
          <div className="text-2xl font-semibold mt-1">{eur(monthlyTotal)}</div>
          <div className="text-[11px] text-faint mt-1">{subscriptions.filter((s) => s.active).length} actief</div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wider text-muted">Per jaar</div>
          <div className="text-2xl font-semibold mt-1">{eur(monthlyTotal * 12)}</div>
          <div className="text-[11px] text-faint mt-1">geschat op actieve abonnementen</div>
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
                  <div className="text-[11px] text-faint truncate">{parts.join(' · ')}</div>
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

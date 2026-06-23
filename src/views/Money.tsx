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
import type { Domain, Transaction } from '../types'
import { Wallet, Upload, Target, TrendingUp, TrendingDown, Plus, Receipt, ArrowDownLeft, ArrowUpRight, CheckCircle2 } from 'lucide-react'

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

/** Forgiving CSV parser: finds a date, an amount and a description per line. */
function parseCsv(text: string): Transaction[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  const out: Transaction[] = []
  lines.forEach((line, i) => {
    const cells = line.split(/[;,\t]/).map((c) => c.trim().replace(/^"|"$/g, ''))
    if (cells.length < 2) return
    // skip a header row
    if (i === 0 && /date|datum|bedrag|amount|omschrijving/i.test(line)) return
    const dateCell = cells.find((c) => /\d{4}-\d{2}-\d{2}/.test(c) || /\d{8}/.test(c))
    let date = TODAY
    if (dateCell) {
      const iso = dateCell.match(/\d{4}-\d{2}-\d{2}/)?.[0]
      const yyyymmdd = dateCell.match(/^(\d{4})(\d{2})(\d{2})$/)
      date = iso ?? (yyyymmdd ? `${yyyymmdd[1]}-${yyyymmdd[2]}-${yyyymmdd[3]}` : TODAY)
    }
    const amtCell = cells.find((c) => /^[+-]?\s*\d{1,3}([.,]\d{3})*([.,]\d{1,2})?$/.test(c) && c !== dateCell)
    if (!amtCell) return
    const amount = parseFloat(amtCell.replace(/\.(?=\d{3})/g, '').replace(',', '.'))
    if (isNaN(amount)) return
    const merchant =
      cells.filter((c) => c !== dateCell && c !== amtCell && c.length > 2).sort((a, b) => b.length - a.length)[0] ||
      'Onbekend'
    out.push({
      id: `imp-${Date.now()}-${i}`,
      date,
      amount,
      merchant,
      category: amount > 0 ? 'Client income' : 'Uncategorized',
      domain: amount > 0 ? 'prjct' : 'personal',
    })
  })
  return out
}

export default function Money() {
  const { transactions, goals, payments, addTransactions, markPaymentPaid } = useStore()
  const fileRef = useRef<HTMLInputElement>(null)
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

  const revenueGoal = goals.find((g) => g.id === 'g1')

  const byCategory = useMemo(() => {
    const map = new Map<string, number>()
    monthTx.forEach((t) => {
      if (t.amount < 0) map.set(t.category, (map.get(t.category) || 0) + Math.abs(t.amount))
    })
    return [...map.entries()].map(([cat, v]) => ({ cat, v: Math.round(v), domain: CAT_DOMAIN[cat] ?? 'personal' as Domain })).sort((a, b) => b.v - a.v)
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

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Wallet className="h-5 w-5 text-buurtkaart" /> Money
          </h1>
          <p className="text-sm text-muted mt-1">ABN AMRO · transacties, categorieën en runway naar je doel.</p>
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

      {/* top stats */}
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
            <div className="text-xs uppercase tracking-wider text-muted flex items-center gap-1">
              <Target className="h-3.5 w-3.5 text-prjct" /> Doel €10k
            </div>
            <div className="text-2xl font-semibold mt-1">{Math.round((revenueGoal.current / revenueGoal.target) * 100)}%</div>
            <div className="h-1.5 w-full rounded-full bg-line overflow-hidden mt-2">
              <div className="h-full rounded-full bg-prjct" style={{ width: `${(revenueGoal.current / revenueGoal.target) * 100}%` }} />
            </div>
            <div className="text-[11px] text-faint mt-1">nog {eur0(revenueGoal.target - revenueGoal.current)} te gaan</div>
          </div>
        )}
      </div>

      {/* outstanding payments */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
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

      {/* category breakdown */}
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

      {/* transactions */}
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
    </div>
  )
}

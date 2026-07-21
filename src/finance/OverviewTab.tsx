import { useMemo } from 'react'
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
import { SectionTitle, Empty, Sparkline } from '../components/ui'
import { DOMAIN_META, DOMAIN_HEX, TODAY, fmtDate } from '../domains'
import { eur, eur0 } from '../lib/format'
import { OPENING_BALANCE } from '../mockData'
import { CATEGORY_DOMAIN } from './categories'
import { computeBalance, balanceOnDates } from './balance'
import { monthStats, prevMonthKey } from './stats'
import type { Domain, Transaction, Payment, BalanceCheckpoint } from '../types'
import { TrendingUp, TrendingDown, Pencil, Sparkles } from 'lucide-react'

export function OverviewTab({
  transactions,
  payments,
  balanceCheckpoints,
  filter,
  onFilterChange,
  onEditTransaction,
  onAdjustBalance,
}: {
  transactions: Transaction[]
  payments: Payment[]
  balanceCheckpoints: BalanceCheckpoint[]
  filter: Domain | 'all'
  onFilterChange: (d: Domain | 'all') => void
  onEditTransaction: (tx: Transaction) => void
  onAdjustBalance: () => void
}) {
  const { balance, asOf } = useMemo(
    () => computeBalance(transactions, balanceCheckpoints, OPENING_BALANCE),
    [transactions, balanceCheckpoints],
  )

  const balanceTrend = useMemo(() => {
    const days = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(TODAY + 'T00:00:00')
      d.setDate(d.getDate() - (13 - i))
      return d.toISOString().slice(0, 10)
    })
    return balanceOnDates(transactions, balanceCheckpoints, OPENING_BALANCE, days)
  }, [transactions, balanceCheckpoints])

  const thisMonth = TODAY.slice(0, 7)
  const { earned, spent, byCategory } = useMemo(() => monthStats(transactions, thisMonth), [transactions, thisMonth])
  const { earned: earnedPrev, spent: spentPrev } = useMemo(
    () => monthStats(transactions, prevMonthKey(thisMonth)),
    [transactions, thisMonth],
  )

  const openOutgoing = useMemo(
    () => payments.filter((p) => p.status === 'open' && p.direction === 'outgoing').reduce((a, p) => a + p.amount, 0),
    [payments],
  )
  const safeToSpend = balance - openOutgoing

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

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* the one hero number on this screen — everything else is detail you
            check, this is the thing you glance at */}
        <div className="card-hero relative p-4">
          <button
            onClick={onAdjustBalance}
            className="absolute right-4 top-4 p-1 -m-1 rounded-lg hover:bg-black/10"
            aria-label="Saldo bijwerken"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <div className="text-xs font-semibold uppercase tracking-wider">Saldo</div>
          <div className="text-2xl font-bold tabular-nums mt-1">{eur(balance)}</div>
          {transactions.length >= 2 && (
            <span className="block mt-1">
              <Sparkline values={balanceTrend} className="text-[#16210f]" width={72} height={22} />
            </span>
          )}
          <div className="text-xs font-medium mt-1">
            {asOf ? `bijgewerkt ${fmtDate(asOf)}` : `incl. ${transactions.length} transacties`}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wider text-muted flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5 text-buurtkaart" /> Inkomsten</div>
          <div className="text-2xl font-bold tabular-nums mt-1 text-buurtkaart-deep">{eur0(earned)}</div>
          <div className="text-xs text-faint mt-1">{earnedPrev > 0 ? `vorige maand ${eur0(earnedPrev)}` : 'deze maand'}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wider text-muted flex items-center gap-1"><TrendingDown className="h-3.5 w-3.5 text-cross" /> Uitgaven</div>
          <div className="text-2xl font-bold tabular-nums mt-1">{eur0(spent)}</div>
          <div className="text-xs text-faint mt-1">{spentPrev > 0 ? `vorige maand ${eur0(spentPrev)}` : 'deze maand'}</div>
        </div>
      </div>

      {openOutgoing > 0 && (
        <div className={`card p-3 flex items-center justify-between gap-3 ${safeToSpend < 0 ? 'border-cross/40' : ''}`}>
          <span className="text-sm text-muted">Vrij besteedbaar <span className="text-faint">(saldo min nog te betalen)</span></span>
          <span className={`text-sm font-semibold tabular-nums ${safeToSpend < 0 ? 'text-cross' : 'text-ink'}`}>{eur(safeToSpend)}</span>
        </div>
      )}

      {byCategory.length > 0 && (
        <div className="card p-4">
          <SectionTitle>Waar gaat het heen</SectionTitle>
          <ResponsiveContainer width="100%" height={Math.max(140, byCategory.length * 30)}>
            <BarChart data={byCategory} layout="vertical" margin={{ top: 0, right: 16, left: 24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7E9DE" horizontal={false} />
              <XAxis type="number" tick={AXIS_TICK_10} />
              <YAxis type="category" dataKey="cat" width={90} tick={{ fill: '#5C6150', fontSize: 11 }} />
              <Tooltip cursor={{ fill: '#F4F5EE' }} contentStyle={CHART_TIP} formatter={(v: number) => [`€${v}`, 'uitgegeven']} />
              <Bar dataKey="v" radius={[0, 4, 4, 0]}>
                {byCategory.map((c) => (
                  <Cell key={c.cat} fill={DOMAIN_HEX[(CATEGORY_DOMAIN[c.cat] ?? 'personal') as Domain]} />
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
                onClick={() => onFilterChange(d)}
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
                      onClick={() => onEditTransaction(t)}
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
    </div>
  )
}

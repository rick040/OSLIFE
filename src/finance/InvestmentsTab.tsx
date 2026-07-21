import { useMemo, useState } from 'react'
import { Empty, SectionTitle } from '../components/ui'
import { eur, eur0 } from '../lib/format'
import { fmtDate } from '../domains'
import type { Holding, HoldingQuote } from '../types'
import { Plus, Trash2, RefreshCw, TrendingUp, TrendingDown, LineChart } from 'lucide-react'

type Currency = 'EUR' | 'USD' | 'GBP'
type Fx = { EURUSD: number | null; EURGBP: number | null }

function toEur(amount: number, currency: Currency, fx: Fx): number | null {
  if (currency === 'EUR') return amount
  if (currency === 'USD') return fx.EURUSD ? amount / fx.EURUSD : null
  return fx.EURGBP ? amount / fx.EURGBP : null // GBP
}

export function InvestmentsTab({
  holdings,
  quotes,
  fx,
  loading,
  onAdd,
  onDelete,
  onRefresh,
}: {
  holdings: Holding[]
  quotes: Record<string, HoldingQuote>
  fx: Fx
  loading: boolean
  onAdd: (h: Omit<Holding, 'id'>) => void
  onDelete: (id: string) => void
  onRefresh: () => void
}) {
  const [form, setForm] = useState(false)

  const rows = useMemo(
    () =>
      holdings.map((h) => {
        const quote = quotes[h.ticker]
        const costTotalEur = toEur(h.shares * h.costBasis, h.currency, fx)
        const currentValueEur = quote?.price != null ? toEur(h.shares * quote.price, quote.currency, fx) : null
        const pl = costTotalEur != null && currentValueEur != null ? currentValueEur - costTotalEur : null
        const plPct = pl != null && costTotalEur ? (pl / costTotalEur) * 100 : null
        return { h, quote, costTotalEur, currentValueEur, pl, plPct }
      }),
    [holdings, quotes, fx],
  )

  const totalCost = rows.reduce((a, r) => a + (r.costTotalEur ?? 0), 0)
  const totalValue = rows.reduce((a, r) => a + (r.currentValueEur ?? r.costTotalEur ?? 0), 0)
  const totalPl = totalValue - totalCost
  const totalPlPct = totalCost ? (totalPl / totalCost) * 100 : 0

  return (
    <div className="space-y-5">
      {holdings.length > 0 && (
        <div className="card-hero p-4">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wider">Portefeuille</div>
            <button onClick={onRefresh} className="p-1 -m-1 rounded-lg hover:bg-black/10" aria-label="Ververs koersen" disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="text-2xl font-bold tabular-nums mt-1">{eur(totalValue)}</div>
          <div className={`text-xs font-medium mt-1 flex items-center gap-1 ${totalPl >= 0 ? '' : 'opacity-80'}`}>
            {totalPl >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {totalPl >= 0 ? '+' : ''}{eur0(totalPl)} ({totalPlPct >= 0 ? '+' : ''}{totalPlPct.toFixed(1)}%) t.o.v. inleg {eur0(totalCost)}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <SectionTitle hint="Alleen wat je écht bezit — geen algemene marktdata.">
          <span className="flex items-center gap-2"><LineChart className="h-4 w-4 text-prjct" /> Posities</span>
        </SectionTitle>
        <button className="btn-primary !py-1.5 shrink-0" onClick={() => setForm((f) => !f)}>
          <Plus className="h-4 w-4" /> Nieuw
        </button>
      </div>

      {form && <NewHoldingForm onSubmit={(h) => { onAdd(h); setForm(false) }} onCancel={() => setForm(false)} />}

      {holdings.length === 0 ? (
        <Empty>Nog geen posities. Voeg een aandeel of ETF toe dat je bezit.</Empty>
      ) : (
        <div className="card divide-y divide-line">
          {rows.map(({ h, quote, currentValueEur, pl, plPct }) => (
            <div key={h.id} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-ink truncate">{h.name || h.ticker}</div>
                <div className="text-xs text-faint truncate">
                  {h.shares}× {h.ticker} · inleg {eur(h.costBasis)}/{h.currency}
                  {quote?.price != null && ` · nu ${quote.price.toFixed(2)} ${quote.currency}`}
                  {quote?.asOf && ` (${fmtDate(quote.asOf)})`}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-semibold tabular-nums">{currentValueEur != null ? eur(currentValueEur) : '—'}</div>
                {pl != null && plPct != null && (
                  <div className={`text-xs tabular-nums ${pl >= 0 ? 'text-buurtkaart-deep' : 'text-cross'}`}>
                    {pl >= 0 ? '+' : ''}{eur0(pl)} ({plPct >= 0 ? '+' : ''}{plPct.toFixed(1)}%)
                  </div>
                )}
              </div>
              <button onClick={() => onDelete(h.id)} className="text-faint hover:text-cross shrink-0 p-1" aria-label="Verwijder">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function NewHoldingForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (h: Omit<Holding, 'id'>) => void
  onCancel: () => void
}) {
  const [ticker, setTicker] = useState('')
  const [name, setName] = useState('')
  const [shares, setShares] = useState('')
  const [costBasis, setCostBasis] = useState('')
  const [currency, setCurrency] = useState<Currency>('EUR')
  const [purchaseDate, setPurchaseDate] = useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const sharesNum = parseFloat(shares.replace(',', '.'))
    const costNum = parseFloat(costBasis.replace(',', '.'))
    if (!ticker.trim() || isNaN(sharesNum) || isNaN(costNum) || !purchaseDate) return
    onSubmit({
      ticker: ticker.trim().toUpperCase(),
      name: name.trim() || null,
      shares: sharesNum,
      costBasis: costNum,
      currency,
      purchaseDate,
      notes: null,
    })
  }

  return (
    <form onSubmit={submit} className="card p-4 space-y-3">
      <SectionTitle hint="Ticker in Stooq-notatie, bv. ASML.NL of AAPL.US.">Nieuwe positie</SectionTitle>
      <div className="flex flex-wrap gap-2">
        <input value={ticker} onChange={(e) => setTicker(e.target.value)} placeholder="Ticker (bv. AAPL.US)" required className="flex-[1_1_140px] rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none focus:border-prjct/60" />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Naam (optioneel)" className="flex-[1_1_140px] rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none focus:border-prjct/60" />
      </div>
      <div className="flex flex-wrap gap-2">
        <input value={shares} onChange={(e) => setShares(e.target.value)} placeholder="Aantal" required inputMode="decimal" className="flex-[1_1_100px] rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none focus:border-prjct/60" />
        <input value={costBasis} onChange={(e) => setCostBasis(e.target.value)} placeholder="Prijs per stuk" required inputMode="decimal" className="flex-[1_1_120px] rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none focus:border-prjct/60" />
        <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} className="flex-[0_0_90px] rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none">
          <option value="EUR">EUR</option>
          <option value="USD">USD</option>
          <option value="GBP">GBP</option>
        </select>
        <input value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} type="date" required className="flex-[1_1_140px] rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none" />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn-ghost !py-1.5">Annuleer</button>
        <button type="submit" className="btn-primary !py-1.5"><Plus className="h-4 w-4" /> Toevoegen</button>
      </div>
    </form>
  )
}

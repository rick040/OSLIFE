import { useMemo, useState } from 'react'
import { DomainChip, SectionTitle, Empty, ConfirmDialog } from '../components/ui'
import { DOMAIN_META, TODAY, fmtDate, daysBetween } from '../domains'
import { dueLabel } from '../lib/dates'
import { eur } from '../lib/format'
import { MiniCalendar } from './MiniCalendar'
import type { Domain, Payment, PaymentDirection, Subscription, Cadence } from '../types'
import {
  Plus, Trash2, CheckCircle2, ArrowDownLeft, ArrowUpRight, Copy, Link2, Repeat, Pause, Play, X,
} from 'lucide-react'

type Segment = 'eenmalig' | 'abonnementen'

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

export function BillsTab({
  payments,
  subscriptions,
  onAddPayment,
  onMarkPaid,
  onDeletePayment,
  onAddSubscription,
  onToggleSubscription,
  onDeleteSubscription,
}: {
  payments: Payment[]
  subscriptions: Subscription[]
  onAddPayment: (p: Omit<Payment, 'id' | 'status' | 'source'>) => void
  onMarkPaid: (id: string) => void
  onDeletePayment: (id: string) => void
  onAddSubscription: (s: Omit<Subscription, 'id'>) => void
  onToggleSubscription: (id: string) => void
  onDeleteSubscription: (id: string) => void
}) {
  const [segment, setSegment] = useState<Segment>('eenmalig')

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-2xl bg-sunken p-1 w-fit">
        {(['eenmalig', 'abonnementen'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSegment(s)}
            className={`rounded-xl px-3 py-1.5 text-sm font-medium ${segment === s ? 'bg-surface shadow-sm text-ink' : 'text-muted'}`}
          >
            {s === 'eenmalig' ? 'Eenmalig' : 'Abonnementen'}
          </button>
        ))}
      </div>

      {segment === 'eenmalig' ? (
        <OneOffBills payments={payments} onAdd={onAddPayment} onMarkPaid={onMarkPaid} onDelete={onDeletePayment} />
      ) : (
        <Subscriptions
          subscriptions={subscriptions}
          onAdd={onAddSubscription}
          onToggle={onToggleSubscription}
          onDelete={onDeleteSubscription}
        />
      )}
    </div>
  )
}

// ── Eenmalig: manually-tracked bills/invoices ────────────────────────────────
function OneOffBills({
  payments,
  onAdd,
  onMarkPaid,
  onDelete,
}: {
  payments: Payment[]
  onAdd: (p: Omit<Payment, 'id' | 'status' | 'source'>) => void
  onMarkPaid: (id: string) => void
  onDelete: (id: string) => void
}) {
  const [form, setForm] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Payment | null>(null)

  const openPayments = useMemo(
    () =>
      payments
        .filter((p) => p.status === 'open')
        .sort((a, b) => (a.due ? a.due : '9999').localeCompare(b.due ? b.due : '9999')),
    [payments],
  )
  const toReceive = openPayments.filter((p) => p.direction === 'incoming').reduce((a, p) => a + p.amount, 0)
  const toPay = openPayments.filter((p) => p.direction === 'outgoing').reduce((a, p) => a + p.amount, 0)

  const markedDates = useMemo(
    () => new Set(openPayments.filter((p): p is Payment & { due: string } => !!p.due).map((p) => p.due)),
    [openPayments],
  )
  const shown = selectedDate ? openPayments.filter((p) => p.due === selectedDate) : openPayments

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wider text-muted flex items-center gap-1"><ArrowUpRight className="h-3.5 w-3.5 text-cross" /> Nog te betalen</div>
          <div className="text-2xl font-bold tabular-nums mt-1">{eur(toPay)}</div>
          <div className="text-xs text-faint mt-1">{openPayments.filter((p) => p.direction === 'outgoing').length} openstaand</div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wider text-muted flex items-center gap-1"><ArrowDownLeft className="h-3.5 w-3.5 text-buurtkaart" /> Nog te ontvangen</div>
          <div className="text-2xl font-bold tabular-nums mt-1 text-buurtkaart-deep">{eur(toReceive)}</div>
          <div className="text-xs text-faint mt-1">{openPayments.filter((p) => p.direction === 'incoming').length} openstaand</div>
        </div>
      </div>

      {markedDates.size > 0 && <MiniCalendar markedDates={markedDates} selected={selectedDate} onSelect={setSelectedDate} />}

      <div className="flex items-center justify-between gap-3">
        <SectionTitle>{selectedDate ? `Op ${fmtDate(selectedDate)}` : 'Openstaand'}</SectionTitle>
        <button className="btn-primary !py-1.5 shrink-0" onClick={() => setForm((f) => !f)}>
          <Plus className="h-4 w-4" /> Nieuw
        </button>
      </div>

      {form && <NewPaymentForm onSubmit={(p) => { onAdd(p); setForm(false) }} onCancel={() => setForm(false)} />}

      {shown.length ? (
        <div className="card divide-y divide-line">
          {shown.map((p) => {
            const due = dueLabel(p.due, { prefix: 'vervalt ' })
            return (
              <div key={p.id} className="flex items-center gap-3 py-2.5 px-3">
                <span className={`shrink-0 ${p.direction === 'incoming' ? 'text-buurtkaart' : 'text-cross'}`}>
                  {p.direction === 'incoming' ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-ink truncate">{p.payee}</div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <DomainChip domain={p.domain} small />
                    <span className={`text-xs ${due.overdue ? 'text-cross font-medium' : 'text-faint'}`}>{due.label}</span>
                    {p.note && <span className="text-xs text-faint truncate">· {p.note}</span>}
                  </div>
                  {(p.iban || p.paymentLink) && (
                    <div className="flex items-center gap-3 mt-1">
                      {p.iban && (
                        <button
                          onClick={() => navigator.clipboard?.writeText(p.iban!)}
                          className="text-[11px] text-faint hover:text-ink inline-flex items-center gap-1"
                          title="Kopieer IBAN"
                        >
                          <Copy className="h-3 w-3" /> {p.iban}
                        </button>
                      )}
                      {p.paymentLink && (
                        <a href={p.paymentLink} target="_blank" rel="noreferrer" className="text-[11px] text-prjct hover:underline inline-flex items-center gap-1">
                          <Link2 className="h-3 w-3" /> Betaallink
                        </a>
                      )}
                    </div>
                  )}
                </div>
                <span className={`text-sm font-medium tabular-nums shrink-0 ${p.direction === 'incoming' ? 'text-buurtkaart-deep' : 'text-ink'}`}>
                  {p.direction === 'incoming' ? '+' : '-'}{eur(p.amount)}
                </span>
                <button className="btn-ghost shrink-0 !py-1.5" onClick={() => onMarkPaid(p.id)}>
                  <CheckCircle2 className="h-4 w-4" /> {p.direction === 'incoming' ? 'Ontvangen' : 'Betaald'}
                </button>
                <button className="text-faint hover:text-cross shrink-0 p-1" onClick={() => setConfirmDelete(p)} aria-label="Verwijder betaling">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )
          })}
        </div>
      ) : (
        <Empty>{selectedDate ? 'Niets op deze dag.' : 'Geen openstaande betalingen.'}</Empty>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={`Betaling "${confirmDelete.payee}" verwijderen?`}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => { onDelete(confirmDelete.id); setConfirmDelete(null) }}
        />
      )}
    </div>
  )
}

function NewPaymentForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (p: Omit<Payment, 'id' | 'status' | 'source'>) => void
  onCancel: () => void
}) {
  const [payee, setPayee] = useState('')
  const [amount, setAmount] = useState('')
  const [direction, setDirection] = useState<PaymentDirection>('outgoing')
  const [due, setDue] = useState('')
  const [domain, setDomain] = useState<Domain>('personal')
  const [iban, setIban] = useState('')
  const [paymentLink, setPaymentLink] = useState('')
  const [note, setNote] = useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const amt = parseFloat(amount.replace(',', '.'))
    if (!payee.trim() || isNaN(amt)) return
    onSubmit({
      payee: payee.trim(),
      amount: Math.abs(amt),
      due: due || null,
      direction,
      domain,
      iban: iban.trim() || null,
      paymentLink: paymentLink.trim() || null,
      note: note.trim() || null,
    })
  }

  return (
    <form onSubmit={submit} className="card p-4 space-y-3">
      <SectionTitle>Nieuwe betaling</SectionTitle>
      <div className="flex gap-1 rounded-xl bg-sunken p-1 w-fit">
        {(['outgoing', 'incoming'] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDirection(d)}
            className={`rounded-lg px-3 py-1 text-xs font-medium ${direction === d ? 'bg-surface shadow-sm text-ink' : 'text-muted'}`}
          >
            {d === 'outgoing' ? 'Te betalen' : 'Te ontvangen'}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <input value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="Aan wie (bv. Energieleverancier)" required className="flex-[2_1_180px] rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none focus:border-prjct/60" />
        <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Bedrag" required inputMode="decimal" className="flex-[0_0_100px] rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none focus:border-prjct/60" />
        <input value={due} onChange={(e) => setDue(e.target.value)} type="date" className="flex-[1_1_140px] rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none" />
        <select value={domain} onChange={(e) => setDomain(e.target.value as Domain)} className="flex-[1_1_120px] rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none">
          {(['personal', 'prjct', 'parkingyou', 'buurtkaart'] as const).map((d) => (
            <option key={d} value={d}>{DOMAIN_META[d].label}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-2">
        <input value={iban} onChange={(e) => setIban(e.target.value)} placeholder="IBAN (optioneel)" className="flex-[1_1_180px] rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none focus:border-prjct/60" />
        <input value={paymentLink} onChange={(e) => setPaymentLink(e.target.value)} placeholder="Betaallink (optioneel)" className="flex-[1_1_180px] rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none focus:border-prjct/60" />
      </div>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Omschrijving (optioneel)" className="w-full rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none focus:border-prjct/60" />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn-ghost !py-1.5">Annuleer</button>
        <button type="submit" className="btn-primary !py-1.5"><Plus className="h-4 w-4" /> Toevoegen</button>
      </div>
    </form>
  )
}

// ── Abonnementen (recurring) ──────────────────────────────────────────────────
function Subscriptions({
  subscriptions,
  onAdd,
  onToggle,
  onDelete,
}: {
  subscriptions: Subscription[]
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

  const monthlyTotal = subscriptions.filter((s) => s.active).reduce((a, s) => a + monthly(s.amount, s.cadence), 0)
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
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wider text-muted">Per maand</div>
          <div className="text-2xl font-bold tabular-nums mt-1">{eur(monthlyTotal)}</div>
          <div className="text-xs text-faint mt-1">{subscriptions.filter((s) => s.active).length} actief</div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wider text-muted">Per jaar</div>
          <div className="text-2xl font-bold tabular-nums mt-1">{eur(monthlyTotal * 12)}</div>
          <div className="text-xs text-faint mt-1">geschat</div>
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

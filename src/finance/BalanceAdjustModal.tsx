import { useState } from 'react'
import { Overlay } from '../components/ui'
import { TODAY } from '../domains'
import { X, CheckCircle2 } from 'lucide-react'

// Pin the real balance Rick sees in his banking app right now — fixes the
// running-balance drift instead of trusting opening-balance + every
// transaction ever imported.
export function BalanceAdjustModal({
  currentBalance,
  onClose,
  onSave,
}: {
  currentBalance: number
  onClose: () => void
  onSave: (amount: number, asOf: string, note: string | null) => void
}) {
  const [amount, setAmount] = useState(String(Math.round(currentBalance * 100) / 100))
  const [asOf, setAsOf] = useState(TODAY)
  const [note, setNote] = useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const amt = parseFloat(amount.replace(',', '.'))
    if (isNaN(amt)) return
    onSave(amt, asOf, note.trim() || null)
  }

  return (
    <Overlay tone="black" onClose={onClose} panelClassName="card w-full max-w-sm p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-semibold text-ink">Saldo bijwerken</div>
        <button onClick={onClose} className="text-faint hover:text-ink p-1" aria-label="Sluiten">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="text-xs text-faint -mt-3">Vul in wat er nu echt op je rekening staat — alles vanaf deze datum telt vanaf hier opnieuw mee.</p>
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-muted">Saldo nu</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            autoFocus
            className="mt-1 w-full rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none focus:border-prjct/60"
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-muted">Per datum</span>
          <input
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            type="date"
            max={TODAY}
            className="mt-1 w-full rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none"
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-muted">Notitie (optioneel)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="bv. gecontroleerd in de bank-app"
            className="mt-1 w-full rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none"
          />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost">Annuleer</button>
          <button type="submit" className="btn-primary"><CheckCircle2 className="h-4 w-4" /> Opslaan</button>
        </div>
      </form>
    </Overlay>
  )
}

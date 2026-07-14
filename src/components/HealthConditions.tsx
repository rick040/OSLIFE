import { useState } from 'react'
import { useStore } from '../store'
import { fmtDate } from '../domains'
import { FolderHeart, Trash2 } from 'lucide-react'

const STATUS_LABEL: Record<string, string> = {
  active: 'actief',
  monitoring: 'in de gaten',
  resolved: 'afgerond',
}

/**
 * Read-only gezondheidsdossiers (health_condition) voor een subject ('kyra' | 'rick').
 * Rendert niets als er geen dossiers zijn, zodat het schone schermen niet vervuilt.
 * Dossiers kunnen automatisch ontstaan via promotie P1 (3 dierenartsbezoeken).
 * Elk dossier is tier=geheim; "Vergeten" verwijdert het hard incl. de gespiegelde
 * kopie in de event-log en laat een tombstone achter (recht op vergeten).
 */
export default function HealthConditions({ subject }: { subject: 'kyra' | 'rick' }) {
  const conditions = useStore((s) => s.healthConditions).filter((c) => c.subject === subject)
  const forgetRecord = useStore((s) => s.forgetRecord)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  if (conditions.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <FolderHeart className="h-4 w-4 text-cross" /> Gezondheidsdossiers
      </div>
      {conditions.map((c) => (
        <div key={c.id} className="card p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">{c.label}</span>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-line text-muted">{STATUS_LABEL[c.status] ?? c.status}</span>
              {confirmId === c.id ? (
                <span className="flex items-center gap-1 text-[11px]">
                  <span className="text-faint">Zeker?</span>
                  <button onClick={() => { forgetRecord('health_condition', c.id); setConfirmId(null) }} className="text-cross font-medium hover:underline">Vergeet</button>
                  <button onClick={() => setConfirmId(null)} className="text-muted hover:underline">annuleer</button>
                </span>
              ) : (
                <button title="Permanent vergeten" onClick={() => setConfirmId(c.id)} className="text-faint hover:text-cross p-0.5">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <div className="text-[11px] text-faint mt-0.5">sinds {fmtDate(c.openedAt)}</div>
          {c.notes && <p className="text-xs text-muted mt-1">{c.notes}</p>}
        </div>
      ))}
    </div>
  )
}

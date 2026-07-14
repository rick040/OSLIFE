import { useStore } from '../store'
import { fmtDate } from '../domains'
import { FolderHeart } from 'lucide-react'

const STATUS_LABEL: Record<string, string> = {
  active: 'actief',
  monitoring: 'in de gaten',
  resolved: 'afgerond',
}

/**
 * Read-only gezondheidsdossiers (health_condition) voor een subject ('kyra' | 'rick').
 * Rendert niets als er geen dossiers zijn, zodat het schone schermen niet vervuilt.
 * Dossiers kunnen automatisch ontstaan via promotie P1 (3 dierenartsbezoeken).
 */
export default function HealthConditions({ subject }: { subject: 'kyra' | 'rick' }) {
  const conditions = useStore((s) => s.healthConditions).filter((c) => c.subject === subject)
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
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-line text-muted">{STATUS_LABEL[c.status] ?? c.status}</span>
          </div>
          <div className="text-[11px] text-faint mt-0.5">sinds {fmtDate(c.openedAt)}</div>
          {c.notes && <p className="text-xs text-muted mt-1">{c.notes}</p>}
        </div>
      ))}
    </div>
  )
}

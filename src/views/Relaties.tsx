import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { Empty, Overlay } from '../components/ui'
import { UserPlus, MessageCircle, Trash2, AlertCircle, Users, X } from 'lucide-react'
import type { PersonKind } from '../types'

const KIND_LABEL: Record<PersonKind, string> = {
  network: 'Netwerk',
  business: 'Zakelijk',
  both: 'Beide',
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null
  const then = new Date(iso).getTime()
  return Math.floor((Date.now() - then) / 86_400_000)
}

export default function Relaties() {
  const { people, interactions, addPerson, deletePerson, logInteraction } = useStore()
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<PersonKind>('network')
  const [email, setEmail] = useState('')

  const owedByPerson = useMemo(() => {
    const m = new Map<string, number>()
    for (const i of interactions) {
      if (i.owedReply && i.personId) m.set(i.personId, (m.get(i.personId) ?? 0) + 1)
    }
    return m
  }, [interactions])

  const submit = () => {
    if (!name.trim()) return
    addPerson({
      displayName: name.trim(),
      kind,
      emails: email.trim() ? [email.trim().toLowerCase()] : [],
      phones: [],
      birthday: null,
      cadenceDays: null,
      lastInteractionAt: null,
      clientId: null,
      notes: null,
      tier: 'normaal',
    })
    setName(''); setEmail(''); setKind('network')
    setShowAdd(false)
  }

  return (
    <div className="flex flex-col gap-7 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sunken">
            <Users className="h-5 w-5 text-ink-soft" />
          </span>
          <h1 className="text-xl font-medium text-ink">Relaties</h1>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary">
          <UserPlus className="h-4 w-4" /> Persoon
        </button>
      </div>

      {showAdd && (
        <Overlay tone="black" onClose={() => setShowAdd(false)} panelClassName="card w-full max-w-md p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium">Persoon toevoegen</div>
            <button onClick={() => setShowAdd(false)} className="text-faint hover:text-ink p-1 shrink-0" aria-label="Sluiten">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Naam" className="input" autoFocus />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail (voor mail-matching)" className="input" />
          </div>
          <select value={kind} onChange={(e) => setKind(e.target.value as PersonKind)} className="input w-full">
            {(['network', 'business', 'both'] as PersonKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
          <button onClick={submit} disabled={!name.trim()} className="btn-primary w-full">
            <UserPlus className="h-4 w-4" /> Toevoegen
          </button>
        </Overlay>
      )}

      {people.length === 0 ? (
        <Empty>Nog geen mensen vastgelegd. Voeg iemand toe om contact te gaan volgen.</Empty>
      ) : (
        <div className="space-y-2 animate-fade-up">
          {people.map((p) => {
            const since = daysSince(p.lastInteractionAt)
            const overdue = p.cadenceDays != null && since != null && since > p.cadenceDays
            const owed = owedByPerson.get(p.id) ?? 0
            return (
              <div key={p.id} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{p.displayName}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-line text-muted">{KIND_LABEL[p.kind]}</span>
                      {owed > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cross/15 text-cross-deep flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" /> {owed} openstaand
                        </span>
                      )}
                    </div>
                    {p.emails.length > 0 && <div className="text-xs text-faint mt-0.5 truncate">{p.emails.join(', ')}</div>}
                    <div className={`text-xs mt-1 ${overdue ? 'text-cross' : 'text-muted'}`}>
                      {since == null ? 'Nog geen contact gelogd' : `Laatste contact: ${since} dag(en) geleden`}
                      {overdue && ' — tijd om bij te praten'}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      title="Contact loggen"
                      onClick={() => logInteraction({ personId: p.id, channel: 'call', direction: 'out', summary: null, owedReply: false, occurredAt: new Date().toISOString() })}
                      className="p-2 rounded-lg hover:bg-sunken text-muted">
                      <MessageCircle className="h-4 w-4" />
                    </button>
                    <button title="Verwijderen" onClick={() => deletePerson(p.id)} className="p-2 rounded-lg hover:bg-sunken text-muted">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

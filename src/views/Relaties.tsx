import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { Empty } from '../components/ui'
import { UserPlus, MessageCircle, Trash2, AlertCircle } from 'lucide-react'
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
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold">Relaties</h1>
        <p className="text-sm text-muted mt-1">
          Wie verwaarloos je? Leg mensen vast, log contact, en zie wie je te lang niet sprak of
          wie nog een reactie van je wacht.
        </p>
      </div>

      <div className="card p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium"><UserPlus className="h-4 w-4 text-prjct" /> Persoon toevoegen</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Naam"
            className="rounded-lg border border-line bg-transparent px-3 py-2 text-sm" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail (voor mail-matching)"
            className="rounded-lg border border-line bg-transparent px-3 py-2 text-sm" />
        </div>
        <div className="flex items-center gap-2">
          <select value={kind} onChange={(e) => setKind(e.target.value as PersonKind)}
            className="rounded-lg border border-line bg-transparent px-3 py-2 text-sm">
            {(['network', 'business', 'both'] as PersonKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
          <button onClick={submit} disabled={!name.trim()}
            className="ml-auto rounded-lg bg-prjct/10 text-prjct border border-prjct/40 px-4 py-2 text-sm font-medium hover:bg-prjct/15 disabled:opacity-50">
            Toevoegen
          </button>
        </div>
      </div>

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
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cross/15 text-cross flex items-center gap-1">
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
                      className="p-2 rounded-lg hover:bg-line text-muted">
                      <MessageCircle className="h-4 w-4" />
                    </button>
                    <button title="Verwijderen" onClick={() => deletePerson(p.id)} className="p-2 rounded-lg hover:bg-line text-muted">
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

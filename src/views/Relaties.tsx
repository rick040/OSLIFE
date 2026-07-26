import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { Empty, Pill } from '../components/ui'
import { PersonAvatar } from '../components/crm'
import { UserPlus, AlertCircle, Users, Search, Link2 } from 'lucide-react'
import type { Person } from '../types'
import { connectionsForPerson, PERSON_KIND_LABEL, PERSON_KIND_HEX } from '../lib/crm/relaties'
import PersonForm from './PersonForm'
import PersonDetail from './PersonDetail'

function daysSince(iso: string | null): number | null {
  if (!iso) return null
  const then = new Date(iso).getTime()
  return Math.floor((Date.now() - then) / 86_400_000)
}

export default function Relaties() {
  const { people, interactions, personConnections } = useStore()
  const [showAdd, setShowAdd] = useState(false)
  const [open, setOpen] = useState<Person | null>(null)
  const [query, setQuery] = useState('')
  const [tagFilter, setTagFilter] = useState<string | null>(null)

  const owedByPerson = useMemo(() => {
    const m = new Map<string, number>()
    for (const i of interactions) {
      if (i.owedReply && i.personId) m.set(i.personId, (m.get(i.personId) ?? 0) + 1)
    }
    return m
  }, [interactions])

  const allTags = useMemo(() => {
    const s = new Set<string>()
    for (const p of people) for (const t of p.tags) s.add(t)
    return Array.from(s).sort()
  }, [people])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return people.filter((p) => {
      if (tagFilter && !p.tags.includes(tagFilter)) return false
      if (!q) return true
      return (
        p.displayName.toLowerCase().includes(q) ||
        (p.company ?? '').toLowerCase().includes(q) ||
        p.emails.some((e) => e.toLowerCase().includes(q)) ||
        p.tags.some((t) => t.toLowerCase().includes(q))
      )
    })
  }, [people, query, tagFilter])

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

      {people.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <div className="relative">
            <Search className="h-4 w-4 text-faint absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Zoek op naam, bedrijf, e-mail of tag…"
              className="input w-full pl-9"
            />
          </div>
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setTagFilter(null)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${tagFilter === null ? 'bg-forest text-white border-forest' : 'bg-sunken border-line text-muted hover:text-ink'}`}
              >
                Alle
              </button>
              {allTags.map((t) => (
                <button
                  key={t}
                  onClick={() => setTagFilter(t === tagFilter ? null : t)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${tagFilter === t ? 'bg-forest text-white border-forest' : 'bg-sunken border-line text-muted hover:text-ink'}`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {showAdd && <PersonForm person={null} onClose={() => setShowAdd(false)} />}
      {open && <PersonDetail person={open} onClose={() => setOpen(null)} />}

      {people.length === 0 ? (
        <Empty>Nog geen mensen vastgelegd. Voeg iemand toe om je rolodex te starten.</Empty>
      ) : filtered.length === 0 ? (
        <Empty>Geen contacten gevonden voor deze zoekopdracht.</Empty>
      ) : (
        <div className="space-y-2 animate-fade-up">
          {filtered.map((p) => {
            const since = daysSince(p.lastInteractionAt)
            const overdue = p.cadenceDays != null && since != null && since > p.cadenceDays
            const owed = owedByPerson.get(p.id) ?? 0
            const connCount = connectionsForPerson(p.id, personConnections, people).length
            const color = PERSON_KIND_HEX[p.kind]
            return (
              <button key={p.id} onClick={() => setOpen(p)} className="card p-4 w-full text-left hover:bg-sunken transition-colors">
                <div className="flex items-start gap-3">
                  <PersonAvatar person={p} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{p.displayName}</span>
                      <Pill hex={color} className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0">{PERSON_KIND_LABEL[p.kind]}</Pill>
                      {p.tags.slice(0, 2).map((t) => (
                        <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-line text-muted shrink-0">{t}</span>
                      ))}
                      {owed > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cross/15 text-cross-deep flex items-center gap-1 shrink-0">
                          <AlertCircle className="h-3 w-3" /> {owed} openstaand
                        </span>
                      )}
                    </div>
                    {(p.jobTitle || p.company) && (
                      <div className="text-xs text-faint mt-0.5 truncate">{[p.jobTitle, p.company].filter(Boolean).join(' bij ')}</div>
                    )}
                    <div className={`text-xs mt-1 flex items-center gap-2 flex-wrap ${overdue ? 'text-cross' : 'text-muted'}`}>
                      <span>{since == null ? 'Nog geen contact gelogd' : `Laatste contact: ${since} dag(en) geleden`}{overdue && ' — tijd om bij te praten'}</span>
                      {connCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-faint"><Link2 className="h-3 w-3" /> {connCount}</span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

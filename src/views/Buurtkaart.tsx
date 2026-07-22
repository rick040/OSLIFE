import { useEffect, useMemo, useState } from 'react'
import { Map, RefreshCw, ChevronDown, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { ConfirmDialog } from '../components/ui'

// Buurtkaart — Geldrop Buurtkaart beheer. Live data komt uit de WordPress-plugin
// API (geldropbuurtkaart.nl) via de gbk-overview edge function; lokale state
// (status wijzigen, editie activeren/verwijderen) blijft als snelle UI-laag.

type Tab = 'edities' | 'klanten' | 'facturen'

interface Edition {
  id: number; name: string; deadline: string; delivery: string; spotsTotal: number; submissions: number; status: string; active: boolean
}
interface Invoice { id: number; label: string; amount: number; status: string }
interface Submission {
  id: number; company: string; plan: 'premium' | 'standard'; contact: string; edition: string; status: string
  industry?: string; phone?: string; address?: string; website?: string; pitch?: string; invoices: Invoice[]
}

const SUB_STATUS: Record<string, { label: string; hex: string }> = {
  nieuw: { label: 'Nieuw', hex: '#60A5FA' },
  benaderd: { label: 'Benaderd', hex: '#FBBF24' },
  akkoord: { label: 'Akkoord', hex: '#34D399' },
  betaald: { label: 'Betaald', hex: '#34431F' },
  afgewezen: { label: 'Afgewezen', hex: '#F87171' },
}
const INV_STATUS: Record<string, { label: string; hex: string }> = {
  open: { label: 'Open', hex: '#FBBF24' },
  te_laat: { label: 'Te laat', hex: '#F87171' },
  betaald: { label: 'Betaald', hex: '#34D399' },
}
const ED_STATUS: Record<string, { label: string; hex: string }> = {
  upcoming: { label: 'Aankomend', hex: '#60A5FA' },
  active: { label: 'Actief', hex: '#34D399' },
  completed: { label: 'Afgerond', hex: '#8C9080' },
}

import { eur } from '../lib/format'
const fmt = (iso: string) => (iso ? new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Amsterdam' }) : 'geen datum')

const ED0: Edition[] = []
const SUB0: Submission[] = []

// ── Defensive normalisers for the GBK WordPress payload ──────────────────────
// The /overview endpoint shape isn't fully fixed, so every field is read by a
// list of likely key names and coerced, falling back to sane defaults.
type AnyObj = Record<string, unknown>
const gnum = (v: unknown) => (typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.')) || 0)
const gstr = (v: unknown) => (v == null ? '' : String(v))
function pick(obj: unknown, keys: string[]): unknown {
  if (!obj || typeof obj !== 'object') return undefined
  for (const k of keys) if ((obj as AnyObj)[k] != null) return (obj as AnyObj)[k]
  return undefined
}
function asArray(obj: unknown, keys: string[]): AnyObj[] {
  const v = pick(obj, keys)
  return Array.isArray(v) ? (v as AnyObj[]) : []
}
const coerce = (s: string, allowed: string[], fallback: string) =>
  allowed.includes(s.toLowerCase()) ? s.toLowerCase() : fallback

function normEditions(data: unknown): Edition[] {
  return asArray(data, ['editions', 'edities', 'edition', 'editie']).map((e, i) => ({
    id: gnum(pick(e, ['id'])) || i + 1,
    name: gstr(pick(e, ['name', 'title', 'naam', 'label'])) || `Editie ${i + 1}`,
    deadline: gstr(pick(e, ['deadline', 'deadline_date', 'aanmeld_deadline'])),
    delivery: gstr(pick(e, ['delivery', 'bezorging', 'delivery_date', 'verschijning'])),
    spotsTotal: gnum(pick(e, ['spotsTotal', 'spots', 'spots_total', 'plekken', 'total_spots'])),
    submissions: gnum(pick(e, ['submissions', 'aanmeldingen', 'count', 'klanten'])),
    status: coerce(gstr(pick(e, ['status'])), Object.keys(ED_STATUS), 'upcoming'),
    active: Boolean(pick(e, ['active', 'is_active', 'actief'])),
  }))
}

function normSubs(data: unknown): Submission[] {
  return asArray(data, ['customers', 'klanten', 'submissions', 'aanmeldingen', 'advertisers', 'adverteerders']).map(
    (s, i) => ({
      id: gnum(pick(s, ['id'])) || i + 1,
      company: gstr(pick(s, ['company', 'bedrijf', 'name', 'naam', 'company_name'])) || 'Onbekend',
      plan: gstr(pick(s, ['plan', 'pakket', 'package'])).toLowerCase().includes('prem') ? 'premium' : 'standard',
      contact: gstr(pick(s, ['contact', 'contactpersoon', 'contact_name'])),
      edition: gstr(pick(s, ['edition', 'editie', 'edition_name'])),
      status: coerce(gstr(pick(s, ['status'])), Object.keys(SUB_STATUS), 'nieuw'),
      industry: gstr(pick(s, ['industry', 'branche'])) || undefined,
      phone: gstr(pick(s, ['phone', 'telefoon', 'tel'])) || undefined,
      address: gstr(pick(s, ['address', 'adres'])) || undefined,
      website: gstr(pick(s, ['website', 'site', 'url'])) || undefined,
      pitch: gstr(pick(s, ['pitch', 'omschrijving', 'description'])) || undefined,
      invoices: asArray(s, ['invoices', 'facturen']).map((inv, j) => ({
        id: gnum(pick(inv, ['id'])) || j + 1,
        label: gstr(pick(inv, ['label', 'description', 'omschrijving', 'title'])) || 'Factuur',
        amount: gnum(pick(inv, ['amount', 'bedrag', 'total'])),
        status: coerce(gstr(pick(inv, ['status'])), Object.keys(INV_STATUS), 'open'),
      })),
    }),
  )
}

type LiveStatus = 'loading' | 'live' | 'empty' | 'error'

export default function Buurtkaart() {
  const [tab, setTab] = useState<Tab>('edities')
  const [editions, setEditions] = useState(ED0)
  const [subs, setSubs] = useState(SUB0)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [edForm, setEdForm] = useState(false)
  const [edName, setEdName] = useState('')
  const [status, setStatus] = useState<LiveStatus>('loading')

  const loadGbk = async () => {
    setStatus('loading')
    try {
      const { data, error } = await supabase.functions.invoke('gbk-overview')
      const payload = (data as { ok?: boolean; data?: unknown } | null)?.data
      if (error || !payload) {
        setStatus('error')
        return
      }
      const eds = normEditions(payload)
      const ss = normSubs(payload)
      setEditions(eds)
      setSubs(ss)
      setStatus(eds.length || ss.length ? 'live' : 'empty')
    } catch {
      setStatus('error')
    }
  }

  useEffect(() => {
    void loadGbk()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const invoices = useMemo(() => subs.flatMap((s) => s.invoices.map((i) => ({ ...i, sub: s }))), [subs])
  const openInv = invoices.filter((i) => ['open', 'te_laat'].includes(i.status))
  const openSum = openInv.reduce((a, i) => a + i.amount, 0)
  const active = editions.find((e) => e.active)
  const spotsFree = active ? active.spotsTotal - active.submissions : 0

  const activate = (id: number) => setEditions((es) => es.map((e) => ({ ...e, active: e.id === id, status: e.id === id ? 'active' : e.status })))
  const [confirmDelId, setConfirmDelId] = useState<number | null>(null)
  const del = (id: number) => setConfirmDelId(id)
  const addEd = () => {
    if (!edName.trim()) return
    setEditions((es) => [...es, { id: Math.max(0, ...es.map((e) => e.id)) + 1, name: edName.trim(), deadline: '', delivery: '', spotsTotal: 12, submissions: 0, status: 'upcoming', active: false }])
    setEdName(''); setEdForm(false)
  }
  const setSubStatus = (id: number, status: string) => setSubs((ss) => ss.map((s) => (s.id === id ? { ...s, status } : s)))
  const setInvStatus = (subId: number, invId: number, status: string) =>
    setSubs((ss) => ss.map((s) => (s.id === subId ? { ...s, invoices: s.invoices.map((i) => (i.id === invId ? { ...i, status } : i)) } : s)))

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-faint">Geldrop · beheer</div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Map className="h-6 w-6 text-buurtkaart" /> Buurtkaart</h1>
        </div>
        <button onClick={loadGbk} className="h-9 w-9 rounded-full bg-buurtkaart/15 text-buurtkaart-deep flex items-center justify-center" aria-label="Vernieuwen"><RefreshCw className={`h-4 w-4 ${status === 'loading' ? 'animate-spin' : ''}`} /></button>
      </div>

      {/* stats */}
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Actieve editie" value={active?.name.split(',')[0] ?? 'Geen'} />
        <Stat label="Plekken vrij" value={String(spotsFree)} color="text-buurtkaart-deep" />
        <Stat label="Klanten" value={String(subs.length)} color="text-prjct-deep" />
        <Stat label="Open facturen" value={String(openInv.length)} sub={openInv.length ? eur(openSum) : undefined} color={openInv.length ? 'text-personal-deep' : 'text-ink'} />
      </div>

      {/* tabs */}
      <div className="flex gap-1 rounded-2xl bg-sunken p-1">
        {(['edities', 'klanten', 'facturen'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium capitalize transition-colors ${tab === t ? 'bg-surface shadow-sm text-ink' : 'text-muted'}`}>{t}</button>
        ))}
      </div>

      {tab === 'edities' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wider text-faint">Edities</div>
            <button onClick={() => setEdForm((f) => !f)} className="text-sm text-buurtkaart-deep font-medium">+ Nieuwe editie</button>
          </div>
          {edForm && (
            <div className="card p-4 flex gap-2">
              <input value={edName} onChange={(e) => setEdName(e.target.value)} placeholder="Editie 3, maart 2027" className="flex-1 rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none focus:border-buurtkaart/60" />
              <button onClick={addEd} className="btn-primary !py-2"><Plus className="h-4 w-4" /></button>
            </div>
          )}
          <div className="card divide-y divide-line">
            {editions.map((e) => {
              const t = ED_STATUS[e.status]
              return (
                <div key={e.id} className="flex flex-wrap items-center gap-2.5 p-3.5">
                  <div className="flex-1 min-w-[180px]">
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-medium">{e.name}</span>
                      {e.active && <span className="h-1.5 w-1.5 rounded-full bg-buurtkaart" title="Actief" />}
                    </div>
                    <div className="text-xs text-muted mt-0.5">deadline {fmt(e.deadline)} · bezorging {fmt(e.delivery)} · {e.submissions}/{e.spotsTotal} plekken</div>
                  </div>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${t.hex}28`, color: t.hex }}>{t.label}</span>
                  {!e.active && <button onClick={() => activate(e.id)} className="chip border border-line text-muted hover:text-ink">Activeer</button>}
                  <button onClick={() => del(e.id)} className="chip border border-line text-cross">Verwijder</button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {tab === 'klanten' && (
        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-faint">Klanten / aanmeldingen</div>
          <div className="card divide-y divide-line">
            {subs.map((s) => {
              const open = expanded === s.id
              return (
                <div key={s.id}>
                  <div className="flex items-center gap-2.5 p-3.5 cursor-pointer" onClick={() => setExpanded(open ? null : s.id)}>
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] font-medium truncate">{s.company}</div>
                      <div className="text-xs text-muted mt-0.5">{s.plan === 'premium' ? 'Premium · A7' : 'Standard · A8'}{s.contact ? ` · ${s.contact}` : ''} · {s.edition}</div>
                    </div>
                    <select
                      value={s.status}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setSubStatus(s.id, e.target.value)}
                      className="text-[12px] font-semibold rounded-lg px-2 py-1 border border-line outline-none"
                      style={{ background: `${SUB_STATUS[s.status].hex}22`, color: SUB_STATUS[s.status].hex }}
                    >
                      {Object.entries(SUB_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                    <ChevronDown className={`h-4 w-4 text-faint transition-transform ${open ? 'rotate-180' : ''}`} />
                  </div>
                  {open && (
                    <div className="px-3.5 pb-3.5 grid grid-cols-2 gap-3">
                      {([['Branche', s.industry], ['Telefoon', s.phone], ['Adres', s.address]] as const)
                        .filter(([, v]) => v)
                        .map(([l, v]) => (
                          <div key={l}><div className="text-[11px] text-faint font-semibold">{l}</div><div className="text-[13px] text-muted">{v}</div></div>
                        ))}
                      {s.website && <div><div className="text-[11px] text-faint font-semibold">Website</div><a href={s.website} target="_blank" rel="noreferrer" className="text-[13px] text-buurtkaart-deep">{s.website.replace(/^https?:\/\//, '')}</a></div>}
                      {s.pitch && <div className="col-span-2"><div className="text-[11px] text-faint font-semibold">Pitch</div><div className="text-[13px] text-muted">{s.pitch}</div></div>}
                      {s.invoices.length > 0 && (
                        <div className="col-span-2">
                          <div className="text-[11px] text-faint font-semibold mb-1">Facturen</div>
                          {s.invoices.map((inv) => (
                            <div key={inv.id} className="flex items-center gap-2.5 text-[13px] text-muted py-1">
                              <span className="flex-1">{inv.label}</span>
                              <span className="font-semibold">{eur(inv.amount)}</span>
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${INV_STATUS[inv.status].hex}28`, color: INV_STATUS[inv.status].hex }}>{INV_STATUS[inv.status].label}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {tab === 'facturen' && (
        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-faint">Facturen (advertenties)</div>
          {invoices.length === 0 ? (
            <div className="card p-4 text-sm text-faint">Nog geen facturen.</div>
          ) : (
            <div className="card divide-y divide-line">
              {invoices.map((inv) => (
                <div key={`${inv.sub.id}-${inv.id}`} className="flex flex-wrap items-center gap-3 p-3.5">
                  <div className="flex-1 min-w-[160px]">
                    <div className="text-[15px] font-medium">{inv.sub.company}</div>
                    <div className="text-xs text-muted mt-0.5">{inv.label} · {inv.sub.edition}</div>
                  </div>
                  <div className="text-[15px] font-bold">{eur(inv.amount)}</div>
                  <select
                    value={inv.status}
                    onChange={(e) => setInvStatus(inv.sub.id, inv.id, e.target.value)}
                    className="text-[12px] font-semibold rounded-lg px-2 py-1 border border-line outline-none"
                    style={{ background: `${INV_STATUS[inv.status].hex}22`, color: INV_STATUS[inv.status].hex }}
                  >
                    {Object.entries(INV_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="text-[11px] text-faint">
        {status === 'loading' && 'verbinden met geldropbuurtkaart.nl…'}
        {status === 'live' && 'live · geldropbuurtkaart.nl (WordPress API)'}
        {status === 'empty' && 'verbonden met geldropbuurtkaart.nl · nog geen data'}
        {status === 'error' && 'kon geldropbuurtkaart.nl niet bereiken — controleer GBK_API_KEY'}
      </div>

      {confirmDelId !== null && (
        <ConfirmDialog
          title="Editie verwijderen?"
          onCancel={() => setConfirmDelId(null)}
          onConfirm={() => {
            setEditions((es) => es.filter((e) => e.id !== confirmDelId))
            setConfirmDelId(null)
          }}
        />
      )}
    </div>
  )
}

function Stat({ label, value, sub, color = 'text-ink' }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="card p-3.5">
      <div className="text-xs text-faint">{label}</div>
      <div className={`text-lg font-bold tracking-tight mt-0.5 truncate ${color}`}>
        {value}
        {sub && <span className="text-xs font-medium text-faint"> · {sub}</span>}
      </div>
    </div>
  )
}

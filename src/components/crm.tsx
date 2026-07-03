// Shared UI primitives + constants for the native CRM (CRM / Projecten).
import { useEffect } from 'react'
import { X, FolderKanban, Clock } from 'lucide-react'
import type { ProjectStatus, ClientStatus, Priority, Domain, Project, Client } from '../types'
import { TODAY, daysBetween, fmtDate } from '../domains'
import { DomainChip, Pill } from './ui'

// ── formatting ────────────────────────────────────────────────────────────────
export const eur = (n: number | null | undefined) => {
  if (n == null) return '–'
  if (Math.abs(n) >= 1000) return `€${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
  return `€${n.toLocaleString('nl-NL')}`
}
export const eur0 = (n: number) => `€${n.toLocaleString('nl-NL', { maximumFractionDigits: 0 })}`

// ── status maps (single source of truth, mirrors the old Dutch CRM labels) ─────
export const CRM_STATUS: Record<ProjectStatus, string> = {
  active: 'In uitvoering',
  review: 'In uitvoering',
  lead: 'Gepland',
  blocked: 'Gepauzeerd',
  done: 'Opgeleverd',
}
export const STATUS_HEX: Record<string, string> = {
  'In uitvoering': '#6FA07C',
  Gepland: '#6E8CA8',
  Gepauzeerd: '#C6A05B',
  Opgeleverd: '#9385B0',
}
export const PROJECT_STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: 'lead', label: 'Gepland (lead)' },
  { value: 'active', label: 'In uitvoering' },
  { value: 'review', label: 'In review' },
  { value: 'blocked', label: 'Gepauzeerd' },
  { value: 'done', label: 'Opgeleverd' },
]

export const CLIENT_HEX: Record<string, string> = {
  Active: '#6FA07C', Lead: '#6E8CA8', Prospect: '#9385B0',
  Planned: '#C6A05B', Inactive: '#C58392', Past: '#8C9080',
}
export const CLIENT_STATUS_NL: Record<string, string> = {
  Active: 'Actief', Lead: 'Lead', Prospect: 'Prospect',
  Planned: 'Gepland', Inactive: 'Inactief', Past: 'Voorbij',
}
export const CLIENT_STATUS_OPTIONS: ClientStatus[] = ['Active', 'Lead', 'Prospect', 'Planned', 'Inactive', 'Past']

export const PRIO_HEX: Record<string, string> = { High: '#C58392', Medium: '#C6A05B', Low: '#8C9080' }
export const PRIO_NL: Record<string, string> = { High: 'Hoog', Medium: 'Gemiddeld', Low: 'Laag' }
export const PRIORITY_OPTIONS: Priority[] = ['High', 'Medium', 'Low']

export const DOMAIN_OPTIONS: { value: Domain; label: string }[] = [
  { value: 'prjct', label: 'PRJCT Agency' },
  { value: 'parkingyou', label: 'ParkingYou' },
  { value: 'buurtkaart', label: 'Buurtkaart' },
  { value: 'personal', label: 'Personal' },
  { value: 'cross', label: 'Cross-domain' },
]

export const PROJECT_TYPE_OPTIONS = [
  'Website', 'Webshop', 'Branding', 'Logo', 'Social Media', 'SEO',
  'Content', 'Fotografie', 'Video', 'Advies', 'Onderhoud', 'App',
]

// ── modal shell (bottom-sheet on mobile, centered card on desktop) ─────────────
export function Sheet({
  title, onClose, children, footer, wide,
}: {
  title: React.ReactNode
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])
  return (
    <div className="fixed inset-0 z-50 flex flex-col md:items-center md:justify-center">
      <div className="absolute inset-0 bg-scrim/55 backdrop-blur-md" onClick={onClose} />
      <div className={`relative mt-auto md:mt-0 w-full ${wide ? 'md:max-w-2xl' : 'md:max-w-lg'} md:max-h-[90dvh] max-h-[92dvh] flex flex-col bg-canvas md:rounded-4xl rounded-t-4xl border border-line shadow-pop overflow-hidden`}>
        <div className="flex items-center gap-3 p-5 pb-3 border-b border-line shrink-0">
          <div className="flex-1 min-w-0 font-semibold text-lg leading-tight">{title}</div>
          <button onClick={onClose} className="h-8 w-8 rounded-full bg-sunken flex items-center justify-center text-muted hover:text-ink shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">{children}</div>
        {footer && <div className="p-4 border-t border-line shrink-0">{footer}</div>}
      </div>
    </div>
  )
}

// ── form fields ────────────────────────────────────────────────────────────────
const inputCls =
  'w-full text-sm bg-sunken rounded-xl px-3 py-2 outline-none border border-line focus:border-forest transition-colors'

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-muted">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="text-[11px] text-faint mt-1 block">{hint}</span>}
    </label>
  )
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ''}`} />
}
export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputCls} resize-none ${props.className ?? ''}`} />
}
export function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputCls} ${props.className ?? ''}`} />
}

export function PrimaryBtn({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`w-full py-2.5 rounded-xl bg-forest text-white text-sm font-semibold disabled:opacity-40 transition-opacity ${rest.className ?? ''}`}
    >
      {children}
    </button>
  )
}

// ── shared project/client presentation (used by CRM + Projecten) ───────────────

export function deadlineInfo(iso: string | null): { label: string; color: string; urgent: boolean } | null {
  if (!iso) return null
  const d = daysBetween(TODAY, iso)
  if (d < 0) return { label: `${-d}d te laat`, color: '#C58392', urgent: true }
  if (d === 0) return { label: 'Vandaag', color: '#C6A05B', urgent: true }
  if (d <= 7) return { label: `over ${d}d`, color: '#C6A05B', urgent: true }
  return { label: fmtDate(iso), color: '#8C9080', urgent: false }
}

export function Kpi({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="h-7 w-7 rounded-xl bg-sunken flex items-center justify-center">{icon}</span>
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</span>
      </div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] text-faint mt-0.5">{sub}</div>
    </div>
  )
}

export function StatusBadge({ status }: { status: ProjectStatus }) {
  const label = CRM_STATUS[status]
  const c = STATUS_HEX[label]
  return (
    <Pill hex={c} className="text-[10px] font-semibold px-2 py-0.5 rounded-md whitespace-nowrap">
      {label}
    </Pill>
  )
}

/** Project name + client badge; clicking the client (when `onClientClick` is given) opens it without triggering the card's own onClick. */
function ClientBadge({ project, onClientClick }: { project: Project; onClientClick?: (clientId: string) => void }) {
  const name = project.client
  if (!name) return null
  if (project.clientId && onClientClick) {
    return (
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => { e.stopPropagation(); onClientClick(project.clientId!) }}
        className="hover:text-forest hover:underline underline-offset-2 truncate"
      >
        {name}
      </span>
    )
  }
  return <span className="truncate">{name}</span>
}

export function ProjectCard({ p, onClick, onClientClick }: { p: Project; onClick: () => void; onClientClick?: (clientId: string) => void }) {
  const dl = deadlineInfo(p.deadline)
  return (
    <button onClick={onClick} className="card p-3.5 flex flex-col min-h-[150px] text-left w-full hover:bg-sunken transition-colors">
      <div className="flex items-center justify-between mb-2">
        <span className="h-9 w-9 rounded-2xl bg-sunken flex items-center justify-center">
          <FolderKanban className="h-4.5 w-4.5 text-prjct" />
        </span>
        <StatusBadge status={p.status} />
      </div>
      <div className="text-sm font-semibold leading-tight line-clamp-2">{p.name}</div>
      <div className="text-xs text-faint mt-0.5">
        <ClientBadge project={p} onClientClick={onClientClick} />
      </div>
      <div className="flex-1" />
      <div className="flex flex-wrap gap-1 mt-2 mb-2">
        {p.priority && (
          <Pill hex={PRIO_HEX[p.priority]} className="text-[10px] font-semibold px-1.5 py-0.5 rounded">
            {PRIO_NL[p.priority] ?? p.priority}
          </Pill>
        )}
        {dl && (
          <Pill hex={dl.color} className="text-[10px] font-semibold px-1.5 py-0.5 rounded inline-flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" /> {dl.label}
          </Pill>
        )}
      </div>
      <div className="flex items-center justify-between border-t border-line pt-2">
        <span className="text-sm font-semibold tabular-nums">{eur(p.value)}</span>
        {p.type?.[0] && <span className="text-[11px] text-faint">{p.type[0]}</span>}
      </div>
    </button>
  )
}

export function ProjectRow({ p, onClick, onClientClick }: { p: Project; onClick: () => void; onClientClick?: (clientId: string) => void }) {
  const dl = deadlineInfo(p.deadline)
  return (
    <button onClick={onClick} className="card p-3.5 flex items-start gap-3 text-left w-full hover:bg-sunken transition-colors">
      <span className="h-10 w-10 rounded-2xl bg-sunken flex items-center justify-center shrink-0">
        <FolderKanban className="h-5 w-5 text-prjct" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold truncate">{p.name}</span>
          <span className="text-sm font-semibold tabular-nums shrink-0">{eur(p.value)}</span>
        </div>
        <div className="text-xs text-muted truncate mt-0.5">
          <ClientBadge project={p} onClientClick={onClientClick} />
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          <StatusBadge status={p.status} />
          {p.priority && (
            <Pill hex={PRIO_HEX[p.priority]} className="text-[10px] font-semibold px-2 py-0.5 rounded-md">{PRIO_NL[p.priority] ?? p.priority}</Pill>
          )}
          {dl && (
            <Pill hex={dl.color} className="text-[10px] font-semibold px-2 py-0.5 rounded-md inline-flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" /> {dl.label}
            </Pill>
          )}
          {p.type?.slice(0, 2).map((t) => (
            <span key={t} className="text-[10px] px-2 py-0.5 rounded-md bg-sunken text-faint">{t}</span>
          ))}
        </div>
      </div>
    </button>
  )
}

export function ClientCard({ c, onClick }: { c: Client; onClick: () => void }) {
  const color = CLIENT_HEX[c.clientStatus ?? 'Past'] ?? '#8C9080'
  return (
    <button onClick={onClick} className="card p-3.5 w-40 shrink-0 text-left hover:bg-sunken transition-colors">
      <div className="flex items-center gap-2 mb-2">
        <span className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0" style={{ color, background: `${color}28` }}>
          {c.name.slice(0, 1).toUpperCase()}
        </span>
        {c.clientStatus && (
          <Pill hex={color} className="text-[10px] font-semibold px-1.5 py-0.5 rounded">{CLIENT_STATUS_NL[c.clientStatus] ?? c.clientStatus}</Pill>
        )}
      </div>
      <div className="text-sm font-semibold truncate">{c.name}</div>
      <div className="mt-1.5 space-y-0.5 text-[11px] text-faint">
        {c.potentie && <div>Potentie: {c.potentie}</div>}
        {c.scope != null && <div className="tabular-nums">Scope: {eur(c.scope)}</div>}
        <div className="flex items-center gap-1"><DomainChip domain={c.domain} small /></div>
      </div>
    </button>
  )
}

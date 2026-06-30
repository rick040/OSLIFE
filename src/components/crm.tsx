// Shared UI primitives + constants for the native CRM (CRM / Projecten).
import { useEffect } from 'react'
import { X } from 'lucide-react'
import type { ProjectStatus, ClientStatus, Priority, Domain } from '../types'

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

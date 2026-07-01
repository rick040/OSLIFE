import { useState } from 'react'
import type { ClientIntakeDraft } from '../heyra/cards'
import {
  UserRoundPlus, Mail, Euro, CalendarClock, Pencil, Check, Copy, CheckCircle2, ArrowRight, ListChecks,
} from 'lucide-react'

export interface ClientIntakeCommitOptions {
  createClient: boolean
  createProject: boolean
  forceNewClient: boolean
}

export interface ClientIntakeResult {
  clientId: string | null
  projectId: string | null
}

/**
 * The Klant-intake reply: review + edit the extraction before anything is
 * written to the CRM. Two independent toggles ("klant aanmaken/koppelen",
 * "project aanmaken") mirror the source skill's Lead-vs-Active distinction —
 * a bare price inquiry becomes a Lead client with no project, not a forced one.
 */
export default function ClientIntakeCard({
  draft: initial,
  result,
  onCommit,
  onNav,
}: {
  draft: ClientIntakeDraft
  result?: ClientIntakeResult | null
  onCommit: (draft: ClientIntakeDraft, opts: ClientIntakeCommitOptions) => void
  onNav?: (v: string) => void
}) {
  const [draft, setDraft] = useState<ClientIntakeDraft>(initial)
  const [editing, setEditing] = useState(false)
  const [createClient, setCreateClient] = useState(true)
  const [createProject, setCreateProject] = useState(Boolean(initial.deliverables.length || initial.budgetGuess))
  const [forceNewClient, setForceNewClient] = useState(false)
  const [copied, setCopied] = useState(false)
  const [committing, setCommitting] = useState(false)

  const patch = (p: Partial<ClientIntakeDraft>) => setDraft((d) => ({ ...d, ...p }))
  const created = Boolean(result)

  async function copyReply() {
    try {
      await navigator.clipboard.writeText(draft.reply)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard unavailable — nothing to fall back to, the textarea is already selectable
    }
  }

  async function commit() {
    setCommitting(true)
    try {
      onCommit(draft, { createClient, createProject, forceNewClient })
    } finally {
      setCommitting(false)
    }
  }

  return (
    <div className="card overflow-hidden animate-fade-up">
      <div className="flex items-center gap-2 px-4 py-2 bg-sunken">
        <UserRoundPlus className="h-4 w-4 text-muted" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">Klant-intake</span>
        <span className="chip ml-auto bg-line text-muted">{draft.language === 'nl' ? 'NL' : 'EN'}</span>
        {!created && (
          <button
            onClick={() => setEditing((v) => !v)}
            className="text-faint hover:text-ink p-1 rounded-lg hover:bg-surface/60"
            aria-label={editing ? 'Klaar met bewerken' : 'Bewerken'}
          >
            {editing ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      <div className="p-4 space-y-3">
        {editing ? (
          <input
            value={draft.clientName}
            onChange={(e) => patch({ clientName: e.target.value })}
            className="input w-full text-base font-medium"
            placeholder="Klantnaam"
          />
        ) : (
          <h3 className="text-base font-semibold leading-snug">{draft.clientName}</h3>
        )}

        {draft.matchedClientId && !forceNewClient && (
          <div className="text-xs rounded-xl bg-line/60 text-muted px-3 py-2 flex items-center justify-between gap-2">
            <span>Bestaande klant herkend — koppelt aan “{draft.clientName}”.</span>
            <button onClick={() => setForceNewClient(true)} className="text-prjct-deep font-medium shrink-0">
              Toch nieuw
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {draft.email && (
            <span className="chip bg-sunken text-muted">
              <Mail className="h-3.5 w-3.5" /> {draft.email}
            </span>
          )}
          {draft.budgetGuess != null && (
            <span className="chip bg-sunken text-muted">
              <Euro className="h-3.5 w-3.5" /> €{draft.budgetGuess.toLocaleString('nl-NL')}
            </span>
          )}
          {draft.deadlineGuess && (
            <span className="chip bg-sunken text-muted">
              <CalendarClock className="h-3.5 w-3.5" /> {draft.deadlineGuess}
            </span>
          )}
          {draft.projectType.map((t) => (
            <span key={t} className="chip bg-line text-muted">{t}</span>
          ))}
        </div>

        {editing && (
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-muted flex flex-col gap-1">
              E-mail
              <input
                value={draft.email ?? ''}
                onChange={(e) => patch({ email: e.target.value || null })}
                className="input"
              />
            </label>
            <label className="text-[11px] text-muted flex flex-col gap-1">
              Budget (EUR)
              <input
                type="number"
                value={draft.budgetGuess ?? ''}
                onChange={(e) => patch({ budgetGuess: e.target.value ? Number(e.target.value) : null })}
                className="input"
              />
            </label>
            <label className="text-[11px] text-muted flex flex-col gap-1 col-span-2">
              Projecttype (komma-gescheiden)
              <input
                value={draft.projectType.join(', ')}
                onChange={(e) => patch({ projectType: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                className="input"
              />
            </label>
          </div>
        )}

        {(draft.deliverables.length > 0 || editing) && (
          <label className="text-[11px] text-muted flex flex-col gap-1">
            <span className="flex items-center gap-1"><ListChecks className="h-3 w-3" /> Deliverables (één per regel)</span>
            {editing ? (
              <textarea
                value={draft.deliverables.join('\n')}
                onChange={(e) => patch({ deliverables: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })}
                rows={Math.min(6, Math.max(2, draft.deliverables.length))}
                className="input resize-none"
              />
            ) : (
              <ul className="list-disc pl-4 text-xs text-ink space-y-0.5">
                {draft.deliverables.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            )}
          </label>
        )}

        <label className="text-[11px] text-muted flex flex-col gap-1">
          Antwoord
          <textarea
            value={draft.reply}
            onChange={(e) => patch({ reply: e.target.value })}
            rows={5}
            className="input resize-none whitespace-pre-line"
          />
        </label>

        {!draft.fromBrain && (
          <p className="text-[11px] text-faint">Zonder brein beschikbaar — check en vul aan waar nodig.</p>
        )}

        {!created && (
          <div className="flex flex-wrap items-center gap-4 pt-1">
            <label className="flex items-center gap-1.5 text-xs text-muted">
              <input type="checkbox" checked={createClient} onChange={(e) => setCreateClient(e.target.checked)} />
              Klant aanmaken/koppelen
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted">
              <input type="checkbox" checked={createProject} onChange={(e) => setCreateProject(e.target.checked)} />
              Project aanmaken
            </label>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {created ? (
            <span className="btn bg-buurtkaart/15 text-buurtkaart-deep cursor-default">
              <CheckCircle2 className="h-4 w-4" /> Toegevoegd aan CRM
            </span>
          ) : (
            <button className="btn-primary" onClick={commit} disabled={committing}>
              <CheckCircle2 className="h-4 w-4" /> {committing ? 'Aanmaken…' : 'Aanmaken in CRM'}
            </button>
          )}
          <button className="btn-ghost" onClick={copyReply}>
            <Copy className="h-4 w-4" /> {copied ? 'Gekopieerd' : 'Kopieer antwoord'}
          </button>
          {created && result?.projectId && onNav && (
            <button className="btn-ghost" onClick={() => onNav('projects')}>
              Open in Projecten <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

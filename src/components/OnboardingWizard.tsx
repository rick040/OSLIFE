import { useRef, useState } from 'react'
import {
  X, ArrowLeft, ArrowRight, Sparkles, CheckCircle2, Copy, Plus, Trash2,
  UserRoundPlus, FolderKanban, ListChecks, CalendarClock, FileText, Loader2,
} from 'lucide-react'
import { useStore } from '../store'
import type { Domain, Message } from '../types'
import {
  Field, TextInput, TextArea, SelectInput, PrimaryBtn,
  DOMAIN_OPTIONS, PROJECT_TYPE_OPTIONS,
} from './crm'
import { TODAY } from '../domains'
import {
  runOnboardingAnalysis, mergedTaskList, resolveMilestoneDates,
  type OnboardingDraft, type OnboardingMilestone,
} from '../lib/crm/onboardingAgent'

const STEPS = [
  { key: 'intake', title: 'Klantbericht', hint: 'Plak een bericht van de klant, of vul alles handmatig in' },
  { key: 'client', title: 'Klant', hint: 'Wie is de klant?' },
  { key: 'project', title: 'Project', hint: 'Wat gaan we opleveren?' },
  { key: 'tasks', title: 'Taken & tests', hint: 'Werkstappen en acceptatiecriteria vóór oplevering' },
  { key: 'milestones', title: 'Mijlpalen', hint: 'Planning richting oplevering' },
  { key: 'proposal', title: 'Voorstel & factuur', hint: 'Offerte-tekst en conceptfactuur' },
  { key: 'review', title: 'Overzicht', hint: 'Check alles, dan zetten we het door naar de CRM' },
] as const

/**
 * Full-screen client-onboarding wizard: paste a raw client message, let HEYRA
 * (Haiku) draft the client, project, scope, tasks, a test/acceptance
 * checklist, milestones and a proposal — then review/edit each step before
 * anything is written to the CRM. Every AI field stays editable; skipping the
 * AI step and filling everything in by hand works just as well.
 */
export default function OnboardingWizard({
  onClose, onDone,
}: {
  onClose: () => void
  onDone: (result: { clientId: string | null; projectId: string | null }) => void
}) {
  const store = useStore()
  const [step, setStep] = useState(0)

  // Step 0 — intake
  const [raw, setRaw] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzed, setAnalyzed] = useState(false)
  const [draft, setDraft] = useState<OnboardingDraft | null>(null)

  // Step 1 — client
  const [clientName, setClientName] = useState('')
  const [email, setEmail] = useState('')
  const [domain, setDomain] = useState<Domain>('prjct')
  const [matchedClientId, setMatchedClientId] = useState<string | null>(null)
  const [forceNewClient, setForceNewClient] = useState(false)
  const [createClient, setCreateClient] = useState(true)

  // Step 2 — project
  const [createProject, setCreateProject] = useState(true)
  const [projectName, setProjectName] = useState('')
  const [projectTypes, setProjectTypes] = useState<string[]>([])
  const [budget, setBudget] = useState('')
  const [startDate, setStartDate] = useState(TODAY)
  const [deadline, setDeadline] = useState('')
  const [scope, setScope] = useState('')

  // Step 3 — tasks & tests
  const [tasks, setTasks] = useState<string[]>([])
  const [acceptanceCriteria, setAcceptanceCriteria] = useState<string[]>([])

  // Step 4 — milestones
  const [milestones, setMilestones] = useState<OnboardingMilestone[]>([])

  // Step 5 — proposal & invoice
  const [proposalText, setProposalText] = useState('')
  const [reply, setReply] = useState('')
  const [invoiceAmount, setInvoiceAmount] = useState('')
  const [createInvoice, setCreateInvoice] = useState(true)
  const [copied, setCopied] = useState<'proposal' | 'reply' | null>(null)

  // Step 6 — review / commit
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const touchX = useRef<number | null>(null)

  function applyDraft(d: OnboardingDraft) {
    setDraft(d)
    setClientName(d.clientName)
    setEmail(d.email ?? '')
    setMatchedClientId(d.matchedClientId)
    setForceNewClient(false)
    setCreateProject(Boolean(d.deliverables.length || d.tasks.length || d.budgetGuess))
    setProjectName(d.clientName ? `${d.clientName} - ${d.projectType[0] ?? 'Project'}` : '')
    setProjectTypes(d.projectType)
    setBudget(d.budgetGuess != null ? String(d.budgetGuess) : '')
    setDeadline(d.deadlineGuess ?? '')
    setScope(d.scope)
    setTasks(mergedTaskList(d))
    setAcceptanceCriteria(d.acceptanceCriteria)
    setMilestones(d.milestones)
    setProposalText(d.proposalText)
    setReply(d.reply)
    setInvoiceAmount(d.budgetGuess != null ? String(d.budgetGuess) : '')
  }

  async function analyze() {
    if (!raw.trim()) return
    setAnalyzing(true)
    try {
      const d = await runOnboardingAnalysis(raw.trim(), store.clients)
      applyDraft(d)
      setAnalyzed(true)
      setStep(1)
    } finally {
      setAnalyzing(false)
    }
  }

  function skipToManual() {
    setAnalyzed(true)
    setStep(1)
  }

  function toggleType(t: string) {
    setProjectTypes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))
  }

  function addMilestoneRow() {
    setMilestones((m) => [...m, { title: '', offsetDays: (m.length ? m[m.length - 1].offsetDays : 0) + 7 }])
  }
  function updateMilestoneRow(i: number, patch: Partial<OnboardingMilestone>) {
    setMilestones((m) => m.map((x, idx) => (idx === i ? { ...x, ...patch } : x)))
  }
  function removeMilestoneRow(i: number) {
    setMilestones((m) => m.filter((_, idx) => idx !== i))
  }

  async function copyText(kind: 'proposal' | 'reply', text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(kind)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      // clipboard unavailable — textarea stays selectable as a fallback
    }
  }

  function goNext() {
    setStep((s) => Math.min(STEPS.length - 1, s + 1))
  }
  function goBack() {
    setStep((s) => Math.max(0, s - 1))
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchX.current = e.touches[0]?.clientX ?? null
  }
  function handleTouchEnd(e: React.TouchEvent) {
    const start = touchX.current
    touchX.current = null
    if (start == null) return
    const tag = (document.activeElement?.tagName ?? '').toLowerCase()
    if (tag === 'textarea' || tag === 'input' || tag === 'select') return
    const dx = (e.changedTouches[0]?.clientX ?? start) - start
    if (Math.abs(dx) < 70) return
    if (dx < 0) goNext()
    else goBack()
  }

  const useExisting = Boolean(matchedClientId) && !forceNewClient && createClient
  const canProceed =
    step === 1 ? clientName.trim().length > 0 :
    step === 2 ? !createProject || projectName.trim().length > 0 :
    true

  async function handleCreate() {
    setCreating(true)
    setError(null)
    try {
      const clientPayload = !createClient || useExisting
        ? null
        : {
            name: clientName.trim(),
            domain,
            clientStatus: createProject ? ('Active' as const) : ('Lead' as const),
            email: email.trim() || null,
            scope: budget ? parseFloat(budget) : null,
            firstContact: TODAY,
            researchNote: null,
            researchedAt: null,
          }

      const projectPayload = !createProject
        ? null
        : {
            name: projectName.trim() || `${clientName.trim()} - ${projectTypes[0] ?? 'Project'}`,
            client: clientName.trim(),
            domain,
            status: 'lead' as const,
            deadline: deadline || null,
            progress: 0,
            value: budget ? parseFloat(budget) : 0,
            type: projectTypes,
            startDate: startDate || null,
            deliverables: draft?.deliverables ?? [],
            scope: scope.trim() || null,
          }

      const message: Omit<Message, 'id'> = {
        contact: clientName.trim() || 'Nieuwe klant',
        contactKey: email.trim() || clientName.trim() || 'onboarding',
        channel: draft?.channelGuess ?? 'email',
        direction: 'in',
        subject: null,
        snippet: (raw || draft?.sourceText || '').slice(0, 140),
        body: raw || draft?.sourceText || '',
        ts: new Date().toISOString(),
        unread: false,
        source: 'manual',
      }

      const allTasks = createProject
        ? [...tasks, ...acceptanceCriteria.map((a) => `Test: ${a}`)]
        : []

      const result = await store.createClientIntake({
        client: clientPayload,
        existingClientId: useExisting ? matchedClientId : null,
        project: projectPayload,
        tasks: allTasks,
        message,
      })

      if (result.projectId) {
        if (milestones.length) {
          const resolved = resolveMilestoneDates(milestones, startDate || TODAY)
          resolved.forEach((m) => {
            if (m.title.trim()) store.addMilestone(result.projectId!, { title: m.title.trim(), dueDate: m.dueDate, progress: 0, done: false })
          })
        }
        if (createInvoice && invoiceAmount) {
          store.addInvoice(result.projectId, {
            number: '',
            amount: parseFloat(invoiceAmount) || 0,
            status: 'draft',
            issuedOn: TODAY,
            dueOn: null,
            paidOn: null,
            note: proposalText.trim() || null,
          })
        }
      }

      onDone(result)
    } catch {
      setError('Aanmaken is mislukt — probeer het nog eens.')
    } finally {
      setCreating(false)
    }
  }

  const s = STEPS[step]

  return (
    <div className="fixed inset-0 z-50 bg-canvas flex flex-col">
      {/* Header: progress + close */}
      <div className="shrink-0 border-b border-line px-4 sm:px-8 py-4 flex items-center gap-3">
        <span className="h-10 w-10 rounded-2xl bg-forest/12 flex items-center justify-center shrink-0">
          <Sparkles className="h-5 w-5 text-forest" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-lg font-semibold leading-tight">{s.title}</div>
          <div className="text-xs text-muted truncate">{s.hint}</div>
        </div>
        <button onClick={onClose} className="h-10 w-10 rounded-full bg-sunken flex items-center justify-center text-muted hover:text-ink shrink-0" aria-label="Sluiten">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="shrink-0 flex gap-1.5 px-4 sm:px-8 py-3 border-b border-line">
        {STEPS.map((st, i) => (
          <button
            key={st.key}
            onClick={() => (analyzed || i === 0) && setStep(i)}
            disabled={!analyzed && i > 0}
            className={`h-1.5 flex-1 rounded-full transition-colors ${i === step ? 'bg-forest' : i < step ? 'bg-forest/40' : 'bg-line'}`}
            aria-label={st.title}
          />
        ))}
      </div>

      {/* Body */}
      <div
        className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 sm:py-10"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="max-w-2xl mx-auto space-y-6">
          {step === 0 && (
            <div className="space-y-5">
              <p className="text-sm text-muted">
                Plak het bericht dat je van de klant kreeg (WhatsApp, e-mail, Fiverr). HEYRA (Haiku) leidt daar de klant,
                het project, taken, een testchecklist en een voorstel uit af — je kunt straks alles nog aanpassen.
              </p>
              <TextArea
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                rows={12}
                placeholder="Plak hier het klantbericht…"
                className="text-base min-h-[280px]"
                autoFocus
              />
              <div className="flex flex-wrap gap-3">
                <PrimaryBtn onClick={analyze} disabled={!raw.trim() || analyzing} className="flex-1 py-4 text-base flex items-center justify-center gap-2">
                  {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {analyzing ? 'Analyseren…' : 'Analyseren met AI'}
                </PrimaryBtn>
                <button onClick={skipToManual} className="btn-ghost px-5">
                  Handmatig invoeren
                </button>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <TextInput
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Klantnaam of bedrijf"
                className="text-lg font-semibold py-3"
                autoFocus
              />
              {matchedClientId && !forceNewClient && (
                <div className="text-sm rounded-2xl bg-line/60 text-muted px-4 py-3 flex items-center justify-between gap-3">
                  <span>Bestaande klant herkend — koppelt aan “{clientName}”.</span>
                  <button onClick={() => setForceNewClient(true)} className="text-prjct-deep font-medium shrink-0">Toch nieuw</button>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <Field label="E-mail">
                  <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="naam@bedrijf.nl" />
                </Field>
                <Field label="Domein">
                  <SelectInput value={domain} onChange={(e) => setDomain(e.target.value as Domain)}>
                    {DOMAIN_OPTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </SelectInput>
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm text-muted">
                <input type="checkbox" checked={createClient} onChange={(e) => setCreateClient(e.target.checked)} className="accent-forest h-4 w-4" />
                Klant aanmaken/koppelen in de CRM
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <label className="flex items-center gap-2 text-sm text-muted">
                <input type="checkbox" checked={createProject} onChange={(e) => setCreateProject(e.target.checked)} className="accent-forest h-4 w-4" />
                Project aanmaken
              </label>
              {createProject && (
                <>
                  <TextInput
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="Projectnaam"
                    className="text-lg font-semibold py-3"
                  />
                  <Field label="Type project">
                    <div className="flex flex-wrap gap-2">
                      {PROJECT_TYPE_OPTIONS.map((t) => {
                        const on = projectTypes.includes(t)
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() => toggleType(t)}
                            className={`chip text-sm px-3 py-1.5 ${on ? 'bg-forest text-white' : 'bg-surface border border-line text-muted'}`}
                          >
                            {t}
                          </button>
                        )
                      })}
                    </div>
                  </Field>
                  <div className="grid grid-cols-3 gap-4">
                    <Field label="Startdatum">
                      <TextInput type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                    </Field>
                    <Field label="Deadline">
                      <TextInput type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
                    </Field>
                    <Field label="Prijs (€)">
                      <TextInput type="number" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="0" />
                    </Field>
                  </div>
                  <Field label="Scope" hint="wat valt er binnen dit project (en wat niet)">
                    <TextArea value={scope} onChange={(e) => setScope(e.target.value)} rows={4} placeholder="Korte omschrijving van de opdracht…" />
                  </Field>
                </>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              {!createProject ? (
                <p className="text-sm text-muted">Geen project gepland — er zijn geen taken om te plannen.</p>
              ) : (
                <>
                  <Field label="Taken" hint="één per regel — werkstappen richting oplevering">
                    <TextArea
                      value={tasks.join('\n')}
                      onChange={(e) => setTasks(e.target.value.split('\n').map((t) => t.trim()).filter(Boolean))}
                      rows={10}
                      className="text-sm"
                    />
                  </Field>
                  <Field label="Testchecklist" hint="waar moet op gecontroleerd worden vóór oplevering — één per regel">
                    <TextArea
                      value={acceptanceCriteria.join('\n')}
                      onChange={(e) => setAcceptanceCriteria(e.target.value.split('\n').map((t) => t.trim()).filter(Boolean))}
                      rows={5}
                      placeholder={'Werkt op mobiel\nAlle links werken\nKlant heeft content goedgekeurd'}
                      className="text-sm"
                    />
                  </Field>
                </>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              {!createProject ? (
                <p className="text-sm text-muted">Geen project gepland — er zijn geen mijlpalen om te plannen.</p>
              ) : (
                <>
                  <div className="space-y-3">
                    {milestones.map((m, i) => {
                      const resolved = resolveMilestoneDates([m], startDate || TODAY)[0]
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <TextInput
                            value={m.title}
                            onChange={(e) => updateMilestoneRow(i, { title: e.target.value })}
                            placeholder="Mijlpaal"
                            className="flex-1"
                          />
                          <TextInput
                            type="number"
                            value={m.offsetDays}
                            onChange={(e) => updateMilestoneRow(i, { offsetDays: Math.max(0, Number(e.target.value) || 0) })}
                            className="w-20 text-center"
                          />
                          <span className="text-xs text-faint w-24 shrink-0">{resolved?.dueDate}</span>
                          <button onClick={() => removeMilestoneRow(i)} className="text-faint hover:text-cross-deep p-1.5 shrink-0" aria-label="Verwijderen">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                  <button onClick={addMilestoneRow} className="btn-ghost text-sm flex items-center gap-1.5">
                    <Plus className="h-4 w-4" /> Mijlpaal toevoegen
                  </button>
                  <p className="text-xs text-faint">Dagen vanaf startdatum ({startDate || TODAY}) — de datum rechts is het resultaat.</p>
                </>
              )}
            </div>
          )}

          {step === 5 && (
            <div className="space-y-6">
              <Field label="Voorstel / offerte-tekst">
                <TextArea value={proposalText} onChange={(e) => setProposalText(e.target.value)} rows={10} className="text-sm whitespace-pre-line" />
              </Field>
              <button onClick={() => copyText('proposal', proposalText)} className="btn-ghost text-sm flex items-center gap-1.5">
                <Copy className="h-4 w-4" /> {copied === 'proposal' ? 'Gekopieerd' : 'Kopieer voorstel'}
              </button>

              <Field label="Antwoord aan klant" hint="om los te versturen — wordt niet automatisch gemaild">
                <TextArea value={reply} onChange={(e) => setReply(e.target.value)} rows={6} className="text-sm whitespace-pre-line" />
              </Field>
              <button onClick={() => copyText('reply', reply)} className="btn-ghost text-sm flex items-center gap-1.5">
                <Copy className="h-4 w-4" /> {copied === 'reply' ? 'Gekopieerd' : 'Kopieer antwoord'}
              </button>

              {createProject && (
                <div className="rounded-2xl border border-line p-4 space-y-3">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input type="checkbox" checked={createInvoice} onChange={(e) => setCreateInvoice(e.target.checked)} className="accent-forest h-4 w-4" />
                    Conceptfactuur aanmaken
                  </label>
                  {createInvoice && (
                    <Field label="Bedrag (€)">
                      <TextInput type="number" value={invoiceAmount} onChange={(e) => setInvoiceAmount(e.target.value)} placeholder="0" />
                    </Field>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 6 && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-line divide-y divide-line overflow-hidden">
                <div className="p-4 flex items-start gap-3">
                  <UserRoundPlus className="h-4 w-4 text-muted mt-0.5 shrink-0" />
                  <div>
                    <div className="text-sm font-semibold">{clientName || '—'}</div>
                    <div className="text-xs text-muted">
                      {createClient ? (useExisting ? 'koppelt aan bestaande klant' : 'nieuwe klant') : 'klant wordt niet aangemaakt'}
                      {email && ` · ${email}`}
                    </div>
                  </div>
                </div>
                <div className="p-4 flex items-start gap-3">
                  <FolderKanban className="h-4 w-4 text-muted mt-0.5 shrink-0" />
                  <div>
                    <div className="text-sm font-semibold">{createProject ? (projectName || '—') : 'Geen project'}</div>
                    {createProject && (
                      <div className="text-xs text-muted">
                        {projectTypes.join(', ') || 'geen type'} · {budget ? `€${Number(budget).toLocaleString('nl-NL')}` : 'geen prijs'}
                        {deadline && ` · deadline ${deadline}`}
                      </div>
                    )}
                  </div>
                </div>
                {createProject && (
                  <div className="p-4 flex items-start gap-3">
                    <ListChecks className="h-4 w-4 text-muted mt-0.5 shrink-0" />
                    <div className="text-xs text-muted">{tasks.length} taken · {acceptanceCriteria.length} testpunten</div>
                  </div>
                )}
                {createProject && milestones.length > 0 && (
                  <div className="p-4 flex items-start gap-3">
                    <CalendarClock className="h-4 w-4 text-muted mt-0.5 shrink-0" />
                    <div className="text-xs text-muted">{milestones.length} mijlpalen</div>
                  </div>
                )}
                {createProject && createInvoice && (
                  <div className="p-4 flex items-start gap-3">
                    <FileText className="h-4 w-4 text-muted mt-0.5 shrink-0" />
                    <div className="text-xs text-muted">Conceptfactuur · €{invoiceAmount ? Number(invoiceAmount).toLocaleString('nl-NL') : '0'}</div>
                  </div>
                )}
              </div>
              {error && <p className="text-sm text-cross-deep">{error}</p>}
              <PrimaryBtn onClick={handleCreate} disabled={creating || !clientName.trim()} className="py-4 text-base flex items-center justify-center gap-2">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {creating ? 'Aanmaken…' : 'Aanmaken in CRM'}
              </PrimaryBtn>
            </div>
          )}
        </div>
      </div>

      {/* Footer nav */}
      {step < STEPS.length - 1 && (
        <div className="shrink-0 border-t border-line px-4 sm:px-8 py-4 flex items-center gap-3">
          <button
            onClick={goBack}
            disabled={step === 0}
            className="btn-ghost px-4 py-3 disabled:opacity-30 flex items-center gap-1.5"
          >
            <ArrowLeft className="h-4 w-4" /> Terug
          </button>
          <div className="flex-1" />
          <button
            onClick={goNext}
            disabled={!canProceed}
            className="btn-primary px-6 py-3 flex items-center gap-1.5 disabled:opacity-40"
          >
            Volgende <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}

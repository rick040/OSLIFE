import { useMemo, useState } from 'react'
import type { Project, ProjectStatus, Priority, Domain } from '../types'
import { useStore } from '../store'
import { templateTasksFor } from '../lib/crm/projectTemplates'
import {
  Sheet, Field, TextInput, TextArea, SelectInput, PrimaryBtn,
  PROJECT_STATUS_OPTIONS, PRIORITY_OPTIONS, PRIO_NL, DOMAIN_OPTIONS, PROJECT_TYPE_OPTIONS,
} from '../components/crm'

/**
 * Create (project = null) or edit a project. `presetClientId` pre-links a client
 * when launched from a client's detail screen.
 */
export default function ProjectForm({
  project, presetClientId, onClose,
}: {
  project: Project | null
  presetClientId?: string | null
  onClose: () => void
}) {
  const { clients, addProject, updateProject, createProjectWithTemplate } = useStore()
  const editing = !!project

  const initialClientId = project?.clientId ?? presetClientId ?? ''
  const [name, setName] = useState(project?.name ?? '')
  const [clientId, setClientId] = useState(initialClientId ?? '')
  const [domain, setDomain] = useState<Domain>(project?.domain ?? 'prjct')
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? 'lead')
  const [priority, setPriority] = useState<Priority | ''>(project?.priority ?? '')
  const [types, setTypes] = useState<string[]>(project?.type ?? [])
  const [startDate, setStartDate] = useState(project?.startDate?.slice(0, 10) ?? '')
  const [deadline, setDeadline] = useState(project?.deadline?.slice(0, 10) ?? '')
  const [value, setValue] = useState(project?.value != null ? String(project.value) : '')
  const [scope, setScope] = useState(project?.scope ?? '')
  const [deliverables, setDeliverables] = useState((project?.deliverables ?? []).join('\n'))
  const [notes, setNotes] = useState(project?.notes ?? '')
  const [addTemplate, setAddTemplate] = useState(true)

  const templateTasks = useMemo(() => templateTasksFor(types), [types])

  function toggleType(t: string) {
    setTypes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))
  }

  function submit() {
    if (!name.trim()) return
    const client = clients.find((c) => c.id === clientId)
    const patch = {
      name: name.trim(),
      clientId: clientId || null,
      client: client?.name ?? project?.client ?? '',
      domain,
      status,
      priority: (priority || undefined) as Priority | undefined,
      type: types,
      startDate: startDate || null,
      deadline: deadline || null,
      value: value ? parseFloat(value) : 0,
      scope: scope.trim() || null,
      deliverables: deliverables.split('\n').map((d) => d.trim()).filter(Boolean),
      notes: notes.trim() || null,
    }
    if (editing && project) updateProject(project.id, patch)
    else if (addTemplate && templateTasks.length) void createProjectWithTemplate({ ...patch, progress: 0 }, templateTasks)
    else addProject({ ...patch, progress: 0 })
    onClose()
  }

  return (
    <Sheet
      title={editing ? 'Project bewerken' : 'Nieuw project'}
      onClose={onClose}
      wide
      footer={<PrimaryBtn onClick={submit} disabled={!name.trim()}>{editing ? 'Opslaan' : 'Project aanmaken'}</PrimaryBtn>}
    >
      <Field label="Projectnaam">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="bv. Website redesign" autoFocus />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Klant">
          <SelectInput value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">— geen klant —</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </SelectInput>
        </Field>
        <Field label="Domein">
          <SelectInput value={domain} onChange={(e) => setDomain(e.target.value as Domain)}>
            {DOMAIN_OPTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </SelectInput>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Status">
          <SelectInput value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
            {PROJECT_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </SelectInput>
        </Field>
        <Field label="Prioriteit">
          <SelectInput value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            <option value="">—</option>
            {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{PRIO_NL[p]}</option>)}
          </SelectInput>
        </Field>
      </div>

      <Field label="Type project">
        <div className="flex flex-wrap gap-1.5">
          {PROJECT_TYPE_OPTIONS.map((t) => {
            const on = types.includes(t)
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleType(t)}
                className={`chip ${on ? 'bg-forest text-white' : 'bg-surface border border-line text-muted'}`}
              >
                {t}
              </button>
            )
          })}
        </div>
      </Field>

      {!editing && templateTasks.length > 0 && (
        <div className="rounded-2xl bg-surface border border-line p-3">
          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
            <input type="checkbox" checked={addTemplate} onChange={(e) => setAddTemplate(e.target.checked)} className="accent-forest h-4 w-4" />
            Voeg standaardtaken toe ({templateTasks.length})
          </label>
          {addTemplate && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {templateTasks.map((t) => (
                <span key={t} className="text-[11px] px-2 py-0.5 rounded-md bg-sunken text-faint">{t}</span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Startdatum">
          <TextInput type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label="Deadline / opleverdatum">
          <TextInput type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </Field>
      </div>

      <Field label="Projectprijs (€)">
        <TextInput type="number" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0" />
      </Field>

      <Field label="Project scope" hint="korte omschrijving van de opdracht">
        <TextArea value={scope} onChange={(e) => setScope(e.target.value)} rows={2} placeholder="Wat valt er binnen dit project?" />
      </Field>

      <Field label="Deliverables" hint="één per regel">
        <TextArea value={deliverables} onChange={(e) => setDeliverables(e.target.value)} rows={3} placeholder={'Logo\nHuisstijl\n5 social posts'} />
      </Field>

      <Field label="Notities">
        <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </Field>
    </Sheet>
  )
}

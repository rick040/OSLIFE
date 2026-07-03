import { useState } from 'react'
import type { Client, ClientStatus, Domain } from '../types'
import { useStore } from '../store'
import {
  Sheet, Field, TextInput, SelectInput, PrimaryBtn,
  CLIENT_STATUS_OPTIONS, CLIENT_STATUS_NL, DOMAIN_OPTIONS,
} from '../components/crm'

/** Create (client = null) or edit a client. */
export default function ClientForm({ client, onClose }: { client: Client | null; onClose: () => void }) {
  const { addClient, updateClient } = useStore()
  const editing = !!client

  const [name, setName] = useState(client?.name ?? '')
  const [domain, setDomain] = useState<Domain>(client?.domain ?? 'prjct')
  const [status, setStatus] = useState<ClientStatus | ''>(client?.clientStatus ?? 'Lead')
  const [potentie, setPotentie] = useState(client?.potentie ?? '')
  const [scope, setScope] = useState(client?.scope != null ? String(client.scope) : '')
  const [email, setEmail] = useState(client?.email ?? '')
  const [website, setWebsite] = useState(client?.website ?? '')
  const [firstContact, setFirstContact] = useState(client?.firstContact?.slice(0, 10) ?? '')
  const [followUpCycle, setFollowUpCycle] = useState(client?.followUpCycleDays != null ? String(client.followUpCycleDays) : '30')

  function submit() {
    if (!name.trim()) return
    const patch = {
      name: name.trim(),
      domain,
      clientStatus: (status || null) as ClientStatus | null,
      potentie: (potentie || null) as Client['potentie'],
      scope: scope ? parseFloat(scope) : null,
      email: email.trim() || null,
      website: website.trim() || null,
      firstContact: firstContact || null,
      followUpCycleDays: followUpCycle ? Math.max(1, parseInt(followUpCycle, 10) || 30) : 30,
    }
    if (editing && client) updateClient(client.id, patch)
    else addClient(patch)
    onClose()
  }

  return (
    <Sheet
      title={editing ? 'Klant bewerken' : 'Nieuwe klant'}
      onClose={onClose}
      footer={<PrimaryBtn onClick={submit} disabled={!name.trim()}>{editing ? 'Opslaan' : 'Klant toevoegen'}</PrimaryBtn>}
    >
      <Field label="Naam">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Klantnaam of bedrijf" autoFocus />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Domein">
          <SelectInput value={domain} onChange={(e) => setDomain(e.target.value as Domain)}>
            {DOMAIN_OPTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </SelectInput>
        </Field>
        <Field label="Status">
          <SelectInput value={status} onChange={(e) => setStatus(e.target.value as ClientStatus)}>
            {CLIENT_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{CLIENT_STATUS_NL[s]}</option>)}
          </SelectInput>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Potentie">
          <SelectInput value={potentie} onChange={(e) => setPotentie(e.target.value as 'Hoog' | 'Middel' | 'Laag')}>
            <option value="">—</option>
            <option value="Hoog">Hoog</option>
            <option value="Middel">Middel</option>
            <option value="Laag">Laag</option>
          </SelectInput>
        </Field>
        <Field label="Scope (€)" hint="geschatte waarde">
          <TextInput type="number" value={scope} onChange={(e) => setScope(e.target.value)} placeholder="0" />
        </Field>
      </div>
      <Field label="E-mail">
        <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="naam@bedrijf.nl" />
      </Field>
      <Field label="Website">
        <TextInput value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Eerste contact">
          <TextInput type="date" value={firstContact} onChange={(e) => setFirstContact(e.target.value)} />
        </Field>
        <Field label="Opvolgcyclus (dagen)" hint="hoe vaak contact opnemen">
          <TextInput type="number" min={1} value={followUpCycle} onChange={(e) => setFollowUpCycle(e.target.value)} placeholder="30" />
        </Field>
      </div>
    </Sheet>
  )
}

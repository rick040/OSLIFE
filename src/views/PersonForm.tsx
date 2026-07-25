import { useState } from 'react'
import { X } from 'lucide-react'
import type { Person, PersonKind } from '../types'
import { useStore } from '../store'
import { Sheet, Field, TextInput, TextArea, SelectInput, PrimaryBtn } from '../components/crm'
import { TAG_PRESETS, suggestTags } from '../lib/crm/relaties'

const KIND_LABEL: Record<PersonKind, string> = {
  network: 'Netwerk',
  business: 'Zakelijk',
  both: 'Beide',
}

function splitList(v: string): string[] {
  return v.split(',').map((s) => s.trim()).filter(Boolean)
}

/** Create (person = null) or edit a person — the full rolodex contact card. */
export default function PersonForm({ person, onClose }: { person: Person | null; onClose: () => void }) {
  const { addPerson, updatePerson } = useStore()
  const editing = !!person

  const [name, setName] = useState(person?.displayName ?? '')
  const [kind, setKind] = useState<PersonKind>(person?.kind ?? 'network')
  const [tags, setTags] = useState<string[]>(person?.tags ?? [])
  const [tagInput, setTagInput] = useState('')
  const [company, setCompany] = useState(person?.company ?? '')
  const [jobTitle, setJobTitle] = useState(person?.jobTitle ?? '')
  const [emails, setEmails] = useState(person?.emails.join(', ') ?? '')
  const [phones, setPhones] = useState(person?.phones.join(', ') ?? '')
  const [instagramUrl, setInstagramUrl] = useState(person?.instagramUrl ?? '')
  const [linkedinUrl, setLinkedinUrl] = useState(person?.linkedinUrl ?? '')
  const [twitterUrl, setTwitterUrl] = useState(person?.twitterUrl ?? '')
  const [websiteUrl, setWebsiteUrl] = useState(person?.websiteUrl ?? '')
  const [birthday, setBirthday] = useState(person?.birthday?.slice(0, 10) ?? '')
  const [cadenceDays, setCadenceDays] = useState(person?.cadenceDays != null ? String(person.cadenceDays) : '')
  const [notes, setNotes] = useState(person?.notes ?? '')

  function toggleTag(t: string) {
    setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))
  }
  function addCustomTag() {
    const t = tagInput.trim()
    if (t && !tags.includes(t)) setTags((cur) => [...cur, t])
    setTagInput('')
  }

  function submit() {
    if (!name.trim()) return
    const emailList = splitList(emails).map((e) => e.toLowerCase())
    const phoneList = splitList(phones)
    const companyVal = company.trim() || null
    const finalTags = tags.length > 0 ? tags : suggestTags({
      company: companyVal, clientId: person?.clientId ?? null,
      instagramUrl: instagramUrl.trim() || null, linkedinUrl: linkedinUrl.trim() || null, twitterUrl: twitterUrl.trim() || null,
      emails: emailList, phones: phoneList,
    })
    const patch = {
      displayName: name.trim(),
      kind,
      emails: emailList,
      phones: phoneList,
      birthday: birthday || null,
      cadenceDays: cadenceDays ? Math.max(1, parseInt(cadenceDays, 10) || 30) : null,
      clientId: person?.clientId ?? null,
      notes: notes.trim() || null,
      tier: person?.tier ?? ('normaal' as const),
      tags: finalTags,
      company: companyVal,
      jobTitle: jobTitle.trim() || null,
      instagramUrl: instagramUrl.trim() || null,
      linkedinUrl: linkedinUrl.trim() || null,
      twitterUrl: twitterUrl.trim() || null,
      websiteUrl: websiteUrl.trim() || null,
    }
    if (editing && person) updatePerson(person.id, patch)
    else addPerson({ ...patch, lastInteractionAt: null })
    onClose()
  }

  return (
    <Sheet
      title={editing ? 'Contact bewerken' : 'Nieuw contact'}
      onClose={onClose}
      footer={<PrimaryBtn onClick={submit} disabled={!name.trim()}>{editing ? 'Opslaan' : 'Contact toevoegen'}</PrimaryBtn>}
    >
      <Field label="Naam">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Voor- en achternaam" autoFocus />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <SelectInput value={kind} onChange={(e) => setKind(e.target.value as PersonKind)}>
            {(['network', 'business', 'both'] as PersonKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </SelectInput>
        </Field>
        <Field label="Bedrijf">
          <TextInput value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Bedrijfsnaam" />
        </Field>
      </div>

      <Field label="Functie">
        <TextInput value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Functietitel" />
      </Field>

      <Field label="Tags / categorie" hint="Klik om te (de)selecteren — of typ je eigen tag en druk Enter. Leeg blijft? Dan tagt OSLIFE automatisch op basis van de ingevulde velden.">
        <div className="flex flex-wrap gap-1.5 mb-2">
          {TAG_PRESETS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => toggleTag(t)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${tags.includes(t) ? 'bg-forest text-white border-forest' : 'bg-sunken border-line text-muted hover:text-ink'}`}
            >
              {t}
            </button>
          ))}
          {tags.filter((t) => !(TAG_PRESETS as readonly string[]).includes(t)).map((t) => (
            <button key={t} type="button" onClick={() => toggleTag(t)} className="text-xs px-2.5 py-1 rounded-full border bg-forest text-white border-forest inline-flex items-center gap-1">
              {t} <X className="h-3 w-3" />
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <TextInput
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomTag() } }}
            placeholder="Eigen tag…"
          />
          <button type="button" onClick={addCustomTag} className="px-3 rounded-xl bg-sunken text-sm font-medium text-muted hover:text-ink shrink-0">Toevoegen</button>
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="E-mail(s)" hint="komma-gescheiden, voor mail-matching">
          <TextInput value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="naam@voorbeeld.nl" />
        </Field>
        <Field label="Telefoon(s)" hint="komma-gescheiden">
          <TextInput value={phones} onChange={(e) => setPhones(e.target.value)} placeholder="06-…" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Instagram">
          <TextInput value={instagramUrl} onChange={(e) => setInstagramUrl(e.target.value)} placeholder="https://instagram.com/…" />
        </Field>
        <Field label="LinkedIn">
          <TextInput value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} placeholder="https://linkedin.com/in/…" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="X / Twitter">
          <TextInput value={twitterUrl} onChange={(e) => setTwitterUrl(e.target.value)} placeholder="https://x.com/…" />
        </Field>
        <Field label="Website">
          <TextInput value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://…" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Verjaardag">
          <TextInput type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} />
        </Field>
        <Field label="Contactcyclus (dagen)" hint="hoe vaak bijpraten">
          <TextInput type="number" min={1} value={cadenceDays} onChange={(e) => setCadenceDays(e.target.value)} placeholder="bv. 30" />
        </Field>
      </div>

      <Field label="Notities">
        <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Hoe je elkaar kent, waar je over sprak…" />
      </Field>
    </Sheet>
  )
}

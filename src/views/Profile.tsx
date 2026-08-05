import { useState, useEffect, useRef } from 'react'
import { useStore } from '../store'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '../components/ui/collapsible'
import { SetupHint, SectionTitle } from '../components/ui'
import { CURRENT_CATEGORIES, DESIRED_CATEGORIES, LANDSCAPE_CATEGORIES, hasAnyItems, type CategoryDef } from '../profile'
import { INTERVIEW, type InterviewSection } from '../selfModel'
import type { ProfileItem } from '../types'
import { Fingerprint, Sparkles, Compass, Plus, X, Check, ChevronDown } from 'lucide-react'
import CharacterTab from '../components/character/CharacterTab'

type Tab = 'personage' | 'huidig' | 'droom' | 'landschap'

const TABS: { id: Tab; label: string }[] = [
  { id: 'personage', label: 'Personage' },
  { id: 'huidig', label: 'Huidig' },
  { id: 'droom', label: 'Droom' },
  { id: 'landschap', label: 'Landschap' },
]

function fmtWhen(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `bijgewerkt ${d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`
}

function AddItemForm({ onAdd }: { onAdd: (text: string) => void }) {
  const [draft, setDraft] = useState('')
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const t = draft.trim()
        if (!t) return
        onAdd(t)
        setDraft('')
      }}
      className="flex gap-1.5"
    >
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Toevoegen…"
        className="flex-1 min-w-0 rounded-lg bg-sunken border border-line px-2 py-1 text-xs outline-none focus:border-prjct/60"
      />
      <button type="submit" className="btn-ghost !py-1 !px-2 text-xs shrink-0">
        <Plus className="h-3 w-3" />
      </button>
    </form>
  )
}

function StatusPill({ status }: { status: ProfileItem['status'] }) {
  return status === 'hypothesis' ? (
    <span className="chip bg-personal/15 text-personal-deep text-[10px] px-1.5 py-0 shrink-0">Hypothese</span>
  ) : (
    <span className="chip bg-buurtkaart/15 text-buurtkaart text-[10px] px-1.5 py-0 shrink-0">Bevestigd</span>
  )
}

function CurrentCategoryCard({ def }: { def: CategoryDef }) {
  // Select the stable categories object itself — never `?? []` inside the
  // selector, which would hand useSyncExternalStore a fresh array reference
  // on every read and cause an infinite render loop ("Maximum update depth
  // exceeded"). The fallback belongs outside, as a plain derived value.
  const categories = useStore((s) => s.identityProfile.current.categories)
  const items = categories[def.key] ?? []
  const setCurrentItems = useStore((s) => s.setCurrentItems)
  const confirmCurrentItem = useStore((s) => s.confirmCurrentItem)

  return (
    <div className="card p-4">
      <h3 className="text-[11px] uppercase tracking-wider text-muted">{def.label}</h3>
      <p className="text-[11px] text-faint mt-0.5 mb-2 leading-snug">{def.hint}</p>

      {items.length === 0 ? (
        <p className="text-xs text-faint italic mb-2">Nog niets herkend.</p>
      ) : (
        <ul className="space-y-1.5 mb-2">
          {items.map((it, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-ink-soft group">
              <span className="mt-1.5 h-1 w-1 rounded-full bg-faint shrink-0" />
              <span className="flex-1">{it.text}</span>
              <StatusPill status={it.status} />
              {it.status === 'hypothesis' && (
                <button
                  onClick={() => confirmCurrentItem(def.key, i)}
                  className="text-faint hover:text-buurtkaart shrink-0"
                  aria-label={`Bevestig "${it.text}"`}
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={() => setCurrentItems(def.key, items.filter((_, idx) => idx !== i))}
                className="text-faint hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                aria-label={`Verwijder "${it.text}"`}
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <AddItemForm onAdd={(text) => setCurrentItems(def.key, [...items, { text, status: 'confirmed' }])} />
    </div>
  )
}

function StringListCard({
  title,
  hint,
  items,
  onAdd,
  onRemove,
}: {
  title: string
  hint?: string
  items: string[]
  onAdd: (text: string) => void
  onRemove: (index: number) => void
}) {
  return (
    <div className="card p-4">
      <h3 className="text-[11px] uppercase tracking-wider text-muted">{title}</h3>
      {hint && <p className="text-[11px] text-faint mt-0.5 mb-2 leading-snug">{hint}</p>}

      {items.length === 0 ? (
        <p className="text-xs text-faint italic mb-2">Nog niets herkend.</p>
      ) : (
        <ul className="space-y-1 mb-2">
          {items.map((t, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-ink-soft group">
              <span className="mt-1.5 h-1 w-1 rounded-full bg-faint shrink-0" />
              <span className="flex-1">{t}</span>
              <button
                onClick={() => onRemove(i)}
                className="text-faint hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                aria-label={`Verwijder "${t}"`}
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <AddItemForm onAdd={onAdd} />
    </div>
  )
}

function CurrentGrid() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {CURRENT_CATEGORIES.map((def) => (
        <CurrentCategoryCard key={def.key} def={def} />
      ))}
    </div>
  )
}

function DesiredGrid() {
  const categories = useStore((s) => s.identityProfile.desired.categories)
  const setDesiredItems = useStore((s) => s.setDesiredItems)
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {DESIRED_CATEGORIES.map((def) => {
        const items = categories[def.key] ?? []
        return (
          <StringListCard
            key={def.key}
            title={def.label}
            hint={def.hint}
            items={items}
            onAdd={(t) => setDesiredItems(def.key, [...items, t])}
            onRemove={(i) => setDesiredItems(def.key, items.filter((_, idx) => idx !== i))}
          />
        )
      })}
    </div>
  )
}

function LandscapeGrid() {
  const categories = useStore((s) => s.identityProfile.landscape.categories)
  const setLandscapeItems = useStore((s) => s.setLandscapeItems)
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {LANDSCAPE_CATEGORIES.map((def) => {
        const items = categories[def.key] ?? []
        return (
          <StringListCard
            key={def.key}
            title={def.label}
            hint={def.hint}
            items={items}
            onAdd={(t) => setLandscapeItems(def.key, [...items, t])}
            onRemove={(i) => setLandscapeItems(def.key, items.filter((_, idx) => idx !== i))}
          />
        )
      })}
    </div>
  )
}

function TensionsCard() {
  const tensions = useStore((s) => s.identityProfile.landscape.tensions)
  const setTensions = useStore((s) => s.setTensions)
  return (
    <StringListCard
      title="Spanningen"
      hint="Concrete botsingen tussen wie je nu bent en wie je wilt worden — de eerste kloven om aan te werken."
      items={tensions}
      onAdd={(t) => setTensions([...tensions, t])}
      onRemove={(i) => setTensions(tensions.filter((_, idx) => idx !== i))}
    />
  )
}

function InterviewSectionCard({ section }: { section: InterviewSection }) {
  const answers = useStore((s) => s.identityProfile.interview.answers)
  const updateInterviewAnswer = useStore((s) => s.updateInterviewAnswer)
  const [open, setOpen] = useState(false)
  const answeredCount = section.questions.filter((q) => (answers[q.id] ?? '').trim()).length

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="card overflow-hidden !p-0">
      <CollapsibleTrigger className="w-full flex items-center justify-between gap-3 p-4 text-left">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-ink">{section.title}</h3>
          <p className="text-xs text-faint mt-0.5">{section.blurb}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-faint tabular-nums">
            {answeredCount}/{section.questions.length}
          </span>
          <ChevronDown className={`h-4 w-4 text-faint transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4 space-y-4 border-t border-line pt-4">
        {section.questions.map((q) => (
          <div key={q.id} className="space-y-1.5">
            <p className="text-xs text-ink-soft leading-relaxed">{q.prompt}</p>
            <textarea
              defaultValue={answers[q.id] ?? ''}
              onBlur={(e) => {
                if (e.target.value !== (answers[q.id] ?? '')) updateInterviewAnswer(q.id, e.target.value)
              }}
              placeholder="…"
              rows={3}
              className="w-full rounded-lg bg-sunken border border-line px-3 py-2 text-sm outline-none focus:border-prjct/60 leading-relaxed"
            />
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}

export default function Profile() {
  const {
    identityProfile,
    generatingProfile,
    lastProfileError,
    distillingInterview,
    lastDistillError,
    generatingLandscape,
    lastLandscapeError,
    expandingDesired,
    lastExpandDesiredError,
    braindumpEntries,
    generateCurrentProfile,
    distillFromInterview,
    generateLandscape,
    expandDesiredFromSignal,
  } = useStore()

  const [tab, setTab] = useState<Tab>('personage')
  const [showLegacy, setShowLegacy] = useState(false)
  const { current, desired, landscape, legacyNotes } = identityProfile
  const desiredHasSignal = hasAnyItems(desired.categories)

  const freshBraindumpCount = desired.generatedAt
    ? braindumpEntries.filter((b) => b.createdAt > desired.generatedAt!).length
    : braindumpEntries.length

  // Auto-suggest, once per fresh batch: as soon as there's braindump signal
  // written since the desired profile was last touched, quietly check it for
  // explicit aspirational statements — no button press required. The action
  // itself no-ops (cheaply) if there's nothing fresh, so this is safe to fire
  // on every mount; the ref just stops it firing twice for the same batch
  // within one mount (e.g. React StrictMode's double-invoke in dev).
  const autoExpandedRef = useRef(false)
  useEffect(() => {
    if (autoExpandedRef.current) return
    if (freshBraindumpCount === 0 || expandingDesired) return
    autoExpandedRef.current = true
    void expandDesiredFromSignal()
  }, [freshBraindumpCount, expandingDesired, expandDesiredFromSignal])

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sunken">
          <Fingerprint className="h-5 w-5 text-ink-soft" />
        </span>
        <div>
          <h1 className="text-xl font-medium text-ink">Profiel</h1>
          <p className="text-sm text-muted mt-0.5">Wie je nu bent, wie je wordt, en de omgeving die de kloof overbrugt.</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="personage" className="mt-6">
          <CharacterTab />
        </TabsContent>

        <TabsContent value="huidig" className="mt-6 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <p className="text-xs text-faint max-w-md">
              Automatisch samengesteld uit je braindumps, patronen, geleerde feiten en gewoontes ("Bevestigd"), plus
              hypotheses uit je interview op de Droom-tab ("Hypothese", nog niet bevestigd door data). Klopt iets niet
              (meer) — pas het direct aan.
            </p>
            <div className="flex items-center gap-2 shrink-0">
              {fmtWhen(current.generatedAt) && <span className="text-[11px] text-faint">{fmtWhen(current.generatedAt)}</span>}
              <button className="btn-ghost !py-1.5" onClick={() => generateCurrentProfile()} disabled={generatingProfile}>
                {generatingProfile ? (
                  <span className="h-4 w-4 rounded-full border-2 border-prjct border-t-transparent animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 text-prjct" />
                )}
                {generatingProfile ? 'Denkt na…' : current.generatedAt ? 'Vernieuwen' : 'Genereer uit data'}
              </button>
            </div>
          </div>

          {lastProfileError && !generatingProfile && (
            <div className="card p-3 text-sm text-personal-deep bg-personal/10">{lastProfileError}</div>
          )}

          <CurrentGrid />
        </TabsContent>

        <TabsContent value="droom" className="mt-6 space-y-4">
          <div className="card p-4 text-sm text-ink-soft space-y-2">
            <p>Vul het interview in — bij je eigen tempo, half werk is prima. HEYRA destilleert hieruit je droomprofiel.</p>
            <p className="text-xs text-faint">
              Geen goede antwoorden. Reik naar het eerlijke antwoord, niet het indrukwekkende. Sla over wat niet landt.
            </p>
          </div>

          <div className="space-y-2">
            {INTERVIEW.map((section) => (
              <InterviewSectionCard key={section.key} section={section} />
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap">
            {legacyNotes.trim() ? (
              <button className="text-xs text-faint hover:text-ink underline" onClick={() => setShowLegacy((v) => !v)}>
                {showLegacy ? 'Verberg' : 'Toon'} oorspronkelijke tekst (bewaard)
              </button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              {fmtWhen(current.hypothesesAt) && <span className="text-[11px] text-faint">{fmtWhen(current.hypothesesAt)}</span>}
              <button className="btn-ghost !py-1.5" onClick={() => distillFromInterview()} disabled={distillingInterview}>
                {distillingInterview ? (
                  <span className="h-4 w-4 rounded-full border-2 border-prjct border-t-transparent animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 text-prjct" />
                )}
                {distillingInterview ? 'Destilleert…' : 'Destilleer'}
              </button>
            </div>
          </div>

          {showLegacy && legacyNotes.trim() && (
            <div className="card p-4">
              <p className="text-[11px] uppercase tracking-wider text-muted mb-2">Oorspronkelijke tekst (bewaard, alleen-lezen)</p>
              <pre className="text-xs text-faint whitespace-pre-wrap font-sans leading-relaxed max-h-64 overflow-y-auto">{legacyNotes}</pre>
            </div>
          )}

          {lastDistillError && !distillingInterview && (
            <div className="card p-3 text-sm text-personal-deep bg-personal/10">{lastDistillError}</div>
          )}

          <div className="flex items-start justify-between gap-3 flex-wrap">
            <SectionTitle hint="HEYRA leest je braindumps mee en vult dit automatisch aan zodra je iets expliciets schrijft over wie je wilt worden.">
              Droomprofiel
            </SectionTitle>
            <div className="flex items-center gap-2 shrink-0">
              {freshBraindumpCount > 0 && !expandingDesired && (
                <span className="text-[11px] text-faint">{freshBraindumpCount} nieuwe braindump(s) niet gescand</span>
              )}
              <button className="btn-ghost !py-1.5" onClick={() => expandDesiredFromSignal()} disabled={expandingDesired}>
                {expandingDesired ? (
                  <span className="h-4 w-4 rounded-full border-2 border-prjct border-t-transparent animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 text-prjct" />
                )}
                {expandingDesired ? 'Scant braindumps…' : 'Zoek in braindumps'}
              </button>
            </div>
          </div>

          {lastExpandDesiredError && !expandingDesired && (
            <div className="card p-3 text-sm text-personal-deep bg-personal/10">{lastExpandDesiredError}</div>
          )}

          <DesiredGrid />
        </TabsContent>

        <TabsContent value="landschap" className="mt-6 space-y-4">
          {!desiredHasSignal ? (
            <SetupHint icon={Compass} title="Vul eerst je droomprofiel in" cta="Naar droomprofiel" onCta={() => setTab('droom')}>
              Het landschap — de mensen, gewoontes, tijd, geld, balans en focus die de kloof overbruggen — bouwt voort op
              je droomprofiel.
            </SetupHint>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <p className="text-xs text-faint max-w-md">
                  De omgeving die de kloof tussen je huidige en je droomprofiel overbrugt.
                </p>
                <div className="flex items-center gap-2 shrink-0">
                  {fmtWhen(landscape.generatedAt) && (
                    <span className="text-[11px] text-faint">{fmtWhen(landscape.generatedAt)}</span>
                  )}
                  <button className="btn-ghost !py-1.5" onClick={() => generateLandscape()} disabled={generatingLandscape}>
                    {generatingLandscape ? (
                      <span className="h-4 w-4 rounded-full border-2 border-prjct border-t-transparent animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4 text-prjct" />
                    )}
                    {generatingLandscape ? 'Denkt na…' : landscape.generatedAt ? 'Vernieuwen' : 'Genereer landschap'}
                  </button>
                </div>
              </div>

              {lastLandscapeError && !generatingLandscape && (
                <div className="card p-3 text-sm text-personal-deep bg-personal/10">{lastLandscapeError}</div>
              )}

              <TensionsCard />
              <LandscapeGrid />
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

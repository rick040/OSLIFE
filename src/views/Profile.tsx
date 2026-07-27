import { useState } from 'react'
import { useStore } from '../store'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
import { SetupHint } from '../components/ui'
import { PERSONA_CATEGORIES, LANDSCAPE_CATEGORIES, hasAnyItems, type CategoryDef } from '../profile'
import type { IdentitySnapshot, Landscape } from '../types'
import { Fingerprint, Sparkles, Compass, Save, Plus, X } from 'lucide-react'

type Tab = 'huidig' | 'droom' | 'landschap'
type Section = 'current' | 'dream' | 'landscape'

const TABS: { id: Tab; label: string }[] = [
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

function CategoryCard({
  def,
  items,
  onAdd,
  onRemove,
}: {
  def: CategoryDef
  items: string[]
  onAdd: (text: string) => void
  onRemove: (index: number) => void
}) {
  const [draft, setDraft] = useState('')
  return (
    <div className="card p-4">
      <h3 className="text-[11px] uppercase tracking-wider text-muted">{def.label}</h3>
      <p className="text-[11px] text-faint mt-0.5 mb-2 leading-snug">{def.hint}</p>

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
    </div>
  )
}

function CategoryGrid({
  defs,
  section,
  snapshot,
}: {
  defs: CategoryDef[]
  section: Section
  snapshot: IdentitySnapshot | Landscape
}) {
  const setProfileCategoryItems = useStore((s) => s.setProfileCategoryItems)
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {defs.map((def) => {
        const items = snapshot.categories[def.key] ?? []
        return (
          <CategoryCard
            key={def.key}
            def={def}
            items={items}
            onAdd={(text) => setProfileCategoryItems(section, def.key, [...items, text])}
            onRemove={(i) => setProfileCategoryItems(section, def.key, items.filter((_, idx) => idx !== i))}
          />
        )
      })}
    </div>
  )
}

export default function Profile() {
  const {
    identityProfile,
    generatingProfile,
    lastProfileError,
    generatingDream,
    lastDreamError,
    generatingLandscape,
    lastLandscapeError,
    generateCurrentProfile,
    updateDreamNotes,
    distillDreamProfile,
    generateLandscape,
  } = useStore()

  const [tab, setTab] = useState<Tab>('huidig')
  const [draftNotes, setDraftNotes] = useState(identityProfile.dreamNotes)
  const notesDirty = draftNotes !== identityProfile.dreamNotes

  const { current, dreamNotes, dream, landscape } = identityProfile
  const dreamHasSignal = hasAnyItems(dream.categories) || dreamNotes.trim().length > 0

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

        <TabsContent value="huidig" className="mt-6 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <p className="text-xs text-faint max-w-md">
              Automatisch samengesteld door HEYRA uit je braindumps, patronen, geleerde feiten en gewoontes. Klopt iets
              niet (meer) — pas het direct aan per categorie.
            </p>
            <div className="flex items-center gap-2 shrink-0">
              {fmtWhen(current.generatedAt) && <span className="text-[11px] text-faint">{fmtWhen(current.generatedAt)}</span>}
              <button className="btn-ghost !py-1.5" onClick={() => generateCurrentProfile()} disabled={generatingProfile}>
                {generatingProfile ? (
                  <span className="h-4 w-4 rounded-full border-2 border-prjct border-t-transparent animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 text-prjct" />
                )}
                {generatingProfile ? 'Denkt na…' : current.generatedAt ? 'Vernieuwen' : 'Genereer profiel'}
              </button>
            </div>
          </div>

          {lastProfileError && !generatingProfile && (
            <div className="card p-3 text-sm text-personal-deep bg-personal/10">{lastProfileError}</div>
          )}

          <CategoryGrid defs={PERSONA_CATEGORIES} section="current" snapshot={current} />
        </TabsContent>

        <TabsContent value="droom" className="mt-6 space-y-4">
          <div className="card p-4 text-sm text-ink-soft space-y-2">
            <p>
              Het profiel dat je nodig hebt om te leven zoals je wilt — de onderliggende eigenschappen, niet de losse
              wensen.
            </p>
            <p className="text-xs text-faint">
              Bijvoorbeeld: niet "ergens een jaar wonen en dan verhuizen", maar "financieel onafhankelijk, geen baas,
              zelfstandig inkomen" — het profiel dat die vrijheid mogelijk maakt.
            </p>
          </div>

          <div className="space-y-2">
            <h2 className="text-[11px] uppercase tracking-wider text-muted">Ruwe notities</h2>
            <textarea
              value={draftNotes}
              onChange={(e) => setDraftNotes(e.target.value)}
              placeholder="Nog niet ingevuld — schrijf hier vrij over wie je wilt worden. HEYRA destilleert dit naar de categorieën hieronder."
              rows={8}
              className="w-full rounded-xl bg-sunken border border-line px-3 py-2.5 text-sm outline-none focus:border-prjct/60 leading-relaxed"
            />
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <button className="btn-primary !py-1.5" onClick={() => updateDreamNotes(draftNotes)} disabled={!notesDirty}>
                <Save className="h-4 w-4" /> Opslaan
              </button>
              <div className="flex items-center gap-2">
                {fmtWhen(dream.generatedAt) && <span className="text-[11px] text-faint">{fmtWhen(dream.generatedAt)}</span>}
                <button className="btn-ghost !py-1.5" onClick={() => distillDreamProfile()} disabled={generatingDream}>
                  {generatingDream ? (
                    <span className="h-4 w-4 rounded-full border-2 border-prjct border-t-transparent animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 text-prjct" />
                  )}
                  {generatingDream ? 'Destilleert…' : 'Destilleer naar categorieën'}
                </button>
              </div>
            </div>
          </div>

          {lastDreamError && !generatingDream && (
            <div className="card p-3 text-sm text-personal-deep bg-personal/10">{lastDreamError}</div>
          )}

          <CategoryGrid defs={PERSONA_CATEGORIES} section="dream" snapshot={dream} />
        </TabsContent>

        <TabsContent value="landschap" className="mt-6 space-y-4">
          {!dreamHasSignal ? (
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

              <CategoryGrid defs={LANDSCAPE_CATEGORIES} section="landscape" snapshot={landscape} />
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

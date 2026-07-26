import { useState } from 'react'
import { useStore } from '../store'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
import { Empty, SetupHint } from '../components/ui'
import { Fingerprint, Sparkles, Compass, Save, Users, Repeat, MapPin } from 'lucide-react'

type Tab = 'huidig' | 'droom' | 'landschap'

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

function ItemList({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return <p className="text-xs text-faint italic">{empty}</p>
  return (
    <ul className="space-y-1.5">
      {items.map((t, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-ink-soft">
          <span className="mt-1.5 h-1 w-1 rounded-full bg-faint shrink-0" />
          {t}
        </li>
      ))}
    </ul>
  )
}

function Section({ title, accent, items, empty }: { title: string; accent: string; items: string[]; empty: string }) {
  return (
    <div className={`card p-4 border-l-2 ${accent}`}>
      <h3 className="text-[11px] uppercase tracking-wider text-muted mb-2">{title}</h3>
      <ItemList items={items} empty={empty} />
    </div>
  )
}

export default function Profile() {
  const {
    identityProfile,
    generatingProfile,
    lastProfileError,
    generatingLandscape,
    lastLandscapeError,
    generateCurrentProfile,
    updateDreamProfile,
    generateLandscape,
  } = useStore()

  const [tab, setTab] = useState<Tab>('huidig')
  const [draftMd, setDraftMd] = useState(identityProfile.dreamMd)
  const dreamDirty = draftMd !== identityProfile.dreamMd

  const { current, dreamMd, landscape } = identityProfile

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto">
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
              Automatisch samengesteld door HEYRA uit je braindumps, patronen, geleerde feiten en gewoontes — hoe meer
              vastgelegd, hoe scherper dit wordt.
            </p>
            <div className="flex items-center gap-2 shrink-0">
              {fmtWhen(current.generatedAt) && (
                <span className="text-[11px] text-faint">{fmtWhen(current.generatedAt)}</span>
              )}
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

          {!current.generatedAt && !generatingProfile ? (
            <Empty>Nog geen profiel gegenereerd. Klik op "Genereer profiel" om te beginnen.</Empty>
          ) : (
            <>
              {current.summary && <div className="card p-4 text-sm text-ink-soft">{current.summary}</div>}
              <div className="grid gap-3 sm:grid-cols-2">
                <Section title="Eigenschappen" accent="border-prjct" items={current.traits} empty="Nog niets herkend." />
                <Section title="Sterke punten" accent="border-buurtkaart" items={current.strengths} empty="Nog niets herkend." />
                <Section title="Valkuilen" accent="border-personal" items={current.weaknesses} empty="Nog niets herkend." />
                <Section title="Versnellers" accent="border-forest" items={current.accelerators} empty="Nog niets herkend." />
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="droom" className="mt-6 space-y-4">
          <div className="card p-4 text-sm text-ink-soft space-y-2">
            <p>
              Beschrijf het profiel dat je nodig hebt om te leven zoals je wilt — de onderliggende eigenschappen, niet de
              losse wensen.
            </p>
            <p className="text-xs text-faint">
              Bijvoorbeeld: niet "ergens een jaar wonen en dan verhuizen", maar "financieel onafhankelijk, geen baas,
              zelfstandig inkomen" — het profiel dat die vrijheid mogelijk maakt.
            </p>
          </div>

          <textarea
            value={draftMd}
            onChange={(e) => setDraftMd(e.target.value)}
            placeholder="Nog niet ingevuld — voeg hier je droomprofiel toe wanneer je zover bent."
            rows={14}
            className="w-full rounded-xl bg-sunken border border-line px-3 py-2.5 text-sm outline-none focus:border-prjct/60 leading-relaxed"
          />
          <div className="flex justify-end">
            <button
              className="btn-primary !py-1.5"
              onClick={() => updateDreamProfile(draftMd)}
              disabled={!dreamDirty}
            >
              <Save className="h-4 w-4" /> Opslaan
            </button>
          </div>
        </TabsContent>

        <TabsContent value="landschap" className="mt-6 space-y-4">
          {!dreamMd.trim() ? (
            <SetupHint
              icon={Compass}
              title="Vul eerst je droomprofiel in"
              cta="Naar droomprofiel"
              onCta={() => setTab('droom')}
            >
              Het landschap — de mensen, gewoontes en omgeving die de kloof overbruggen — bouwt voort op je droomprofiel.
            </SetupHint>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <p className="text-xs text-faint max-w-md">
                  De omgeving die de kloof tussen je huidige en je droomprofiel overbrugt: wie je om je heen nodig hebt,
                  welke gewoontes je opbouwt, en welke omgeving dat mogelijk maakt.
                </p>
                <div className="flex items-center gap-2 shrink-0">
                  {fmtWhen(landscape.generatedAt) && (
                    <span className="text-[11px] text-faint">{fmtWhen(landscape.generatedAt)}</span>
                  )}
                  <button
                    className="btn-ghost !py-1.5"
                    onClick={() => generateLandscape()}
                    disabled={generatingLandscape}
                  >
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

              {!landscape.generatedAt && !generatingLandscape ? (
                <Empty>Nog geen landschap gegenereerd. Klik op "Genereer landschap" om te beginnen.</Empty>
              ) : (
                <>
                  {landscape.summary && <div className="card p-4 text-sm text-ink-soft">{landscape.summary}</div>}
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="card p-4 border-l-2 border-prjct">
                      <h3 className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted mb-2">
                        <Users className="h-3.5 w-3.5" /> Mensen
                      </h3>
                      <ItemList items={landscape.people} empty="Nog niets herkend." />
                    </div>
                    <div className="card p-4 border-l-2 border-buurtkaart">
                      <h3 className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted mb-2">
                        <Repeat className="h-3.5 w-3.5" /> Gewoontes
                      </h3>
                      <ItemList items={landscape.habits} empty="Nog niets herkend." />
                    </div>
                    <div className="card p-4 border-l-2 border-forest">
                      <h3 className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted mb-2">
                        <MapPin className="h-3.5 w-3.5" /> Omgeving
                      </h3>
                      <ItemList items={landscape.environment} empty="Nog niets herkend." />
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

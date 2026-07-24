import { X, Send } from 'lucide-react'
import { useStore } from '../store'
import { SectionTitle, Overlay } from './ui'
import type { NotificationPrefs, NudgeCategory } from '../types'

const BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined

const DEFAULT_PREFS: NotificationPrefs = {
  telegramChatId: null,
  telegramUsername: null,
  linkedAt: null,
  morningBriefing: true,
  eveningCheckin: true,
  habitReminders: true,
  urgentAlerts: true,
  morningTime: '07:30',
  eveningTime: '20:00',
  habitTime: '21:00',
  quietHoursStart: null,
  quietHoursEnd: null,
  nudgesEnabled: false,
  nudgesPerDay: 3,
  nudgeCategories: ['task', 'sharp', 'suggestion', 'checkin'],
}

const CATEGORIES: Array<{ key: keyof NotificationPrefs; timeKey?: keyof NotificationPrefs; label: string; hint: string }> = [
  { key: 'morningBriefing', timeKey: 'morningTime', label: 'Ochtendbriefing', hint: 'Nudge + open loops van vandaag.' },
  { key: 'eveningCheckin', timeKey: 'eveningTime', label: 'Avond check-in', hint: 'Vraagt energie + stemming als je nog niet hebt ingecheckt.' },
  { key: 'habitReminders', timeKey: 'habitTime', label: 'Gewoonte-herinneringen', hint: 'Gewoontes die nog openstaan, met streak op het spel.' },
  { key: 'urgentAlerts', label: 'Urgente signalen', hint: 'Betaling nadert, loop over deadline, project geblokkeerd — zodra het gebeurt.' },
]

const NUDGE_CATEGORIES: Array<{ key: NudgeCategory; label: string; hint: string }> = [
  { key: 'task', label: 'Taak/gewoonte-duwtjes', hint: 'Een open taak of nog niet afgevinkte gewoonte, op een willekeurig moment.' },
  { key: 'sharp', label: 'Keep-me-sharp', hint: 'Herinner je iets terug uit de Kennisbank, met een "toon antwoord"-knop.' },
  { key: 'suggestion', label: 'Suggesties', hint: 'Een lichte aanmoediging op basis van openstaande taken of lopende projecten.' },
  { key: 'checkin', label: 'Losse check-ins', hint: 'Tussentijdse "hoe is je energie nu?" — los van de vaste avond check-in.' },
]

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const { notificationPrefs, setNotificationPrefs, settings, setHourlyRate } = useStore()
  const p = notificationPrefs ?? DEFAULT_PREFS
  const linked = !!p.telegramChatId
  const quietOn = !!(p.quietHoursStart && p.quietHoursEnd)

  return (
    <Overlay
      tone="scrim-blur"
      onClose={onClose}
      className="flex items-center justify-center p-4 animate-fade-up"
      panelClassName="card shadow-card-lg max-w-lg w-full p-6 max-h-[85vh] overflow-y-auto"
    >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Instellingen</h2>
            <p className="text-sm text-muted mt-1">OSLIFE bereikt je proactief via Telegram — geen app hoeft open te staan.</p>
          </div>
          <button className="text-muted hover:text-ink" onClick={onClose} aria-label="Sluiten">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5">
          <SectionTitle hint="Ochtendbriefing, avond-check-in, gewoonte-herinneringen en urgente meldingen — allemaal via één bot.">
            Telegram
          </SectionTitle>

          {linked ? (
            <div className="rounded-2xl p-3 bg-buurtkaart/10 text-sm text-buurtkaart-deep">
              Gekoppeld als @{p.telegramUsername ?? 'onbekend'}
              {p.linkedAt && ` sinds ${p.linkedAt.slice(0, 10)}`}.
            </div>
          ) : (
            <div className="rounded-2xl p-3 bg-cross/10 space-y-2">
              <p className="text-sm text-ink">Nog niet gekoppeld. Open de bot en stuur <code>/start</code>.</p>
              {BOT_USERNAME ? (
                <a
                  href={`https://t.me/${BOT_USERNAME}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-primary !py-1.5 text-xs w-fit"
                >
                  <Send className="h-3.5 w-3.5" /> Open Telegram-bot
                </a>
              ) : (
                <p className="text-xs text-faint">Bot nog niet geconfigureerd (VITE_TELEGRAM_BOT_USERNAME ontbreekt).</p>
              )}
            </div>
          )}
        </div>

        <div className="mt-5 space-y-3">
          <SectionTitle>Meldingen</SectionTitle>
          {CATEGORIES.map((c) => (
            <div key={c.key} className="flex items-center justify-between gap-3 py-1.5 border-b border-line last:border-0">
              <div className="min-w-0">
                <div className="text-sm text-ink">{c.label}</div>
                <div className="text-xs text-faint">{c.hint}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {c.timeKey && (
                  <input
                    type="time"
                    className="input !py-1 !px-2 text-xs w-24"
                    value={p[c.timeKey] as string}
                    disabled={!p[c.key]}
                    onChange={(e) => setNotificationPrefs({ [c.timeKey!]: e.target.value } as Partial<NotificationPrefs>)}
                  />
                )}
                <input
                  type="checkbox"
                  className="accent-forest h-4 w-4"
                  checked={!!p[c.key]}
                  onChange={(e) => setNotificationPrefs({ [c.key]: e.target.checked } as Partial<NotificationPrefs>)}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5">
          <SectionTitle hint="Urgente signalen blijven stil binnen dit venster (ochtend/avond/gewoontes gaan gewoon door).">
            Stille uren
          </SectionTitle>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              className="accent-forest h-4 w-4"
              checked={quietOn}
              onChange={(e) =>
                setNotificationPrefs(
                  e.target.checked
                    ? { quietHoursStart: '22:00', quietHoursEnd: '07:00' }
                    : { quietHoursStart: null, quietHoursEnd: null },
                )
              }
            />
            <input
              type="time"
              className="input !py-1 !px-2 text-xs w-24"
              value={p.quietHoursStart ?? '22:00'}
              disabled={!quietOn}
              onChange={(e) => setNotificationPrefs({ quietHoursStart: e.target.value })}
            />
            <span className="text-xs text-faint">tot</span>
            <input
              type="time"
              className="input !py-1 !px-2 text-xs w-24"
              value={p.quietHoursEnd ?? '07:00'}
              disabled={!quietOn}
              onChange={(e) => setNotificationPrefs({ quietHoursEnd: e.target.value })}
            />
          </div>
        </div>

        <div className="mt-5">
          <SectionTitle hint="Willekeurige momenten door de dag heen, los van de vaste tijden hierboven — geen vast schema, gewoon af en toe een duwtje.">
            Nudges door de dag
          </SectionTitle>
          <div className="flex items-center justify-between gap-3 py-1.5">
            <div className="min-w-0">
              <div className="text-sm text-ink">Actief</div>
              <div className="text-xs text-faint">Respecteert je stille uren hierboven.</div>
            </div>
            <input
              type="checkbox"
              className="accent-forest h-4 w-4"
              checked={p.nudgesEnabled}
              onChange={(e) => setNotificationPrefs({ nudgesEnabled: e.target.checked })}
            />
          </div>
          {p.nudgesEnabled && (
            <>
              <label className="flex items-center justify-between gap-3 py-1.5 border-t border-line">
                <span className="text-sm text-ink">Ongeveer per dag</span>
                <input
                  type="number"
                  min={1}
                  max={12}
                  className="input !py-1 !px-2 text-sm w-16 text-right"
                  value={p.nudgesPerDay}
                  onChange={(e) => setNotificationPrefs({ nudgesPerDay: Math.min(12, Math.max(1, parseInt(e.target.value, 10) || 1)) })}
                />
              </label>
              <div className="space-y-2 pt-1">
                {NUDGE_CATEGORIES.map((c) => {
                  const checked = p.nudgeCategories.includes(c.key)
                  return (
                    <div key={c.key} className="flex items-center justify-between gap-3 py-1 border-b border-line last:border-0">
                      <div className="min-w-0">
                        <div className="text-sm text-ink">{c.label}</div>
                        <div className="text-xs text-faint">{c.hint}</div>
                      </div>
                      <input
                        type="checkbox"
                        className="accent-forest h-4 w-4 shrink-0"
                        checked={checked}
                        onChange={(e) =>
                          setNotificationPrefs({
                            nudgeCategories: e.target.checked
                              ? [...p.nudgeCategories, c.key]
                              : p.nudgeCategories.filter((k) => k !== c.key),
                          })
                        }
                      />
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>

        <div className="mt-5">
          <SectionTitle hint="Gebruikt om facturen te genereren uit ongefactureerde, declarabele uren.">
            Facturatie
          </SectionTitle>
          <label className="flex items-center justify-between gap-3 py-1.5">
            <span className="text-sm text-ink">Uurtarief (€)</span>
            <input
              type="number"
              min={0}
              step="1"
              className="input !py-1 !px-2 text-sm w-28 text-right"
              value={settings.hourlyRate || ''}
              onChange={(e) => setHourlyRate(parseFloat(e.target.value) || 0)}
              placeholder="0"
            />
          </label>
        </div>
    </Overlay>
  )
}

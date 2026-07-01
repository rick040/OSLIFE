import { useState, useEffect } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { useStore } from './store'
import LoginScreen from './components/LoginScreen'
import Dashboard from './views/Dashboard'
import Today from './views/Today'
import Tasks from './views/Tasks'
import Heyra from './views/Heyra'
import Capture from './views/Capture'
import Memory from './views/Memory'
import Reflect from './views/Reflect'
import DayBuilder from './views/DayBuilder'
import Vitals from './views/Vitals'
import Signals from './views/Signals'
import Money from './views/Money'
import Projects from './views/Projects'
import CRM from './views/CRM'
import Habits from './views/Habits'
import Dog from './views/Dog'
import StrategieHQ from './views/StrategieHQ'
import Buurtkaart from './views/Buurtkaart'
import Eyes from './views/Eyes'
import Dakmeester from './views/Dakmeester'
import InboxView from './views/Inbox'
import NorthStar from './views/NorthStar'
import Mindmap from './views/Mindmap'
import LoopExplainer from './components/LoopExplainer'
import Orb from './components/Orb'
import AppGrid from './components/AppGrid'
import { SCREENS, type View } from './nav'
import { Workflow, Play, RotateCcw, Grid3x3 } from 'lucide-react'

export default function App() {
  const [view, setView] = useState<View>('dashboard')
  const [showLoops, setShowLoops] = useState(false)
  const [showGrid, setShowGrid] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const { resetDemo, runNightlyReflect, reflectCount, loadLiveData, dataSource, isLoading, healthDays } = useStore()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthChecked(true)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session) loadLiveData()
  }, [session])

  const Current: Record<View, JSX.Element> = {
    dashboard: <Dashboard onNav={(v) => setView(v as View)} />,
    today: <Today onNav={(v) => setView(v as View)} />,
    tasks: <Tasks />,
    daybuilder: <DayBuilder />,
    vitals: <Vitals />,
    signals: <Signals />,
    money: <Money />,
    projects: <Projects />,
    inbox: <InboxView />,
    northstar: <NorthStar />,
    heyra: <Heyra onNav={(v) => setView(v as View)} />,
    capture: <Capture />,
    memory: <Memory />,
    reflect: <Reflect />,
    mindmap: <Mindmap />,
    // built in later phases
    habits: <Habits />,
    crm: <CRM />,
    strategiehq: <StrategieHQ onNav={(v) => setView(v)} />,
    buurtkaart: <Buurtkaart />,
    eyes: <Eyes />,
    dakmeester: <Dakmeester />,
    dog: <Dog />,
  }

  if (!authChecked) return (
    <div className="min-h-screen flex items-center justify-center bg-canvas">
      <div className="h-6 w-6 rounded-full border-2 border-forest border-t-transparent animate-spin" />
    </div>
  )

  if (!session) return <LoginScreen />

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-canvas">
      {/* sidebar (desktop) */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col bg-surface border-r border-line p-4 sticky top-0 h-screen">
        <div className="flex items-center gap-2.5 px-2 mb-7">
          <Orb size={36} onTap={() => setView('heyra')} onLongPress={() => setShowGrid(true)} />
          <div>
            <div className="font-semibold leading-tight tracking-tight">OSLIFE</div>
            <div className="text-[10px] leading-tight flex items-center gap-1">
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${dataSource === 'live' ? 'bg-forest' : 'bg-faint'}`} />
              <span className="text-faint">{dataSource === 'live' ? 'live data' : 'mock data'}</span>
            </div>
          </div>
          <button
            onClick={() => setShowGrid(true)}
            className="ml-auto text-faint hover:text-ink p-1.5 rounded-xl hover:bg-sunken"
            aria-label="Alle apps"
          >
            <Grid3x3 className="h-4 w-4" />
          </button>
        </div>

        <nav className="space-y-0.5 flex-1 overflow-y-auto -mr-2 pr-2">
          {SCREENS.map((n) => {
            const Icon = n.icon
            const active = view === n.id
            return (
              <button
                key={n.id}
                onClick={() => setView(n.id)}
                className={`group w-full flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-colors ${
                  active ? 'bg-forest text-white shadow-sm' : 'text-muted hover:text-ink hover:bg-sunken'
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-lime' : ''}`} />
                <span className="flex-1 text-left font-medium">{n.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="space-y-1.5 pt-3 border-t border-line">
          <button
            onClick={() => setShowLoops(true)}
            className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted hover:text-ink hover:bg-sunken"
          >
            <Workflow className="h-4 w-4" /> The two loops
          </button>
          <button
            onClick={runNightlyReflect}
            className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-cross hover:bg-cross/10"
          >
            <Play className="h-4 w-4" /> Run reflect {reflectCount > 0 && `(${reflectCount})`}
          </button>
          <button
            onClick={() => {
              if (confirm('Reset the demo to its seeded state? This clears anything you captured.')) resetDemo()
            }}
            className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-faint hover:text-ink hover:bg-sunken"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset demo
          </button>
        </div>
      </aside>

      {/* mobile top bar */}
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between border-b border-line bg-canvas/85 backdrop-blur px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Orb size={32} onTap={() => setView('heyra')} onLongPress={() => setShowGrid(true)} />
          <span className="font-semibold">OSLIFE</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowGrid(true)} className="text-muted" aria-label="Alle apps">
            <Grid3x3 className="h-5 w-5" />
          </button>
          <button onClick={() => setShowLoops(true)} className="text-muted">
            <Workflow className="h-5 w-5" />
          </button>
          <button onClick={runNightlyReflect} className="text-cross">
            <Play className="h-5 w-5" />
          </button>
          <button
            onClick={() => {
              if (confirm('Reset the demo?')) resetDemo()
            }}
            className="text-faint"
          >
            <RotateCcw className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* main */}
      <main className="flex-1 min-w-0 p-4 md:p-8 pb-24 md:pb-8">
        <div className="max-w-5xl mx-auto">
          {isLoading && healthDays.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-faint">
              <div className="h-6 w-6 rounded-full border-2 border-forest border-t-transparent animate-spin" />
              <p className="text-sm">Connecting to your data…</p>
            </div>
          ) : Current[view]}
        </div>
      </main>

      {/* mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-line bg-canvas/90 backdrop-blur flex">
        {SCREENS.filter((n) => n.primary).map((n) => {
          const Icon = n.icon
          const active = view === n.id
          return (
            <button
              key={n.id}
              onClick={() => setView(n.id)}
              className={`flex-1 min-w-0 flex flex-col items-center gap-0.5 py-2 text-[10px] ${
                active ? 'text-forest font-semibold' : 'text-faint'
              }`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="max-w-full truncate">{n.label}</span>
            </button>
          )
        })}
      </nav>

      {showLoops && <LoopExplainer onClose={() => setShowLoops(false)} />}
      {showGrid && <AppGrid active={view} onNav={(v) => setView(v)} onClose={() => setShowGrid(false)} />}
    </div>
  )
}

import { useState, useEffect } from 'react'
import { useStore } from './store'
import Dashboard from './views/Dashboard'
import Today from './views/Today'
import Jarvis from './views/Jarvis'
import Capture from './views/Capture'
import Memory from './views/Memory'
import Reflect from './views/Reflect'
import DayBuilder from './views/DayBuilder'
import Vitals from './views/Vitals'
import Signals from './views/Signals'
import Money from './views/Money'
import Projects from './views/Projects'
import InboxView from './views/Inbox'
import NorthStar from './views/NorthStar'
import Mindmap from './views/Mindmap'
import LoopExplainer from './components/LoopExplainer'
import {
  LayoutDashboard,
  MessageSquare,
  Inbox,
  Database,
  Brain,
  CalendarRange,
  RotateCcw,
  Workflow,
  Play,
  Gauge,
  Activity,
  Wallet,
  FolderKanban,
  Mail,
  Target,
  Network,
  Radar,
} from 'lucide-react'

type View =
  | 'dashboard'
  | 'today'
  | 'jarvis'
  | 'capture'
  | 'memory'
  | 'reflect'
  | 'daybuilder'
  | 'vitals'
  | 'signals'
  | 'money'
  | 'projects'
  | 'inbox'
  | 'northstar'
  | 'mindmap'

const NAV: { id: View; label: string; icon: typeof LayoutDashboard; layer: string; primary?: boolean }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: Gauge, layer: 'Surface · one glance', primary: true },
  { id: 'today', label: 'Today', icon: LayoutDashboard, layer: 'Surface' },
  { id: 'daybuilder', label: 'Day Builder', icon: CalendarRange, layer: 'Surface' },
  { id: 'vitals', label: 'Vitals', icon: Activity, layer: 'Life · health', primary: true },
  { id: 'signals', label: 'Signalen', icon: Radar, layer: 'Life · gedrag' },
  { id: 'money', label: 'Money', icon: Wallet, layer: 'Life · finance', primary: true },
  { id: 'projects', label: 'Projects', icon: FolderKanban, layer: 'Life · work', primary: true },
  { id: 'inbox', label: 'Inbox', icon: Mail, layer: 'Life · mail' },
  { id: 'northstar', label: 'North Star', icon: Target, layer: 'Life · goals' },
  { id: 'jarvis', label: 'Jarvis', icon: MessageSquare, layer: 'Intake · Understand' },
  { id: 'capture', label: 'Capture', icon: Inbox, layer: 'Intake', primary: true },
  { id: 'memory', label: 'Memory', icon: Database, layer: 'Remember' },
  { id: 'reflect', label: 'Reflect', icon: Brain, layer: 'Reflect' },
  { id: 'mindmap', label: 'Verbanden', icon: Network, layer: 'Reflect · graph' },
]

export default function App() {
  const [view, setView] = useState<View>('dashboard')
  const [showLoops, setShowLoops] = useState(false)
  const { resetDemo, runNightlyReflect, reflectCount, loadLiveData, dataSource } = useStore()

  useEffect(() => {
    loadLiveData()
  }, [])

  const Current = {
    dashboard: <Dashboard onNav={(v) => setView(v as View)} />,
    today: <Today onNav={(v) => setView(v as View)} />,
    jarvis: <Jarvis />,
    capture: <Capture />,
    memory: <Memory />,
    reflect: <Reflect />,
    daybuilder: <DayBuilder />,
    vitals: <Vitals />,
    signals: <Signals />,
    money: <Money />,
    projects: <Projects />,
    inbox: <InboxView />,
    northstar: <NorthStar />,
    mindmap: <Mindmap />,
  }[view]

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-canvas">
      {/* sidebar (desktop) */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col bg-surface border-r border-line p-4 sticky top-0 h-screen">
        <div className="flex items-center gap-2.5 px-2 mb-7">
          <div className="h-9 w-9 rounded-2xl bg-gradient-to-br from-forest to-lime flex items-center justify-center text-lg shadow-sm">
            🧠
          </div>
          <div>
            <div className="font-semibold leading-tight tracking-tight">RICK-OS</div>
            <div className="text-[10px] leading-tight flex items-center gap-1">
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${dataSource === 'live' ? 'bg-forest' : 'bg-faint'}`} />
              <span className="text-faint">{dataSource === 'live' ? 'live data' : 'mock data'}</span>
            </div>
          </div>
        </div>

        <nav className="space-y-0.5 flex-1">
          {NAV.map((n) => {
            const Icon = n.icon
            const active = view === n.id
            return (
              <button
                key={n.id}
                onClick={() => setView(n.id)}
                className={`group w-full flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-colors ${
                  active
                    ? 'bg-forest text-white shadow-sm'
                    : 'text-muted hover:text-ink hover:bg-sunken'
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
        <div className="flex items-center gap-2">
          <span className="text-lg">🧠</span>
          <span className="font-semibold">RICK-OS</span>
        </div>
        <div className="flex items-center gap-3">
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
        <div className="max-w-5xl mx-auto">{Current}</div>
      </main>

      {/* mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-line bg-canvas/90 backdrop-blur flex">
        {NAV.filter((n) => n.primary).map((n) => {
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
    </div>
  )
}

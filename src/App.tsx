import { useState } from 'react'
import { useStore } from './store'
import { useLiveSession } from './lib/useLiveSession'
import LoginScreen from './components/LoginScreen'
import Dashboard from './views/Dashboard'
import Tasks from './views/Tasks'
import Heyra from './views/Heyra'
import Capture from './views/Capture'
import ShareIntake from './views/ShareIntake'
import Memory from './views/Memory'
import Kennisbank from './views/Kennisbank'
import Reflect from './views/Reflect'
import DayBuilder from './views/DayBuilder'
import Vitals from './views/Vitals'
import Workout from './views/Workout'
import Money from './views/Money'
import Projects from './views/Projects'
import CRM from './views/CRM'
import Habits from './views/Habits'
import Cleaning from './views/Cleaning'
import Dog from './views/Dog'
import Locations from './views/Locations'
import StrategieHQ from './views/StrategieHQ'
import Buurtkaart from './views/Buurtkaart'
import InboxView from './views/Inbox'
import NorthStar from './views/NorthStar'
import ProfileScreen from './views/Profile'
import Mindmap from './views/Mindmap'
import Relaties from './views/Relaties'
import HuisAdmin from './views/HuisAdmin'
import RedesignDemo from './design-demo/RedesignDemo'
import TabletApp from './tablet/TabletApp'
import LoopExplainer from './components/LoopExplainer'
import SettingsModal from './components/SettingsModal'
import AppGrid from './components/AppGrid'
import SuggestionSplash from './components/SuggestionSplash'
import { ConfirmDialog } from './components/ui'
import { AppShell } from './components/layout/app-shell'
import { type View } from './nav'

export default function App() {
  const [view, setView] = useState<View>('dashboard')
  // PWA Web Share Target lands on /share (see public/sw.js + manifest).
  const [isShare, setIsShare] = useState(() => window.location.pathname === '/share')
  // Standalone redesign preview (docs/design.md Part 2) — no auth required
  // so it's reviewable without logging in. See src/design-demo/RedesignDemo.tsx.
  const isDesignDemo = window.location.pathname === '/design-demo'
  // Wall-mounted kiosk views (e.g. the gym tablet) — no nav chrome, own routing. See src/tablet/TabletApp.tsx.
  const isTablet = window.location.pathname.startsWith('/tablet')
  const [showLoops, setShowLoops] = useState(false)
  const [showGrid, setShowGrid] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  // Which reset-demo confirm to show: the sidebar's full text or the top bar's short one.
  const [confirmReset, setConfirmReset] = useState<'full' | 'short' | null>(null)
  const { resetDemo, runNightlyReflect, reflectCount, dataSource, isLoading, nudge } = useStore()
  const { session, authChecked } = useLiveSession()

  const Current: Record<View, JSX.Element> = {
    dashboard: <Dashboard onNav={(v) => setView(v as View)} />,
    tasks: <Tasks />,
    daybuilder: <DayBuilder />,
    vitals: <Vitals />,
    workout: <Workout />,
    money: <Money />,
    projects: <Projects />,
    inbox: <InboxView />,
    northstar: <NorthStar />,
    profile: <ProfileScreen />,
    heyra: <Heyra onNav={(v) => setView(v as View)} />,
    capture: <Capture />,
    memory: <Memory />,
    kennisbank: <Kennisbank />,
    reflect: <Reflect />,
    mindmap: <Mindmap />,
    // built in later phases
    habits: <Habits />,
    cleaning: <Cleaning />,
    crm: <CRM />,
    strategiehq: <StrategieHQ onNav={(v) => setView(v)} />,
    buurtkaart: <Buurtkaart />,
    dog: <Dog />,
    locations: <Locations />,
    relaties: <Relaties />,
    huisadmin: <HuisAdmin />,
  }

  if (isDesignDemo) return <RedesignDemo />

  if (isTablet) return <TabletApp />

  if (!authChecked) return (
    <div className="min-h-screen flex items-center justify-center bg-canvas">
      <div className="h-6 w-6 rounded-full border-2 border-forest border-t-transparent animate-spin" />
    </div>
  )

  if (!session) return <LoginScreen />

  if (isShare) return <ShareIntake onDone={() => { setIsShare(false); setView('capture') }} />

  return (
    <>
      <AppShell
        view={view}
        onNav={setView}
        email={session.user?.email}
        onShowGrid={() => setShowGrid(true)}
        onShowLoops={() => setShowLoops(true)}
        onRunReflect={runNightlyReflect}
        onShowSettings={() => setShowSettings(true)}
        onResetDemo={() => setConfirmReset('full')}
        reflectCount={reflectCount}
        dataSource={dataSource}
        nudge={nudge}
      >
        {isLoading ? (
          // Gated on isLoading alone, not "healthDays is empty" — a rehydrated
          // localStorage snapshot (or the demo-seed fallback in
          // applyPersistDefaults) is basically never actually empty, so that
          // extra condition meant this spinner almost never showed and the
          // screen would instead paint stale/cached numbers first, then jump
          // to the real ones once loadLiveData() resolved a moment later —
          // "the data shifts while I'm looking at it". isLoading reliably
          // starts true (seed()) and flips false exactly once, after the
          // first loadLiveData() completes (success or failure, see
          // store.ts) — later background refreshes (focus/5-min poll) don't
          // reset it, so this only gates the first paint, not every refetch.
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-faint">
            <div className="h-6 w-6 rounded-full border-2 border-forest border-t-transparent animate-spin" />
            <p className="text-sm">Connecting to your data…</p>
          </div>
        ) : Current[view]}
      </AppShell>

      {showLoops && <LoopExplainer onClose={() => setShowLoops(false)} />}
      {showGrid && <AppGrid active={view} onNav={(v) => setView(v)} onClose={() => setShowGrid(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      <SuggestionSplash />
      {confirmReset && (
        <ConfirmDialog
          title={confirmReset === 'full' ? 'Reset the demo to its seeded state?' : 'Reset the demo?'}
          message={confirmReset === 'full' ? 'This clears anything you captured.' : undefined}
          confirmLabel="Reset"
          onCancel={() => setConfirmReset(null)}
          onConfirm={() => { setConfirmReset(null); resetDemo() }}
        />
      )}
    </>
  )
}

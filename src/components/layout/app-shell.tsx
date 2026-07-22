import { useEffect, useState } from 'react'

import { SCREENS, type View } from '@/nav'
import type { Nudge } from '@/types'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { CommandMenu } from '@/components/layout/command-menu'
import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav'
import TimerWidget from '@/components/TimerWidget'

export interface AppShellProps {
  view: View
  onNav: (v: View) => void
  email?: string | null
  onShowGrid: () => void
  onShowLoops: () => void
  onRunReflect: () => void
  onShowSettings: () => void
  onResetDemo: () => void
  reflectCount: number
  dataSource: 'live' | 'mock'
  nudge: Nudge
  children: React.ReactNode
}

export function AppShell({
  view,
  onNav,
  email,
  onShowGrid,
  onShowLoops,
  onRunReflect,
  onShowSettings,
  onResetDemo,
  reflectCount,
  dataSource,
  nudge,
  children,
}: AppShellProps) {
  const [commandOpen, setCommandOpen] = useState(false)
  const screen = SCREENS.find((s) => s.id === view)

  // ⌘K / Ctrl+K opens the command palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setCommandOpen((o) => !o)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <SidebarProvider>
      <AppSidebar
        view={view}
        onNav={onNav}
        onShowGrid={onShowGrid}
        onShowLoops={onShowLoops}
        onRunReflect={onRunReflect}
        onShowSettings={onShowSettings}
        onResetDemo={onResetDemo}
        reflectCount={reflectCount}
        dataSource={dataSource}
        nudge={nudge}
      />
      <SidebarInset className="min-w-0">
        <AppHeader
          title={screen?.label ?? 'OSLIFE'}
          layer={screen?.layer}
          email={email}
          onOpenSearch={() => setCommandOpen(true)}
          onShowSettings={onShowSettings}
        />
        <main className="flex-1 overflow-x-hidden p-4 pb-24 md:p-6 md:pb-6 lg:p-8">
          <div className="mx-auto max-w-5xl">{children}</div>
        </main>
      </SidebarInset>

      <MobileBottomNav view={view} onNav={onNav} onShowGrid={onShowGrid} />
      <CommandMenu open={commandOpen} onOpenChange={setCommandOpen} onNav={onNav} />
      <TimerWidget />
    </SidebarProvider>
  )
}

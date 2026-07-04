import { Play, RotateCcw, Settings, Workflow, Grid3x3 } from 'lucide-react'

import { SCREENS, GROUP_ORDER, type View, type ScreenGroup } from '@/nav'
import Orb from '@/components/Orb'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'

// Human-readable section headers for the grouped nav.
const GROUP_LABELS: Record<ScreenGroup, string> = {
  Surface: 'Overzicht',
  Life: 'Leven',
  Business: 'Business',
  Intake: 'Vastleggen',
  Reflect: 'Reflectie',
}

export interface AppSidebarProps {
  view: View
  onNav: (v: View) => void
  onShowGrid: () => void
  onShowLoops: () => void
  onRunReflect: () => void
  onShowSettings: () => void
  onResetDemo: () => void
  reflectCount: number
  dataSource: 'live' | 'mock'
}

export function AppSidebar({
  view,
  onNav,
  onShowGrid,
  onShowLoops,
  onRunReflect,
  onShowSettings,
  onResetDemo,
  reflectCount,
  dataSource,
}: AppSidebarProps) {
  const { setOpenMobile, isMobile } = useSidebar()

  const go = (v: View) => {
    onNav(v)
    if (isMobile) setOpenMobile(false)
  }

  return (
    <Sidebar collapsible="icon" variant="floating">
      <SidebarHeader>
        <div className="flex items-center gap-2.5 px-1 py-1.5">
          <Orb
            size={32}
            onTap={() => go('heyra')}
            onLongPress={onShowGrid}
          />
          <div className="grid flex-1 leading-tight group-data-[collapsible=icon]:hidden">
            <span className="font-semibold tracking-tight">OSLIFE</span>
            <span className="flex items-center gap-1 text-[10px]">
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  dataSource === 'live' ? 'bg-forest' : 'bg-faint'
                }`}
              />
              <span className="text-faint">
                {dataSource === 'live' ? 'live data' : 'mock data'}
              </span>
            </span>
          </div>
          <button
            onClick={onShowGrid}
            className="ml-auto rounded-md p-1.5 text-faint hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:hidden"
            aria-label="Alle apps"
          >
            <Grid3x3 className="h-4 w-4" />
          </button>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {GROUP_ORDER.map((group) => {
          const items = SCREENS.filter((s) => s.group === group)
          if (!items.length) return null
          return (
            <SidebarGroup key={group}>
              <SidebarGroupLabel>{GROUP_LABELS[group]}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((n) => {
                    const Icon = n.icon
                    return (
                      <SidebarMenuItem key={n.id}>
                        <SidebarMenuButton
                          isActive={view === n.id}
                          tooltip={n.label}
                          onClick={() => go(n.id)}
                        >
                          <Icon />
                          <span>{n.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )
        })}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="De twee loops" onClick={onShowLoops}>
              <Workflow />
              <span>De twee loops</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Run reflect"
              onClick={onRunReflect}
              className="text-cross hover:text-cross"
            >
              <Play />
              <span>Run reflect{reflectCount > 0 ? ` (${reflectCount})` : ''}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Instellingen" onClick={onShowSettings}>
              <Settings />
              <span>Instellingen</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="sm"
              tooltip="Reset demo"
              onClick={onResetDemo}
              className="text-faint"
            >
              <RotateCcw />
              <span>Reset demo</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

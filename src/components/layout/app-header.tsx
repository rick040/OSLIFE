import { Search } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { ProfileDropdown } from '@/components/layout/profile-dropdown'

export interface AppHeaderProps {
  title: string
  layer?: string
  email?: string | null
  onOpenSearch: () => void
  onShowSettings: () => void
}

export function AppHeader({
  title,
  layer,
  email,
  onOpenSearch,
  onShowSettings,
}: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 h-6" />

      <div className="min-w-0">
        <h1 className="truncate text-base font-semibold leading-tight">
          {title}
        </h1>
        {layer && (
          <p className="truncate text-xs text-muted-foreground">{layer}</p>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="outline"
          onClick={onOpenSearch}
          className={cn(
            'relative h-9 justify-start rounded-full text-sm text-muted-foreground sm:w-56 sm:pr-12'
          )}
        >
          <Search className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline-flex">Zoeken…</span>
          <kbd className="pointer-events-none absolute right-1.5 top-1.5 hidden h-6 select-none items-center gap-1 rounded border bg-accent px-1.5 font-mono text-[10px] font-medium text-accent-foreground opacity-100 sm:flex">
            <span className="text-xs">⌘</span>K
          </kbd>
        </Button>
        <ThemeToggle />
        <ProfileDropdown email={email} onShowSettings={onShowSettings} />
      </div>
    </header>
  )
}

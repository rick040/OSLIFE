import { SCREENS, GROUP_ORDER, type View, type ScreenGroup } from '@/nav'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'

const GROUP_LABELS: Record<ScreenGroup, string> = {
  Surface: 'Overzicht',
  Life: 'Leven',
  Business: 'Business',
  Intake: 'Vastleggen',
  Reflect: 'Reflectie',
}

export interface CommandMenuProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onNav: (v: View) => void
}

export function CommandMenu({ open, onOpenChange, onNav }: CommandMenuProps) {
  const run = (fn: () => void) => {
    onOpenChange(false)
    fn()
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Zoek een scherm of actie…" />
      <CommandList>
        <CommandEmpty>Geen resultaten gevonden.</CommandEmpty>
        {GROUP_ORDER.map((group) => {
          const items = SCREENS.filter((s) => s.group === group)
          if (!items.length) return null
          return (
            <CommandGroup key={group} heading={GROUP_LABELS[group]}>
              {items.map((n) => {
                const Icon = n.icon
                return (
                  <CommandItem
                    key={n.id}
                    value={`${n.label} ${n.layer}`}
                    onSelect={() => run(() => onNav(n.id))}
                  >
                    <Icon />
                    <span>{n.label}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {n.layer}
                    </span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          )
        })}
      </CommandList>
    </CommandDialog>
  )
}

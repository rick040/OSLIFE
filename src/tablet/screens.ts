import type { ComponentType } from 'react'
import { Dumbbell, FolderKanban } from 'lucide-react'
import GymWorkoutKiosk from './GymWorkoutKiosk'
import ProjectDeskKiosk from './ProjectDeskKiosk'

/**
 * Registry of wall-mounted kiosk views, reached at /tablet/<key>. Each is a
 * standalone, read-mostly surface for one room's device (no nav chrome, no
 * editing) — the gym tablet is the first; more rooms/screens register here
 * as they're built. Visiting bare /tablet shows a picker built from this list.
 */
export interface TabletScreen {
  key: string
  label: string
  icon: ComponentType<{ className?: string }>
  component: ComponentType
}

export const TABLET_SCREENS: TabletScreen[] = [
  { key: 'workout', label: 'Workout', icon: Dumbbell, component: GymWorkoutKiosk },
  { key: 'projects', label: 'Projecten', icon: FolderKanban, component: ProjectDeskKiosk },
]

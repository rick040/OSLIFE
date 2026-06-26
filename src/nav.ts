import {
  Gauge,
  LayoutDashboard,
  CalendarRange,
  Activity,
  Radar,
  Wallet,
  FolderKanban,
  Users,
  Mail,
  Target,
  MessageSquare,
  Inbox,
  Database,
  Brain,
  Network,
  Repeat,
  Compass,
  Map,
  Eye,
  Home,
  Dog,
} from 'lucide-react'

// ── Central screen registry ──────────────────────────────────────────────────
// Single source of truth for routing, the sidebar nav and the HEYRA app-grid.
export type View =
  | 'dashboard'
  | 'today'
  | 'daybuilder'
  | 'vitals'
  | 'habits'
  | 'signals'
  | 'money'
  | 'crm'
  | 'projects'
  | 'inbox'
  | 'northstar'
  | 'strategiehq'
  | 'buurtkaart'
  | 'eyes'
  | 'dakmeester'
  | 'dog'
  | 'heyra'
  | 'capture'
  | 'memory'
  | 'reflect'
  | 'mindmap'

export type ScreenGroup = 'Surface' | 'Life' | 'Business' | 'Intake' | 'Reflect'

export interface Screen {
  id: View
  label: string
  icon: typeof Gauge
  layer: string
  group: ScreenGroup
  /** shown in the mobile bottom bar */
  primary?: boolean
  /** accent color token (tailwind text-* class) for the app-grid tile */
  accent: string
}

export const SCREENS: Screen[] = [
  // Surface
  { id: 'dashboard', label: 'Dashboard', icon: Gauge, layer: 'Surface · one glance', group: 'Surface', primary: true, accent: 'text-forest' },
  { id: 'today', label: 'Today', icon: LayoutDashboard, layer: 'Surface', group: 'Surface', accent: 'text-forest' },
  { id: 'daybuilder', label: 'Day Builder', icon: CalendarRange, layer: 'Surface', group: 'Surface', accent: 'text-forest' },

  // Life
  { id: 'vitals', label: 'Vitals', icon: Activity, layer: 'Life · health', group: 'Life', primary: true, accent: 'text-cross' },
  { id: 'habits', label: 'Habits', icon: Repeat, layer: 'Life · gedrag', group: 'Life', accent: 'text-buurtkaart' },
  { id: 'signals', label: 'Signalen', icon: Radar, layer: 'Life · gedrag', group: 'Life', accent: 'text-personal' },
  { id: 'money', label: 'Money', icon: Wallet, layer: 'Life · finance', group: 'Life', primary: true, accent: 'text-buurtkaart' },
  { id: 'dog', label: 'Kyra', icon: Dog, layer: 'Life · hond', group: 'Life', accent: 'text-personal' },
  { id: 'inbox', label: 'Inbox', icon: Mail, layer: 'Life · mail', group: 'Life', accent: 'text-parkingyou' },
  { id: 'northstar', label: 'North Star', icon: Target, layer: 'Life · goals', group: 'Life', accent: 'text-prjct' },

  // Business
  { id: 'crm', label: 'CRM', icon: Users, layer: 'Business · klanten', group: 'Business', primary: true, accent: 'text-prjct' },
  { id: 'projects', label: 'Projects', icon: FolderKanban, layer: 'Business · werk', group: 'Business', accent: 'text-prjct' },
  { id: 'strategiehq', label: 'Strategie HQ', icon: Compass, layer: 'Business · strategie', group: 'Business', accent: 'text-forest' },
  { id: 'buurtkaart', label: 'Buurtkaart', icon: Map, layer: 'Business · Geldrop', group: 'Business', accent: 'text-buurtkaart' },
  { id: 'eyes', label: 'The Eyes', icon: Eye, layer: 'Business · monitoring', group: 'Business', accent: 'text-cross' },
  { id: 'dakmeester', label: 'Dakmeester', icon: Home, layer: 'Business · klant', group: 'Business', accent: 'text-parkingyou' },

  // Intake
  { id: 'heyra', label: 'HEYRA', icon: MessageSquare, layer: 'Intake · Understand', group: 'Intake', accent: 'text-prjct' },
  { id: 'capture', label: 'Capture', icon: Inbox, layer: 'Intake', group: 'Intake', primary: true, accent: 'text-forest' },

  // Reflect
  { id: 'memory', label: 'Memory', icon: Database, layer: 'Remember', group: 'Reflect', accent: 'text-muted' },
  { id: 'reflect', label: 'Reflect', icon: Brain, layer: 'Reflect', group: 'Reflect', accent: 'text-cross' },
  { id: 'mindmap', label: 'Verbanden', icon: Network, layer: 'Reflect · graph', group: 'Reflect', accent: 'text-prjct' },
]

export const GROUP_ORDER: ScreenGroup[] = ['Surface', 'Life', 'Business', 'Intake', 'Reflect']

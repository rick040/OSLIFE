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
  CheckSquare,
  Signal,
  Sparkles,
} from 'lucide-react'

// ── Central screen registry ──────────────────────────────────────────────────
// Single source of truth for routing, the sidebar nav and the HEYRA app-grid.
export type View =
  | 'dashboard'
  | 'today'
  | 'tasks'
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
  | 'inferences'
  | 'sync'

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
  { id: 'dashboard', label: 'Dashboard', icon: Gauge, layer: 'Overzicht · één oogopslag', group: 'Surface', primary: true, accent: 'text-forest' },
  { id: 'today', label: 'Vandaag', icon: LayoutDashboard, layer: 'Overzicht', group: 'Surface', accent: 'text-forest' },
  { id: 'tasks', label: 'Taken', icon: CheckSquare, layer: 'Overzicht · taken', group: 'Surface', primary: true, accent: 'text-forest' },
  { id: 'daybuilder', label: 'Dagplanner', icon: CalendarRange, layer: 'Overzicht', group: 'Surface', accent: 'text-forest' },

  // Life
  { id: 'vitals', label: 'Gezondheid', icon: Activity, layer: 'Leven · gezondheid', group: 'Life', primary: true, accent: 'text-cross' },
  { id: 'habits', label: 'Gewoonten', icon: Repeat, layer: 'Leven · gedrag', group: 'Life', accent: 'text-buurtkaart' },
  { id: 'signals', label: 'Signalen', icon: Radar, layer: 'Leven · gedrag', group: 'Life', accent: 'text-personal' },
  { id: 'money', label: 'Geld', icon: Wallet, layer: 'Leven · financiën', group: 'Life', primary: true, accent: 'text-buurtkaart' },
  { id: 'dog', label: 'Kyra', icon: Dog, layer: 'Leven · hond', group: 'Life', accent: 'text-personal' },
  { id: 'inbox', label: 'Inbox', icon: Mail, layer: 'Leven · mail', group: 'Life', accent: 'text-parkingyou' },
  { id: 'northstar', label: 'Noordster', icon: Target, layer: 'Leven · doelen', group: 'Life', accent: 'text-prjct' },

  // Business
  { id: 'crm', label: 'CRM', icon: Users, layer: 'Business · klanten', group: 'Business', primary: true, accent: 'text-prjct' },
  { id: 'projects', label: 'Projecten', icon: FolderKanban, layer: 'Business · werk', group: 'Business', accent: 'text-prjct' },
  { id: 'strategiehq', label: 'Strategie HQ', icon: Compass, layer: 'Business · strategie', group: 'Business', accent: 'text-forest' },
  { id: 'buurtkaart', label: 'Buurtkaart', icon: Map, layer: 'Business · Geldrop', group: 'Business', accent: 'text-buurtkaart' },
  { id: 'eyes', label: 'The Eyes', icon: Eye, layer: 'Business · monitoring', group: 'Business', accent: 'text-cross' },
  { id: 'dakmeester', label: 'Dakmeester', icon: Home, layer: 'Business · klant', group: 'Business', accent: 'text-parkingyou' },

  // Intake
  { id: 'heyra', label: 'HEYRA', icon: MessageSquare, layer: 'Intake · Begrijpen', group: 'Intake', accent: 'text-prjct' },
  { id: 'capture', label: 'Vastleggen', icon: Inbox, layer: 'Intake', group: 'Intake', primary: true, accent: 'text-forest' },

  // Reflect
  { id: 'inferences', label: 'Inferenties', icon: Sparkles, layer: 'Reflectie · te bevestigen', group: 'Reflect', accent: 'text-cross' },
  { id: 'memory', label: 'Geheugen', icon: Database, layer: 'Herinnering', group: 'Reflect', accent: 'text-muted' },
  { id: 'reflect', label: 'Reflectie', icon: Brain, layer: 'Reflectie', group: 'Reflect', accent: 'text-cross' },
  { id: 'mindmap', label: 'Verbanden', icon: Network, layer: 'Reflectie · grafiek', group: 'Reflect', accent: 'text-prjct' },
  { id: 'sync', label: 'Databronnen', icon: Signal, layer: 'Systeem · sync-status', group: 'Reflect', accent: 'text-forest' },
]

export const GROUP_ORDER: ScreenGroup[] = ['Surface', 'Life', 'Business', 'Intake', 'Reflect']

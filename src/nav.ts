import {
  Gauge,
  CalendarRange,
  Activity,
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
  Dog,
  CheckSquare,
  Contact,
  FileText,
  SprayCan,
  BookOpen,
  Dumbbell,
} from 'lucide-react'

// ── Central screen registry ──────────────────────────────────────────────────
// Single source of truth for routing, the sidebar nav and the HEYRA app-grid.
export type View =
  | 'dashboard'
  | 'tasks'
  | 'daybuilder'
  | 'vitals'
  | 'workout'
  | 'habits'
  | 'cleaning'
  | 'money'
  | 'crm'
  | 'projects'
  | 'inbox'
  | 'northstar'
  | 'strategiehq'
  | 'buurtkaart'
  | 'dog'
  | 'relaties'
  | 'huisadmin'
  | 'heyra'
  | 'capture'
  | 'memory'
  | 'kennisbank'
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
  { id: 'dashboard', label: 'Dashboard', icon: Gauge, layer: 'Overzicht · één oogopslag', group: 'Surface', primary: true, accent: 'text-forest' },
  { id: 'tasks', label: 'Taken', icon: CheckSquare, layer: 'Overzicht · taken', group: 'Surface', primary: true, accent: 'text-forest' },
  { id: 'daybuilder', label: 'Dagplanner', icon: CalendarRange, layer: 'Overzicht', group: 'Surface', accent: 'text-forest' },

  // Life
  { id: 'vitals', label: 'Gezondheid', icon: Activity, layer: 'Leven · gezondheid, gedrag & schermtijd', group: 'Life', primary: true, accent: 'text-cross' },
  { id: 'workout', label: 'Workout', icon: Dumbbell, layer: 'Leven · training & spieren', group: 'Life', accent: 'text-cross' },
  { id: 'habits', label: 'Gewoonten', icon: Repeat, layer: 'Leven · gedrag', group: 'Life', accent: 'text-buurtkaart' },
  { id: 'cleaning', label: 'Schoonmaak', icon: SprayCan, layer: 'Leven · huishouden', group: 'Life', primary: true, accent: 'text-buurtkaart' },
  { id: 'money', label: 'Geld', icon: Wallet, layer: 'Leven · financiën', group: 'Life', primary: true, accent: 'text-buurtkaart' },
  { id: 'dog', label: 'Kyra', icon: Dog, layer: 'Leven · hond', group: 'Life', accent: 'text-personal' },
  { id: 'relaties', label: 'Relaties', icon: Contact, layer: 'Leven · mensen', group: 'Life', accent: 'text-prjct' },
  { id: 'huisadmin', label: 'Huis & Admin', icon: FileText, layer: 'Leven · admin', group: 'Life', accent: 'text-buurtkaart' },
  { id: 'inbox', label: 'Inbox', icon: Mail, layer: 'Leven · mail', group: 'Life', accent: 'text-parkingyou' },
  { id: 'northstar', label: 'Noordster', icon: Target, layer: 'Leven · doelen', group: 'Life', accent: 'text-prjct' },

  // Business
  { id: 'crm', label: 'CRM', icon: Users, layer: 'Business · klanten', group: 'Business', primary: true, accent: 'text-prjct' },
  { id: 'projects', label: 'Projecten', icon: FolderKanban, layer: 'Business · werk', group: 'Business', accent: 'text-prjct' },
  { id: 'strategiehq', label: 'Strategie HQ', icon: Compass, layer: 'Business · strategie', group: 'Business', accent: 'text-forest' },
  { id: 'buurtkaart', label: 'Buurtkaart', icon: Map, layer: 'Business · Geldrop', group: 'Business', accent: 'text-buurtkaart' },

  // Intake
  { id: 'heyra', label: 'HEYRA', icon: MessageSquare, layer: 'Intake · Begrijpen', group: 'Intake', accent: 'text-prjct' },
  { id: 'capture', label: 'Vastleggen', icon: Inbox, layer: 'Intake', group: 'Intake', primary: true, accent: 'text-forest' },

  // Reflect
  { id: 'memory', label: 'Geheugen', icon: Database, layer: 'Herinnering · incl. inferenties', group: 'Reflect', accent: 'text-muted' },
  { id: 'kennisbank', label: 'Kennisbank', icon: BookOpen, layer: 'Herinnering · uitgelichte inzichten', group: 'Reflect', accent: 'text-buurtkaart' },
  { id: 'reflect', label: 'Reflectie', icon: Brain, layer: 'Reflectie · incl. databronnen', group: 'Reflect', accent: 'text-cross' },
  { id: 'mindmap', label: 'Verbanden', icon: Network, layer: 'Reflectie · grafiek', group: 'Reflect', accent: 'text-prjct' },
]

export const GROUP_ORDER: ScreenGroup[] = ['Surface', 'Life', 'Business', 'Intake', 'Reflect']

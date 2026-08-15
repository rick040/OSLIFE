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
  MapPin,
  Dog,
  Fingerprint,
  CheckSquare,
  Contact,
  FileText,
  SprayCan,
  BookOpen,
  Dumbbell,
  Bot,
  Archive,
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
  | 'locations'
  | 'relaties'
  | 'huisadmin'
  | 'profile'
  | 'heyra'
  | 'capture'
  | 'claudelog'
  | 'memory'
  | 'kennisbank'
  | 'reflect'
  | 'mindmap'
  | 'archief'

export type ScreenGroup = 'Surface' | 'Life' | 'Business' | 'Intake' | 'Reflect' | 'Archief'

export interface Screen {
  id: View
  label: string
  icon: typeof Gauge
  layer: string
  group: ScreenGroup
  /**
   * Shown in the mobile bottom bar. Capped at 4 (+ "Meer") by
   * mobile-bottom-nav — a fifth `primary` screen silently falls off the bar,
   * so this flag is a real budget, not a label.
   *
   * Prominence is earned by writes, not by intent: a screen keeps its slot
   * while it's still being used and loses it when it isn't. See
   * docs/REDESIGN-PLAN.md §"Phase 0".
   */
  primary?: boolean
  /**
   * Parked: still routable (deep links and `onNav` keep working), but absent
   * from the sidebar, the app grid, the command menu and the bottom bar.
   * Reachable via the Archief screen or `?view=<id>`.
   *
   * This is a navigation flag only — no code, tables or data are removed.
   * Archived screens are up for review on 2026-09-15, once `screen_views`
   * has real read telemetry to judge them by.
   */
  archived?: boolean
  /** accent color token (tailwind text-* class) for the app-grid tile */
  accent: string
  /** needs more than the default max-w-5xl reading width (e.g. a desk-style multi-column layout) */
  wide?: boolean
}

export const SCREENS: Screen[] = [
  // Surface
  { id: 'dashboard', label: 'Dashboard', icon: Gauge, layer: 'Overzicht · één oogopslag', group: 'Surface', primary: true, accent: 'text-forest' },
  { id: 'tasks', label: 'Taken', icon: CheckSquare, layer: 'Overzicht · taken', group: 'Surface', primary: true, accent: 'text-forest' },
  { id: 'daybuilder', label: 'Dagplanner', icon: CalendarRange, layer: 'Overzicht', group: 'Surface', archived: true, accent: 'text-forest' },

  // Life
  { id: 'vitals', label: 'Gezondheid', icon: Activity, layer: 'Leven · gezondheid, gedrag & schermtijd', group: 'Life', accent: 'text-cross' },
  { id: 'workout', label: 'Workout', icon: Dumbbell, layer: 'Leven · training & spieren', group: 'Life', archived: true, accent: 'text-cross' },
  { id: 'habits', label: 'Gewoonten', icon: Repeat, layer: 'Leven · gedrag', group: 'Life', archived: true, accent: 'text-buurtkaart' },
  { id: 'cleaning', label: 'Schoonmaak', icon: SprayCan, layer: 'Leven · huishouden', group: 'Life', archived: true, accent: 'text-buurtkaart' },
  { id: 'money', label: 'Geld', icon: Wallet, layer: 'Leven · financiën', group: 'Life', primary: true, accent: 'text-buurtkaart' },
  { id: 'dog', label: 'Kyra', icon: Dog, layer: 'Leven · hond', group: 'Life', accent: 'text-personal' },
  { id: 'locations', label: 'Locaties', icon: MapPin, layer: 'Leven · bezochte plekken', group: 'Life', accent: 'text-parkingyou' },
  { id: 'relaties', label: 'Relaties', icon: Contact, layer: 'Leven · mensen', group: 'Life', archived: true, accent: 'text-prjct' },
  { id: 'huisadmin', label: 'Huis & Admin', icon: FileText, layer: 'Leven · admin', group: 'Life', archived: true, accent: 'text-buurtkaart' },
  { id: 'inbox', label: 'Inbox', icon: Mail, layer: 'Leven · mail', group: 'Life', accent: 'text-parkingyou' },
  { id: 'northstar', label: 'Noordster', icon: Target, layer: 'Leven · doelen', group: 'Life', archived: true, accent: 'text-prjct' },
  { id: 'profile', label: 'Profiel', icon: Fingerprint, layer: 'Leven · wie je nu bent & wordt', group: 'Life', accent: 'text-personal' },

  // Business
  { id: 'crm', label: 'CRM', icon: Users, layer: 'Business · klanten', group: 'Business', accent: 'text-prjct', wide: true },
  { id: 'projects', label: 'Projecten', icon: FolderKanban, layer: 'Business · werk', group: 'Business', accent: 'text-prjct', wide: true },
  { id: 'strategiehq', label: 'Strategie HQ', icon: Compass, layer: 'Business · strategie', group: 'Business', accent: 'text-forest' },
  { id: 'buurtkaart', label: 'Buurtkaart', icon: Map, layer: 'Business · Geldrop', group: 'Business', accent: 'text-buurtkaart' },

  // Intake
  { id: 'heyra', label: 'HEYRA', icon: MessageSquare, layer: 'Intake · Begrijpen', group: 'Intake', accent: 'text-prjct' },
  { id: 'capture', label: 'Vastleggen', icon: Inbox, layer: 'Intake', group: 'Intake', primary: true, accent: 'text-forest' },

  // Reflect
  { id: 'claudelog', label: 'Claude', icon: Bot, layer: 'Herinnering · Claude-gesprekken', group: 'Reflect', accent: 'text-muted' },
  { id: 'memory', label: 'Geheugen', icon: Database, layer: 'Herinnering · incl. inferenties', group: 'Reflect', accent: 'text-muted' },
  { id: 'kennisbank', label: 'Kennisbank', icon: BookOpen, layer: 'Herinnering · uitgelichte inzichten', group: 'Reflect', accent: 'text-buurtkaart' },
  { id: 'reflect', label: 'Reflectie', icon: Brain, layer: 'Reflectie · incl. databronnen', group: 'Reflect', accent: 'text-cross' },
  { id: 'mindmap', label: 'Verbanden', icon: Network, layer: 'Reflectie · grafiek', group: 'Reflect', accent: 'text-prjct' },

  // Archief — the index of parked screens. Not itself archived: it's the way back in.
  { id: 'archief', label: 'Archief', icon: Archive, layer: 'Geparkeerd · niets verwijderd', group: 'Archief', accent: 'text-muted' },
]

export const GROUP_ORDER: ScreenGroup[] = ['Surface', 'Life', 'Business', 'Intake', 'Reflect', 'Archief']

/**
 * The screens navigation actually offers. Every nav surface (sidebar, app
 * grid, command menu, bottom bar) renders from this, never from `SCREENS`
 * directly — that's what makes `archived` mean something.
 *
 * `SCREENS` stays complete so routing, deep links and the header title keep
 * resolving for archived screens.
 */
export const NAV_SCREENS: Screen[] = SCREENS.filter((s) => !s.archived)

/** The parked screens, for the Archief index. */
export const ARCHIVED_SCREENS: Screen[] = SCREENS.filter((s) => s.archived)

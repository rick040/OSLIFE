import { Car, Briefcase, MapPin, Heart, Shuffle, type LucideIcon } from 'lucide-react'
import type { Domain } from '../../types'

/**
 * One real icon per life-domain "skill" — RuneScape identifies each skill by
 * its own icon (not a color swatch), and a colored dot alone doesn't scale
 * as a recognizable identity once there are level badges, quest chips and
 * tree nodes all needing to say "this is ParkingYou" at a glance.
 */
export const DOMAIN_ICON: Record<Domain, LucideIcon> = {
  parkingyou: Car,
  prjct: Briefcase,
  buurtkaart: MapPin,
  personal: Heart,
  cross: Shuffle,
}

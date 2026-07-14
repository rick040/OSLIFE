// ── ADHD-proof daily cleaning schedule ───────────────────────────────────────
// Static content: a fixed 15-min-a-day rotation, one zone per weekday. Every
// task has a stable `key` so a completion can be logged against it forever,
// independent of any later wording tweaks to the `label`.

export interface CleaningTask {
  key: string
  label: string
}

export interface CleaningZone {
  /** matches Date#getDay(): 0 = Sunday … 6 = Saturday */
  day: number
  emoji: string
  title: string
  subtitle: string
  minutes: number
  /** domain-palette color token (e.g. 'buurtkaart') used for accents/rings/chips */
  accent: string
  tasks: CleaningTask[]
}

export const DAILY_BASELINE: CleaningTask[] = [
  { key: 'daily-morning', label: 'Morning: pull up the duvet, smooth the bedsheets, and arrange pillows.' },
  { key: 'daily-evening', label: 'Evening: wipe out the bathroom sink with a cloth or paper towel right after brushing teeth.' },
  { key: 'daily-night', label: 'Night: clear the kitchen sink. Load the dishwasher and run it.' },
]

export const ZONES: CleaningZone[] = [
  {
    day: 1,
    accent: 'parkingyou',
    emoji: '🚿',
    title: 'The Spa',
    subtitle: 'Bathrooms',
    minutes: 15,
    tasks: [
      { key: 'mon-clear', label: 'Clear: remove everything from the sink counter.' },
      { key: 'mon-spray', label: 'Spray: mist the sink, shower/tub floor, and toilet with all-purpose cleaner.' },
      { key: 'mon-wipe-sink', label: 'Wipe: wipe the sink and counter.' },
      { key: 'mon-wipe-toilet', label: 'Wipe: wipe the toilet (start at the flush handle, move down to the base).' },
      { key: 'mon-shine', label: 'Shine: spray glass cleaner on the mirror and faucet. Wipe until streak-free.' },
      { key: 'mon-stage', label: 'Stage: fold and hang fresh towels perfectly straight. Align soap and lotions so labels face forward.' },
    ],
  },
  {
    day: 2,
    accent: 'personal',
    emoji: '🍽️',
    title: 'The Restaurant',
    subtitle: 'Kitchen',
    minutes: 15,
    tasks: [
      { key: 'tue-clear', label: 'Clear: remove mail, keys, or non-kitchen items from the counters (basket or their proper home).' },
      { key: 'tue-wipe', label: 'Wipe: spray and wipe the kitchen counters and stove top.' },
      { key: 'tue-shine', label: 'Shine: wipe fingerprints off the fridge, microwave, and dishwasher fronts.' },
      { key: 'tue-purge', label: 'Purge: open the fridge, grab 1-2 expired or fuzzy items, and throw them away.' },
      { key: 'tue-stage', label: 'Stage: fold the dish towel over the oven handle. Group counter items (oils, syrups) tightly on a tray.' },
    ],
  },
  {
    day: 3,
    accent: 'buurtkaart',
    emoji: '🛋️',
    title: 'The Lounge',
    subtitle: 'Living area',
    minutes: 15,
    tasks: [
      { key: 'wed-clear', label: 'Clear: clear the coffee table and end tables of mugs, wrappers, and clutter.' },
      { key: 'wed-dust', label: 'Dust: quick swipe of the coffee table and TV stand with a microfiber cloth.' },
      { key: 'wed-floor', label: 'Floor: spot-vacuum or sweep the highest-traffic area or center rug (don’t move furniture).' },
      { key: 'wed-stage', label: 'Stage: fold throw blankets over the back of the couch, karate-chop the pillows, square up any books.' },
    ],
  },
  {
    day: 4,
    accent: 'prjct',
    emoji: '🛏️',
    title: 'The Suite',
    subtitle: 'Bedrooms',
    minutes: 15,
    tasks: [
      { key: 'thu-clear', label: 'Clear: nightstands of glasses, receipts, clutter — only lamp, clock, current book stay.' },
      { key: 'thu-tidy', label: 'Tidy: pick up clothes from the floor or “the chair” — hamper or hang them up.' },
      { key: 'thu-dust', label: 'Dust: quick wipe of the nightstands and the top of the dresser.' },
      { key: 'thu-stage', label: 'Stage: straighten curtains/blinds. Line up slippers or shoes neatly by the bed or closet.' },
    ],
  },
  {
    day: 5,
    accent: 'cross',
    emoji: '🗑️',
    title: 'The Grounds',
    subtitle: 'Trash & reset',
    minutes: 15,
    tasks: [
      { key: 'fri-empty', label: 'Empty: walk the house with a bag and empty every small trash can (bathrooms, office, bedrooms).' },
      { key: 'fri-floor', label: 'Floor: 5-minute speed sweep/vacuum of the main hallway and entryway.' },
      { key: 'fri-detail', label: 'Detail: wipe the front door handle and hallway light switches.' },
      { key: 'fri-stage', label: 'Stage: fluff the entryway mat and straighten shoes by the front door.' },
    ],
  },
  {
    day: 6,
    accent: 'faint',
    emoji: '🛑',
    title: 'Do Not Disturb',
    subtitle: 'Rest day',
    minutes: 0,
    tasks: [{ key: 'sat-rest', label: 'Rest and enjoy your space — baseline only today.' }],
  },
  {
    day: 0,
    accent: 'forest',
    emoji: '📝',
    title: 'Inventory & Prep',
    subtitle: 'Restock & reset',
    minutes: 10,
    tasks: [
      { key: 'sun-restock', label: 'Restock: check toilet paper, paper towels, soap — refill or replace for the week.' },
      { key: 'sun-trash', label: 'Trash: take the main kitchen garbage and Friday’s collected trash to the outside bin.' },
      { key: 'sun-reset', label: 'Reset: rebuild the cleaning caddy so it’s fully ready for Monday.' },
    ],
  },
]

export function zoneForDay(day: number): CleaningZone {
  return ZONES.find((z) => z.day === day) ?? ZONES[0]
}

export function zoneForDate(iso: string): CleaningZone {
  return zoneForDay(new Date(iso + 'T00:00:00').getDay())
}

/** Baseline + that date's zone tasks, in the order they should be worked. */
export function tasksForDate(iso: string): CleaningTask[] {
  return [...DAILY_BASELINE, ...zoneForDate(iso).tasks]
}

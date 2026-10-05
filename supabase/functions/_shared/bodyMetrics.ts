/**
 * Smart-scale body-composition fields for health_body_metrics, shared by
 * weight-ingest (MacroDroid) and health-ingest (Tasker / Health sheet).
 * Columns added in migration 20261006100000_body_composition.sql.
 *
 * Each field has a plausible range: a value outside it (a misparsed number, a
 * scale glitch) is dropped on its own rather than rejecting the whole reading.
 */

export const BODY_FIELDS = {
  bmi: [10, 70],
  muscle_mass_kg: [5, 150],
  muscle_pct: [5, 90],
  skeletal_muscle_kg: [5, 100],
  skeletal_muscle_pct: [5, 80],
  fat_free_mass_kg: [15, 200],
  body_water_pct: [20, 85],
  bone_mass_kg: [0.5, 10],
  protein_pct: [5, 40],
  subcutaneous_fat_pct: [1, 60],
  visceral_fat: [1, 60],
  bmr_kcal: [500, 5000],
  metabolic_age: [10, 100],
} as const satisfies Record<string, readonly [number, number]>

export type BodyField = keyof typeof BODY_FIELDS
export type BodyFields = Partial<Record<BodyField, number>>

const INTEGER_FIELDS: BodyField[] = ['bmr_kcal', 'metabolic_age']

function inRange(field: BodyField, v: unknown): number | undefined {
  const isInt = INTEGER_FIELDS.includes(field)
  // "1.820" kcal is a thousands separator, "82,3" a decimal comma.
  const n = typeof v === 'string' ? parseFloat(isInt ? v.replace(/[.,](?=\d{3}\b)/g, '') : v.replace(',', '.')) : v
  if (typeof n !== 'number' || !Number.isFinite(n)) return undefined
  const [min, max] = BODY_FIELDS[field]
  if (n < min || n > max) return undefined
  return isInt ? Math.round(n) : n
}

/**
 * The body-composition fields present (and plausible) in a structured payload.
 * Only measured fields are returned, so a weight-only reading upserts exactly
 * the columns it always did — that also keeps it working on a database where
 * the migration hasn't run yet.
 */
export function pickBodyFields(src: Record<string, unknown>): BodyFields {
  const out: BodyFields = {}
  for (const field of Object.keys(BODY_FIELDS) as BodyField[]) {
    const v = inRange(field, src[field])
    if (v !== undefined) out[field] = v
  }
  return out
}

const NUM = String.raw`(\d{1,4}(?:[.,]\d{1,2})?)`

/**
 * Labelled values in free-form notification text (NL + EN), e.g.
 * "Spierpercentage 41,2% · Lichaamswater 55,1% · BMR 1820 kcal". Unlabelled
 * numbers are never guessed at — a scale app that only says "82,3 kg" just
 * yields an empty object here.
 */
const TEXT_PATTERNS: [BodyField, RegExp][] = [
  ['skeletal_muscle_pct', new RegExp(String.raw`(?:skeletspier\w*|skeletal muscle\w*)\D{0,15}?${NUM}\s*%`, 'i')],
  ['skeletal_muscle_kg', new RegExp(String.raw`(?:skeletspier\w*|skeletal muscle\w*)\D{0,15}?${NUM}\s*kg`, 'i')],
  ['muscle_pct', new RegExp(String.raw`(?<!skelet)(?<!skeletal )(?:spier\w*|muscle(?: rate| ratio| mass)?)\D{0,15}?${NUM}\s*%`, 'i')],
  ['muscle_mass_kg', new RegExp(String.raw`(?<!skelet)(?<!skeletal )(?:spier\w*|muscle(?: mass)?)\D{0,15}?${NUM}\s*kg`, 'i')],
  ['fat_free_mass_kg', new RegExp(String.raw`(?:vetvrij\w*(?: massa| gewicht)?|fat[- ]free (?:mass|weight)|lean (?:body )?mass)\D{0,15}?${NUM}\s*kg`, 'i')],
  ['body_water_pct', new RegExp(String.raw`(?:lichaamswater|vocht\w*|(?:body )?water)\D{0,15}?${NUM}\s*%`, 'i')],
  ['bone_mass_kg', new RegExp(String.raw`(?:botmassa|bot|bone(?: mass)?)\D{0,15}?${NUM}\s*kg`, 'i')],
  ['protein_pct', new RegExp(String.raw`(?:eiwit\w*|prote[iï]ne?)\D{0,15}?${NUM}\s*%`, 'i')],
  ['subcutaneous_fat_pct', new RegExp(String.raw`(?:onderhuids\w* vet|subcuta\w* (?:vet|fat))\D{0,15}?${NUM}\s*%`, 'i')],
  ['visceral_fat', new RegExp(String.raw`(?:viscera\w*(?: vet| fat)?)\D{0,15}?${NUM}(?![\d.,]*\s*%)`, 'i')],
  ['bmr_kcal', new RegExp(String.raw`(?:bmr|basa\w*(?: metabol\w*)?|rustverbranding)\D{0,15}?(\d{1,2}[.,]\d{3}|\d{3,4})`, 'i')],
  ['bmi', new RegExp(String.raw`\bbmi\D{0,8}?${NUM}`, 'i')],
  ['metabolic_age', new RegExp(String.raw`(?:metabole leeftijd|lichaamsleeftijd|metabolic age|body age)\D{0,10}?${NUM}`, 'i')],
]

export function parseBodyFieldsFromText(text: string): BodyFields {
  const raw: Record<string, string> = {}
  for (const [field, re] of TEXT_PATTERNS) {
    const m = text.match(re)
    if (m) raw[field] = m[1]
  }
  return pickBodyFields(raw)
}

/**
 * Body-fat % from notification text: a labelled value wins ("vet 18,2%",
 * "body fat: 18.2 %"); without a label, only an unambiguous single
 * percentage counts — with several (muscle, water, …) we'd just be guessing.
 */
export function parseBodyFatFromText(text: string): number | null {
  const labelled = text.match(
    new RegExp(String.raw`(?<!onderhuids |subcutaan |subcutaneous |visceraal |visceral )(?:lichaamsvet\w*|vetpercentage|body fat\w*|vet|fat)\D{0,15}?(\d{1,2}(?:[.,]\d{1,2})?)\s*%`, 'i'),
  )
  const all = [...text.matchAll(/(\d{1,2}(?:[.,]\d{1,2})?)\s*%/g)]
  const raw = labelled?.[1] ?? (all.length === 1 ? all[0][1] : null)
  if (raw == null) return null
  const n = parseFloat(raw.replace(',', '.'))
  return Number.isFinite(n) && n >= 1 && n <= 75 ? n : null
}

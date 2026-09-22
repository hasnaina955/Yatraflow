// ============ Seasonality - what the month means for this route ============
// The line under the dates: "Feb - the best window for Kerala" or "Jun - full
// monsoon on the coast: green, cheap, wet". Competence display, honestly
// sourced: this is climatology a well-travelled planner would tell you, not a
// marketing claim and never a fabricated "best time to book".
//
// CONTRACT:
//  - No note for a region we do not know. Silence beats a generic filler line.
//  - A month is judged by the region's own seasons, and the note says what the
//    weather DOES (heat, monsoon, snowbound passes) rather than rating it.
//  - Pure module: no react/network imports, node-testable.

export interface Seasonality {
  /** Keywords matched against "City, State" strings, lowercase. */
  matches: readonly string[]
  label: string
  /** Months (1-12) that are the region's good window. */
  best: readonly number[]
  /** Months to think twice about, with the reason in `note`. */
  caution: readonly number[]
  /** One honest sentence about the month's conditions. */
  note: string
}

export const SEASONALITY: readonly Seasonality[] = [
  {
    matches: ['kerala', 'kochi', 'munnar', 'alleppey', 'alappuzha', 'kozhikode', 'wayanad', 'thekkady'],
    label: 'Kerala',
    best: [11, 12, 1, 2, 3],
    caution: [6, 7, 8],
    note: 'November to March is the dry window; June to August is the full monsoon - green, cheap and very wet.',
  },
  {
    matches: ['rajasthan', 'jaipur', 'jodhpur', 'udaipur', 'jaisalmer', 'bikaner', 'pushkar'],
    label: 'Rajasthan',
    best: [10, 11, 12, 1, 2, 3],
    caution: [5, 6],
    note: 'October to March is the comfortable window; May and June push past 45C in the day.',
  },
  {
    matches: ['himachal', 'manali', 'shimla', 'spiti', 'kaza', 'kasol', 'dharamshala', 'kullu'],
    label: 'Himachal',
    best: [4, 5, 6, 9, 10],
    caution: [7, 8],
    note: 'April to June and September to October are the sweet spots; July and August bring landslides and washed-out passes.',
  },
  {
    matches: ['goa', 'panaji', 'palolem', 'gokarna', 'karnataka', 'mangalore', 'udupi', 'konkan'],
    label: 'the Konkan coast',
    best: [11, 12, 1, 2],
    caution: [6, 7, 8, 9],
    note: 'November to February is the season; the monsoon shuts most beach shacks and much of the coast road is wet.',
  },
  {
    matches: ['ladakh', 'leh', 'nubra', 'hanle', 'kargil', 'zanskar'],
    label: 'Ladakh',
    best: [6, 7, 8, 9],
    caution: [1, 2, 12],
    note: 'June to September only - the passes are snowbound the rest of the year and most stays close.',
  },
  {
    matches: ['tamil nadu', 'chennai', 'madurai', 'kanyakumari', 'ooty', 'coimbatore', 'rameswaram'],
    label: 'Tamil Nadu',
    best: [11, 12, 1, 2],
    caution: [4, 5, 10],
    note: 'November to February is the cool window; April and May are the hottest months, and October is the north-east monsoon.',
  },
  {
    matches: ['meghalaya', 'shillong', 'cherrapunji', 'sohra', 'assam', 'kaziranga', 'guwahati'],
    label: 'the North-East',
    best: [10, 11, 12, 1, 2, 3],
    caution: [6, 7, 8],
    note: 'October to March is the dry window; June to August is the heaviest rain on earth, and Cherrapunji earns it.',
  },
]

/** Which region's seasons a trip's places belong to, or null. */
export function seasonalityFor(places: readonly string[]): Seasonality | null {
  const hay = places.join(' ').toLowerCase()
  if (!hay.trim()) return null
  for (const s of SEASONALITY) {
    if (s.matches.some(m => hay.includes(m))) return s
  }
  return null
}

/** The line for a month (1-12). Null when we have no region, or no view on the
 *  month - both are honest silences. */
export function seasonNoteFor(places: readonly string[], month: number): string | null {
  const s = seasonalityFor(places)
  if (!s) return null
  if (!Number.isFinite(month) || month < 1 || month > 12) return null
  const m = Math.round(month)
  if (s.caution.includes(m)) return `Heads up: ${monthName(m)} is in ${s.label}'s rough stretch - ${s.note}`
  if (s.best.includes(m)) return `${monthName(m)} is a good window for ${s.label} - ${s.note}`
  return `${monthName(m)} sits between ${s.label}'s best months - ${s.note}`
}

const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function monthName(month: number): string {
  if (!Number.isFinite(month) || month < 1 || month > 12) return ''
  return MONTHS[Math.round(month)]
}

/** Month (1-12) from an ISO date, or null. */
export function monthOfIso(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(iso)
  if (!m) return null
  const month = Number(m[2])
  return month >= 1 && month <= 12 ? month : null
}

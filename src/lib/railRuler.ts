// Corridor marks for the rail ruler: where each suggestion sits along the drive.
//
// The ruler is the rail's sense of place. It reads the same cumulative km the
// cards already show, so a dot can never disagree with the number on the card.

export interface RulerInput {
  id: string
  /** along-route km for this suggestion; null when it is off the polyline */
  km: number | null
  /** halt purpose from the ride plan, which decides the dot's tone */
  purpose: string
}

export interface RulerMark {
  id: string
  /** position along the drive, 0 to 100 */
  pct: number
  tone: 'need' | 'meal' | 'see'
}

const MEAL_PURPOSES = new Set(['meal', 'food'])
const SEE_PURPOSES = new Set(['sight', 'sightseeing', 'scenic', 'detour'])

/**
 * Marks for one rail, clamped to the drive and rounded to a tenth of a percent
 * so React keys and inline styles stay stable between renders.
 */
export function rulerMarks(items: RulerInput[], planKm: number): RulerMark[] {
  if (!(planKm > 0)) return []
  const marks: RulerMark[] = []
  for (const item of items) {
    if (item.km == null || !Number.isFinite(item.km)) continue
    const raw = (item.km / planKm) * 100
    const pct = Math.round(Math.max(0, Math.min(100, raw)) * 10) / 10
    const tone: RulerMark['tone'] = MEAL_PURPOSES.has(item.purpose)
      ? 'meal'
      : SEE_PURPOSES.has(item.purpose)
        ? 'see'
        : 'need'
    marks.push({ id: item.id, pct, tone })
  }
  return marks
}

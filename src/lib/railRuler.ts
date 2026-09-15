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

/** Step between nudged dots sharing one position (#155), in pct points. */
const COLLISION_STEP = 1.2

/**
 * Marks for one rail, clamped to the drive and rounded to a tenth of a percent
 * so React keys and inline styles stay stable between renders.
 *
 * #155: two suggestions at the same km used to render two dots at one `left:%`
 * — visually one dot, silently undercounting the cards. Exact-equal positions
 * are nudged apart in centred `COLLISION_STEP` steps (a folded meal+fuel pair
 * reads as two adjacent dots, never one).
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
  // Nudge exact-equal positions apart, centred on the shared spot. Groups are
  // order-stable (input order), so a re-render never reshuffles the dots.
  const byPct = new Map<number, RulerMark[]>()
  for (const m of marks) {
    const list = byPct.get(m.pct) ?? []
    list.push(m)
    byPct.set(m.pct, list)
  }
  for (const [, list] of byPct) {
    if (list.length < 2) continue
    const n = list.length
    list.forEach((m, i) => {
      m.pct = Math.round(Math.max(0, Math.min(100, m.pct + (i - (n - 1) / 2) * COLLISION_STEP)) * 10) / 10
    })
  }
  return marks
}

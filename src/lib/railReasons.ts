// Structured reason chips for the Map-tab rail cards.
//
// Every chip is derived from a number the planner already produced - the
// segment clock, the day's detour budget, the published hours, the provider
// rating - so a chip can always be traced back to the engine's own output.
// Nothing here invents an estimate; that keeps the product's promise that
// every claim on screen states its basis.
import { LUNCH_WINDOW } from './ridePlan'
import { minutesToHM } from './engine'

export interface RailReasonInput {
  /** halt purpose from the ride plan: fuel, meal, rest, stretch, overnight, sight... */
  purpose: string
  /** minutes-since-midnight the halt is planned for, when the clock walk ran */
  etaMinutes: number | null
  /** drive minutes since the previous stop on this day */
  minutesFromPrev: number
  /** true when this halt opens the day's drive */
  isFirstSegment: boolean
  /** extra minutes the detour costs, per the engine's road math */
  detourMinutes: number
  /** share of the day's detour budget this halt would use (0-100+) */
  budgetSharePct: number | null
  /** true when the detour exceeds what the day has left */
  overBudget: boolean
  /** provider rating, 1-5, when the source returned one */
  rating?: number
}

export interface RailChip {
  label: string
  tone?: 'warn'
  /** Icon token, rendered with the app's own icon set by the caller. */
  icon?: 'star'
}

/** Stretch beyond this earns a chip; it mirrors the fatigue cadence.
 *  #173: set ~15 min BELOW the nominal 2 h — this input is engine-estimated
 *  from blended speeds (±15% slop), so a threshold on a round cliff splits
 *  identical drives. Estimated quantities get bands, not cliffs. */
const STRETCH_COMMENT_MIN = 105
/** Below this share, the budget is noise rather than a reason. Same band
 *  logic (#173): 15% nominal, minus the estimate slop. */
const BUDGET_SHARE_COMMENT_PCT = 12
/** Ratings below this are not a reason to stop. */
const RATING_COMMENT_MIN = 4
/** The card stays a scan: three chips, most useful first. */
const MAX_CHIPS = 3

/**
 * Priority-ordered reason chips, capped so the card does not become a wall of
 * labels: over-budget first (it changes the decision), then timing reasons,
 * then quality, then bookkeeping.
 */
export function railReasonChips(input: RailReasonInput): RailChip[] {
  const chips: RailChip[] = []
  const push = (label: string, opts?: { tone?: RailChip['tone']; icon?: RailChip['icon'] }): void => {
    if (chips.length < MAX_CHIPS) chips.push({ label, ...(opts ?? {}) })
  }

  if (input.overBudget) push('over budget', { tone: 'warn' })

  if (
    input.purpose === 'meal' &&
    input.etaMinutes != null &&
    input.etaMinutes >= LUNCH_WINDOW[0] &&
    input.etaMinutes <= LUNCH_WINDOW[1]
  ) {
    push('lunch window')
  }

  if (input.minutesFromPrev >= STRETCH_COMMENT_MIN) {
    push(`${minutesToHM(input.minutesFromPrev)} stretch`)
  }

  if (input.rating != null && input.rating >= RATING_COMMENT_MIN) {
    // Just the number, with the app's star glyph in front - the way a rating
    // is read everywhere else.
    push(input.rating.toFixed(1), { icon: 'star' })
  }

  if (input.budgetSharePct != null && input.budgetSharePct >= BUDGET_SHARE_COMMENT_PCT) {
    push(`${input.budgetSharePct}% of budget`)
  }

  if (input.isFirstSegment) push('first stop')

  return chips
}

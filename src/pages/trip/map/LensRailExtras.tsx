// W4-B: left-rail extras that change with the active lens.
// Only known facts render. A missing value keeps its part out.
import { STAY_RINGS } from './stayLens'
import type { RingId } from '../../../components/map/lenses/StayDeck'
import type { MapLensId } from './useMapLenses'

export interface RailRingChoice {
  id: RingId
  label: string
}

/** The reach choices. They use the deck's real ring ids. */
export function railRingChoices(): RailRingChoice[] {
  return STAY_RINGS.map(ring => ({
    id: ring.id,
    label: `≤${ring.minutes} min ${ring.mode}`,
  }))
}

/** The stop a fix names. A target with no stop id falls back to the day's
 *  timed commitment. Both are known facts. Null stays null. */
export function fixTargetStopId(
  target: { stopId: string | null } | null,
  commitments: readonly { dayIndex: number; stopId?: string }[],
  dayIndex: number,
): string | null {
  if (target?.stopId != null) return target.stopId
  const found = commitments.find(entry => entry.dayIndex === dayIndex && entry.stopId != null)
  return found?.stopId ?? null
}

/** Find the stop a fix names. Null when the id is unknown. */
export function fixStopTitle(
  days: readonly { stops: readonly { id: string; title: string }[] }[],
  stopId: string | null,
): string | null {
  if (stopId == null) return null
  for (const day of days) {
    const stop = day.stops.find(entry => entry.id === stopId)
    if (stop) return stop.title
  }
  return null
}

export interface DriveBudget {
  usedMin: number | null
  budgetMin: number | null
  freeStops: number | null
}

/** The budget line for the rail box. An unknown number keeps the old lines. */
export function driveBudgetBarText(budget: DriveBudget | null): string | null {
  if (budget == null || budget.usedMin == null || budget.budgetMin == null || budget.freeStops == null) return null
  return `${budget.usedMin} of ${budget.budgetMin} min · ${budget.freeStops} free stops`
}

/** A five-step fill fraction. Null when the numbers are unknown. */
export function driveBudgetStep(usedMin: number | null, budgetMin: number | null): number | null {
  if (usedMin == null || budgetMin == null) return null
  if (!Number.isFinite(usedMin) || !Number.isFinite(budgetMin) || budgetMin <= 0) return null
  return Math.min(4, Math.max(0, Math.round((usedMin / budgetMin) * 4)))
}

export interface LensRailExtrasProps {
  lens: MapLensId
  ringId: RingId
  onRing: (id: RingId) => void
}

/** The in-flow reach card for the Stay lens. Other lenses add no rail card:
 *  the budget bar, the window row and the problem tint live in MapItinerary. */
export function LensRailExtras({ lens, ringId, onRing }: LensRailExtrasProps) {
  if (lens !== 'stay') return null
  return <section className="mv2-lens-rail-card" aria-label="How far from the base">
    <h3 className="mv2-lens-rail-title">How far from the base</h3>
    <div className="mv2-lens-rail-rings" role="group" aria-label="Reach from the base">
      {railRingChoices().map(choice => (
        <button key={choice.id} type="button" className="mv2-lens-rail-ring-btn"
          aria-pressed={choice.id === ringId} onClick={() => onRing(choice.id)}>{choice.label}</button>
      ))}
    </div>
    <p className="mv2-lens-rail-note">The crew's mode sets the default.</p>
  </section>
}

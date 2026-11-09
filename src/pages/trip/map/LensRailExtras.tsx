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

/** The budget line. An unknown number keeps the line out. */
export function driveBudgetText(budget: DriveBudget | null): string | null {
  if (budget == null || budget.usedMin == null || budget.budgetMin == null) return null
  const head = `${budget.usedMin} of ${budget.budgetMin} min`
  return budget.freeStops == null ? head : `${head} · ${budget.freeStops} free stops`
}

/** A five-step fill fraction. Null when the numbers are unknown. */
export function driveBudgetStep(usedMin: number | null, budgetMin: number | null): number | null {
  if (usedMin == null || budgetMin == null) return null
  if (!Number.isFinite(usedMin) || !Number.isFinite(budgetMin) || budgetMin <= 0) return null
  return Math.min(4, Math.max(0, Math.round((usedMin / budgetMin) * 4)))
}

export interface LensRailExtrasProps {
  lens: MapLensId
  clock: (min: number) => string
  windowRow: { label: string; startMin: number; endMin: number } | null
  ringId: RingId
  onRing: (id: RingId) => void
  fixStopTitle: string | null
  driveBudget: DriveBudget | null
}

export function LensRailExtras(props: LensRailExtrasProps) {
  const { lens, clock, windowRow, ringId, onRing, driveBudget } = props
  const problemTitle = props.fixStopTitle
  if (lens === 'drive') {
    const text = driveBudgetText(driveBudget)
    const step = driveBudgetStep(driveBudget?.usedMin ?? null, driveBudget?.budgetMin ?? null)
    return <section className="mv2-lens-rail-card" aria-label="Detour budget">
      <h3 className="mv2-lens-rail-title">Detour budget</h3>
      {text == null
        ? <p className="mv2-lens-rail-note">The detour budget for this day is unknown.</p>
        : <>
          <p className="mv2-lens-rail-budget">{text}</p>
          <div className="mv2-lens-rail-progress" role="progressbar" aria-label="Detour budget used"
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={step == null ? 0 : step * 25}>
            <span className="mv2-lens-rail-progress-fill" data-step={step ?? 0} />
          </div>
        </>}
    </section>
  }
  if (lens === 'stay') {
    return <section className="mv2-lens-rail-card" aria-label="How far from the base">
      <h3 className="mv2-lens-rail-title">How far from the base</h3>
      <div className="mv2-lens-rail-rings" role="group" aria-label="Reach from the base">
        {railRingChoices().map(choice => (
          <button key={choice.id} type="button" className="mv2-lens-rail-ring-btn"
            aria-pressed={choice.id === ringId} onClick={() => onRing(choice.id)}>{choice.label}</button>
        ))}
      </div>
      <p className="mv2-lens-rail-note">The crew's mode sets the default.</p>
      {windowRow != null && <div className="mv2-lens-window-row">
        <span>{windowRow.label} {clock(windowRow.startMin)}–{clock(windowRow.endMin)}</span>
      </div>}
    </section>
  }
  if (lens === 'gap') {
    return windowRow == null
      ? null
      : <section className="mv2-lens-rail-card" aria-label="Open window">
        <div className="mv2-lens-window-row">
          <span>{windowRow.label} {clock(windowRow.startMin)}–{clock(windowRow.endMin)}</span>
        </div>
      </section>
  }
  if (lens === 'fix') {
    return problemTitle == null
      ? null
      : <section className="mv2-lens-rail-card" aria-label="Problem stop">
        <div className="mv2-lens-problem-row"><span>{problemTitle}</span></div>
      </section>
  }
  return null
}

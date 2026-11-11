// W4-B: left-rail extras that change with the active lens.
// Only known facts render. A missing value keeps its part out.
import { collectWarnings, groupWarnings } from '../../../lib/engine'
import type { Trip } from '../../../data/types'
import { warningRefs } from './fixLens'
import { stayRingOptions, type RingId } from '../../../components/map/lenses/StayDeck'
import { Car, Footprints } from 'lucide-react'
import type { MapLensId } from './useMapLenses'

export interface RailRingChoice {
  id: RingId
  label: string
  ariaLabel: string
  mode: 'walk' | 'drive'
}

/** The reach choices. They use the deck's real ring ids. */
export function railRingChoices(): RailRingChoice[] {
  return stayRingOptions().map(ring => ({ ...ring }))
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

/** Split a budget line into its bold number and the rest. A line with no
 *  leading number keeps one plain part. The whole text never changes. */
export function budgetValueParts(value: string): { lead: string | null; rest: string } {
  const match = /^(\d+)(\s+of\s+[\s\S]*)$/.exec(value)
  return match == null ? { lead: null, rest: value } : { lead: match[1], rest: match[2] }
}

/** The length of a stay window, as the board writes it. A zero or unknown
 *  span shows nothing. */
export function windowDurationText(startMin: number, endMin: number): string | null {
  if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) return null
  const minutes = endMin - startMin
  if (minutes <= 0) return null
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest} min`
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, '0')}`
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

export interface BudgetBlockView {
  /** The fixed label. Every lens shows this same label. */
  label: string
  /** The used-of-total line, or the budget alone when the used part is unknown. */
  value: string
  /** True only when the used part is known. An unknown part draws no bar. */
  showBar: boolean
}

/** One budget block for every lens. Stay and Fix pass no bar, so only the
 *  known budget shows. The used line is printed only when all parts are known. */
export function budgetBlockView(budgetBar: { text: string; step: number } | null, budgetMin: number): BudgetBlockView {
  return {
    label: 'Detour budget',
    value: budgetBar == null ? `${budgetMin} min` : budgetBar.text,
    showBar: budgetBar != null,
  }
}

/** The problem row sub line. Every part must be known. An unknown fact
 *  keeps the whole line out. Never a guessed place, time or reason. */
export function fixReasonLine(place: string | null, timeText: string | null, reason: string | null): string | null {
  if (place == null || timeText == null || reason == null) return null
  if (place.trim() === '' || timeText.trim() === '' || reason.trim() === '') return null
  return `${place} ${timeText} · ${reason}`
}

/** The reason the Fix lens names for one day. It reads the same engine
 *  warnings and targets as the deck, so the rail cannot disagree with it. */
export function fixProblemReason(trip: Trip, dayIndex: number): string | null {
  const { byDay } = groupWarnings(collectWarnings(trip))
  const warnings = byDay.get(dayIndex) ?? []
  const targets = warningRefs(trip, dayIndex)
  const pairs = warnings.flatMap((warning, index) => {
    const target = targets[index]
    return target ? [{ warning, severe: target.severe }] : []
  })
  const chosen = pairs.find(pair => pair.severe) ?? pairs[0]
  const detail = chosen?.warning.detail ?? null
  return detail != null && detail.trim() !== '' ? detail : null
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
          aria-label={choice.ariaLabel} aria-pressed={choice.id === ringId} onClick={() => onRing(choice.id)}>
          {choice.mode === 'walk' ? <Footprints size={14} aria-hidden /> : <Car size={14} aria-hidden />}
          {choice.label}
        </button>
      ))}
    </div>
    <p className="mv2-lens-rail-note">The crew's mode sets the default.</p>
  </section>
}

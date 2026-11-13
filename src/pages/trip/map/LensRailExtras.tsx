// W4-B: left-rail extras that change with the active lens.
// Only known facts render. A missing value keeps its part out.
import { collectWarnings, groupWarnings, type LegEstimate } from '../../../lib/engine'
import type { JourneyRow } from '../../../lib/journeyProjection'
import type { ItineraryStop, Trip } from '../../../data/types'
import { warningRefs } from './fixLens'
import { stayRingOptions, type RingId } from '../../../components/map/lenses/StayDeck'
import { CarFront, PersonStanding } from 'lucide-react'
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

export type DriveBudget = { budgetMin: number } & (
  | { kind: 'known'; usedMin: number }
  | { kind: 'unknown'; usedMin: null }
  | { kind: 'empty'; usedMin: null }
)

/** Only planned detour stops spend the budget. Alternatives never spend.
 *  A stay, a start or end anchor, and a stop on the route (no corridor match)
 *  are destinations, not detours, so they add nothing. A detour stop with no
 *  known cost makes the spend unknown. */
export function plannedDriveBudget(
  stops: readonly (Pick<ItineraryStop, 'id' | 'status'> & Partial<Pick<ItineraryStop, 'auto' | 'category'>>)[],
  rows: readonly (Pick<JourneyRow, 'stopId' | 'detourMin'> & Partial<Pick<JourneyRow, 'onCorridor'>>)[],
  budgetMin: number,
  /** True when the corridor scan answered, so a stop with no row is on the route. */
  corridorReady = false,
): DriveBudget {
  const costs = new Map<string, number>()
  for (const stop of stops) {
    if (stop.status === 'rejected' || stop.auto === true || stop.category === 'hotel') continue
    const facts = rows.filter(row => row.stopId === String(stop.id))
    if (facts.length === 0 && corridorReady) continue
    if (facts.length > 0 && facts.every(row => row.onCorridor === false)) continue
    const cost = facts[0]?.detourMin
    if (cost == null || !Number.isFinite(cost) || cost < 0 || facts.some(row => row.detourMin !== cost)) return { kind: 'unknown', usedMin: null, budgetMin }
    costs.set(String(stop.id), cost)
  }
  return costs.size === 0
    ? { kind: 'empty', usedMin: null, budgetMin }
    : { kind: 'known', usedMin: [...costs.values()].reduce((sum, cost) => sum + cost, 0), budgetMin }
}

/** Only the chosen day's planned stops can spend the rail budget. */
export function driveBudgetBarText(budget: DriveBudget | null): string | null {
  if (budget == null) return null
  if (budget.kind === 'unknown') return 'Detour · Not measured'
  if (budget.kind === 'empty') return 'Detour · No stops'
  if (budget.usedMin > budget.budgetMin) return `Detour ${Math.round(budget.usedMin)} / ${budget.budgetMin} min · ${Math.round(budget.usedMin - budget.budgetMin)} min over`
  return `Detour ${Math.round(budget.usedMin)} / ${budget.budgetMin} min`
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

/** Known spend draws progress. Unknown and empty states show their own text. */
export function budgetBlockView(budgetBar: { text: string; step: number | null } | null, budgetMin: number): BudgetBlockView {
  return {
    label: 'Detour budget',
    value: budgetBar == null ? `${budgetMin} min` : budgetBar.text,
    showBar: budgetBar?.step != null,
  }
}

/** The problem row sub line. Every part must be known. An unknown fact
 *  keeps the whole line out. Never a guessed place, time or reason. */
export function fixReasonLine(place: string | null, timeText: string | null, reason: string | null): string | null {
  if (place == null || timeText == null || reason == null) return null
  if (place.trim() === '' || timeText.trim() === '' || reason.trim() === '') return null
  return `${place} ${timeText} · ${reason}`
}

/** The Fix row's short line from the engine's own problem facts. */
export function fixRailLine(problemTitle: string | null, clock: (hm: string) => string = hm => hm): string | null {
  if (problemTitle == null || problemTitle.trim() === '') return null
  return problemTitle.trim().replace(/\b\d{1,2}:\d{2}\b/g, clock)
}

/** The reason the Fix lens names for one day. It reads the same engine
 *  warnings and targets as the deck, on the same measured legs. */
export function fixProblemReason(trip: Trip, dayIndex: number, legCorrections?: Record<string, LegEstimate>): string | null {
  const { byDay } = groupWarnings(collectWarnings(trip, legCorrections))
  const warnings = byDay.get(dayIndex) ?? []
  const targets = warningRefs(trip, dayIndex, legCorrections)
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
          {choice.mode === 'walk' ? <PersonStanding size={13} aria-hidden /> : <CarFront size={13} aria-hidden />}
          {choice.label}
        </button>
      ))}
    </div>
    <p className="mv2-lens-rail-note">Range · Walk or 30 min drive</p>
  </section>
}

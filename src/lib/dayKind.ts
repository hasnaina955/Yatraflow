// The one day-type rule (P1-D). The Timeline day header and the Overview day
// card both read it, so the two surfaces cannot name a day differently.
import type { Journey } from './engine'
import { minutesToHM } from './engine'
import { isDriveDay } from './ridePlan'
import type { RoadState } from './roadStatLabel'
import { dayHeaderLabel } from '../pages/trip/timeline/dayLabel'

export type DayType = 'DRIVE' | 'STAY' | 'MIXED'
type KindJourney = Pick<Journey, 'distanceKm' | 'driveMinutes'> & {
  points: readonly { legIn?: { kind?: string } | null }[]
}

/** A stay day never leaves its base: no chain, no synthesized destination. */
export function isStayJourney(journey: KindJourney): boolean {
  return journey.points.length <= 1 && journey.distanceKm < 0.5
}

/** Derived from the journey, never labelled by hand: a full drive day clears
 *  the planned-break floor (#134), a short hop plus local time is mixed, and no
 *  wheel time at all is a stay. */
export function dayTypeOf(journey: KindJourney): DayType {
  if (isStayJourney(journey)) return 'STAY'
  return isDriveDay(journey.distanceKm, journey.driveMinutes) ? 'DRIVE' : 'MIXED'
}

export function hasAirLeg(journey: KindJourney): boolean {
  return journey.points.some(point => point.legIn?.kind === 'air')
}

export function dayKindLabel(journey: KindJourney): string {
  if (hasAirLeg(journey)) return 'Flight day'
  const type = dayTypeOf(journey)
  return type === 'STAY' ? 'Stay day' : type === 'DRIVE' ? 'Drive day' : 'Drive + local'
}

/**
 * The Overview day card's second line: day type, stops, km and drive time.
 * Every value comes from the engine's journey. A value the day does not have
 * is left out, never printed as zero. Km that the road did not measure carries
 * a "~", the same rule as the Timeline's distance stat (#671).
 */
export function overviewDayMetaLine(journey: KindJourney, stops: number, roadState: RoadState): string {
  const parts = [dayKindLabel(journey)]
  if (stops > 0) parts.push(`${stops} stop${stops === 1 ? '' : 's'}`)
  if (journey.distanceKm >= 0.5) {
    parts.push(`${roadState === 'ok' ? '' : '~'}${Math.round(journey.distanceKm)} km`)
  }
  if (journey.driveMinutes > 0) parts.push(minutesToHM(journey.driveMinutes))
  return parts.join(' · ')
}

/**
 * The day title in the mockup's form, with an em dash. A title written as
 * "Munnar: tea estates" already names its place, so it prints as
 * "Munnar — tea estates". Any other custom title follows the route
 * ("Kochi to Munnar — waterfalls"). A default "Day N" title adds nothing, and
 * a title that repeats the route or a place on it is not added.
 */
export function overviewDayTitle(route: string, index: number, title: string | null | undefined, places: readonly string[] = []): string {
  const label = dayHeaderLabel(index, title)
  if (label.number === null) return route
  const custom = label.title.trim()
  const colon = custom.indexOf(': ')
  if (colon > 0 && colon < custom.length - 2) return `${custom.slice(0, colon).trim()} — ${custom.slice(colon + 2).trim()}`
  const same = (value: string) => value.trim().toLowerCase() === custom.toLowerCase()
  if (same(route) || places.some(same)) return route
  return `${route} — ${custom}`
}

/** The summary tile's headline: trip km, drive time and cost. A zero value is
 *  left out. Km carries a "~" unless the road was measured. */
export function overviewRibbonLine(
  totals: { totalDistanceKm: number; totalTravelMinutes: number; totalCostInr: number },
  roadMeasured: boolean,
  formatMoney: (inr: number) => string,
): string {
  const parts: string[] = []
  if (totals.totalDistanceKm >= 0.5) parts.push(`${roadMeasured ? '' : '~'}${Math.round(totals.totalDistanceKm).toLocaleString('en-IN')} km`)
  if (totals.totalTravelMinutes > 0) parts.push(minutesToHM(totals.totalTravelMinutes))
  if (totals.totalCostInr > 0) parts.push(formatMoney(totals.totalCostInr))
  return parts.join(' · ')
}

/** "3 days to check": the days whose strip cell has something to fix. */
export function daysToCheckLabel(cells: readonly { tone: string }[]): string | null {
  const count = cells.filter(cell => cell.tone === 'fix' || cell.tone === 'risk').length
  return count === 0 ? null : `${count} day${count === 1 ? '' : 's'} to check`
}

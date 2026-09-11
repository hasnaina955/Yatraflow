// ============ Timeline collapsed-day summary (pure helpers) ============
// Phase 1 of the Timeline restructure (docs/TIMELINE-PLAN.md): the collapsed
// day header doubles as a scannable summary row. These helpers are pure and
// node-testable (no DOM/React) — the component layer just renders their output.

import type { Trip, ItineraryStop } from '../data/types'
import { NO_OPEN_DAY } from './uiPrefs'

type TripDay = Trip['days'][number]

/** A stop's visit dwell, tolerating legacy rows with missing/non-finite
 *  values (the same guard simulateDay applies before using visitMinutes). */
function dwellOf(stop: ItineraryStop): number {
  return typeof stop.visitMinutes === 'number' && Number.isFinite(stop.visitMinutes) ? stop.visitMinutes : 0
}

/** The day's stops in plan order, with rejected stops excluded — the same
 *  "visible" set every other timeline surface renders. */
export function visibleStops(day: TripDay): ItineraryStop[] {
  return [...day.stops].filter(s => s.status !== 'rejected').sort((a, b) => a.orderInDay - b.orderInDay)
}

/** "Tea Museum → Top Station → Kundala Lake" — the collapsed row's route
 *  chain (the header stats line only shows start → end, not middle stops).
 *  Empty string for a day with no visible stops. */
export function routeChain(day: TripDay): string {
  return visibleStops(day).map(s => s.title).join(' → ')
}

/** One-line summary for a collapsed STAY day (no route chain to show). */
export function stayDaySummary(visitCount: number): string {
  return visitCount > 0
    ? `No driving today · ${visitCount} visit${visitCount === 1 ? '' : 's'} planned`
    : 'No driving today · free morning'
}

/** Pure accordion transition — opening a day closes the others (negative
 *  control for "state is lifted"); tapping the open day closes it. */
export function accordionNext(currentOpen: number, dayIndex: number): number {
  return currentOpen === dayIndex ? NO_OPEN_DAY : dayIndex
}

export interface DwellSegment {
  stop: ItineraryStop
  /** visit dwell in minutes (0 for pass-through waypoints) */
  minutes: number
  /** the one stop whose dwell dominates the day — rendered amber */
  busiest: boolean
  /** flex-grow weight; zero-dwell stops keep a visible sliver */
  weight: number
}

/**
 * Per-stop bars for the collapsed row's dwell chart: one segment per visible
 * stop, widest where the day's time actually goes. Null when the chart would
 * say nothing (fewer than 2 stops, or nobody has a dwell) — caller hides it.
 */
export function dwellSegments(day: TripDay): DwellSegment[] | null {
  const active = visibleStops(day)
  if (active.length < 2) return null
  const dwells = active.map(dwellOf)
  if (!dwells.some(m => m > 0)) return null
  const busiestIdx = dwells.reduce((best, m, i) => (m > dwells[best] ? i : best), 0)
  return active.map((stop, i) => ({
    stop,
    minutes: dwells[i],
    busiest: i === busiestIdx,
    weight: Math.max(dwells[i] / 15, 0.5),
  }))
}

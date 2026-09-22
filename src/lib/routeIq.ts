// ============ Route IQ - what the road says while you are still choosing ============
// One honest line under the stops: how long the biggest hop really takes, and
// whether the day's drive swallows lunch. Straight-line distance times the
// same road factor the bill uses, over the mode's average speed - the same
// arithmetic the ticket prints, so the two can never tell different stories.
//
// CONTRACT:
//  - No straight-line pretending: the label says it is rough and why.
//  - Only the LONGEST leg is reported. A per-leg wall of numbers is noise.
//  - Silence when the route cannot be measured (missing coordinates, one stop).
//
// Pure module: no react/network imports, node-testable.

import { haversineKm } from './geo'
import { ROAD_FACTOR } from './tripStarter'
import { MODE_SPEED } from './engine'
import { LUNCH_WINDOW } from './ridePlan'
import type { TransportMode } from '../data/types'

export interface RoutePoint {
  name: string
  lat?: number
  lng?: number
}

export interface LegEstimate {
  from: string
  to: string
  km: number
  minutes: number
}

/** Journey-ordered legs the route can actually measure. */
export function measurableLegs(points: readonly RoutePoint[]): LegEstimate[] {
  const legs: LegEstimate[] = []
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) continue
    const km = Math.round(haversineKm(a.lat, a.lng, b.lat, b.lng) * ROAD_FACTOR)
    legs.push({ from: a.name, to: b.name, km, minutes: 0 })
  }
  return legs
}

/** Minutes for a hop, from the mode's own average speed. */
export function legMinutes(km: number, mode: TransportMode): number {
  const speed = MODE_SPEED[mode] ?? 42
  if (!Number.isFinite(speed) || speed <= 0) return 0
  return Math.round((km / speed) * 60)
}

/** "3h 40m" / "45m" - the same shape the rest of the app uses. */
export function durationLabel(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  const h = Math.floor(m / 60)
  const rest = m % 60
  if (h === 0) return `${rest}m`
  if (rest === 0) return `${h}h`
  return `${h}h ${rest}m`
}

export interface RouteIq {
  /** The longest hop between two stops that both have coordinates. */
  longest: LegEstimate
  /** True when the day's drive (all measurable legs, from an 8am start) runs
   *  through the lunch window - the planner should expect to eat on the road. */
  coversLunch: boolean
}

export interface LunchEstimate {
  title: string
  atMin: number
}

/** Where the first day's drive crosses the lunch window, from an 8am start.
 *  The same legs routeIq measures - so the meal line and the route line cannot
 *  tell different stories. Returns the hop's DESTINATION as the honest guess;
 *  real halt places need the workspace's halt search, which is not free. */
export function estimateLunchStop(points: readonly RoutePoint[], mode: TransportMode, startMinOfDay = 8 * 60): LunchEstimate | null {
  const legs = measurableLegs(points).map(l => ({ ...l, minutes: legMinutes(l.km, mode) }))
  let clock = startMinOfDay
  for (const leg of legs) {
    const arrive = clock + leg.minutes
    if (arrive >= LUNCH_WINDOW[0] && clock <= LUNCH_WINDOW[1]) {
      const atMin = Math.max(LUNCH_WINDOW[0], Math.min(arrive, LUNCH_WINDOW[1]))
      return { title: leg.to, atMin }
    }
    clock = arrive
  }
  return null
}

/** The one line under the stops, or null when there is nothing honest to say. */
export function routeIq(points: readonly RoutePoint[], mode: TransportMode, startMinOfDay = 8 * 60): RouteIq | null {
  const legs = measurableLegs(points).map(l => ({ ...l, minutes: legMinutes(l.km, mode) }))
  if (legs.length === 0) return null
  const longest = legs.reduce((a, b) => (b.minutes > a.minutes ? b : a))
  if (longest.minutes < 30) return null
  let clock = startMinOfDay
  let coversLunch = false
  for (const leg of legs) {
    const arrive = clock + leg.minutes
    if (arrive >= LUNCH_WINDOW[0] && clock <= LUNCH_WINDOW[1]) { coversLunch = true; break }
    clock = arrive
  }
  return { longest, coversLunch }
}

/** The sentence the page renders. Never claims a place it did not resolve. */
export function routeIqLine(iq: RouteIq): string {
  const { longest, coversLunch } = iq
  const hop = `${longest.from.split(',')[0]} to ${longest.to.split(',')[0]} is about ${durationLabel(longest.minutes)} of driving (~${longest.km} km)`
  const tail = coversLunch
    ? ' - the drive runs through lunch, so plan to eat on the road'
    : ''
  return `${hop}${tail}. Estimated from the straight-line distance at the mode\u2019s average speed, so treat it as rough.`
}

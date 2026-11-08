// ============ Net added minutes (#08 AC2) ============
// ONE pure producer for a candidate row's net added minutes.
//
// Definition: a candidate's net added minutes are the change in the day's
// total time on the road and at stops — driving, plus visit minutes, plus the
// engine's per-stop buffer — when that candidate is inserted into its day.
// It is the impact preview's own `timeDeltaMin` for the same insert, so the
// rail card and the preview cannot disagree about one place.
//
// Method: re-simulate. The candidate is inserted into the day's stop array at
// the caller's proposed position, and the existing engine/impact function
// computes the proposed plan minus the baseline. There is no second formula.
//
// Unknown stays unknown. A candidate keeps null when the day is absent, the
// insert position is not an integer inside the day, the position is not a
// usable coordinate, or the visit length is not a finite number. A known zero
// visit length is a fact and returns a number. No default duration, no guessed
// buffer and no invented position is added here.
//
// Estimated road: where a leg carries no measurement, the engine estimates it,
// and that estimate is the number the preview already shows. This producer
// reports the same number because it runs the same function. Only a candidate
// with no position at all stays unknown.
//
// Pure: no store, no network, no React, no provider, and no input is mutated.
//
// Cost bound: each candidate runs `computeImpact` once. That call simulates the
// whole trip twice, for the baseline and for the proposed plan. The baseline is
// not shared between candidates, because `computeImpact` does not expose it.
// A producer memoises each distinct candidate fact set. A caller that keeps one
// producer across builds pays nothing for a repeat build with the same facts.
import type { ItineraryStop, Trip } from '../data/types'
import { computeImpact, type LegCorrections } from './impact'

type TripDay = Trip['days'][number]

/** The trip, the day and the road evidence the preview itself receives. */
export interface NetAddedContext {
  trip: Trip
  dayIndex: number
  legCorrections?: LegCorrections
}

/** One candidate row, with the position the writer would insert at. */
export interface NetAddedCandidate {
  /** Stable row key. The memo key starts here. */
  key: string
  /** The stop the writer would create for this candidate. */
  stop: ItineraryStop
  /** Insert index in the day's stop array; null = position unknown. */
  insertAt: number | null
}

/** A candidate with a proven position, for the one insert helper. */
function insertableAt(candidate: NetAddedCandidate, day: TripDay): number | null {
  const at = candidate.insertAt
  if (typeof at !== 'number' || !Number.isInteger(at)) return null
  if (at < 0 || at > day.stops.length) return null
  return at
}

/**
 * The day with the candidate inserted and the day renumbered. `orderInDay` is
 * the day's display invariant, so it is rewritten exactly as the preview's own
 * insert rewrites it. Returns null when the position is not proven.
 */
export function withCandidateInserted(day: TripDay, candidate: NetAddedCandidate): TripDay | null {
  const at = insertableAt(candidate, day)
  if (at === null) return null
  const stops = [
    ...day.stops.slice(0, at),
    candidate.stop,
    ...day.stops.slice(at),
  ].map((stop, index) => ({ ...stop, orderInDay: index + 1 }))
  return { ...day, stops }
}

/** A finite, non-zero coordinate. The app's one rule for a known position. */
function hasUsablePosition(stop: ItineraryStop): boolean {
  const lat = stop.lat
  const lng = stop.lng
  if (typeof lat !== 'number' || typeof lng !== 'number') return false
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
  return !(lat === 0 && lng === 0)
}

/** A known visit length: a finite, non-negative number. Zero stays zero. */
function hasKnownVisit(stop: ItineraryStop): boolean {
  const visit = stop.visitMinutes
  return typeof visit === 'number' && Number.isFinite(visit) && visit >= 0
}

function computeNetAdded(context: NetAddedContext, candidate: NetAddedCandidate): number | null {
  const day = context.trip.days.find(entry => entry.index === context.dayIndex)
  if (!day) return null
  if (!hasUsablePosition(candidate.stop)) return null
  if (!hasKnownVisit(candidate.stop)) return null
  const proposedDay = withCandidateInserted(day, candidate)
  if (!proposedDay) return null
  const proposed: Trip = {
    ...context.trip,
    days: context.trip.days.map(entry => (entry === day ? proposedDay : entry)),
  }
  const delta = computeImpact(
    context.trip,
    proposed,
    'add',
    context.dayIndex,
    context.legCorrections,
  ).timeDeltaMin
  return Number.isFinite(delta) ? delta : null
}

/**
 * The producer's memo key: the row key, the insert index and the whole stop.
 * The impact function reads more of the stop than its coordinates and visit
 * length, so the key takes the whole stop.
 */
function memoKey(candidate: NetAddedCandidate): string {
  return JSON.stringify([candidate.key, candidate.insertAt ?? null, candidate.stop])
}

/** One candidate's net added minutes. Pure. No cache. */
export function netAddedMinutes(context: NetAddedContext, candidate: NetAddedCandidate): number | null {
  return computeNetAdded(context, candidate)
}

/** A memoised producer for one trip and day. */
export interface NetAddedProducer {
  /** Distinct candidate fact sets simulated so far. */
  readonly memoSize: number
  netAddedFor(candidate: NetAddedCandidate): number | null
}

/**
 * One producer per trip/day. Each distinct candidate fact set is simulated once
 * for as long as the caller keeps this producer.
 */
export function createNetAddedProducer(context: NetAddedContext): NetAddedProducer {
  const memo = new Map<string, number | null>()
  return {
    get memoSize() {
      return memo.size
    },
    netAddedFor(candidate) {
      const key = memoKey(candidate)
      if (memo.has(key)) return memo.get(key) ?? null
      const value = computeNetAdded(context, candidate)
      memo.set(key, value)
      return value
    },
  }
}

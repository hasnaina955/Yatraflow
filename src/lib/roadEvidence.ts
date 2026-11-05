// The road-evidence bridge (direct-review repair, DeepSeek lane).
//
// roadMeasure.ts produces a validated measurement bound to the active route
// and generation; the hit needs the additive fact that every consumer checks.
// This bridge removes any previous stamp first, then writes one context-bound
// record only when three things match: the active route/generation, the hit's
// own identity, and the caller's origin. A stale or foreign call leaves the
// hit with NO measured evidence, never with aged cost or arrival. It is pure
// and inert until a production caller wires the (still disabled) transport.
import type { MeasuredRoadFact, PlaceHit } from './providers/hits'
import { isCurrentForRoute, type ActiveRoute, type RoadMeasurement } from './providers/roadMeasure'

/** Remove any measured stamp from a hit. Used when the evidence cannot be trusted. */
export function withoutRoadMeasurement(hit: PlaceHit): PlaceHit {
  if (!('measuredRoadFact' in hit)) return hit
  const rest = { ...hit }
  delete rest.measuredRoadFact
  return rest
}

/**
 * Copy a CURRENT measurement onto a hit as one context-bound fact. No
 * measurement, a stale/foreign route, or a measurement for another hit strips
 * any previous stamp and returns the hit without measured evidence.
 *
 * `originKey` identifies the measurement pair's shared origin; a consumer that
 * later exposes the fact must match it (candidateArrival's ArrivalContext).
 */
export function withRoadMeasurement(
  hit: PlaceHit,
  measurement: RoadMeasurement | undefined,
  active: ActiveRoute,
  originKey: string,
): PlaceHit {
  const clean = withoutRoadMeasurement(hit)
  if (!measurement) return clean
  if (!isCurrentForRoute(measurement, active)) return clean
  if (measurement.hitId !== String(hit.id)) return clean
  const fact: MeasuredRoadFact = {
    hitId: String(hit.id),
    originKey,
    routeFingerprint: measurement.routeFingerprint,
    generation: measurement.generation,
    departAtMin: measurement.departAtMin,
    detourMin: measurement.detourMin,
    arriveMin: measurement.arrivalLegMin,
  }
  return { ...clean, measuredRoadFact: fact }
}

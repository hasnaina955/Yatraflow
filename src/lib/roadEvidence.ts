// The road-evidence bridge (direct-review repair, DeepSeek lane).
//
// roadMeasure.ts produces a validated measurement bound to the active route
// and generation; the hit needs the additive facts daySlots and the card read.
// This bridge copies them and nothing else: a stale or foreign measurement is
// ignored, so a late old-route reply cannot change a candidate. It is pure and
// inert until a production caller wires the (still disabled) transport.
import type { PlaceHit } from './providers/hits'
import { isCurrentForRoute, type ActiveRoute, type RoadMeasurement } from './providers/roadMeasure'

/**
 * Copy a CURRENT measurement onto a hit as the additive measured facts.
 * Stale or foreign measurements return the hit unchanged. No identity, order
 * or other evidence is touched.
 */
export function withRoadMeasurement(
  hit: PlaceHit,
  measurement: RoadMeasurement | undefined,
  active: ActiveRoute,
): PlaceHit {
  if (!measurement || !isCurrentForRoute(measurement, active)) return hit
  return {
    ...hit,
    measuredRoadDetourMin: measurement.detourMin,
    measuredRoadArriveMin: measurement.arrivalLegMin,
    measuredRoadDepartAtMin: measurement.departAtMin,
  }
}

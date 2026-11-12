// The candidate arrival clock (direct-review repair, DeepSeek lane).
//
// The scorer, the slot engine and the card must agree on WHEN the traveller
// reaches the place. Measured arrival evidence is trusted ONLY inside the
// complete context it was measured in: same hit, same departure clock, same
// active route/generation and same origin. A missing route or origin fails
// closed (unknown), never "matches by omission"; a directed arrival is never
// inferred by halving a measured asymmetric total. Without measured evidence
// the unchanged symmetric geometric estimate applies.
import type { MeasuredRoadFact, PlaceHit } from './providers/hits'

/**
 * The COMPLETE context measured evidence must match. Both parts are needed:
 * a route without its origin, or an origin without its route, cannot identify
 * the measurement pair.
 */
export interface ArrivalContext {
  route: { generation: number; routeFingerprint: string }
  originKey: string
}

function contextTrustsMeasured(
  fact: MeasuredRoadFact,
  hitId: string,
  etaMinutes: number,
  context: ArrivalContext | undefined,
): boolean {
  if (fact.hitId !== hitId) return false
  if (Math.abs(fact.departAtMin - etaMinutes) > 1) return false
  // Fail closed: absence of the route or the origin is not a match.
  if (!context || !context.route || typeof context.originKey !== 'string' || context.originKey.length === 0) return false
  if (fact.generation !== context.route.generation) return false
  if (fact.routeFingerprint !== context.route.routeFingerprint) return false
  return fact.originKey === context.originKey
}

/**
 * Arrival clock for a candidate. With a measured fact and its COMPLETE
 * matching context: ETA plus the directed leg. With a measured fact but any
 * missing or mismatched context: null (unknown), never half of a measured
 * total. With no measured fact: ETA plus half the unchanged geometric
 * estimate. Null when ETA or estimate is unknown.
 */
export function candidateArrivalMin(args: {
  hit: Pick<PlaceHit, 'id' | 'measuredRoadFact'>
  etaMinutes: number | null | undefined
  detourMin: number | null | undefined
  context?: ArrivalContext
}): number | null {
  const eta = args.etaMinutes
  if (eta == null || !Number.isFinite(eta)) return null
  const fact = args.hit.measuredRoadFact
  if (fact) {
    return contextTrustsMeasured(fact, String(args.hit.id), eta, args.context)
      ? eta + fact.arriveMin
      : null
  }
  const detour = args.detourMin
  if (detour == null || !Number.isFinite(detour) || detour < 0) return null
  // Symmetric estimate: the fact is return-valued and charged once, so the
  // outward leg is half. This is an estimate, not a measured arrival.
  return eta + detour / 2
}

/** True only when complete measured context matches this hit and clock. */
export function arrivalIsMeasured(args: {
  hit: Pick<PlaceHit, 'id' | 'measuredRoadFact'>
  etaMinutes: number | null | undefined
  context?: ArrivalContext
}): boolean {
  const eta = args.etaMinutes
  const fact = args.hit.measuredRoadFact
  if (eta == null || !Number.isFinite(eta) || !fact) return false
  return contextTrustsMeasured(fact, String(args.hit.id), eta, args.context)
}

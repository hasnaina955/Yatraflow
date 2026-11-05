// The candidate arrival clock (direct-review repair, DeepSeek lane).
//
// The scorer, the slot engine and the card must agree on WHEN the traveller
// reaches the place. A measured arrival leg is used only inside the context it
// was measured in: same hit, same origin, same active route/generation and the
// departure clock it was taken at. A mismatched measured context is UNKNOWN —
// a directed arrival is never inferred by halving a measured asymmetric total.
// Without measured evidence the symmetric geometric estimate applies.
import type { MeasuredRoadFact, PlaceHit } from './providers/hits'

/** What a caller knows about the context it is scoring under, when it knows it. */
export interface ArrivalContext {
  /** active route/generation from the measurement contract */
  route?: { generation: number; routeFingerprint: string } | null
  /** stable origin identity of the measurement pair */
  originKey?: string | null
}

function factMatchesContext(
  fact: MeasuredRoadFact,
  hitId: string,
  etaMinutes: number,
  context: ArrivalContext,
): boolean {
  if (fact.hitId !== hitId) return false
  if (Math.abs(fact.departAtMin - etaMinutes) > 1) return false
  const route = context.route
  if (route && (fact.generation !== route.generation || fact.routeFingerprint !== route.routeFingerprint)) return false
  if (context.originKey != null && fact.originKey !== context.originKey) return false
  return true
}

/**
 * Arrival clock for a candidate. With a matching measured fact: ETA plus the
 * directed leg. With a measured fact that does NOT match this context: null
 * (unknown), never half of a measured total. With no measured fact: ETA plus
 * half the symmetric geometric estimate. Null when ETA or estimate unknown.
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
    return factMatchesContext(fact, String(args.hit.id), eta, args.context ?? {})
      ? eta + fact.arriveMin
      : null
  }
  const detour = args.detourMin
  if (detour == null || !Number.isFinite(detour) || detour < 0) return null
  // Symmetric estimate: the fact is return-valued and charged once, so the
  // outward leg is half. This is an estimate, not a measured arrival.
  return eta + detour / 2
}

/** True when the arrival came from a measured fact that matches this context. */
export function arrivalIsMeasured(args: {
  hit: Pick<PlaceHit, 'id' | 'measuredRoadFact'>
  etaMinutes: number | null | undefined
  context?: ArrivalContext
}): boolean {
  const eta = args.etaMinutes
  const fact = args.hit.measuredRoadFact
  if (eta == null || !Number.isFinite(eta) || !fact) return false
  return factMatchesContext(fact, String(args.hit.id), eta, args.context ?? {})
}

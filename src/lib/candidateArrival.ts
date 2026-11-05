// The candidate arrival clock (direct-review repair, DeepSeek lane).
//
// The scorer, the slot engine and the card must agree on WHEN the traveller
// reaches the place. With measured evidence the directed arrival leg is used,
// but only at the departure clock it was measured at: a leg measured from a
// different clock cannot be added to this segment's ETA. Without evidence the
// symmetric estimate applies (half of the return-driving total), never a
// measured total halved as if it were directed.
import type { PlaceHit } from './providers/hits'

/**
 * Arrival clock for a candidate: ETA plus the directed leg when the measured
 * evidence matches that ETA, else ETA plus half the symmetric return total.
 * Null when the ETA or the detour is unknown — never guessed.
 */
export function candidateArrivalMin(args: {
  hit: Pick<PlaceHit, 'measuredRoadArriveMin' | 'measuredRoadDepartAtMin'>
  etaMinutes: number | null | undefined
  detourMin: number | null | undefined
}): number | null {
  const eta = args.etaMinutes
  if (eta == null || !Number.isFinite(eta)) return null
  const measured = args.hit.measuredRoadArriveMin
  const depart = args.hit.measuredRoadDepartAtMin
  if (measured != null && Number.isFinite(measured) && measured >= 0
    && depart != null && Number.isFinite(depart) && Math.abs(depart - eta) <= 1) {
    // The recorded clock anchor: the leg belongs to the ETA it was measured at.
    return eta + measured
  }
  const detour = args.detourMin
  if (detour == null || !Number.isFinite(detour) || detour < 0) return null
  // Symmetric estimate: the fact is return-valued and charged once, so the
  // outward leg is half. This is an estimate, not a measured arrival.
  return eta + detour / 2
}

/** True when the arrival came from directed measured evidence, not the half estimate. */
export function arrivalIsMeasured(args: {
  hit: Pick<PlaceHit, 'measuredRoadArriveMin' | 'measuredRoadDepartAtMin'>
  etaMinutes: number | null | undefined
}): boolean {
  const eta = args.etaMinutes
  const measured = args.hit.measuredRoadArriveMin
  const depart = args.hit.measuredRoadDepartAtMin
  return eta != null && Number.isFinite(eta)
    && measured != null && Number.isFinite(measured) && measured >= 0
    && depart != null && Number.isFinite(depart) && Math.abs(depart - eta) <= 1
}

// ============ Road-measured detours (ticket 11 / #896, repaired) ============
// Pure core for measuring the road detour of top candidates. Repair R3
// (progress review P1+P2) fixes the fact contract end to end:
//
//  1. The via route already INCLUDES the detour's extra driving: baseline 60
//     and a complete via route of 84 already imply 24 extra minutes — not 48.
//     The return doubling is gone; the measured delta is the complete extra
//     driving and is charged once (the approved 'extra return driving' rule):
//     the direction pair out-and-back is inherent in via-minus-baseline.
//  2. EXTRA driving and the DIRECTED ARRIVAL leg are modeled as separate
//     facts. Arrival is never derived by halving an asymmetric total: the
//     transport must return the via route's leg-0 (origin→place) minutes, so
//     one-way roads / traffic yield an honest arrival leg.
//  3. Both routes share EXPLICIT matching clock inputs (same departAt passed
//     to every call; recorded on the fact) — matching endpoints, clock and
//     direction per the ticket AC.
//  4. Quota is rechecked before EVERY request (baseline and each via); when
//     it exhausts mid-batch the remaining candidates are skipped 'quota' and
//     the already-collected measurements are kept (the rule-3 pause).
//  5. The top-15 ceiling is HARD: a caller requesting 20 still gets at most
//     MEASUREMENT_TOP_CANDIDATES.
//  6. Staleness binds results to the ACTIVE route and generation: a late
//     reply from an older route/generation can never replace a measurement
//     taken against the current route.
//
// ACTIVATION GATE (ticket 11 AC 6): routing rights and operating limits must
// be agreed BEFORE expanded live calls. This module ships the corrected
// helper, its fact surface and its seams with an INJECTED transport — no
// production caller is wired, so no live call happens until the coordinator's
// agreement lands. The proposal stays in overnight/glm/PREP-11.
//
// No provider import lives here — routes.ts's googleRoute is the expected
// transport (already quota-counted per call and geometry-asserted per #187),
// injected as a parameter so tests run without network.

export interface RoadMeasurement {
  /** the measured hit's id */
  hitId: string
  /**
   * measured EXTRA DRIVING in minutes: complete via route − complete
   * baseline (the direction pair out-and-back is inherent in the delta).
   * Charged ONCE against the day budget; ≥ 0, validated.
   */
  detourMin: number
  /**
   * DIRECTED arrival-leg minutes (via route leg 0: origin → place), measured
   * — never derived from the return total (no halving of an asymmetric
   * figure; one-way roads and traffic keep their direction).
   */
  arrivalLegMin: number
  measured: true
  /** measurement generation — a LOWER generation arriving late never wins */
  generation: number
  /** fingerprint of the route the measurement was taken against */
  routeFingerprint: string
  /** local epoch ms of the measurement */
  measuredAt: number
  /**
   * the matching departure clock (minutes since local midnight) both routes
   * were measured under — part of the fact so consumers can see the basis
   * and the next measurement can match it.
   */
  departAtMin: number
}

export type MeasurementResult = RoadMeasurement | { invalid: true; reason: string }

export interface ViaMeasurement {
  /** complete via route minutes (origin → place → destination) */
  totalMin: number
  /** the via route's first leg (origin → place) — the directed arrival leg */
  arrivalLegMin: number
}

/**
 * Derive the measured fact from a baseline/via pair taken with matching
 * endpoints, clock and direction. Negative deltas (a via route shorter than
 * its own baseline — engine noise, not a detour), non-finite or missing
 * values are invalid and stay unknown; a zero delta is a valid on-road fact,
 * never unknown. No doubling happens here or anywhere else — 60 baseline +
 * 84 via IS 24 extra minutes.
 */
export function roadDetourFromLegs(args: {
  hitId: string
  baselineMin: number | null | undefined
  via: ViaMeasurement | null | undefined
  generation: number
  routeFingerprint: string
  measuredAt: number
  departAtMin: number
}): MeasurementResult {
  const { hitId, baselineMin, via, generation, routeFingerprint, measuredAt, departAtMin } = args
  if (baselineMin == null || !Number.isFinite(baselineMin) || baselineMin < 0) {
    return { invalid: true, reason: 'baseline missing or non-finite' }
  }
  const viaTotalMin = via?.totalMin
  const arrivalLegMin = via?.arrivalLegMin
  if (viaTotalMin == null || !Number.isFinite(viaTotalMin) || viaTotalMin < 0) {
    return { invalid: true, reason: 'via route missing or non-finite' }
  }
  if (arrivalLegMin == null || !Number.isFinite(arrivalLegMin) || arrivalLegMin < 0) {
    return { invalid: true, reason: 'directed arrival leg missing or non-finite' }
  }
  const delta = viaTotalMin - baselineMin
  if (!Number.isFinite(delta) || delta < 0) {
    return { invalid: true, reason: 'negative detour delta · engine noise, stays unknown' }
  }
  const rounded = Math.round(delta * 100) / 100
  return {
    hitId,
    detourMin: rounded,
    arrivalLegMin: Math.round(arrivalLegMin * 100) / 100,
    measured: true,
    generation,
    routeFingerprint,
    measuredAt,
    departAtMin,
  }
}

/** What a measurement must match to be current (the ACTIVE route/generation). */
export interface ActiveRoute {
  generation: number
  routeFingerprint: string
}

/** True when a measurement belongs to the active route and generation — false = stale or foreign. */
export function isCurrentForRoute(m: RoadMeasurement | undefined, active: ActiveRoute): boolean {
  if (!m) return false
  return m.generation === active.generation && m.routeFingerprint === active.routeFingerprint
}

/**
 * Staleness merge bound to the ACTIVE route (repair R3, progress review P2):
 * a measurement only counts when its generation AND route fingerprint match
 * the active route. A late reply from an OLD route (fingerprints differ) or
 * an older generation can NEVER replace a current measurement. Among
 * current-route candidates the newest measuredAt wins. Returns the
 * effective measurement, or undefined when neither candidate is current.
 */
export function mergeMeasurement(
  prev: RoadMeasurement | undefined,
  next: RoadMeasurement | undefined,
  active: ActiveRoute,
): RoadMeasurement | undefined {
  const prevCurrent = isCurrentForRoute(prev, active)
  const nextCurrent = isCurrentForRoute(next, active)
  if (!prevCurrent && !nextCurrent) return undefined
  if (!nextCurrent) return prev
  if (!prevCurrent) return next
  const p2 = prev as RoadMeasurement
  const n2 = next as RoadMeasurement
  return (n2.measuredAt > p2.measuredAt) ? n2 : p2
}

/** The HARD per-day measurement ceiling (ticket 11 AC 2) — callers cannot raise it. */
export const MEASUREMENT_TOP_CANDIDATES = 15

/**
 * First N unique candidates in ranked order, N capped at the hard ceiling:
 * even when a caller requests 20, at most 15 are returned. Uniqueness by hit
 * id so a duplicate never spends two ceiling slots.
 */
export function topCandidatesForMeasurement<T>(ranked: readonly T[], idOf: (item: T) => string, requestedLimit?: number): T[] {
  // hard ceiling (recheck P2): a caller-supplied limit above 15 does not widen
  // the batch, and an INVALID limit (NaN/±∞) never disables the stop condition
  // — Math.min(NaN, 15) is NaN, which made `length >= NaN` false forever and
  // selected the whole probe list. Rule: garbage limits (non-finite) resolve
  // to the standard ceiling; finite limits floor (fractional/0 respect the
  // caller, bounded [0, 15]).
  let limit = MEASUREMENT_TOP_CANDIDATES
  if (requestedLimit != null && Number.isFinite(requestedLimit)) {
    limit = Math.max(0, Math.floor(requestedLimit))
  }
  limit = Math.min(limit, MEASUREMENT_TOP_CANDIDATES)
  const seen = new Set<string>()
  const out: T[] = []
  for (const item of ranked) {
    if (out.length >= limit) break
    const id = idOf(item)
    if (seen.has(id)) continue
    seen.add(id)
    out.push(item)
  }
  return out
}

/**
 * The transport contract: BOTH legs must come from the same engine with
 * matching endpoints, the SAME explicit departure clock and direction
 * (ticket 11 AC 1). The expected production transport wraps routes.ts
 * googleRoute — already quota-counted per call and geometry-asserted (#187) —
 * via-supported, exposing per-leg data for the directed arrival leg.
 */
export interface MeasureTransport {
  /** minutes for origin → destination, no intermediates, under the given clock */
  baselineMin: (origin: { lat: number; lng: number }, destination: { lat: number; lng: number }, departAtMin: number) => Promise<number>
  /** complete via route minutes AND its directed first leg (origin → place) */
  viaRoute: (origin: { lat: number; lng: number }, destination: { lat: number; lng: number }, place: { lat: number; lng: number }, departAtMin: number) => Promise<ViaMeasurement>
}

export interface MeasuredBatch {
  measurements: RoadMeasurement[]
  /** every unmeasured candidate with the honest reason — the estimate stays labelled upstream */
  skipped: { id: string; reason: 'quota' | 'failed' | string }[]
  /** true when the quota guard went false mid-batch and the tail was halted */
  haltedOnQuota: boolean
}

/**
 * Measure a candidate batch. Callers pass already-ranked candidates; the
 * hard top-15 ceiling is re-applied here regardless of any requested limit.
 * Quota is rechecked BEFORE EVERY request (baseline and each via): when it
 * exhausts mid-batch, the remaining candidates are skipped 'quota' and the
 * batch is halted (already-collected measurements are kept). Transport
 * failures skip that candidate only.
 */
export async function measureRoadDetours(args: {
  origin: { lat: number; lng: number }
  destination: { lat: number; lng: number }
  candidates: readonly { id: string; lat: number; lng: number }[]
  generation: number
  routeFingerprint: string
  transport: MeasureTransport
  quotaAllows: () => boolean
  /** an explicit matching departure clock (minutes since local midnight) for every request */
  departAtMin: number
  /** a requested batch size — capped at the hard ceiling no matter what */
  limit?: number
  now?: number
}): Promise<MeasuredBatch> {
  const { origin, destination, generation, routeFingerprint, transport, quotaAllows, departAtMin } = args
  const now = args.now ?? Date.now()
  const batch = topCandidatesForMeasurement(args.candidates, c => c.id, args.limit)
  const measurements: RoadMeasurement[] = []
  const skipped: { id: string; reason: string }[] = []
  let haltedOnQuota = false

  let baselineMin: number | null = null
  try {
    // quota recheck immediately before the baseline request (per-request discipline)
    if (!quotaAllows()) {
      haltedOnQuota = batch.length > 0
      return { measurements: [], skipped: batch.map(c => ({ id: c.id, reason: 'quota' as const })), haltedOnQuota }
    }
    baselineMin = await transport.baselineMin(origin, destination, departAtMin)
  } catch {
    // one baseline for the whole batch: without it no delta is measurable
    return { measurements: [], skipped: batch.map(c => ({ id: c.id, reason: 'failed' as const })), haltedOnQuota: false }
  }
  for (const candidate of batch) {
    // quota recheck BEFORE EACH via request (repair R3: probe showed via calls
    // continuing after the guard went false) — halt the remaining batch on false
    if (!quotaAllows()) {
      haltedOnQuota = true
      skipped.push({ id: candidate.id, reason: 'quota' })
      continue
    }
    try {
      const via = await transport.viaRoute(origin, destination, candidate, departAtMin)
      const result = roadDetourFromLegs({
        hitId: candidate.id,
        baselineMin,
        via,
        generation,
        routeFingerprint,
        measuredAt: now,
        departAtMin,
      })
      if ('invalid' in result) skipped.push({ id: candidate.id, reason: result.reason })
      else measurements.push(result)
    } catch {
      skipped.push({ id: candidate.id, reason: 'failed' })
    }
  }
  return { measurements, skipped, haltedOnQuota }
}

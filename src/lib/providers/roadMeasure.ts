// ============ Road-measured detours (ticket 11 / #896) ============
// Pure core for measuring the road detour of top candidates: a directed
// baseline route vs a via route through the place, with MATCHING inputs
// (same endpoints, same clock handling, same engine and direction — the
// transport contract below). Invalid, negative or non-finite results stay
// unknown; a stale measurement can never replace a newer one; at most the
// day's top candidates are measured; the quota guard pauses before any call.
//
// ACTIVATION GATE (ticket 11 AC 6): routing rights and project operating
// limits must be agreed BEFORE expanded live calls. This module ships the
// helper, its fact surface and its seams with an INJECTED transport — no
// production caller is wired, so no live call happens until the coordinator's
// limits agreement lands. The proposal is in overnight/glm/PREP-11: top 15
// candidates per viewed day against the existing 'routes' SKU guard.
//
// No provider import lives here — routes.ts's googleRoute is the expected
// transport (already quota-counted and geometry-asserted per #187), but the
// seams take it as a parameter so tests run without network.

export interface RoadMeasurement {
  /** the measured hit's id */
  hitId: string
  /** DIRECTED one-way road delta in minutes (via − baseline), ≥ 0, validated */
  detourMin: number
  /**
   * the unified return-driving spend (ticket 01's fact, charged once). While
   * only the outbound direction is measured, this is 2× the directed delta —
   * a documented symmetric assumption the directed-return upgrade replaces.
   */
  returnDetourMin: number
  /** the explicit arrival-leg estimate daySlots uses (replaces deriving it as dMin/2) */
  oneWayArriveMin: number
  measured: true
  /** measurement generation — a LOWER generation arriving late never wins */
  generation: number
  /** fingerprint of the route the measurement was taken against */
  routeFingerprint: string
  /** local epoch ms of the measurement */
  measuredAt: number
}

export type MeasurementResult = RoadMeasurement | { invalid: true; reason: string }

/**
 * Derive the measured fact from a baseline/via pair taken with matching
 * inputs. Negative deltas (a via route shorter than its own baseline —
 * engine noise, not a detour), non-finite or missing values are invalid and
 * stay unknown; a zero delta is a valid on-road fact, never unknown.
 */
export function roadDetourFromLegs(args: {
  hitId: string
  baselineMin: number | null | undefined
  viaTotalMin: number | null | undefined
  generation: number
  routeFingerprint: string
  measuredAt: number
}): MeasurementResult {
  const { hitId, baselineMin, viaTotalMin, generation, routeFingerprint, measuredAt } = args
  if (baselineMin == null || !Number.isFinite(baselineMin) || baselineMin < 0) {
    return { invalid: true, reason: 'baseline missing or non-finite' }
  }
  if (viaTotalMin == null || !Number.isFinite(viaTotalMin) || viaTotalMin < 0) {
    return { invalid: true, reason: 'via route missing or non-finite' }
  }
  const delta = viaTotalMin - baselineMin
  if (!Number.isFinite(delta) || delta < 0) {
    return { invalid: true, reason: 'negative detour delta — engine noise, stays unknown' }
  }
  const rounded = Math.round(delta * 100) / 100
  return {
    hitId,
    detourMin: rounded,
    returnDetourMin: Math.round(delta * 2 * 100) / 100,
    oneWayArriveMin: rounded,
    measured: true,
    generation,
    routeFingerprint,
    measuredAt,
  }
}

/**
 * Staleness merge (ticket 11 AC 4): a result from a LOWER generation is stale
 * and never replaces a newer measurement; a different route fingerprint
 * invalidates the old record (the route changed, the evidence no longer
 * applies); equal generation on the same route keeps the newest measurement.
 */
export function mergeMeasurement(prev: RoadMeasurement | undefined, next: RoadMeasurement): RoadMeasurement {
  if (!prev) return next
  if (next.generation < prev.generation) return prev
  if (next.generation > prev.generation) return next
  if (next.routeFingerprint !== prev.routeFingerprint) return next
  return next.measuredAt > prev.measuredAt ? next : prev
}

/** Bounded measurement budget (ticket 11 AC 2) — the proposal behind AC 6's gate. */
export const MEASUREMENT_TOP_CANDIDATES = 15

/**
 * First N unique candidates in the order ranked — the caller ranks, this
 * caps. Uniqueness by hit id so a duplicate never spends two budget slots.
 */
export function topCandidatesForMeasurement<T>(ranked: readonly T[], idOf: (item: T) => string, limit: number = MEASUREMENT_TOP_CANDIDATES): T[] {
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
 * matching endpoints, clock inputs and direction (ticket 11 AC 1). The
 * expected production transport wraps routes.ts googleRoute — already
 * quota-counted per call and geometry-asserted (#187) — but any equivalent
 * engine satisfies the contract.
 */
export interface MeasureTransport {
  /** minutes for origin → destination, no intermediates */
  baselineMin: (origin: { lat: number; lng: number }, destination: { lat: number; lng: number }) => Promise<number>
  /** minutes for origin → destination THROUGH the place (one via intermediate) */
  viaTotalMin: (origin: { lat: number; lng: number }, destination: { lat: number; lng: number }, place: { lat: number; lng: number }) => Promise<number>
}

export interface MeasuredBatch {
  measurements: RoadMeasurement[]
  /** every unmeasured candidate with the honest reason — the estimate stays labelled upstream */
  skipped: { id: string; reason: 'quota' | 'failed' | string }[]
}

/**
 * Measure a candidate batch. Callers pass already-ranked candidates; the
 * cap is re-applied here defensively. `quotaAllows` mirrors the provider
 * quota guard (quota.ts) — when it says no, NOTHING is measured and every
 * candidate is skipped with 'quota' (the rule-3 pause: estimates stay, no
 * partial spend). Transport failures skip that candidate only.
 */
export async function measureRoadDetours(args: {
  origin: { lat: number; lng: number }
  destination: { lat: number; lng: number }
  candidates: readonly { id: string; lat: number; lng: number }[]
  generation: number
  routeFingerprint: string
  transport: MeasureTransport
  quotaAllows: () => boolean
  limit?: number
  now?: number
}): Promise<MeasuredBatch> {
  const { origin, destination, generation, routeFingerprint, transport, quotaAllows } = args
  const now = args.now ?? Date.now()
  const batch = topCandidatesForMeasurement(args.candidates, c => c.id, args.limit)
  if (!quotaAllows()) {
    return { measurements: [], skipped: batch.map(c => ({ id: c.id, reason: 'quota' as const })) }
  }
  const measurements: RoadMeasurement[] = []
  const skipped: { id: string; reason: string }[] = []
  let baselineMin: number | null = null
  try {
    baselineMin = await transport.baselineMin(origin, destination)
  } catch {
    // one baseline for the whole batch: without it no delta is measurable
    return { measurements: [], skipped: batch.map(c => ({ id: c.id, reason: 'failed' as const })) }
  }
  for (const candidate of batch) {
    try {
      const viaTotalMin = await transport.viaTotalMin(origin, destination, candidate)
      const result = roadDetourFromLegs({
        hitId: candidate.id,
        baselineMin,
        viaTotalMin,
        generation,
        routeFingerprint,
        measuredAt: now,
      })
      if ('invalid' in result) skipped.push({ id: candidate.id, reason: result.reason })
      else measurements.push(result)
    } catch {
      skipped.push({ id: candidate.id, reason: 'failed' })
    }
  }
  return { measurements, skipped }
}

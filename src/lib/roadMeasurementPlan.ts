// ============ Road measurement plan (ticket 11 AC2–AC5) ============
// The measurement helper (providers/roadMeasure.ts) turns a batch into
// measured facts. This module is the caller seam: ranked candidates become a
// bounded, labelled plan. It adds no ranking, clock, quota engine or provider.
//
// ACTIVATION GATE: AC 6 (routing rights and operating limits) is not agreed.
// The gate is closed by default, so `enabled !== true` or a missing transport
// returns an estimate for every candidate and makes NO transport call. The
// quota guard defaults to false. This module never reads or mutates the live
// quota store, and it never loads a live routing provider. It imports the pure
// hit model only, for the shared coordinate sentinel.
//
// When a caller explicitly enables the gate with an INJECTED transport, the
// existing measureRoadDetours does the work: the hard top-15 cap, one explicit
// departAtMin, a per-request quota recheck, and the active route/generation
// binding. This module filters every result through the helper's own
// isCurrentForRoute guard, so a stale fact is never relabelled as current.
//
// Identity: the candidate id is the hit id the fact will carry. A hit whose
// own id disagrees is not measured, because the road-evidence bridge needs
// `measurement.hitId === String(hit.id)` and would strip that fact later.
// One id owns at most one fact: the first ranked row with an id owns the
// measurement, and later rows with that id stay in the plan with an explicit
// reason. A fact measured at one location is never stamped on another.
import { hasCoords, type PlaceHit } from './providers/hits'
import {
  isCurrentForRoute,
  measureRoadDetours,
  topCandidatesForMeasurement,
  type ActiveRoute,
  type MeasureTransport,
  type RoadMeasurement,
} from './providers/roadMeasure'

export type RoadMeasurementStatus = 'unmeasured' | 'pending' | 'measured' | 'failed' | 'quota-skipped'

export interface RoadMeasurementPlanInput {
  /** ranked candidates: the first 15 eligible ones are measured, in this order */
  candidates: readonly { id: string; hit: PlaceHit }[]
  origin: { lat: number; lng: number }
  destination: { lat: number; lng: number }
  /** the route and generation a measured fact must belong to */
  activeRoute: ActiveRoute
  /** one explicit departure clock (minutes since local midnight) for every request */
  departAtMin: number
  /** generation of the ranked candidate set; must match the active route */
  generation: number
  /** injected only after AC 6 is agreed. Absent or null means no live call. */
  transport?: MeasureTransport | null
  /** existing quota guard. Defaults to false; the live store is never read here. */
  quotaAllows?: () => boolean
  /** defaults to false */
  enabled?: boolean
}

export interface RoadMeasurementRow {
  hitId: string
  status: RoadMeasurementStatus
  detourMin: number | null
  arrivalLegMin: number | null
  /** measured when a current fact exists; estimate when the upstream estimate stands; unknown when no value is usable */
  grade: 'measured' | 'estimate' | 'unknown'
  /** null only on a measured row; every other status carries a truthful label */
  reason: string | null
}

export interface RoadMeasurementPlan {
  activation: 'gated' | 'enabled'
  rows: readonly RoadMeasurementRow[]
  measuredCount: number
}

const ACTIVATION_GATED = 'activation-gated'
const STALE_GENERATION = 'stale-generation'
const ROUTE_IDENTITY_MISSING = 'route-identity-missing'
const COORDINATES_PENDING = 'coordinates-pending'
const IDENTITY_MISMATCH = 'identity-mismatch'
const BEYOND_TOP_CANDIDATES = 'beyond-top-15'
const DUPLICATE_ID = 'duplicate-id'
const QUOTA = 'quota'
const FAILED = 'failed'
const STALE_RESULT = 'stale-result'
const NOT_RETURNED = 'measurement-not-returned'
const MEASUREMENT_FAILED = 'measurement-failed'

function row(
  hitId: string,
  status: RoadMeasurementStatus,
  grade: RoadMeasurementRow['grade'],
  reason: string,
  detourMin: number | null = null,
  arrivalLegMin: number | null = null,
): RoadMeasurementRow {
  return { hitId, status, detourMin, arrivalLegMin, grade, reason }
}

/**
 * Usable coordinates, or null while the hit is still "coords pending". The
 * shared hasCoords predicate owns the (0,0)/mixed-placeholder sentinel.
 */
function coordinateOf(hit: PlaceHit | null | undefined): { lat: number; lng: number } | null {
  if (!hit || !hasCoords(hit)) return null
  return { lat: hit.latitude, lng: hit.longitude }
}

/** Map one helper skip to a labelled row. Invalid values stay unknown, never zero. */
function fromSkip(hitId: string, reason: string): RoadMeasurementRow {
  if (reason === QUOTA) return row(hitId, 'quota-skipped', 'estimate', QUOTA)
  if (reason === FAILED) return row(hitId, 'failed', 'estimate', FAILED)
  // The helper passes the invalid-value reason through as free text.
  return row(hitId, 'failed', 'unknown', reason)
}

/** Map one helper measurement to a row, but only while it is current for the active route. */
function fromMeasurement(hitId: string, measurement: RoadMeasurement, activeRoute: ActiveRoute): RoadMeasurementRow {
  if (!isCurrentForRoute(measurement, activeRoute)) {
    return row(hitId, 'unmeasured', 'estimate', STALE_RESULT)
  }
  return {
    hitId,
    status: 'measured',
    detourMin: measurement.detourMin,
    arrivalLegMin: measurement.arrivalLegMin,
    grade: 'measured',
    reason: null,
  }
}

/**
 * Build a bounded measurement plan. The gate is checked first, so a closed or
 * unconfigured caller never touches the transport, the quota guard or a clock.
 */
export async function planRoadMeasurements(input: RoadMeasurementPlanInput): Promise<RoadMeasurementPlan> {
  const { candidates, origin, destination, activeRoute, departAtMin, generation, transport } = input

  // Rule 1: default gated. Every candidate is retained, never dropped.
  if (input.enabled !== true || !transport) {
    return {
      activation: 'gated',
      rows: candidates.map(candidate => row(candidate.id, 'unmeasured', 'estimate', ACTIVATION_GATED)),
      measuredCount: 0,
    }
  }

  // Rows are indexed by candidate position, so the output keeps rank order and
  // the same length even when a candidate cannot be requested.
  const rows: (RoadMeasurementRow | null)[] = candidates.map(() => null)
  const owners = new Set<string>()
  const measureable: { index: number; id: string; lat: number; lng: number }[] = []

  candidates.forEach((candidate, index) => {
    if (owners.has(candidate.id)) {
      // One id owns one fact. Keep the row, but never stamp it with a fact
      // measured at another candidate's coordinates.
      rows[index] = row(candidate.id, 'unmeasured', 'estimate', DUPLICATE_ID)
      return
    }
    owners.add(candidate.id)
    if (String(candidate.hit?.id) !== candidate.id) {
      rows[index] = row(candidate.id, 'failed', 'unknown', IDENTITY_MISMATCH)
      return
    }
    const coords = coordinateOf(candidate.hit)
    if (!coords) {
      rows[index] = row(candidate.id, 'pending', 'estimate', COORDINATES_PENDING)
      return
    }
    measureable.push({ index, id: candidate.id, lat: coords.lat, lng: coords.lng })
  })

  const finish = (): RoadMeasurementPlan => {
    // The null coalesce is a no-drop guard, not a measurement claim.
    const finalRows = rows.map((built, index) => built
      ?? row(candidates[index].id, 'pending', 'estimate', NOT_RETURNED))
    // Count facts, not rows: one id can own only one measurement.
    const measuredIds = new Set(
      finalRows.filter(finalRow => finalRow.status === 'measured').map(finalRow => finalRow.hitId),
    )
    return {
      activation: 'enabled',
      rows: finalRows,
      measuredCount: measuredIds.size,
    }
  }

  // A plan generation that is not the active route can only produce a stale
  // fact. Refuse before any request rather than spend quota on it.
  const routeReason = generation !== activeRoute.generation
    ? STALE_GENERATION
    : activeRoute.routeFingerprint ? null : ROUTE_IDENTITY_MISSING
  if (routeReason) {
    for (const item of measureable) rows[item.index] = row(item.id, 'unmeasured', 'estimate', routeReason)
    return finish()
  }

  // The helper re-applies the hard cap. The batch is selected here so that
  // out-of-batch candidates stay explicitly labelled instead of absent.
  const batch = topCandidatesForMeasurement(measureable, item => item.id)
  const batchIds = new Set(batch.map(item => item.id))
  for (const item of measureable) {
    if (!batchIds.has(item.id)) rows[item.index] = row(item.id, 'unmeasured', 'estimate', BEYOND_TOP_CANDIDATES)
  }

  if (batch.length > 0) {
    try {
      const outcome = await measureRoadDetours({
        origin,
        destination,
        candidates: batch.map(item => ({ id: item.id, lat: item.lat, lng: item.lng })),
        generation: activeRoute.generation,
        routeFingerprint: activeRoute.routeFingerprint,
        transport,
        quotaAllows: input.quotaAllows ?? (() => false),
        departAtMin,
      })
      const measuredById = new Map<string, RoadMeasurement>(
        outcome.measurements.map(measurement => [measurement.hitId, measurement] as const))
      const skippedById = new Map<string, string>(
        outcome.skipped.map(skip => [skip.id, skip.reason] as const))
      for (const item of measureable) {
        if (rows[item.index]) continue
        if (!batchIds.has(item.id)) continue // already labelled beyond the cap
        const measurement = measuredById.get(item.id)
        if (measurement) {
          rows[item.index] = fromMeasurement(item.id, measurement, activeRoute)
          continue
        }
        const skipReason = skippedById.get(item.id)
        rows[item.index] = skipReason == null
          ? row(item.id, 'pending', 'estimate', NOT_RETURNED)
          : fromSkip(item.id, skipReason)
      }
    } catch {
      // The helper catches per-candidate transport failures. A rejection here
      // means the batch did not resolve, so no row may claim a measurement.
      for (const item of measureable) {
        if (rows[item.index] || !batchIds.has(item.id)) continue
        rows[item.index] = row(item.id, 'failed', 'estimate', MEASUREMENT_FAILED)
      }
    }
  }

  return finish()
}

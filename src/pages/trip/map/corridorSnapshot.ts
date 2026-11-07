// ============ The Map's corridor snapshot (#08 S2) ============
// The Map keeps `useCorridorCache` as the only scanner. It publishes the facts
// it already derives so the future workspace producer does not scan again or
// re-invent Map-only state (weather, the drawn road, held-back budget rows).
//
// This module is data and identity only: no React, no store, no provider call,
// no cache. `corridorSnapshotKey` is a PUBLICATION identity, never a cache,
// quota or generation key (#842 keeps those).
import { drivingPlanFingerprint, type DrivingPlan, type DrivingPlanDay, type PlaceHit, type SegmentHit } from '../../../lib/geocode'
import type { tripDayAttribution } from '../../../lib/daySlots'
import { placeKeysOf } from '../../../lib/placeIdentity'
import type { LatLng } from './weatherGeometry'

/** One published corridor fact set. Data plus four closures over captured data. */
export interface CorridorSnapshot {
  readonly tripId: string
  /** The Map's own inputs hash, never recomputed outside the Map. */
  readonly inputsHash: string
  readonly scopeKm: number
  readonly status: 'ready' | 'scanning' | 'failed' | 'quota'
  readonly source: 'scan' | 'cache' | 'retained'
  readonly pois: readonly SegmentHit[]
  readonly anchors: readonly LatLng[]
  readonly routePolyline: readonly LatLng[] | null
  readonly drivingPlan: DrivingPlan
  readonly dayAttribution: Pick<ReturnType<typeof tripDayAttribution>, 'dayForKm' | 'dayOfSegment' | 'daySpanKm'>
  /** The data the attribution closures close over; the key serializes it. */
  readonly dayAttributionKey: string
  readonly altPool: readonly PlaceHit[]
  readonly detourMinFor: (hit: PlaceHit) => number | null
  readonly detourKmFor: (hit: PlaceHit) => number | null
  /** ids the Map's detour budget held back, from its existing walk. */
  readonly heldBackIds: ReadonlySet<string>
}

/** A provider-aware hit identity plus the position facts a row can read. */
export function hitFactKey(hit: PlaceHit): string {
  return JSON.stringify({
    source: hit.source ?? null,
    id: String(hit.id),
    placeId: hit.placeId ?? null,
    eLoc: hit.eLoc ?? null,
    keys: placeKeysOf(hit)
      .map(key => `${key.provider ?? ''}:${key.kind}:${key.value}`)
      .sort(),
    // Display/scoring/hour/cost facts the Map card and chips read. A same-id
    // refresh that changes one of these must republish, or the producer keeps
    // the old hit objects.
    name: hit.name,
    kind: hit.kind,
    description: hit.description ?? null,
    admin1: hit.admin1 ?? null,
    country: hit.country ?? null,
    country_code: hit.country_code ?? null,
    category: hit.category ?? null,
    family: hit.family ?? null,
    subtype: hit.subtype ?? null,
    openTime: hit.openTime ?? null,
    closeTime: hit.closeTime ?? null,
    hours: hit.hours ?? null,
    rating: hit.rating ?? null,
    ratingCount: hit.ratingCount ?? null,
    thumb: hit.thumb ?? null,
    lat: hit.latitude,
    lng: hit.longitude,
    cumKm: hit.cumKm ?? null,
    offRouteKm: hit.offRouteKm ?? null,
    alongRouteKm: hit.alongRouteKm ?? null,
    legKm: hit.legKm ?? null,
    legMinutes: hit.legMinutes ?? null,
    haltPurpose: hit.haltPurpose ?? null,
    nearestCity: hit.nearestCity ?? null,
    isPopulatedPlace: hit.isPopulatedPlace ?? null,
    population: hit.population ?? null,
    fromGoogleAlongRoute: hit.fromGoogleAlongRoute ?? null,
    measuredRoadFact: hit.measuredRoadFact ?? null,
  })
}

/** The exact main-scan status. Fraction failures never reach this. */
export function corridorStatusFor(input: { quota: boolean; scanFailed: boolean; loading: boolean }): CorridorSnapshot['status'] {
  if (input.quota) return 'quota'
  if (input.scanFailed) return 'failed'
  if (input.loading) return 'scanning'
  return 'ready'
}

/**
 * Retain previous rows after a quota/failure only when they are for the SAME
 * query. A stale route/scope is never relabelled current.
 */
export function retainCorridorRowsOnFailure(input: {
  hasRows: boolean
  meta: { hash: string; scopeKm: number } | null
  inputsHash: string
  scopeKm: number
}): boolean {
  return input.hasRows
    && input.meta != null
    && input.meta.hash === input.inputsHash
    && input.meta.scopeKm === input.scopeKm
}

/**
 * The exact data the attribution closures close over: the day road km and the
 * effective driving days. A change in either can move a hit to another day.
 */
export function dayAttributionKeyFor(
  dayRoadKm: readonly number[] | null | undefined,
  boundaries: readonly DrivingPlanDay[] | null | undefined,
): string {
  return JSON.stringify({
    dayRoadKm: dayRoadKm ? [...dayRoadKm] : null,
    boundaries: (boundaries ?? []).map(day => [
      day.leg, day.dayIndex, day.startKm, day.endKm, day.nightHaltKm, day.startMin,
      day.proposedEndKm ?? null,
    ]),
  })
}

function segmentFacts(sh: SegmentHit): unknown {
  const seg = sh.segment
  return {
    index: seg.index,
    purpose: seg.purpose,
    label: seg.label,
    targetKm: seg.targetKm,
    minKm: seg.minKm,
    maxKm: seg.maxKm,
    kmFromPrev: seg.kmFromPrev,
    minutesFromPrev: seg.minutesFromPrev,
    etaMinutes: seg.etaMinutes ?? null,
    rainy: seg.rainy ?? null,
    rainPct: seg.rainPct ?? null,
    dayEnd: seg.dayEnd ?? null,
    haltPinned: seg.haltPinned ?? null,
    haltDriftToKm: seg.haltDriftToKm ?? null,
    roadPersonality: seg.roadPersonality ?? null,
    roadWarning: seg.roadWarning ?? null,
    hint: seg.hint,
    score: sh.score,
  }
}

/**
 * Complete publication identity. It serializes every fact that shapes a row:
 * all segment fields, hit identity and position, the Map's detour results, the
 * attribution result, the road, the driving plan, the alt pool and the
 * held-back membership. Unchanged content with new array references is equal.
 */
export function corridorSnapshotKey(snapshot: CorridorSnapshot): string {
  return JSON.stringify({
    version: 1,
    tripId: snapshot.tripId,
    inputsHash: snapshot.inputsHash,
    scopeKm: snapshot.scopeKm,
    status: snapshot.status,
    source: snapshot.source,
    pois: snapshot.pois.map(sh => {
      const hit = sh.hit
      return {
        segment: segmentFacts(sh),
        hit: hit ? hitFactKey(hit) : null,
        detourMin: hit ? snapshot.detourMinFor(hit) ?? null : null,
        detourKm: hit ? snapshot.detourKmFor(hit) ?? null : null,
        day: hit ? snapshot.dayAttribution.dayForKm(hit.cumKm) ?? null : null,
        heldBack: hit ? snapshot.heldBackIds.has(String(hit.id)) : false,
      }
    }),
    anchors: snapshot.anchors.map(point => [point.lat, point.lng]),
    routePolyline: snapshot.routePolyline
      ? snapshot.routePolyline.map(point => [point.lat, point.lng])
      : null,
    drivingPlan: drivingPlanFingerprint(snapshot.drivingPlan),
    dayAttributionKey: snapshot.dayAttributionKey,
    altPool: snapshot.altPool.map(hit => [
      hitFactKey(hit),
      hit.cumKm ?? null,
      hit.offRouteKm ?? null,
    ]),
    heldBackIds: [...snapshot.heldBackIds].map(String).sort(),
  })
}

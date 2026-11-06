// ============ Resolved slot vote caller adapter (#841) ============
// Production Group input calls planDecisionResolution before resolveDecision.
// A slot poll wins one atomic ordered target from the shared planner.
// The workspace road facts are measured before this call.
// This module starts no routing call and applies no SQL.
import type { DecisionPlacePayload, ID, OrderedDecisionResolution, Trip, TripDecision } from '../../data/types'
import type { PlaceHit } from '../../lib/providers/hits'
import type { VisitPlaceLike } from '../../lib/placeIdentity'
import {
  planSlotPlacements,
  type ExistingRoadPosition,
  type RoadPositionEvidence,
  type SlotPlacementItem,
  type SlotPlacementResult,
} from '../../lib/slotPlacement'
import { isAirMode } from '../../lib/engine'
import {
  buildRoadChain,
  mapRoadViewFromLegs,
  resolvedLegs,
  roadChainSig,
  type TripRoadView,
} from '../../lib/tripRoad'
import { projectOntoPolyline } from '../../lib/providers/hits'

// The workspace road facts a measured slot resolution needs.
export interface SlotResolutionRoad {
  // The stable key of the measured chain.
  routeKey: string
  // The km along that chain, or null off the line.
  routeKmOf: (lat: number, lng: number) => number | null
}

export type SlotResolutionRefusal =
  | 'missing-winner' | 'missing-place' | 'missing-day' | 'day-changed'
  | 'missing-road' | 'stale-road' | 'missing-anchor' | 'stale-base' | 'planning-refused'

export type OrderedResolutionTarget = { dayId: ID; orderedPlacement: OrderedDecisionResolution }
export type LegacyResolutionTarget = { dayId?: ID; dayIndex?: number }

// A slot poll never takes the legacy append path.
export type DecisionResolutionPlan =
  | { kind: 'legacy'; target: LegacyResolutionTarget }
  | { kind: 'ordered'; target: OrderedResolutionTarget }
  | { kind: 'refused'; reason: SlotResolutionRefusal; detail?: string }

export interface DecisionResolutionInput {
  trip: Trip
  decision: TripDecision
  optionId: ID
  target?: LegacyResolutionTarget
  road: SlotResolutionRoad | null
}

export const SLOT_RESOLUTION_COPY: Record<SlotResolutionRefusal, string> = {
  'missing-winner': 'The chosen option is no longer in this vote.',
  'missing-place': 'The winning place has no valid location. It was not placed.',
  'missing-day': 'This slot vote has no current day. The winning stop was not placed.',
  'day-changed': 'The day changed since this vote was raised. It was not placed.',
  'missing-road': 'The road is not measured yet. Try again when the route is ready.',
  'stale-road': 'The measured route is out of date. Try again when the route is ready.',
  'missing-anchor': 'The winning place is off the measured route. It was not placed.',
  'stale-base': 'The trip changed during this vote. Try again.',
  'planning-refused': 'The winning stop has no road-order place. It was not placed.',
}

// A slot poll is a decision whose options carry the slot prefix.
function isSlotPoll(decision: TripDecision): boolean {
  return decision.options.some(o => typeof o.id === 'string' && o.id.startsWith('slot:'))
}

function refused(reason: SlotResolutionRefusal, detail?: string): DecisionResolutionPlan {
  return detail ? { kind: 'refused', reason, detail } : { kind: 'refused', reason }
}

function samePoint(a: { lat: number; lng: number }, b: { lat: number; lng: number }): boolean {
  return Math.abs(a.lat - b.lat) < 0.000005 && Math.abs(a.lng - b.lng) < 0.000005
}

// Grade the workspace measurement. A line alone is not evidence.
// This mirrors measuredRoadFacts with the same chain helpers.
export function slotResolutionRoadFor(
  trip: Trip,
  road: Pick<TripRoadView, 'status' | 'chain' | 'legs'> | null | undefined,
): SlotResolutionRoad | null {
  if (isAirMode(trip.transportMode)) return null
  if (!road || road.status !== 'ok' || !road.chain || !road.legs || road.legs.length === 0) return null
  const legs = road.legs
  const chain = road.chain
  if (!resolvedLegs(legs)) return null
  const current = buildRoadChain(trip)
  const sameChain = current.points.length === chain.points.length
    && current.points.every((point, index) => samePoint(point, chain.points[index]))
    && (!chain.ptStopId || chain.ptStopId.every((id, index) => id === current.ptStopId[index]))
  if (!sameChain) return null
  const view = mapRoadViewFromLegs(chain, legs, trip.days.map(d => d.index))
  const polyline: Array<{ lat: number; lng: number }> = []
  for (const pair of view.geometry ?? []) {
    const lng = pair?.[0]
    const lat = pair?.[1]
    if (Number.isFinite(lng) && Number.isFinite(lat)) polyline.push({ lat: lat as number, lng: lng as number })
  }
  if (polyline.length < 2) return null
  const routeKey = roadChainSig(trip)
  if (!routeKey) return null
  return {
    routeKey,
    routeKmOf: (lat, lng) => projectOntoPolyline({ latitude: lat, longitude: lng }, polyline)?.km ?? null,
  }
}

// Build the planner place and hit from one decision place payload.
// Both carry the same provider keys, so the planner sees no conflict.
function plannerItemOf(optionId: ID, place: DecisionPlacePayload, road: RoadPositionEvidence): SlotPlacementItem {
  const identity = place.place
  const placeLike: VisitPlaceLike = {
    name: place.title,
    title: place.title,
    locationName: place.locationName,
    lat: place.lat,
    lng: place.lng,
    ...(identity?.placeId ? { placeId: identity.placeId } : {}),
    ...(identity?.eLoc ? { eLoc: identity.eLoc } : {}),
    ...(identity?.source ? { source: identity.source } : {}),
    ...(identity ? { place: identity } : {}),
  }
  const hit: PlaceHit = {
    id: optionId,
    name: place.title,
    latitude: place.lat,
    longitude: place.lng,
    kind: 'poi',
    description: place.locationName,
    ...(identity?.placeId ? { placeId: identity.placeId } : {}),
    ...(identity?.eLoc ? { eLoc: identity.eLoc } : {}),
    ...(identity?.source ? { source: identity.source } : {}),
  }
  return { itemId: optionId, place: placeLike, hit, road }
}

export function planDecisionResolution(input: DecisionResolutionInput): DecisionResolutionPlan {
  const { trip, decision, optionId, target = {}, road } = input
  if (!isSlotPoll(decision)) return { kind: 'legacy', target: { ...target } }

  const winner = decision.options.find(o => o.id === optionId)
  if (!winner) return refused('missing-winner')
  const place = winner.place
  if (!place || !Number.isFinite(place.lat) || !Number.isFinite(place.lng)) return refused('missing-place')

  // The option carries the stable day captured when the crew raised the poll.
  const capturedDayId = place.dayId
  const recoveryDayId = target.dayId
  let dayId: ID
  if (capturedDayId) {
    if (recoveryDayId && recoveryDayId !== capturedDayId) return refused('day-changed')
    dayId = capturedDayId
  } else if (recoveryDayId) {
    dayId = recoveryDayId
  } else {
    return refused('missing-day')
  }
  const day = trip.days.find(d => d.id === dayId)
  if (!day) return refused('missing-day')

  if (!road || typeof road.routeKey !== 'string' || road.routeKey.length === 0) return refused('missing-road')
  if (roadChainSig(trip) !== road.routeKey) return refused('stale-road')
  const revision = trip.writeVersion
  if (typeof revision !== 'number' || !Number.isFinite(revision) || revision < 0) return refused('stale-base')

  const km = road.routeKmOf(place.lat, place.lng)
  if (km == null || !Number.isFinite(km) || km < 0) return refused('missing-anchor')

  const routeKey = road.routeKey
  const existingRoadPositions: ExistingRoadPosition[] = []
  for (const stop of day.stops) {
    if (stop.status === 'rejected') continue
    const stopKm = road.routeKmOf(stop.lat, stop.lng)
    if (stopKm == null || !Number.isFinite(stopKm) || stopKm < 0) continue
    existingRoadPositions.push({ stopId: stop.id, km: stopKm, routeKey, dayId })
  }
  const evidence: RoadPositionEvidence = { km, routeKey, dayId }
  const item = plannerItemOf(optionId, place, evidence)

  // The shared planner measures the insertion anchor only. The server owns the
  // duplicate and already-applied decisions, so a repeat is not refused here.
  let result: SlotPlacementResult
  try {
    result = planSlotPlacements({
      trip,
      items: [item],
      policy: {
        tripId: trip.id,
        dayId,
        operationId: `slot-resolution:${decision.id}:${optionId}`,
        acceptedRouteKeys: [routeKey],
        allowRepeatVisit: true,
        buildStop: () => ({
          id: `slot-winner:${decision.id}:${optionId}`,
          category: place.category,
          title: place.title,
          locationName: place.locationName,
          visitMinutes: place.visitMinutes,
          description: place.description ?? '',
          ...(place.openTime ? { openTime: place.openTime } : {}),
          ...(place.closeTime ? { closeTime: place.closeTime } : {}),
          status: 'confirmed',
        }),
      },
      existingRoadPositions,
    })
  } catch {
    return refused('planning-refused')
  }
  const planned = result.planned[0]
  if (!planned) return refused('missing-anchor', result.skipped[0]?.reason)
  return {
    kind: 'ordered',
    target: { dayId, orderedPlacement: { dayId, beforeStopId: planned.beforeStopId, expectedRevision: revision } },
  }
}

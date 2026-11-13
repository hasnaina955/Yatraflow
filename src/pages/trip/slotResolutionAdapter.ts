// ============ Resolved slot vote caller adapter (#841) ============
// Production Group input calls this module before it calls the store.
// A slot poll wins one atomic ordered target from the shared planner.
// The workspace grades its road before this call.
// This module starts no routing call and applies no SQL.
import type { DecisionPlacePayload, ID, OrderedDecisionResolution, Trip, TripDecision } from '../../data/types'
import type { DecisionResolutionOutcome } from '../../store/collabCommand'
import type { PlaceHit } from '../../lib/providers/hits'
import type { VisitPlaceLike } from '../../lib/placeIdentity'
import {
  planSlotPlacements,
  type ExistingRoadPosition,
  type RoadPositionEvidence,
  type SlotPlacementItem,
  type SlotPlacementResult,
} from '../../lib/slotPlacement'
import { mapRoadViewFromLegs, type RoadStatus, type TripRoadView } from '../../lib/tripRoad'
import { projectOntoPolyline } from '../../lib/providers/hits'
import { measuredRoadFacts, type RoadUnmeasuredReason } from './map/mapTabPipeline'

// The measured road facts one slot resolution needs.
export interface SlotResolutionRoad {
  // The stable key of the measured chain.
  routeKey: string
  // The km along that chain, or null off the line.
  routeKmOf: (lat: number, lng: number) => number | null
}

// The workspace road context the Group tab receives.
// A null measured field keeps the grade reason and the retry action.
export interface SlotRoadContext {
  measured: SlotResolutionRoad | null
  reason: RoadUnmeasuredReason | null
  status: RoadStatus
  // True when a retry can make the road measurable.
  recoverable: boolean
  // The workspace retry action. It starts no new call here.
  retry: () => void
}

// One resolution context. The trip is committed, never a staged draft.
export interface SlotResolutionContext {
  trip: Trip
  road: SlotRoadContext | null
}

export type SlotResolutionRefusal =
  | 'missing-winner' | 'missing-place' | 'missing-day' | 'day-changed'
  | 'missing-road' | 'stale-road' | 'road-unavailable' | 'missing-anchor'
  | 'stale-base' | 'planning-refused'

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
  road: SlotRoadContext | null
}

export const SLOT_RESOLUTION_COPY: Record<SlotResolutionRefusal, string> = {
  'missing-winner': 'The chosen option is no longer in this vote.',
  'missing-place': 'The winning place has no valid location. It was not placed.',
  'missing-day': 'This slot vote has no current day. Choose a day below, then place it.',
  'day-changed': 'The day changed since this vote was raised. It was not placed.',
  'missing-road': 'The road is not measured yet. Measure the route, then resolve again.',
  'stale-road': 'The measured route is out of date. Measure the route, then resolve again.',
  'road-unavailable': 'Ordered placement is unavailable for this trip. The winning stop was not placed.',
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

// A retry helps a pending, failed, estimate-only or stale grade.
// Air and a trip with fewer than two chain points have no road to measure.
function recoverableGrade(reason: RoadUnmeasuredReason, status: RoadStatus): boolean {
  if (reason === 'air-journey') return false
  if (reason === 'no-measurement' && status === 'ok') return false
  return true
}

// Grade the workspace measurement with the Map tab grade function.
// A line alone is not evidence.
// The polyline comes from the same road view the Map tab draws.
export function slotResolutionRoadFor(
  trip: Trip,
  road: TripRoadView | null | undefined,
): SlotRoadContext {
  const view = mapRoadViewFromLegs(road?.chain ?? null, road?.legs ?? null, trip.days.map(d => d.index))
  const polyline: Array<{ lat: number; lng: number }> = []
  // A transport can send a malformed pair. The type says tuple, so read each
  // entry as unknown here and check it before it reaches the polyline.
  for (const pair of view.geometry ?? []) {
    const entry: unknown = pair
    if (!Array.isArray(entry)) continue
    const [lng, lat] = entry
    if (typeof lng === 'number' && Number.isFinite(lng)
      && typeof lat === 'number' && Number.isFinite(lat)) {
      polyline.push({ lat, lng })
    }
  }
  const grade = measuredRoadFacts({ trip, road, hasLine: polyline.length >= 2 })
  const status: RoadStatus = road?.status ?? 'pending'
  const retry = road?.retry ?? (() => {})
  if (!grade.measured) {
    return {
      measured: null,
      reason: grade.reason,
      status,
      recoverable: !!road && recoverableGrade(grade.reason, status),
      retry,
    }
  }
  return {
    measured: {
      routeKey: grade.routeKey,
      routeKmOf: (lat, lng) => projectOntoPolyline({ latitude: lat, longitude: lng }, polyline)?.km ?? null,
    },
    reason: null,
    status,
    recoverable: false,
    retry,
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

  if (!road || !road.measured) {
    const reason = road?.reason === 'stale-chain' ? 'stale-road'
      : road?.recoverable ? 'missing-road'
        : 'road-unavailable'
    return refused(reason, road?.reason ?? undefined)
  }
  const revision = trip.writeVersion
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0) return refused('stale-base')

  const km = road.measured.routeKmOf(place.lat, place.lng)
  if (km == null || !Number.isFinite(km) || km < 0) return refused('missing-anchor')

  const routeKey = road.measured.routeKey
  const existingRoadPositions: ExistingRoadPosition[] = []
  for (const stop of day.stops) {
    if (stop.status === 'rejected') continue
    const stopKm = road.measured.routeKmOf(stop.lat, stop.lng)
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
  // The planner can return no planned item. Read the first with an explicit
  // guard so a missing item stays undefined, and a short skipped list stays safe.
  const planned = result.planned.length > 0 ? result.planned[0] : undefined
  if (!planned) {
    const skippedReason = result.skipped.length > 0 ? result.skipped[0].reason : undefined
    return refused('missing-anchor', skippedReason)
  }
  return {
    kind: 'ordered',
    target: { dayId, orderedPlacement: { dayId, beforeStopId: planned.beforeStopId, expectedRevision: revision } },
  }
}

export interface DecisionResolutionDeps {
  resolveDecision: (decisionId: ID, optionId: ID, target: LegacyResolutionTarget | OrderedResolutionTarget) => Promise<DecisionResolutionOutcome>
  toast: (message: string, kind?: 'ok' | 'err') => void
  reportCollabOutcome: (outcome: DecisionResolutionOutcome) => void
  refuseWhileStaged: (staged?: boolean) => boolean
  claim: () => boolean
  release: () => void
  onPlacementDays: (days: Array<{ id: string; index: number; title?: string }> | null) => void
  onPlacementDayId: (id: string) => void
}

export interface DecisionResolutionFlowInput {
  context: SlotResolutionContext | null
  decision: TripDecision
  optionId: ID
  target?: LegacyResolutionTarget
  previewOpen?: boolean
}

// Each result names the state the card must show.
export type DecisionResolutionFlow =
  | { kind: 'staged' }
  | { kind: 'not-claimed' }
  | { kind: 'refused'; reason: SlotResolutionRefusal; detail: string | null; copy: string; recoverable: boolean }
  | { kind: 'settled'; outcome: DecisionResolutionOutcome; needsDayPicker: boolean }
  | { kind: 'threw' }

// The production Group input resolves a decision through this one branch.
// The adapter, the planner and the store stay real. Only transports are injected.
export async function runDecisionResolution(
  input: DecisionResolutionFlowInput,
  deps: DecisionResolutionDeps,
): Promise<DecisionResolutionFlow> {
  if (deps.refuseWhileStaged(input.previewOpen)) return { kind: 'staged' }
  if (!deps.claim()) return { kind: 'not-claimed' }
  try {
    if (!input.context) {
      const copy = SLOT_RESOLUTION_COPY['road-unavailable']
      deps.toast(copy, 'err')
      return { kind: 'refused', reason: 'road-unavailable', detail: 'no-context', copy, recoverable: false }
    }
    const plan = planDecisionResolution({
      trip: input.context.trip,
      road: input.context.road,
      decision: input.decision,
      optionId: input.optionId,
      target: input.target,
    })
    if (plan.kind === 'refused') {
      const copy = SLOT_RESOLUTION_COPY[plan.reason]
      deps.toast(copy, 'err')
      return {
        kind: 'refused',
        reason: plan.reason,
        detail: plan.detail ?? null,
        copy,
        recoverable: (plan.reason === 'missing-road' || plan.reason === 'stale-road')
          && !!input.context.road?.recoverable,
      }
    }
    const outcome = await deps.resolveDecision(input.decision.id, input.optionId, plan.target)
    let needsDayPicker = false
    if (outcome.status === 'applied' || outcome.status === 'alreadyApplied') {
      if (outcome.placement.status === 'needsDay') {
        deps.onPlacementDays(outcome.placement.availableDays)
        deps.onPlacementDayId('')
        needsDayPicker = true
        deps.toast('The vote is resolved. Choose a current day to place the winning stop.', 'err')
      } else if (outcome.placement.status === 'needsPlace') {
        deps.toast('The vote is resolved, but its winning place needs a valid location.', 'err')
      } else {
        deps.onPlacementDays(null)
        deps.toast(outcome.placement.status === 'notRequired' ? 'Decision resolved' : 'Decision resolved and placed')
      }
    } else {
      deps.reportCollabOutcome(outcome)
    }
    return { kind: 'settled', outcome, needsDayPicker }
  } catch {
    deps.toast('Could not resolve this vote. It is still open. Try again.', 'err')
    return { kind: 'threw' }
  } finally {
    deps.release()
  }
}

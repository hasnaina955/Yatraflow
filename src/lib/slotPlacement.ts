import type { ItineraryDay, ItineraryStop, StopCategory, Trip } from '../data/types'
import type { PlaceHit } from './providers/hits'
import {
  isSameEntity,
  placeKeysOf,
  placeKeyMatches,
  type PlaceKey,
  type VisitPlaceLike,
} from './placeIdentity'

/** A measured road fact injected by the caller. This module performs no routing. */
export interface RoadPositionEvidence {
  km: number
  /** Stable identity of the measured route. */
  routeKey: string
  /** Day the measured position belongs to, by stable day id. */
  dayId: string
  /** Inclusive road-km span measured for that day. */
  fromKm?: number
  toKm?: number
}

/** A measured road fact for a stop already on the target day. */
export interface ExistingRoadPosition {
  stopId: string
  km: number
  routeKey: string
  dayId: string
}

export interface SlotPlacementItem {
  /** Identity of the choice inside one operation. */
  itemId: string
  /** Existing, resolved place identity. */
  place: VisitPlaceLike
  /** Existing, resolved provider hit used by the caller to build a visit. */
  hit: PlaceHit
  /** Road evidence already measured for this exact place and target day. */
  road: RoadPositionEvidence | null
  /** Reason from an upstream rejected visit. The planner never clears it. */
  rejected?: boolean
}

/** Presentation fields for a proposed stop. Provider identity comes from `item.place`. */
export interface SlotPlacementStopFields {
  id: string
  category?: StopCategory
  title?: string
  locationName?: string
  visitMinutes?: number
  priority?: ItineraryStop['priority']
  notes?: string
  slotKey?: string
  sourceUrl?: string
  description?: string
  openTime?: string
  closeTime?: string
  status?: ItineraryStop['status']
}

export interface SlotPlacementPolicy {
  tripId: string
  /** Target day identity. A day title or array index is not a substitute. */
  dayId: string
  /** One identity for this operation. */
  operationId: string
  /** Existing road-evidence keys allowed for this operation. */
  acceptedRouteKeys?: readonly string[]
  /** Explicit product decision to place a repeat of a visit already on the plan. */
  allowRepeatVisit?: boolean
  /** Builds a proposed stop without inventing resolved coordinates or identity. */
  buildStop: (item: SlotPlacementItem) => SlotPlacementStopFields
}

export type SlotPlacementReason =
  | 'missing-day'
  | 'ambiguous-day'
  | 'trip-id-mismatch'
  | 'unresolved-coordinates'
  | 'invalid-road-position'
  | 'unknown-road-position'
  | 'out-of-day-road-position'
  | 'unknown-road-route'
  | 'conflicting-road-route'
  | 'invalid-existing-road-evidence'
  | 'conflicting-existing-road-evidence'
  | 'out-of-day-existing-road-evidence'
  | 'unknown-insertion-point'
  | 'duplicate-in-operation'
  | 'rejected-visit'
  | 'provider-conflict'
  | 'already-in-plan'
  | 'duplicate-stop-id'
  | 'invalid-stop-id'

export type SlotPlacementPhase = 'draft' | 'planned' | 'skipped'

export type SlotPlacementOrdering = {
  kind: 'measured-road-km'
  km: number
  beforeStopId: string | null
}

export interface SlotPlacementPlan {
  itemId: string
  phase: Extract<SlotPlacementPhase, 'planned'>
  /** A draft stop. No server acknowledgement has happened. */
  stop: ItineraryStop
  /** Insertion index in the proposed day's stop array. */
  insertAt: number
  /** Stable identity of the next stop, or null when the stop is last. */
  beforeStopId: string | null
  ordering: SlotPlacementOrdering
}

export interface SlotPlacementSkip {
  itemId: string
  phase: Extract<SlotPlacementPhase, 'skipped'>
  reason: SlotPlacementReason
}

export type SlotPlacementOutcome = SlotPlacementPlan | SlotPlacementSkip

export interface SlotPlacementResult {
  /** Always `draft`. A caller must not read a planned item as acknowledged. */
  phase: Extract<SlotPlacementPhase, 'draft'>
  operationId: string
  tripId: string
  dayId: string
  planned: SlotPlacementPlan[]
  skipped: SlotPlacementSkip[]
  outcomes: SlotPlacementOutcome[]
  /** Null when no day matched. Untouched days are not returned. */
  proposedDay: ItineraryDay | null
  /** Draft trip with only the touched stop array and order fields cloned. */
  proposedTrip: Trip
}

export interface SlotPlacementInput {
  trip: Trip
  items: readonly SlotPlacementItem[]
  policy: SlotPlacementPolicy
  /** Existing road-km evidence. Missing evidence leaves a stop unmeasured. */
  existingRoadPositions?: readonly ExistingRoadPosition[]
}

function validCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function coordinatePair(place: VisitPlaceLike): { lat: number; lng: number } | null {
  const lat = place.lat ?? place.latitude
  const lng = place.lng ?? place.longitude
  if (!validCoordinate(lat) || !validCoordinate(lng)) return null
  if (lat === 0 && lng === 0) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}

/** Flattens persisted nested identity beside the flat fields the existing rules use. */
function normalizedPlace(place: VisitPlaceLike): VisitPlaceLike {
  const nested = place.place
  const lat = place.lat ?? place.latitude
  const lng = place.lng ?? place.longitude
  return {
    ...place,
    name: place.locationName || place.title || place.name,
    placeId: place.placeId ?? nested?.placeId,
    eLoc: place.eLoc ?? nested?.eLoc,
    source: place.source ?? nested?.source ?? place.placeSource,
    lat,
    lng,
    latitude: lat,
    longitude: lng,
  }
}

function providerConflicts(left: VisitPlaceLike, right: VisitPlaceLike): boolean {
  const leftKeys = placeKeysOf(normalizedPlace(left))
  const rightKeys = placeKeysOf(normalizedPlace(right))
  return leftKeys.length > 0
    && rightKeys.length > 0
    && !leftKeys.some(a => rightKeys.some(b => placeKeyMatches(a, b)))
}

function samePlace(left: VisitPlaceLike, right: VisitPlaceLike): boolean {
  return isSameEntity(normalizedPlace(left), normalizedPlace(right))
}

function entityKeys(place: VisitPlaceLike): PlaceKey[] {
  return placeKeysOf(normalizedPlace(place))
}

function stopEntity(stop: ItineraryStop): VisitPlaceLike {
  return {
    id: stop.id,
    title: stop.title,
    locationName: stop.locationName,
    placeId: stop.placeId,
    eLoc: stop.eLoc,
    placeSource: stop.placeSource,
    source: stop.placeSource,
    lat: stop.lat,
    lng: stop.lng,
  }
}

function stopBaseFields(item: SlotPlacementItem): Pick<
  ItineraryStop,
  'title' | 'locationName' | 'lat' | 'lng' | 'placeId' | 'eLoc' | 'placeSource'
> {
  const place = normalizedPlace(item.place)
  const coords = coordinatePair(place)
  if (!coords) throw new Error('unresolved-coordinates')
  const title = typeof place.name === 'string' && place.name.trim()
    ? place.name.trim()
    : item.hit.name
  const locationName = typeof place.locationName === 'string' && place.locationName.trim()
    ? place.locationName.trim()
    : title
  return {
    title,
    locationName,
    lat: coords.lat,
    lng: coords.lng,
    ...(typeof place.placeId === 'string' && place.placeId ? { placeId: place.placeId } : {}),
    ...(typeof place.eLoc === 'string' && place.eLoc ? { eLoc: place.eLoc } : {}),
    ...(place.source ? { placeSource: place.source } : {}),
  }
}

function skip(item: SlotPlacementItem, reason: SlotPlacementReason): SlotPlacementSkip {
  return { itemId: item.itemId, phase: 'skipped', reason }
}

function untouchedDayResult(
  input: SlotPlacementInput,
  reason: SlotPlacementReason,
  outcomes: SlotPlacementOutcome[],
  planned: SlotPlacementPlan[],
  skipped: SlotPlacementSkip[],
): SlotPlacementResult {
  for (const item of input.items) {
    const outcome = skip(item, reason)
    outcomes.push(outcome)
    skipped.push(outcome)
  }
  return {
    phase: 'draft',
    operationId: input.policy.operationId,
    tripId: input.policy.tripId,
    dayId: input.policy.dayId,
    planned,
    skipped,
    outcomes,
    proposedDay: null,
    proposedTrip: input.trip,
  }
}

function normalizeEvidence(
  road: RoadPositionEvidence | null,
  dayId: string,
  acceptedRouteKeys: readonly string[] | undefined,
): { km: number; routeKey: string } | SlotPlacementReason {
  if (!road) return 'unknown-road-position'
  if (!Number.isFinite(road.km) || road.km < 0) return 'invalid-road-position'
  if (typeof road.routeKey !== 'string' || road.routeKey.trim().length === 0) return 'unknown-road-route'
  if (road.dayId !== dayId) return 'out-of-day-road-position'
  if (acceptedRouteKeys && !acceptedRouteKeys.includes(road.routeKey)) return 'conflicting-road-route'
  if (road.fromKm != null && (!Number.isFinite(road.fromKm) || road.fromKm < 0)) return 'invalid-road-position'
  if (road.toKm != null && (!Number.isFinite(road.toKm) || road.toKm < 0)) return 'invalid-road-position'
  if (road.fromKm != null && road.toKm != null && road.fromKm > road.toKm) return 'invalid-road-position'
  if (road.fromKm != null && road.km < road.fromKm) return 'out-of-day-road-position'
  if (road.toKm != null && road.km > road.toKm) return 'out-of-day-road-position'
  return { km: road.km, routeKey: road.routeKey }
}

function keysMatch(left: readonly PlaceKey[], right: readonly PlaceKey[]): boolean {
  return left.some(a => right.some(b => placeKeyMatches(a, b)))
}

/**
 * Plans one operation's slot visits against the current trip.
 *
 * A planned item describes a proposed stop in a draft trip. The caller owns
 * persistence and acknowledgement. This function never says an item was
 * applied. It does not mutate `trip` or any item.
 */
export function planSlotPlacements(input: SlotPlacementInput): SlotPlacementResult {
  const { trip, items, policy, existingRoadPositions = [] } = input
  const matchingDays = trip.id === policy.tripId
    ? trip.days.filter(day => day.id === policy.dayId)
    : []
  const targetDay = matchingDays.length === 1 ? matchingDays[0] : null
  const outcomes: SlotPlacementOutcome[] = []
  const planned: SlotPlacementPlan[] = []
  const skipped: SlotPlacementSkip[] = []
  const push = (outcome: SlotPlacementOutcome) => {
    outcomes.push(outcome)
    if (outcome.phase === 'planned') planned.push(outcome)
    else skipped.push(outcome)
  }
  const skippedResult = (reason: SlotPlacementReason): SlotPlacementResult =>
    untouchedDayResult(input, reason, outcomes, planned, skipped)

  if (trip.id !== policy.tripId) return skippedResult('trip-id-mismatch')
  if (matchingDays.length === 0) return skippedResult('missing-day')
  if (matchingDays.length > 1) return skippedResult('ambiguous-day')
  if (!targetDay) return skippedResult('missing-day')

  const existingEvidence = new Map<string, ExistingRoadPosition>()
  const acceptedRouteKeys = policy.acceptedRouteKeys
  let existingEvidenceError: SlotPlacementReason | null = null
  for (const evidence of existingRoadPositions) {
    if (typeof evidence.stopId !== 'string' || !targetDay.stops.some(stop => stop.id === evidence.stopId)) {
      existingEvidenceError = 'invalid-existing-road-evidence'
      break
    }
    if (evidence.dayId !== policy.dayId) {
      existingEvidenceError = 'out-of-day-existing-road-evidence'
      break
    }
    if (!Number.isFinite(evidence.km) || evidence.km < 0
      || typeof evidence.routeKey !== 'string' || evidence.routeKey.trim().length === 0) {
      existingEvidenceError = 'invalid-existing-road-evidence'
      break
    }
    if (acceptedRouteKeys && !acceptedRouteKeys.includes(evidence.routeKey)) {
      existingEvidenceError = 'conflicting-road-route'
      break
    }
    const previous = existingEvidence.get(evidence.stopId)
    if (previous && (previous.km !== evidence.km || previous.routeKey !== evidence.routeKey)) {
      existingEvidenceError = 'conflicting-existing-road-evidence'
      break
    }
    existingEvidence.set(evidence.stopId, evidence)
  }
  if (existingEvidenceError) return skippedResult(existingEvidenceError)

  const rawRouteKeys = new Set<string>()
  for (const item of items) {
    const road = item.road
    if (road?.dayId === policy.dayId && typeof road.routeKey === 'string' && road.routeKey.trim()) {
      rawRouteKeys.add(road.routeKey)
    }
  }
  for (const evidence of existingEvidence.values()) rawRouteKeys.add(evidence.routeKey)
  const permittedRouteKeys = acceptedRouteKeys
    ? [...rawRouteKeys].filter(key => acceptedRouteKeys.includes(key))
    : [...rawRouteKeys]
  const rejectedRouteKeys = acceptedRouteKeys
    ? [...rawRouteKeys].filter(key => !acceptedRouteKeys.includes(key))
    : []
  let routeKey: string | null = null
  let routeFailureReason: SlotPlacementReason | null = null
  if (rawRouteKeys.size === 0) routeFailureReason = 'unknown-road-position'
  else if (rawRouteKeys.size > 1 || rejectedRouteKeys.length > 0) routeFailureReason = 'conflicting-road-route'
  else if (permittedRouteKeys.length === 1) routeKey = permittedRouteKeys[0]
  else routeFailureReason = 'unknown-road-route'
  if (!routeKey) {
    for (const item of items) {
      const perItemReason = normalizeEvidence(item.road, policy.dayId, acceptedRouteKeys)
      const reason = typeof perItemReason === 'string' ? perItemReason : routeFailureReason
      push(skip(item, reason ?? 'unknown-road-route'))
    }
    return {
      phase: 'draft', operationId: policy.operationId, tripId: policy.tripId, dayId: policy.dayId,
      planned, skipped, outcomes,
      proposedDay: targetDay ? { ...targetDay, stops: [...targetDay.stops] } : null,
      proposedTrip: trip,
    }
  }

  const roadKmOf = (stopId: string): number | null => {
    const evidence = existingEvidence.get(stopId)
    return evidence && evidence.routeKey === routeKey ? evidence.km : null
  }
  const measuredExisting = targetDay.stops
    .filter(stop => stop.status !== 'rejected')
    .map(stop => {
      const km = roadKmOf(stop.id)
      return km == null ? null : { stop, km }
    })
    .filter((entry): entry is { stop: ItineraryStop; km: number } => entry !== null)
  const reserved: Array<{ keys: PlaceKey[]; place: VisitPlaceLike; itemId: string }> = []
  // Trip-unique stop ids: seed from every day's stops, growing as items plan here.
  const usedStopIds = new Set(trip.days.flatMap(day => day.stops.map(stop => stop.id)))
  const proposedStops = [...targetDay.stops]
  const leadingAutoCount = (() => {
    let count = 0
    while (count < proposedStops.length && proposedStops[count].auto === true) count += 1
    return count
  })()

  for (const item of items) {
    const evidence = normalizeEvidence(item.road, policy.dayId, [routeKey])
    if (typeof evidence === 'string') { push(skip(item, evidence)); continue }
    if (!coordinatePair(item.place) || !coordinatePair(item.hit)) { push(skip(item, 'unresolved-coordinates')); continue }
    if (item.rejected) { push(skip(item, 'rejected-visit')); continue }
    if (providerConflicts(item.place, item.hit)) { push(skip(item, 'provider-conflict')); continue }

    const keys = entityKeys(item.place)
    const reservedDuplicate = reserved.some(entry => keysMatch(entry.keys, keys) || samePlace(entry.place, item.place))
    const inPlan = proposedStops.some(stop => stop.status !== 'rejected'
      && samePlace(stopEntity(stop), item.place))
    if (reservedDuplicate) {
      push(skip(item, 'duplicate-in-operation'))
      continue
    }
    if (inPlan && !policy.allowRepeatVisit) { push(skip(item, 'already-in-plan')); continue }

    const fields = policy.buildStop(item)
    if (typeof fields.id !== 'string' || fields.id.trim().length === 0) {
      push(skip(item, 'invalid-stop-id'))
      continue
    }
    // Stop IDs are trip-scoped: a generated id colliding with a stop on any day replaces nothing.
    if (usedStopIds.has(fields.id)) { push(skip(item, 'duplicate-stop-id')); continue }

    const base = stopBaseFields(item)
    const stop: ItineraryStop = {
      id: fields.id,
      title: fields.title ?? base.title,
      category: fields.category ?? 'sightseeing',
      locationName: fields.locationName ?? base.locationName,
      lat: base.lat,
      lng: base.lng,
      ...(base.placeId ? { placeId: base.placeId } : {}),
      ...(base.eLoc ? { eLoc: base.eLoc } : {}),
      ...(base.placeSource ? { placeSource: base.placeSource } : {}),
      description: fields.description ?? '',
      visitMinutes: fields.visitMinutes ?? 0,
      entryFeeInrPerPerson: 0,
      transportCostInrTotal: 0,
      priority: fields.priority ?? 'nice-to-have',
      notes: fields.notes ?? '',
      ...(fields.slotKey ? { slotKey: fields.slotKey } : {}),
      sourceUrl: fields.sourceUrl ?? '',
      ...(fields.openTime ? { openTime: fields.openTime } : {}),
      ...(fields.closeTime ? { closeTime: fields.closeTime } : {}),
      status: fields.status ?? 'suggested',
      orderInDay: proposedStops.length + 1,
    }

    const greaterEndpoint = measuredExisting
      .filter(entry => entry.km > evidence.km)
      .sort((a, b) => a.km - b.km || proposedStops.indexOf(a.stop) - proposedStops.indexOf(b.stop))[0] ?? null
    const equalEndpoint = measuredExisting
      .filter(entry => entry.km === evidence.km)
      .sort((a, b) => proposedStops.indexOf(a.stop) - proposedStops.indexOf(b.stop))
      .slice(-1)[0] ?? null
    const plannedAtKm = planned
      .filter(entry => entry.ordering.kind === 'measured-road-km')
      .map(entry => entry.ordering.km)
    const equalPlannedAtKm = plannedAtKm.filter(km => km === evidence.km).length
    const lastNotGreater = measuredExisting
      .filter(entry => entry.km <= evidence.km)
      .sort((a, b) => a.km - b.km || proposedStops.indexOf(a.stop) - proposedStops.indexOf(b.stop))
      .slice(-1)[0] ?? null

    let insertAt: number
    if (equalEndpoint) {
      insertAt = proposedStops.findIndex(candidate => candidate.id === equalEndpoint.stop.id) + 1
    } else if (greaterEndpoint) {
      insertAt = proposedStops.findIndex(candidate => candidate.id === greaterEndpoint.stop.id)
    } else if (lastNotGreater && (evidence.km > lastNotGreater.km || equalPlannedAtKm > 0)) {
      insertAt = proposedStops.findIndex(candidate => candidate.id === lastNotGreater.stop.id) + 1
    } else if (proposedStops.length === 0) {
      insertAt = 0
    } else {
      push(skip(item, 'unknown-insertion-point'))
      continue
    }
    if (insertAt < 0) { push(skip(item, 'invalid-existing-road-evidence')); continue }
    if (insertAt < leadingAutoCount) insertAt = leadingAutoCount
    if (insertAt > proposedStops.length) insertAt = proposedStops.length

    const beforeStopId = proposedStops[insertAt]?.id ?? null
    const ordering: SlotPlacementOrdering = { kind: 'measured-road-km', km: evidence.km, beforeStopId }
    stop.orderInDay = insertAt + 1
    proposedStops.splice(insertAt, 0, stop)
    measuredExisting.push({ stop, km: evidence.km })
    usedStopIds.add(fields.id)
    reserved.push({ keys, place: item.place, itemId: item.itemId })
    push({
      itemId: item.itemId,
      phase: 'planned',
      stop,
      insertAt,
      beforeStopId,
      ordering,
    })
  }

  // A zero-planned operation must not renumber existing stops into contiguous
  // orderInDay values. A skipped placement must not repair numbering. The trip is
  // returned untouched, matching the all-skipped route-failure path above.
  if (planned.length === 0) {
    return {
      phase: 'draft', operationId: policy.operationId, tripId: policy.tripId, dayId: policy.dayId,
      planned, skipped, outcomes,
      proposedDay: { ...targetDay, stops: [...targetDay.stops] },
      proposedTrip: trip,
    }
  }

  const renumbered = proposedStops.map((stop, index) => ({ ...stop, orderInDay: index + 1 }))
  for (const plan of planned) {
    const finalIndex = renumbered.findIndex(stop => stop.id === plan.stop.id)
    if (finalIndex < 0) continue
    const finalStop = renumbered[finalIndex]
    const finalBeforeStopId = renumbered[finalIndex + 1]?.id ?? null
    plan.stop = finalStop
    plan.insertAt = finalIndex
    plan.beforeStopId = finalBeforeStopId
    if (plan.ordering.kind === 'measured-road-km') {
      plan.ordering = { kind: 'measured-road-km', km: plan.ordering.km, beforeStopId: plan.beforeStopId }
    }
  }
  const proposedDay: ItineraryDay = { ...targetDay, stops: renumbered }
  const proposedTrip: Trip = {
    ...trip,
    days: trip.days.map(day => day.id === policy.dayId ? proposedDay : day),
  }
  return {
    phase: 'draft', operationId: policy.operationId, tripId: policy.tripId, dayId: policy.dayId,
    planned, skipped, outcomes, proposedDay, proposedTrip,
  }
}

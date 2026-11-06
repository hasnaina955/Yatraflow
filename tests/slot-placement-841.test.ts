import { describe, expect, it } from 'vitest'
import type { ItineraryDay, ItineraryStop, Trip } from '../src/data/types'
import type { PlaceHit } from '../src/lib/providers/hits'
import type { VisitPlaceLike } from '../src/lib/placeIdentity'
import {
  planSlotPlacements,
  type ExistingRoadPosition,
  type RoadPositionEvidence,
  type SlotPlacementItem,
  type SlotPlacementPolicy,
} from '../src/lib/slotPlacement'

const ROUTE = 'route-a'
const DAY_ID = 'day-steady'

function stop(over: Partial<ItineraryStop> & Pick<ItineraryStop, 'id' | 'title' | 'orderInDay'>): ItineraryStop {
  return {
    id: over.id,
    title: over.title,
    category: over.category ?? 'sightseeing',
    locationName: over.locationName ?? over.title,
    lat: over.lat ?? 10 + over.orderInDay,
    lng: over.lng ?? 70 + over.orderInDay,
    description: over.description ?? '',
    visitMinutes: over.visitMinutes ?? 30,
    entryFeeInrPerPerson: 0,
    transportCostInrTotal: 0,
    priority: over.priority ?? 'nice-to-have',
    notes: over.notes ?? '',
    status: over.status ?? 'confirmed',
    orderInDay: over.orderInDay,
    ...(over.auto !== undefined ? { auto: over.auto } : {}),
    ...(over.placeId ? { placeId: over.placeId } : {}),
    ...(over.placeSource ? { placeSource: over.placeSource } : {}),
    ...(over.slotKey ? { slotKey: over.slotKey } : {}),
    ...(over.sourceUrl ? { sourceUrl: over.sourceUrl } : {}),
  }
}

function day(over: Partial<ItineraryDay> = {}): ItineraryDay {
  return {
    id: over.id ?? DAY_ID,
    index: over.index ?? 4,
    title: over.title ?? 'Edited title',
    stops: over.stops ?? [],
  }
}

function trip(over: Partial<Trip> = {}): Trip {
  return {
    id: 'trip-1',
    name: 'Trip',
    startLocation: 'A',
    destinations: ['B'],
    startDate: '2026-09-01',
    endDate: '2026-09-05',
    travellers: 2,
    transportMode: 'car',
    budgetPerPersonInr: 10000,
    travelStyle: 'balanced',
    fixedCommitments: over.fixedCommitments ?? [],
    days: over.days ?? [day()],
    expenses: [],
    coverEmoji: 'road',
    visibility: 'private',
    createdAt: 0,
    updatedAt: 0,
  } as Trip
}

function hit(over: Partial<PlaceHit> & Pick<PlaceHit, 'id' | 'name'>): PlaceHit {
  return {
    id: over.id,
    name: over.name,
    latitude: over.latitude ?? 12.1,
    longitude: over.longitude ?? 75.2,
    kind: over.kind ?? 'place',
    ...(over.source ? { source: over.source } : {}),
    ...(over.placeId ? { placeId: over.placeId } : {}),
    ...(over.eLoc ? { eLoc: over.eLoc } : {}),
  }
}

function place(over: Partial<VisitPlaceLike> & Pick<VisitPlaceLike, 'name' | 'lat' | 'lng'>): VisitPlaceLike {
  return {
    name: over.name,
    lat: over.lat,
    lng: over.lng,
    ...(over.title ? { title: over.title } : {}),
    ...(over.locationName ? { locationName: over.locationName } : {}),
    ...(over.placeId ? { placeId: over.placeId } : {}),
    ...(over.eLoc ? { eLoc: over.eLoc } : {}),
    ...(over.source ? { source: over.source } : {}),
    ...(over.placeSource ? { placeSource: over.placeSource } : {}),
    ...(over.place ? { place: over.place } : {}),
  }
}

function road(km: number, over: Partial<RoadPositionEvidence> = {}): RoadPositionEvidence {
  return {
    km,
    routeKey: ROUTE,
    dayId: DAY_ID,
    fromKm: 0,
    toKm: 100,
    ...over,
  }
}

function existing(stopId: string, km: number, over: Partial<ExistingRoadPosition> = {}): ExistingRoadPosition {
  return { stopId, km, routeKey: ROUTE, dayId: DAY_ID, ...over }
}

function item(over: Partial<SlotPlacementItem> & Pick<SlotPlacementItem, 'itemId' | 'hit'>): SlotPlacementItem {
  const placeValue = over.place ?? place({
    name: over.hit.name,
    lat: over.hit.latitude,
    lng: over.hit.longitude,
    ...(over.hit.placeId ? { placeId: over.hit.placeId, source: over.hit.source } : {}),
    ...(over.hit.eLoc ? { eLoc: over.hit.eLoc, source: over.hit.source } : {}),
    ...(over.hit.source && !over.hit.placeId && !over.hit.eLoc ? { source: over.hit.source } : {}),
  })
  return {
    itemId: over.itemId,
    hit: over.hit,
    place: placeValue,
    road: over.road === undefined ? road(40) : over.road,
    ...(over.rejected !== undefined ? { rejected: over.rejected } : {}),
  }
}

function policy(over: Partial<SlotPlacementPolicy> = {}): SlotPlacementPolicy {
  return {
    tripId: over.tripId ?? 'trip-1',
    dayId: over.dayId ?? DAY_ID,
    operationId: over.operationId ?? 'op-1',
    buildStop: over.buildStop ?? (candidate => ({
      id: `stop-${candidate.itemId}`,
      slotKey: 'lunch',
      visitMinutes: 45,
    })),
    ...(over.acceptedRouteKeys ? { acceptedRouteKeys: over.acceptedRouteKeys } : {}),
    ...(over.allowRepeatVisit !== undefined ? { allowRepeatVisit: over.allowRepeatVisit } : {}),
  }
}

function ids(result: ReturnType<typeof planSlotPlacements>): string[] {
  return result.proposedDay?.stops.map(entry => entry.id) ?? []
}

function reasons(result: ReturnType<typeof planSlotPlacements>): Record<string, string> {
  return Object.fromEntries(result.skipped.map(entry => [entry.itemId, entry.reason]))
}

const arrive = hit({ id: 'arrive', name: 'Lunch Dhaba', latitude: 12.2, longitude: 75.3, placeId: 'g-arrive', source: 'google' })
const early = hit({ id: 'early', name: 'Morning View', latitude: 12.3, longitude: 75.4, placeId: 'g-early', source: 'google' })
const stay = stop({ id: 'stay-1', title: 'Night Hotel', category: 'hotel', orderInDay: 2, placeId: 'g-stay', placeSource: 'google' })
const start = stop({ id: 'start-1', title: 'Trip start', orderInDay: 1, auto: true })

describe('issue 841 pure slot placement', () => {
  it('keeps distinct provider identities distinct despite matching names and coordinates', () => {
    const other = hit({ ...arrive, id: 'other-place', placeId: 'g-other-place' })
    const result = planSlotPlacements({
      trip: trip(), items: [item({ itemId: 'first', hit: arrive, road: road(20) }), item({ itemId: 'second', hit: other, road: road(40) })],
      policy: policy(),
    })
    expect(result.planned).toHaveLength(2)
    expect(ids(result)).toEqual(['stop-first', 'stop-second'])
  })

  it('orders a reverse-order input batch against earlier planned stops', () => {
    const result = planSlotPlacements({
      trip: trip({ days: [day({ stops: [start, stay] })] }),
      items: [item({ itemId: 'late', hit: arrive, road: road(50) }), item({ itemId: 'early', hit: early, road: road(20) })],
      policy: policy(), existingRoadPositions: [existing(start.id, 10), existing(stay.id, 60)],
    })
    expect(ids(result)).toEqual([start.id, 'stop-early', 'stop-late', stay.id])
    expect(result.planned.find(entry => entry.itemId === 'early')?.beforeStopId).toBe('stop-late')
  })

  it('keeps existing stops first when a new stop has equal road position', () => {
    const result = planSlotPlacements({
      trip: trip({ days: [day({ stops: [start, stay] })] }),
      items: [item({ itemId: 'equal', hit: arrive, road: road(60) })],
      policy: policy(), existingRoadPositions: [existing(start.id, 10), existing(stay.id, 60)],
    })
    expect(ids(result)).toEqual([start.id, stay.id, 'stop-equal'])
  })

  it('accepts a resolved equator coordinate while still refusing Null Island', () => {
    const result = planSlotPlacements({
      trip: trip(), items: [item({ itemId: 'equator', hit: hit({ ...arrive, latitude: 0 }), road: road(40) })], policy: policy(),
    })
    expect(result.planned).toHaveLength(1)
    expect(result.planned[0].stop.lat).toBe(0)
  })

  it('gives a singleton batch the same draft as one placement, before the terminal stay', () => {
    const base = trip({ days: [day({ stops: [start, stay] })] })
    const evidence = [existing('start-1', 10), existing('stay-1', 60)]
    const candidate = item({ itemId: 'choice', hit: arrive, road: road(40) })
    const one = planSlotPlacements({ trip: base, items: [candidate], policy: policy(), existingRoadPositions: evidence })
    const batch = planSlotPlacements({ trip: base, items: [candidate], policy: policy(), existingRoadPositions: evidence })

    expect(one.phase).toBe('draft')
    expect(one.planned).toHaveLength(1)
    expect(one.planned[0].phase).toBe('planned')
    expect(one.planned[0].ordering.kind).toBe('measured-road-km')
    expect(one.planned[0].beforeStopId).toBe('stay-1')
    expect(one.proposedDay?.stops.map(entry => entry.id)).toEqual(['start-1', 'stop-choice', 'stay-1'])
    expect(one.proposedDay?.stops.map(entry => entry.orderInDay)).toEqual([1, 2, 3])
    expect(one.proposedTrip.days[0].stops.map(entry => entry.id)).toEqual(['start-1', 'stop-choice', 'stay-1'])
    expect(batch).toEqual(one)
    expect(base.days[0].stops.map(entry => entry.id)).toEqual(['start-1', 'stay-1'])
    expect(base.days[0].stops.map(entry => entry.orderInDay)).toEqual([1, 2])
    expect(candidate.road?.km).toBe(40)
  })

  it('inserts a multi-item batch before the correct greater-km endpoints and keeps equal positions stable', () => {
    const at40 = stop({ id: 'stop-40', title: 'At 40', orderInDay: 2, placeId: 'g-40', placeSource: 'google' })
    const base = trip({ days: [day({ stops: [start, at40, stay] })] })
    const evidence = [existing('start-1', 10), existing('stop-40', 40), existing('stay-1', 60)]
    const before40 = item({ itemId: 'thirty', hit: early, road: road(30) })
    const at40Candidate = item({
      itemId: 'forty',
      hit: hit({ id: 'forty-hit', name: 'Equal Point', latitude: 12.31, longitude: 75.41, placeId: 'g-forty', source: 'google' }),
      road: road(40),
    })
    const result = planSlotPlacements({
      trip: base,
      items: [before40, at40Candidate],
      policy: policy(),
      existingRoadPositions: evidence,
    })

    expect(ids(result)).toEqual(['start-1', 'stop-thirty', 'stop-40', 'stop-forty', 'stay-1'])
    expect(result.planned.map(entry => [entry.itemId, entry.beforeStopId])).toEqual([
      ['thirty', 'stop-40'],
      ['forty', 'stay-1'],
    ])
    expect(result.planned[1].insertAt).toBeGreaterThan(result.planned[0].insertAt)
    expect(result.proposedDay?.stops.map(entry => entry.orderInDay)).toEqual([1, 2, 3, 4, 5])
  })

  it('uses terminal stay evidence and a fixed commitment as explicit barriers', () => {
    const fixed = stop({ id: 'fixed-1', title: 'Train', orderInDay: 2, category: 'transport-hub' })
    const base = trip({
      days: [day({ stops: [start, fixed, stay] })],
      fixedCommitments: [{ id: 'fc-1', title: 'Train', type: 'train-departure', dayIndex: 4, time: '18:00', stopId: 'fixed-1' }],
    })
    const result = planSlotPlacements({
      trip: base,
      items: [item({ itemId: 'choice', hit: arrive, road: road(40) })],
      policy: policy(),
      existingRoadPositions: [existing('start-1', 10), existing('stay-1', 60)],
    })

    expect(ids(result)).toEqual(['start-1', 'fixed-1', 'stop-choice', 'stay-1'])
    expect(result.planned[0].ordering.kind).toBe('measured-road-km')
    expect(result.planned[0].beforeStopId).toBe('stay-1')
    expect(result.proposedDay?.stops.find(entry => entry.id === 'stop-choice')?.title).toBe('Lunch Dhaba')
  })

  it('refuses unknown, out-of-day and conflicting placement evidence without appending', () => {
    const base = trip({ days: [day({ stops: [start, stay] })] })
    const evidence = [existing('start-1', 10), existing('stay-1', 60)]
    const unknown = item({ itemId: 'unknown', hit: early, road: null })
    const outsideDay = item({ itemId: 'outside', hit: hit({ id: 'out', name: 'Outside', placeId: 'g-out', source: 'google' }), road: road(40, { dayId: 'other-day' }) })
    const outsideSpan = item({ itemId: 'span', hit: hit({ id: 'span', name: 'Past stay', placeId: 'g-span', source: 'google' }), road: road(90, { toKm: 60 }) })
    const result = planSlotPlacements({
      trip: base,
      items: [unknown, outsideDay, outsideSpan],
      policy: policy(),
      existingRoadPositions: evidence,
    })
    expect(result.planned).toHaveLength(0)
    expect(reasons(result)).toEqual({
      unknown: 'unknown-road-position',
      outside: 'out-of-day-road-position',
      span: 'out-of-day-road-position',
    })
    expect(result.proposedDay?.stops.map(entry => entry.id)).toEqual(['start-1', 'stay-1'])

    const routeConflict = planSlotPlacements({
      trip: base,
      items: [
        item({ itemId: 'a', hit: arrive, road: road(40) }),
        item({ itemId: 'b', hit: early, road: road(45, { routeKey: 'route-b' }) }),
      ],
      policy: policy(),
      existingRoadPositions: evidence,
    })
    expect(routeConflict.planned).toHaveLength(0)
    expect(reasons(routeConflict)).toEqual({ a: 'conflicting-road-route', b: 'conflicting-road-route' })
    expect(routeConflict.proposedDay?.stops.map(entry => entry.id)).toEqual(['start-1', 'stay-1'])
  })

  it('refuses a missing, duplicated or mismatched stable day identity', () => {
    const base = trip({ days: [day({ stops: [start, stay] })] })
    const candidate = item({ itemId: 'choice', hit: arrive })
    const missing = planSlotPlacements({
      trip: base,
      items: [candidate],
      policy: policy({ dayId: 'deleted-day' }),
      existingRoadPositions: [existing('start-1', 10), existing('stay-1', 60)],
    })
    expect(missing.proposedDay).toBeNull()
    expect(reasons(missing)).toEqual({ choice: 'missing-day' })
    expect(missing.proposedTrip).toBe(base)

    const duplicated = planSlotPlacements({
      trip: trip({ days: [day(), day()] }),
      items: [candidate],
      policy: policy(),
    })
    expect(reasons(duplicated)).toEqual({ choice: 'ambiguous-day' })
    expect(duplicated.proposedDay).toBeNull()

    const mismatch = planSlotPlacements({
      trip: base,
      items: [candidate],
      policy: policy({ tripId: 'another-trip' }),
    })
    expect(reasons(mismatch)).toEqual({ choice: 'trip-id-mismatch' })
    expect(mismatch.proposedDay).toBeNull()
  })

  it('uses stable day ids, not editable titles or non-contiguous array positions', () => {
    const dayZero = day({ id: 'day-zero', index: 0, title: 'Old name', stops: [start, stay] })
    const dayFour = day({ id: DAY_ID, index: 4, title: 'Renamed', stops: [start, stay] })
    const base = trip({ days: [dayZero, dayFour] })
    const result = planSlotPlacements({
      trip: base,
      items: [item({ itemId: 'choice', hit: arrive })],
      policy: policy(),
      existingRoadPositions: [existing('start-1', 10), existing('stay-1', 60)],
    })
    expect(result.proposedTrip.days[0].stops.map(entry => entry.id)).toEqual(['start-1', 'stay-1'])
    expect(result.proposedTrip.days[1].stops.map(entry => entry.id)).toEqual(['start-1', 'stop-choice', 'stay-1'])
    expect(result.proposedDay?.title).toBe('Renamed')
  })

  it('skips an accidental operation duplicate and reserves only that operation', () => {
    const base = trip({ days: [day({ stops: [start, stay] })] })
    const evidence = [existing('start-1', 10), existing('stay-1', 60)]
    const first = item({ itemId: 'first', hit: arrive, road: road(40) })
    const second = item({ itemId: 'second', hit: hit({ id: 'second-hit', name: 'Second lunch', placeId: 'g-arrive', source: 'google' }), road: road(41) })
    const result = planSlotPlacements({
      trip: base,
      items: [first, second],
      policy: policy(),
      existingRoadPositions: evidence,
    })
    expect(result.planned.map(entry => entry.itemId)).toEqual(['first'])
    expect(reasons(result)).toEqual({ second: 'duplicate-in-operation' })

    const separate = planSlotPlacements({
      trip: result.proposedTrip,
      items: [second],
      policy: policy({ operationId: 'op-2' }),
      existingRoadPositions: evidence,
    })
    expect(separate.skipped.map(entry => entry.reason)).toEqual(['already-in-plan'])
  })

  it('places a deliberate repeat only when the policy says so', () => {
    const already = stop({ id: 'existing-visit', title: 'Lunch Dhaba', orderInDay: 2, placeId: 'g-arrive', placeSource: 'google', lat: 12.2, lng: 75.3 })
    const base = trip({ days: [day({ stops: [start, already, stay] })] })
    const evidence = [existing('start-1', 10), existing('stay-1', 60)]
    const candidate = item({ itemId: 'repeat', hit: arrive, road: road(40) })
    const blocked = planSlotPlacements({
      trip: base,
      items: [candidate],
      policy: policy(),
      existingRoadPositions: evidence,
    })
    expect(reasons(blocked)).toEqual({ repeat: 'already-in-plan' })

    const allowed = planSlotPlacements({
      trip: base,
      items: [candidate],
      policy: policy({ operationId: 'explicit-repeat', allowRepeatVisit: true }),
      existingRoadPositions: evidence,
    })
    expect(allowed.planned.map(entry => entry.itemId)).toEqual(['repeat'])
    expect(ids(allowed)).toEqual(['start-1', 'existing-visit', 'stop-repeat', 'stay-1'])
  })

  it('keeps rejected visits actionable, refuses unresolved coordinates, and reports provider conflicts', () => {
    const base = trip({ days: [day({ stops: [start, stay] })] })
    const evidence = [existing('start-1', 10), existing('stay-1', 60)]
    const rejected = item({ itemId: 'rejected', hit: early, rejected: true })
    const unresolved = item({
      itemId: 'unresolved',
      hit: hit({ id: 'zero', name: 'Null Island', latitude: 0, longitude: 0, placeId: 'g-zero', source: 'google' }),
      place: place({ name: 'Null Island', lat: 0, lng: 0, placeId: 'g-zero', source: 'google' }),
    })
    const conflict = item({
      itemId: 'conflict',
      hit: hit({ id: 'conflict-hit', name: 'Lunch Dhaba', placeId: 'g-arrive', source: 'google' }),
      place: place({ name: 'Lunch Dhaba', lat: 12.2, lng: 75.3, placeId: 'g-arrive', source: 'mappls' }),
    })
    const result = planSlotPlacements({
      trip: base,
      items: [rejected, unresolved, conflict],
      policy: policy(),
      existingRoadPositions: evidence,
    })
    expect(reasons(result)).toEqual({
      rejected: 'rejected-visit',
      unresolved: 'unresolved-coordinates',
      conflict: 'provider-conflict',
    })
    expect(result.proposedDay?.stops.map(entry => entry.id)).toEqual(['start-1', 'stay-1'])
  })

  it('preserves a rejected existing visit and fixed commitment stop identities', () => {
    const rejected = stop({ id: 'rejected-1', title: 'Declined', orderInDay: 2, status: 'rejected' })
    const fixed = stop({ id: 'fixed-1', title: 'Ceremony', orderInDay: 3, category: 'event' })
    const base = trip({
      days: [day({ stops: [start, rejected, fixed, stay] })],
      fixedCommitments: [{ id: 'fc-1', title: 'Ceremony', type: 'event', dayIndex: 4, time: '17:00', stopId: 'fixed-1' }],
    })
    const result = planSlotPlacements({
      trip: base,
      items: [item({ itemId: 'choice', hit: arrive })],
      policy: policy(),
      existingRoadPositions: [existing('start-1', 10), existing('stay-1', 60)],
    })
    expect(ids(result)).toEqual(['start-1', 'rejected-1', 'fixed-1', 'stop-choice', 'stay-1'])
    expect(result.proposedDay?.stops.find(entry => entry.id === 'rejected-1')?.status).toBe('rejected')
    expect(result.proposedDay?.stops.find(entry => entry.id === 'fixed-1')?.title).toBe('Ceremony')
    expect(result.proposedDay?.stops.map(entry => entry.orderInDay)).toEqual([1, 2, 3, 4, 5])
  })

  it.each(['confirmed', 'rejected'] as const)('rejects a generated stop id used on another day (%s)', status => {
    const collidingStop = stop({ id: 'generated-1', title: 'Same id elsewhere', orderInDay: 1, status })
    const otherDay = day({ id: 'day-other', index: 9, title: 'Other day', stops: [collidingStop] })
    const base = trip({ days: [otherDay, day({ stops: [start, stay] })] })
    const evidence = [existing('start-1', 10), existing('stay-1', 60)]
    const colliding = item({ itemId: 'collision', hit: arrive, road: road(40) })
    const result = planSlotPlacements({
      trip: base,
      items: [colliding],
      policy: policy({ buildStop: () => ({ id: collidingStop.id, slotKey: 'lunch' }) }),
      existingRoadPositions: evidence,
    })
    expect(result.planned).toHaveLength(0)
    expect(reasons(result)).toEqual({ collision: 'duplicate-stop-id' })
    expect(ids(result)).toEqual(['start-1', 'stay-1'])
    expect(result.proposedDay?.stops).not.toContainEqual(expect.objectContaining({ id: 'generated-1' }))
    expect(base.days[0].stops.map(entry => entry.id)).toEqual(['generated-1'])
    expect(base.days[1].stops.map(entry => entry.id)).toEqual(['start-1', 'stay-1'])

    const peer = item({ itemId: 'peer', hit: hit({ id: 'peer-hit', name: 'Morning View', placeId: 'g-early', source: 'google' }), road: road(20) })
    const mixed = planSlotPlacements({
      trip: base,
      items: [colliding, peer],
      policy: policy({ buildStop: item2 => item2.itemId === 'collision' ? { id: collidingStop.id, slotKey: 'lunch' } : { id: 'stop-peer', slotKey: 'lunch' } }),
      existingRoadPositions: evidence,
    })
    expect(mixed.planned.map(entry => entry.itemId)).toEqual(['peer'])
    expect(reasons(mixed)).toEqual({ collision: 'duplicate-stop-id' })
    expect(ids(mixed)).toEqual(['start-1', 'stop-peer', 'stay-1'])

    const second = item({ itemId: 'second', hit: early, road: road(20) })
    const mixedThenPeer = planSlotPlacements({
      trip: base,
      items: [colliding, second],
      policy: policy({ buildStop: item2 => item2.itemId === 'collision' ? { id: 'stop-peer', slotKey: 'lunch' } : { id: 'generated-1', slotKey: 'lunch' } }),
      existingRoadPositions: evidence,
    })
    expect(mixedThenPeer.planned.map(entry => entry.itemId)).toEqual(['collision'])
    expect(reasons(mixedThenPeer)).toEqual({ second: 'duplicate-stop-id' })
    expect(ids(mixedThenPeer)).toEqual(['start-1', 'stop-peer', 'stay-1'])
  })

  it('rejects reused stop ids even when a same-entity repeat is allowed', () => {
    const base = trip({ days: [day({ id: 'day-other', index: 9, stops: [stay] }), day({ stops: [start, stay] })] })
    const evidence = [existing('start-1', 10), existing('stay-1', 60)]
    const result = planSlotPlacements({
      trip: base,
      items: [item({ itemId: 'choice', hit: arrive, road: road(40) })],
      policy: policy({ buildStop: () => ({ id: 'stay-1', slotKey: 'lunch' }) }),
      existingRoadPositions: evidence,
    })
    expect(result.planned).toHaveLength(0)
    expect(reasons(result)).toEqual({ choice: 'duplicate-stop-id' })
    expect(ids(result)).toEqual(['start-1', 'stay-1'])
    expect(base.days[1].stops.map(entry => entry.id)).toEqual(['start-1', 'stay-1'])

    const repeat = planSlotPlacements({
      trip: base,
      items: [item({ itemId: 'repeat', hit: hit({ ...arrive, name: stay.title, placeId: stay.placeId, latitude: stay.lat, longitude: stay.lng }), road: road(40) })],
      policy: policy({ allowRepeatVisit: true, buildStop: () => ({ id: 'stay-1', slotKey: 'lunch' }) }),
      existingRoadPositions: evidence,
    })
    expect(repeat.planned).toHaveLength(0)
    expect(reasons(repeat)).toEqual({ repeat: 'duplicate-stop-id' })
    expect(ids(repeat)).toEqual(['start-1', 'stay-1'])
  })

  it('leaves the target day untouched when no item is planned, even with noncontiguous orderInDay', () => {
    const stopA = stop({ id: 'a', title: 'A', orderInDay: 3 })
    const stopB = stop({ id: 'b', title: 'B', orderInDay: 7 })
    const base = trip({ days: [day({ stops: [stopA, stopB] })] })
    const journey = (items: readonly SlotPlacementItem[]) => planSlotPlacements({
      trip: base,
      items,
      policy: policy(),
      existingRoadPositions: [existing('a', 10), existing('b', 60)],
    })

    const allSkipped = journey([
      item({ itemId: 'unresolved', hit: hit({ id: 'zero', name: 'Null Island', latitude: 0, longitude: 0, placeId: 'g-zero', source: 'google' }) }),
      item({ itemId: 'rejected', hit: early, rejected: true }),
    ])
    expect(allSkipped.planned).toHaveLength(0)
    expect(reasons(allSkipped)).toEqual({ unresolved: 'unresolved-coordinates', rejected: 'rejected-visit' })
    expect(allSkipped.proposedDay?.stops.map(entry => [entry.id, entry.orderInDay])).toEqual([['a', 3], ['b', 7]])
    expect(allSkipped.proposedTrip).toBe(base)
    expect(JSON.stringify(allSkipped.proposedTrip)).toEqual(JSON.stringify(base))

    const empty = journey([])
    expect(empty.planned).toHaveLength(0)
    expect(empty.skipped).toHaveLength(0)
    expect(empty.outcomes).toHaveLength(0)
    expect(empty.proposedDay?.stops.map(entry => [entry.id, entry.orderInDay])).toEqual([['a', 3], ['b', 7]])
    expect(empty.proposedTrip).toBe(base)
    expect(JSON.stringify(empty.proposedTrip)).toEqual(JSON.stringify(base))

    const partial = journey([
      item({ itemId: 'unresolved', hit: hit({ id: 'zero', name: 'Null Island', latitude: 0, longitude: 0, placeId: 'g-zero', source: 'google' }), road: null }),
      item({ itemId: 'valid', hit: arrive, road: road(40) }),
    ])
    expect(partial.planned.map(entry => entry.itemId)).toEqual(['valid'])
    expect(partial.skipped.map(entry => entry.reason)).toEqual(['unknown-road-position'])
    expect(partial.proposedDay?.stops.map(entry => entry.id)).toEqual(['a', 'stop-valid', 'b'])
    expect(partial.proposedDay?.stops.map(entry => entry.orderInDay)).toEqual([1, 2, 3])
    expect(partial.proposedTrip.days).toHaveLength(1)
  })

  it('never reports a draft plan as acknowledgement-applied', () => {
    const result = planSlotPlacements({
      trip: trip({ days: [day({ stops: [start, stay] })] }),
      items: [item({ itemId: 'choice', hit: arrive })],
      policy: policy(),
      existingRoadPositions: [existing('start-1', 10), existing('stay-1', 60)],
    })
    expect(result.phase).toBe('draft')
    expect(result.outcomes.every(outcome => outcome.phase !== 'planned' || outcome.stop.status === 'suggested')).toBe(true)
    expect(JSON.stringify(result)).not.toContain('acknowledgement')
    expect(JSON.stringify(result)).not.toContain('"applied"')
  })
})

// ============ Measured-road binding contract (#08 R2/R3 foundation) ============
// Real stageWriterPicks, real operation gate and real planner. Only the resolver,
// the apply transport and the live road data are controlled.
import { describe, expect, it, vi } from 'vitest'
import type { ItineraryStop, Trip } from '../src/data/types'
import type { PlaceHit } from '../src/lib/providers/hits'
import { roadChainSig } from '../src/lib/tripRoad'
import {
  retryWriterStage,
  stageWriterPicks,
  type WriterActionDeps,
  type WriterApplyChange,
} from '../src/pages/trip/map/mapWriterActions'
import { createWriterOperationGate } from '../src/pages/trip/map/writerOperationGate'
import {
  captureWriterRoadBinding,
  sameWriterBinding,
  type WriterRoadBinding,
} from '../src/pages/trip/map/writerRoadBinding'

const TRIP_ID = 'trip-road-binding'

function hit(overrides: Partial<PlaceHit> = {}): PlaceHit {
  return {
    id: 'g-a', name: 'Cafe A', latitude: 10.3, longitude: 76.3, kind: 'poi',
    source: 'google', placeId: 'g-a', category: 'food', ...overrides,
  }
}

function stop(id: string): ItineraryStop {
  return {
    id, title: 'Existing', category: 'food', locationName: 'Existing',
    lat: 10.2, lng: 76.2, visitMinutes: 30, entryFeeInrPerPerson: 0,
    transportCostInrTotal: 0, priority: 'nice-to-have', status: 'confirmed', orderInDay: 1,
  }
}

function makeTrip(): Trip {
  return {
    id: TRIP_ID, name: 'Binding trip', startLocation: 'Kochi', destinations: ['Munnar'],
    startDate: '2026-11-01', endDate: '2026-11-01', travellers: 2, transportMode: 'car',
    budgetPerPersonInr: 5000, travelStyle: 'balanced', fixedCommitments: [],
    startLocationCoords: { lat: 10, lng: 76 }, destinationCoords: [{ lat: 10.6, lng: 76.6 }],
    days: [{ id: 'day-a', index: 0, title: 'Day 1', stops: [stop('st-a1')] }],
    expenses: [], members: [], coverEmoji: '🧭', visibility: 'private',
    createdAt: 1, updatedAt: 1, writeVersion: 7, roundTrip: false,
  }
}

function binding(overrides: { legKm?: number; points?: number[][] } = {}): WriterRoadBinding {
  const captured = captureWriterRoadBinding({
    tripId: TRIP_ID,
    routeKey: roadChainSig(makeTrip()),
    chainPoints: [{ lat: 10, lng: 76 }, { lat: 10.6, lng: 76.6 }],
    legs: [{
      distanceKm: overrides.legKm ?? 70,
      durationMinutes: 90,
      source: 'osrm',
      geometry: (overrides.points ?? [[10, 76], [10.3, 76.3], [10.6, 76.6]]).map(([lat, lng]) => ({ lat, lng })),
    }],
  })
  if (!captured) throw new Error('test binding invalid')
  return captured
}

function harness(options: { strict?: boolean; held?: boolean; uncertain?: boolean } = {}) {
  const trip = makeTrip()
  const gate = createWriterOperationGate()
  const base = binding()
  let live: WriterRoadBinding | null = options.strict === false ? null : base
  let applyCount = 0
  let draft: Trip | null = null
  let release: ((value: PlaceHit | null) => void) | null = null
  const resolvePick = vi.fn((place: PlaceHit) => {
    if (!options.held) return Promise.resolve(place)
    return new Promise<PlaceHit | null>(resolve => { release = resolve })
  })
  const onCompletion = vi.fn()
  const applyChange: WriterApplyChange = (mutator, _kind, _dayIndex, _onKept, operation) => {
    applyCount += 1
    const copy = structuredClone(trip)
    mutator(copy)
    draft = copy
    if (options.uncertain) queueMicrotask(() => operation?.onUncertain?.())
  }
  const deps: WriterActionDeps = {
    trip,
    applyChange,
    resolvePick,
    mintStopId: () => 'stop-new',
    gate,
    routeKmOf: lat => lat * 10,
    road: { routeKey: base.routeKey },
    currentTrip: () => trip,
    onCompletion,
    poiVisitMinutes: () => 30,
    ...(options.strict === false ? {} : { roadBinding: base, currentRoad: () => live }),
  }
  const request = {
    context: { tripId: TRIP_ID, dayId: 'day-a', dayIndex: 0 },
    intent: 'single' as const,
    picks: [{ slotKey: 'lunch', hit: hit(), dayId: 'day-a', dayIndex: 0, notes: 'n' }],
  }
  return {
    trip, gate, deps, request, resolvePick, applyChange,
    get applyCount() { return applyCount },
    get draft() { return draft },
    get live() { return live },
    set live(value: WriterRoadBinding | null) { live = value },
    release: (value: PlaceHit | null) => release?.(value),
    onCompletion,
  }
}

describe('writer road binding data', () => {
  it('changes the generation on any geometry change and refuses invalid data', () => {
    const base = binding()
    expect(sameWriterBinding(base, binding())).toBe(true)
    expect(sameWriterBinding(base, binding({ legKm: 71 }))).toBe(false)
    expect(sameWriterBinding(base, binding({ points: [[10, 76], [10.4, 76.4], [10.6, 76.6]] }))).toBe(false)
    expect(captureWriterRoadBinding({
      tripId: TRIP_ID, routeKey: 'rk', chainPoints: [], legs: [],
    })).toBeNull()
    expect(captureWriterRoadBinding({
      tripId: TRIP_ID, routeKey: 'rk',
      chainPoints: [{ lat: Number.NaN, lng: 76 }],
      legs: [{ distanceKm: 1, durationMinutes: 1, geometry: [{ lat: 10, lng: 76 }] }],
    })).toBeNull()
  })
})

describe('strict road/trip revalidation', () => {
  it('refuses a geometry change during a held resolver with no apply', async () => {
    const h = harness({ held: true })
    const pending = stageWriterPicks(h.deps, h.request)
    await Promise.resolve()
    h.live = binding({ legKm: 71 })
    h.release(hit())
    const result = await pending
    expect(result.status).toBe('refused')
    expect(result.status === 'refused' ? result.reason : '').toBe('road-evidence-unavailable')
    expect(h.applyCount).toBe(0)
    expect(h.gate.reservations()).toHaveLength(0)
    expect(h.resolvePick).toHaveBeenCalledTimes(1)
  })

  it('refuses a committed stop-chain change and a missing accessor', async () => {
    const h = harness()
    const changed: Trip = {
      ...h.trip,
      days: h.trip.days.map(day => ({ ...day, stops: [...day.stops, stop('st-a2')] })),
    }
    const depsChanged = { ...h.deps, trip: changed, currentTrip: () => changed }
    expect((await stageWriterPicks(depsChanged, h.request)).status).toBe('refused')
    expect(h.applyCount).toBe(0)

    const noAccessor = { ...h.deps, currentRoad: undefined }
    const missing = await stageWriterPicks(noAccessor, h.request)
    expect(missing.status === 'refused' ? missing.reason : '').toBe('road-evidence-unavailable')
  })

  it('applies once when the same binding is unchanged', async () => {
    const h = harness()
    const result = await stageWriterPicks(h.deps, h.request)
    expect(result.status).toBe('staged')
    expect(h.applyCount).toBe(1)
    expect(h.draft?.days[0]?.stops.some(s => s.title === 'Cafe A')).toBe(true)
    const added = h.draft?.days[0]?.stops.find(s => s.title === 'Cafe A')
    expect(added?.id).toBe('stop-new')
    expect(h.draft?.days.find(day => day.stops.some(stop => stop.id === 'stop-new'))?.id).toBe('day-a')
    expect(added?.orderInDay).toBe(2)
    expect(added?.lat).toBe(10.3)
    expect(added?.lng).toBe(76.3)
    expect(added?.slotKey).toBe('lunch')
    expect(added?.placeId).toBe('g-a')
    expect(added?.placeSource).toBe('google')
  })

  it('keeps an uncertain retry reservation when the live binding changed', async () => {
    const h = harness({ uncertain: true })
    const staged = await stageWriterPicks(h.deps, h.request)
    await Promise.resolve()
    expect(staged.status).toBe('staged')
    const operationId = staged.status === 'staged' ? staged.operationId : ''
    const ticket = h.gate.retryTicket(operationId)
    expect(ticket?.binding).toBeDefined()
    expect(h.gate.operation(operationId)?.phase).toBe('uncertain')
    const before = h.gate.reservations().length
    h.live = binding({ legKm: 71 })
    const retried = await retryWriterStage(h.deps, ticket!)
    expect(retried.status).toBe('refused')
    expect(retried.status === 'refused' ? retried.resume?.disposition : '').toBe('road-changed')
    expect(h.gate.operation(operationId)?.phase).toBe('uncertain')
    expect(h.gate.reservations().length).toBe(before)
    expect(h.applyCount).toBe(1)
    expect(h.resolvePick).toHaveBeenCalledTimes(1)
  })

  it('replays the same stop id and anchor when the binding is unchanged', async () => {
    const h = harness({ uncertain: true })
    const staged = await stageWriterPicks(h.deps, h.request)
    await Promise.resolve()
    const operationId = staged.status === 'staged' ? staged.operationId : ''
    const firstStop = h.draft?.days[0]?.stops.find(s => s.title === 'Cafe A')
    const ticket = h.gate.retryTicket(operationId)!
    const retried = await retryWriterStage(h.deps, ticket)
    expect(retried.status).toBe('staged')
    const secondStop = h.draft?.days[0]?.stops.find(s => s.title === 'Cafe A')
    expect(secondStop).toEqual(firstStop)
    expect(secondStop?.slotKey).toBe('lunch')
    expect(h.resolvePick).toHaveBeenCalledTimes(1)
  })

  it('refuses when only the live accessor is present', async () => {
    const h = harness()
    const onlyAccessor = { ...h.deps, roadBinding: undefined, currentRoad: () => binding() }
    const result = await stageWriterPicks(onlyAccessor, h.request)
    expect(result.status === 'refused' ? result.reason : '').toBe('road-evidence-unavailable')
    expect(h.applyCount).toBe(0)
  })

  it('refuses when the planned road key differs from the validated binding', async () => {
    const h = harness()
    const mismatched = { ...h.deps, road: { routeKey: 'rk-different' } }
    const result = await stageWriterPicks(mismatched, h.request)
    expect(result.status === 'refused' ? result.reason : '').toBe('road-evidence-unavailable')
    expect(h.applyCount).toBe(0)
  })

  it('keeps legacy unbound callers working', async () => {
    const h = harness({ strict: false })
    const result = await stageWriterPicks(h.deps, h.request)
    expect(result.status).toBe('staged')
    expect(h.applyCount).toBe(1)
  })
})

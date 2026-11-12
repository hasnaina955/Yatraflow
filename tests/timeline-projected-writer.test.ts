// ============ Actual Timeline covered-row writer composition (#08 S4) ============
// Real `stageProjectedRow`, real #841 `stageWriterPicks`/planner/gate, real
// candidate-to-stop placement. Only the transport edges are controlled: the
// workspace applyChange, the resolver and the current-trip read.
import { describe, expect, it, vi } from 'vitest'
import type { ItineraryStop, Trip } from '../src/data/types'
import type { PlaceHit } from '../src/lib/providers/hits'
import { placeKeysOf } from '../src/lib/placeIdentity'
import type { JourneyRow } from '../src/lib/journeyProjection'
import { createWriterOperationGate } from '../src/pages/trip/map/writerOperationGate'
import type { WriterApplyChange, WriterCompletion } from '../src/pages/trip/map/mapWriterActions'
import {
  projectedPickFor,
  stageProjectedRow,
  type TimelineProjectedWriterConfig,
} from '../src/pages/trip/timeline/timelineProjectedWriter'

const TRIP_ID = 'trip-s4-writer'

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
    id: TRIP_ID, name: 'S4 writer trip', startLocation: 'Kochi', destinations: ['Munnar'],
    startDate: '2026-11-01', endDate: '2026-11-01', travellers: 2, transportMode: 'car',
    budgetPerPersonInr: 5000, travelStyle: 'balanced', fixedCommitments: [],
    startLocationCoords: { lat: 10, lng: 76 }, destinationCoords: [{ lat: 10.6, lng: 76.6 }],
    days: [{ id: 'day-a', index: 0, title: 'Day 1', stops: [stop('st-a1')] }],
    expenses: [], members: [], coverEmoji: '🧭', visibility: 'private',
    createdAt: 1, updatedAt: 1, writeVersion: 7, roundTrip: false,
  }
}

function rowFor(overrides: Partial<JourneyRow> = {}): JourneyRow {
  const place = hit()
  return {
    key: 'row-a', tripId: TRIP_ID, dayId: 'day-a', dayIndex: 0, lens: 'drive',
    purpose: 'meal', slotRef: { tripId: TRIP_ID, dayId: 'day-a', key: 'lunch' },
    slotKey: 'lunch', stopId: null, hit: place, placeKeys: placeKeysOf(place), origin: 'engine',
    detourMin: 4, detourKm: 2, budgetSharePct: 10, visitMin: null, bufferMin: null,
    netAddedMin: null, arriveMin: null, arriveLabel: null, arriveSource: 'candidate',
    windowMin: [720, 900], inWindow: true, reason: null, source: 'google',
    freshness: 'unknown', vote: null,
    actions: { preview: true, add: true, shortlist: true, vote: false, navigate: true },
    ...overrides,
  }
}

function workspace(overrides: {
  onUncertain?: boolean
  completion?: (completion: WriterCompletion) => void
} = {}) {
  const trip = makeTrip()
  let draft: Trip | null = null
  const applyChange: WriterApplyChange = (mutator, _kind, _dayIndex, _onKept, operation) => {
    const copy = structuredClone(trip)
    mutator(copy)
    draft = copy
    if (overrides.onUncertain) operation?.onUncertain?.()
  }
  const resolvePick = vi.fn(async (place: PlaceHit) => place)
  const onCompletion = vi.fn(overrides.completion ?? (() => {}))
  const config: TimelineProjectedWriterConfig = {
    trip,
    applyChange,
    resolvePick,
    road: { routeKmOf: lat => lat * 10, road: { routeKey: 'rk-measured' } },
    currentTrip: () => trip,
    onAcknowledged: onCompletion,
    gate: createWriterOperationGate(),
  }
  return { trip, config, resolvePick, onCompletion, draft: () => draft }
}

describe('covered Add uses the real #841 writer', () => {
  it('writes the exact slot and provider identity through the planner', async () => {
    const h = workspace()
    const result = await stageProjectedRow(h.config, rowFor(), 0, () => {})
    expect(result.status).toBe('staged')
    expect(h.resolvePick).toHaveBeenCalledTimes(1)
    const stops = h.draft()?.days[0]?.stops ?? []
    const added = stops.find(s => s.title === 'Cafe A')
    expect(added).toBeDefined()
    expect(added?.slotKey).toBe('lunch')
    expect(added?.placeId).toBe('g-a')
    expect(added?.placeSource).toBe('google')
    expect(added?.notes).toContain('shared journey projection')
    expect(h.draft()?.days[0]?.id).toBe('day-a')
  })

  it('refuses the documented mixed-axis sentinel before any write', async () => {
    const h = workspace()
    const mixed = rowFor({ hit: hit({ latitude: 0, longitude: 76.3 }) })
    expect(projectedPickFor(mixed, 0)).toBeNull()
    const result = await stageProjectedRow(h.config, mixed, 0, () => {})
    expect(result).toEqual({ status: 'refused', reason: 'invalid-row' })
    expect(h.resolvePick).not.toHaveBeenCalled()
    expect(h.draft()).toBeNull()
  })

  it('stages once on a same-tick double activation', async () => {
    const h = workspace()
    const first = stageProjectedRow(h.config, rowFor(), 0, () => {})
    const second = stageProjectedRow(h.config, rowFor(), 0, () => {})
    const [a, b] = await Promise.all([first, second])
    expect([a.status, b.status].sort()).toEqual(['refused', 'staged'])
    expect(b.status === 'refused' ? b.reason : '').toBe('gate-busy')
    expect(h.resolvePick).toHaveBeenCalledTimes(1)
  })

  it('refuses when the measured road has no position instead of guessing', async () => {
    const h = workspace()
    h.config.road = { routeKmOf: () => null, road: { routeKey: 'rk-measured' } }
    const result = await stageProjectedRow(h.config, rowFor(), 0, () => {})
    expect(result.status).toBe('refused')
    expect(h.draft()).toBeNull()
  })

  it('delivers the real uncertain completion with a retry ticket', async () => {
    const h = workspace({ onUncertain: true })
    await stageProjectedRow(h.config, rowFor(), 0, h.onCompletion)
    expect(h.onCompletion).toHaveBeenCalledTimes(1)
    const completion = h.onCompletion.mock.calls[0]?.[0] as WriterCompletion
    expect(completion.phase).toBe('uncertain')
    expect(completion.acknowledged).toBe(false)
    expect(completion.retry).toBeDefined()
  })
})

import { describe, expect, it } from 'vitest'
import type { PlaceHit } from '../src/lib/providers/hits'
import type { ItineraryStop, Trip } from '../src/data/types'
import type { RoadLeg } from '../src/lib/routing'
import { buildRoadChain, type TripRoadView } from '../src/lib/tripRoad'
import { createManualSlotStore, type ManualSlotContext } from '../src/pages/trip/map/manualSlotContexts'
import { sameStopContent } from '../src/pages/trip/map/mapWriterActions'
import { slotResolutionRoadFor } from '../src/pages/trip/slotResolutionAdapter'

// Boundaries for the safe field and geometry lookups. These tests drive the
// real production modules with controlled data.

const hit = (id: string): PlaceHit =>
  ({ id, name: `Place ${id}`, latitude: 10.2, longitude: 76.2, kind: 'poi' }) as PlaceHit

const baseStop = (over: Partial<ItineraryStop> = {}): ItineraryStop => ({
  id: 'st-1', title: 'Cafe', category: 'food', locationName: 'Cafe',
  lat: 10.2, lng: 76.2, visitMinutes: 45, orderInDay: 1, status: 'confirmed',
  ...over,
} as ItineraryStop)

function makeTrip(): Trip {
  const stops: ItineraryStop[] = [
    { id: 'st-start', title: 'Start', category: 'travel', locationName: 'Start', lat: 10.0, lng: 76.0,
      visitMinutes: 0, orderInDay: 1, status: 'confirmed',
      entryFeeInrPerPerson: 0, transportCostInrTotal: 0, priority: 'must-do' },
    { id: 'st-stay', title: 'Stay', category: 'hotel', locationName: 'Stay', lat: 10.5, lng: 76.5,
      visitMinutes: 0, orderInDay: 2, status: 'confirmed',
      entryFeeInrPerPerson: 0, transportCostInrTotal: 0, priority: 'must-do' },
  ]
  return {
    id: 't1', name: 'Trip', startLocation: 'Kochi', destinations: ['Munnar'],
    startDate: '2026-11-01', endDate: '2026-11-02', travellers: 2,
    transportMode: 'car', budgetPerPersonInr: 5000, travelStyle: 'balanced',
    fixedCommitments: [],
    days: [{ id: 'd1', index: 0, stops }],
    expenses: [], members: [{ userId: 'owner', role: 'owner', joinedAt: 1 }],
    coverEmoji: '🧭', visibility: 'private', createdAt: 1, updatedAt: 1,
    writeVersion: 7, roundTrip: false,
  }
}

describe('#910 safe field and index lookups', () => {
  it('files a slot key named __proto__ as an own field', () => {
    const store = createManualSlotStore()
    const context: ManualSlotContext = { tripId: 't1', dayId: 'd1', slotKey: '__proto__' }
    expect(store.file(context, hit('m-1'))).toBe('filed')
    const record = store.candidatesBySlot({ tripId: 't1', dayId: 'd1' }, {})
    const own = Object.getOwnPropertyDescriptor(record, '__proto__')
    expect(own).toBeDefined()
    expect(Array.isArray(own?.value)).toBe(true)
    expect(Object.getPrototypeOf(record)).toBe(Object.prototype)
    expect(Object.getPrototypeOf({})).toBe(Object.prototype)
  })

  it('walks only own fields and keeps the note and bookkeeping rules', () => {
    const base = baseStop()
    expect(sameStopContent(baseStop({ orderInDay: 9 }), base)).toBe(true)
    expect(sameStopContent(baseStop({ notes: 'changed' }), base)).toBe(false)
    const masked = { ...base, hasOwnProperty: Object.prototype.hasOwnProperty } as unknown as ItineraryStop
    expect(sameStopContent(masked, base)).toBe(false)
  })

  it('skips malformed geometry pairs from a transport', () => {
    const trip = makeTrip()
    const chain = buildRoadChain(trip)
    const geometry = [[76, 10], null, [76.5, 10.5], [77]] as unknown as [number, number][]
    const legs: RoadLeg[] = [{ source: 'osrm', distanceKm: 100, durationMinutes: 90, geometry }]
    const view: TripRoadView = { status: 'ok', chain, legs, retry: () => {} }
    const context = slotResolutionRoadFor(trip, view)
    expect(context.measured).not.toBeNull()
    expect(context.measured?.routeKmOf(10.2, 76.2)).not.toBeNull()
  })
})

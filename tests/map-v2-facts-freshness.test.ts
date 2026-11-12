// ============ Map v2 facts: retained freshness reaches both views (finding 3) ============
// `useCorridorCache` keeps same-query rows after a failure and marks the source
// `retained`. The shared producer must forward that evidence to every corridor
// row, so the Map card and the Timeline row read the same state.
import { describe, expect, it } from 'vitest'
import { deriveDrivingPlan, type PlaceHit, type RideSegment, type SegmentHit } from '../src/lib/geocode'
import { placeIdentity } from '../src/lib/placeIdentity'
import { dayAttributionKeyFor, type CorridorSnapshot } from '../src/pages/trip/map/corridorSnapshot'
import { buildJourneyDays, corridorFreshnessOf } from '../src/pages/trip/journey/journeyDays'
import { mapJourneyRows } from '../src/pages/trip/map/mapJourneyRows'
import { journeyRowMeta, travelJourneyRows } from '../src/pages/trip/timeline/travelJourneyRows'
import type { ItineraryStop, Trip } from '../src/data/types'
import type { DnaVector } from '../src/lib/tripDna'

const TRIP_ID = 'trip-facts'
const DNA: DnaVector = { accepts: 0, declines: 0, categoryAffinity: {}, avgDetourMin: null, avgVisitMin: null }
const FORMAT = { clock: (v: string) => v, minute: (v: number) => String(v) }

function stop(id: string, title: string): ItineraryStop {
  return {
    id, title, category: 'food', locationName: title, lat: 10.1, lng: 76.1, visitMinutes: 30,
    entryFeeInrPerPerson: 0, transportCostInrTotal: 0, priority: 'nice-to-have', status: 'confirmed', orderInDay: 1,
  }
}

function makeTrip(): Trip {
  return {
    id: TRIP_ID, name: 'Facts trip', startLocation: 'Kochi', destinations: ['Munnar'],
    startDate: '2026-11-01', endDate: '2026-11-01', travellers: 2, transportMode: 'car',
    budgetPerPersonInr: 5000, travelStyle: 'balanced', fixedCommitments: [],
    startLocationCoords: { lat: 10, lng: 76 }, destinationCoords: [{ lat: 10.5, lng: 76.5 }],
    days: [{ id: 'day-a', index: 0, title: 'Day 1', stops: [stop('st-a1', 'Cafe A')] }],
    expenses: [], members: [], coverEmoji: '🧭', visibility: 'private', createdAt: 1, updatedAt: 1,
    writeVersion: 1, roundTrip: false,
  }
}

function place(id: string, name: string, cumKm: number, offRouteKm: number): PlaceHit {
  return { id, name, latitude: 10, longitude: 76, kind: 'poi', source: 'osm', cumKm, offRouteKm }
}

function segHit(index: number, hit: PlaceHit): SegmentHit {
  const segment: RideSegment = {
    index, purpose: 'meal', label: `Part ${index}`, targetKm: 20 + index * 15, minKm: 10 + index * 15,
    maxKm: 30 + index * 15, kmFromPrev: 10, minutesFromPrev: 15, hint: `Hint ${index}`,
  }
  return { segment, hit, score: 1 }
}

const dayForKm = (km: number | null | undefined): number | null => (km == null ? null : 0)

function snapshot(overrides: Partial<CorridorSnapshot> = {}): CorridorSnapshot {
  return {
    tripId: TRIP_ID, inputsHash: 'hash-facts', scopeKm: 20, status: 'ready', source: 'scan',
    pois: [segHit(0, place('a', 'A', 20, 2)), segHit(1, place('b', 'B', 40, 6))],
    anchors: [{ lat: 10, lng: 76 }],
    routePolyline: [{ lat: 10, lng: 76 }, { lat: 10.5, lng: 76.5 }],
    drivingPlan: deriveDrivingPlan({ totalKm: 60, driveMinutes: 90 }),
    dayAttribution: { dayForKm, dayOfSegment: sh => dayForKm(sh.hit?.cumKm), daySpanKm: () => ({ fromKm: 0, toKm: 60 }) },
    dayAttributionKey: dayAttributionKeyFor([60], []),
    altPool: [], detourMinFor: p => p.offRouteKm ?? null, detourKmFor: p => p.offRouteKm ?? null,
    heldBackIds: new Set<string>(),
    ...overrides,
  }
}

function views(snap: CorridorSnapshot) {
  const trip = makeTrip()
  const model = buildJourneyDays({
    trip, snapshot: snap, presence: placeIdentity(trip), editable: true, decisions: [],
    dnaVector: DNA, legCorrections: undefined, manualPicksByDay: new Map(),
  })
  const day = model.byDay.get(0)!
  const all = mapJourneyRows(day.projection, day.driveRows)
  // Corridor rows only. A saved stop is a plan fact, not scan evidence.
  const map = all.filter(row => row.stopId == null)
  const savedStops = all.filter(row => row.stopId != null)
  const timeline = travelJourneyRows(day)
  return { map, savedStops, timeline }
}

describe('retained freshness reaches the Map and Timeline rows', () => {
  it('shows a live scan as live in both views', () => {
    const { map, timeline } = views(snapshot())
    expect(map.map(row => row.freshness)).toEqual(['live', 'live'])
    expect(timeline.map(row => journeyRowMeta(row, FORMAT).freshness)).toEqual(['Live result', 'Live result'])
  })

  it('leaves a saved stop unknown, never live or retained', () => {
    const { savedStops } = views(snapshot())
    expect(savedStops.length).toBeGreaterThan(0)
    expect(savedStops.every(row => row.freshness === 'unknown')).toBe(true)
  })

  it('keeps the same ids and says retained after a quota failure', () => {
    const first = views(snapshot())
    const after = views(snapshot({ status: 'quota', source: 'retained' }))
    expect(after.map.map(row => row.key)).toEqual(first.map.map(row => row.key))
    expect(after.map.map(row => row.freshness)).toEqual(['retained', 'retained'])
    expect(after.timeline.map(row => journeyRowMeta(row, FORMAT).freshness)).toEqual(['Retained result', 'Retained result'])
  })

  it('keeps the same ids and says retained after a scan failure', () => {
    const first = views(snapshot())
    const after = views(snapshot({ status: 'failed', source: 'retained' }))
    expect(after.map.map(row => row.key)).toEqual(first.map.map(row => row.key))
    expect(after.map.every(row => row.freshness === 'retained')).toBe(true)
    expect(after.timeline.every(row => row.freshness === 'retained')).toBe(true)
  })
})

describe('corridorFreshnessOf never calls older data live', () => {
  it('maps each snapshot state to one freshness', () => {
    expect(corridorFreshnessOf(snapshot())).toBe('live')
    expect(corridorFreshnessOf(snapshot({ source: 'cache' }))).toBe('retained')
    expect(corridorFreshnessOf(snapshot({ status: 'quota', source: 'retained' }))).toBe('retained')
    expect(corridorFreshnessOf(snapshot({ status: 'failed', source: 'retained' }))).toBe('retained')
  })

  it('stays unknown while a scan runs or when no rows were kept', () => {
    expect(corridorFreshnessOf(snapshot({ status: 'scanning' }))).toBe('unknown')
    expect(corridorFreshnessOf(snapshot({ status: 'quota', source: 'scan' }))).toBe('unknown')
    expect(corridorFreshnessOf(snapshot({ status: 'failed', source: 'scan' }))).toBe('unknown')
    expect(corridorFreshnessOf(null)).toBe('unknown')
  })
})

describe('a day object is rebuilt when only the evidence state changes', () => {
  it('does not reuse the live day after the same ids turn retained', () => {
    const trip = makeTrip()
    const input = (snap: CorridorSnapshot, prev: ReturnType<typeof buildJourneyDays> | null) => buildJourneyDays({
      trip, snapshot: snap, presence: placeIdentity(trip), editable: true, decisions: [],
      dnaVector: DNA, legCorrections: undefined, manualPicksByDay: new Map(), prev,
    })
    const live = input(snapshot(), null)
    const retained = input(snapshot({ status: 'quota', source: 'retained' }), live)
    expect(retained.byDay.get(0)).not.toBe(live.byDay.get(0))
    expect(retained.byDay.get(0)!.projection.rows.filter(row => row.stopId == null).every(row => row.freshness === 'retained')).toBe(true)
    // The same state again reuses the exact day object.
    const again = input(snapshot({ status: 'quota', source: 'retained' }), retained)
    expect(again.byDay.get(0)).toBe(retained.byDay.get(0))
  })
})

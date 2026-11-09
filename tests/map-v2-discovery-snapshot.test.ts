// ============ Map v2 package E: day-local snapshot evidence reaches the rows ============
// The Map publishes the selected day's scan with its real age, coverage and day
// index. A row from that scan appears on that day only, and carries the age.
import { describe, expect, it } from 'vitest'
import { deriveDrivingPlan, type PlaceHit, type RideSegment, type SegmentHit } from '../src/lib/geocode'
import { placeIdentity } from '../src/lib/placeIdentity'
import { corridorSnapshotKey, dayAttributionKeyFor, type CorridorSnapshot } from '../src/pages/trip/map/corridorSnapshot'
import { buildJourneyDays } from '../src/pages/trip/journey/journeyDays'
import type { DiscoveryCoverage } from '../src/lib/providers/hits'
import type { ItineraryStop, Trip } from '../src/data/types'
import type { DnaVector } from '../src/lib/tripDna'

const TRIP_ID = 'trip-day-evidence'
const DNA: DnaVector = { accepts: 0, declines: 0, categoryAffinity: {}, avgDetourMin: null, avgVisitMin: null }
const COVERAGE: DiscoveryCoverage = { method: 'circles', totalKm: 40, coveredKm: 30, anchorCount: 2, radiusM: 10000, complete: false }

function stop(id: string, title: string): ItineraryStop {
  return {
    id, title, category: 'food', locationName: title, lat: 10.1, lng: 76.1, visitMinutes: 30,
    entryFeeInrPerPerson: 0, transportCostInrTotal: 0, priority: 'nice-to-have', status: 'confirmed', orderInDay: 1,
  }
}

function makeTrip(): Trip {
  return {
    id: TRIP_ID, name: 'Two day trip', startLocation: 'Kochi', destinations: ['Munnar'],
    startDate: '2026-11-01', endDate: '2026-11-02', travellers: 2, transportMode: 'car',
    budgetPerPersonInr: 5000, travelStyle: 'balanced', fixedCommitments: [],
    startLocationCoords: { lat: 10, lng: 76 }, destinationCoords: [{ lat: 10.5, lng: 76.5 }],
    days: [
      { id: 'day-a', index: 0, title: 'Day 1', stops: [stop('st-a', 'Cafe A')] },
      { id: 'day-b', index: 1, title: 'Day 2', stops: [stop('st-b', 'Cafe B')] },
    ],
    expenses: [], members: [], coverEmoji: '🧭', visibility: 'private', createdAt: 1, updatedAt: 1,
    writeVersion: 1, roundTrip: false,
  }
}

function place(id: string, cumKm: number): PlaceHit {
  return { id, name: `Place ${id}`, latitude: 10, longitude: 76, kind: 'poi', source: 'osm', cumKm, offRouteKm: 2 }
}

function segHit(index: number, hit: PlaceHit): SegmentHit {
  const segment: RideSegment = {
    index, purpose: 'meal', label: `Part ${index}`, targetKm: 20 + index * 15, minKm: 10 + index * 15,
    maxKm: 30 + index * 15, kmFromPrev: 10, minutesFromPrev: 15, hint: `Hint ${index}`,
  }
  return { segment, hit, score: 1 }
}

// The trip-wide attribution would put every km on day 0. A day scan must ignore it.
const dayForKm = (km: number | null | undefined): number | null => (km == null ? null : 0)

function snapshot(overrides: Partial<CorridorSnapshot> = {}): CorridorSnapshot {
  return {
    tripId: TRIP_ID, inputsHash: 'hash-day', scopeKm: 20, status: 'ready', source: 'scan',
    pois: [segHit(0, place('a', 20)), segHit(1, place('b', 40))],
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

function build(snap: CorridorSnapshot) {
  const trip = makeTrip()
  return buildJourneyDays({
    trip, snapshot: snap, presence: placeIdentity(trip), editable: true, decisions: [],
    dnaVector: DNA, legCorrections: undefined, manualPicksByDay: new Map(),
  })
}

const corridorRows = (model: ReturnType<typeof build>, day: number) =>
  model.byDay.get(day)!.projection.rows.filter(row => row.stopId == null)

describe('a day-local snapshot', () => {
  const day1 = () => snapshot({ discoveryDayIndex: 1, fetchedAt: 1_700_000_000_000, coverage: COVERAGE })

  it('puts every scanned row on the selected day and none on another day', () => {
    const model = build(day1())
    expect(model.byDay.get(1)!.driveRows.map(row => row.id)).toEqual(['a', 'b'])
    expect(model.byDay.get(0)!.driveRows).toEqual([])
    expect(model.allDriveRows.every(row => row.dayIndex === 1)).toBe(true)
    expect(corridorRows(model, 0)).toEqual([])
    expect(corridorRows(model, 1).length).toBeGreaterThan(0)
  })

  it('gives each row of the selected day its real age and coverage', () => {
    const model = build(day1())
    const rows = corridorRows(model, 1)
    expect(rows.every(row => row.fetchedAt === 1_700_000_000_000)).toBe(true)
    expect(rows.every(row => row.coverage === COVERAGE)).toBe(true)
    expect(model.byDay.get(1)!.evidence).toEqual({ dayIndex: 1, fetchedAt: 1_700_000_000_000, coverage: COVERAGE })
  })

  it('gives another day no evidence from this scan', () => {
    const model = build(day1())
    expect(model.byDay.get(0)!.evidence).toBeNull()
  })

  it('republishes when the age or the day changes', () => {
    const base = corridorSnapshotKey(day1())
    expect(corridorSnapshotKey(snapshot({ discoveryDayIndex: 1, fetchedAt: 1_700_000_999_000, coverage: COVERAGE }))).not.toBe(base)
    expect(corridorSnapshotKey(snapshot({ discoveryDayIndex: 0, fetchedAt: 1_700_000_000_000, coverage: COVERAGE }))).not.toBe(base)
  })
})

describe('a trip-wide snapshot', () => {
  it('keeps trip attribution and passes the age to rows without inventing one', () => {
    const withAge = build(snapshot({ fetchedAt: 5, coverage: COVERAGE }))
    expect(withAge.byDay.get(0)!.driveRows.map(row => row.id)).toEqual(['a', 'b'])
    expect(corridorRows(withAge, 0).every(row => row.fetchedAt === 5)).toBe(true)
    const noAge = build(snapshot())
    expect(corridorRows(noAge, 0).every(row => row.fetchedAt == null && row.coverage == null)).toBe(true)
    expect(noAge.byDay.get(0)!.evidence).toBeNull()
  })
})

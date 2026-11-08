// ============ Net added wiring (#08 AC2) ============
// The app's real caller. `buildJourneyDays` is where the Map's corridor
// snapshot becomes every day's projection, so the net-added seam is supplied
// there from the ONE measured road the writer and the preview already use.
//
// These tests drive the real producer: the real day slots, the real planner and
// the real impact function. Only the corridor snapshot is constructed here,
// because it is the Map's published data contract.
import { describe, expect, it } from 'vitest'
import {
  deriveDrivingPlan,
  type PlaceHit,
  type RideSegment,
  type SegmentHit,
} from '../src/lib/geocode'
import { projectOntoPolyline } from '../src/lib/providers/hits'
import { placeIdentity } from '../src/lib/placeIdentity'
import { dayAttributionKeyFor, type CorridorSnapshot } from '../src/pages/trip/map/corridorSnapshot'
import {
  buildJourneyDays,
  type JourneyDaysInput,
  type JourneyNetAddedRoad,
} from '../src/pages/trip/journey/journeyDays'
import { computeImpact } from '../src/lib/impact'
import { confirmedVisitMinutes, intendedVisitMinutes } from '../src/lib/hoursContext'
import { withCandidateInserted } from '../src/lib/netAddedMin'
import type { DnaVector } from '../src/lib/tripDna'
import type { ItineraryStop, Trip } from '../src/data/types'

const TRIP_ID = 'trip-net-added'
const DNA: DnaVector = {
  accepts: 0,
  declines: 0,
  categoryAffinity: {},
  avgDetourMin: null,
  avgVisitMin: null,
}

const LINE = [{ lat: 10, lng: 76 }, { lat: 10.6, lng: 76.6 }]

function hit(overrides: Partial<PlaceHit> & Pick<PlaceHit, 'id' | 'name'>): PlaceHit {
  return { latitude: 10, longitude: 76, kind: 'poi', ...overrides }
}

function segment(index: number, purpose: RideSegment['purpose']): RideSegment {
  return {
    index,
    purpose,
    label: `Part ${index}`,
    targetKm: 20 + index * 15,
    minKm: 10 + index * 15,
    maxKm: 30 + index * 15,
    kmFromPrev: 10,
    minutesFromPrev: 15,
    hint: `Hint ${index}`,
  }
}

function segHit(index: number, purpose: RideSegment['purpose'], place: PlaceHit | null): SegmentHit {
  return { segment: segment(index, purpose), hit: place, score: 1 }
}

function stop(id: string, title: string, lat: number, lng: number, over: Partial<ItineraryStop> = {}): ItineraryStop {
  return {
    id,
    title,
    category: 'food',
    locationName: title,
    lat,
    lng,
    visitMinutes: 30,
    entryFeeInrPerPerson: 0,
    transportCostInrTotal: 0,
    priority: 'nice-to-have',
    status: 'confirmed',
    orderInDay: 1,
    ...over,
  }
}

function makeTrip(): Trip {
  return {
    id: TRIP_ID,
    name: 'Net added trip',
    startLocation: 'Kochi',
    destinations: ['Munnar'],
    startDate: '2026-11-01',
    endDate: '2026-11-02',
    travellers: 2,
    transportMode: 'car',
    budgetPerPersonInr: 5000,
    travelStyle: 'balanced',
    fixedCommitments: [],
    startLocationCoords: { lat: 10, lng: 76 },
    destinationCoords: [{ lat: 10.6, lng: 76.6 }],
    roundTrip: false,
    days: [
      {
        id: 'day-a',
        index: 0,
        title: 'Day 1',
        stops: [
          stop('st-a1', 'Cafe A', 10.1, 76.1, { orderInDay: 1 }),
          stop('st-a2', 'Stay A', 10.5, 76.5, { orderInDay: 2, category: 'hotel', visitMinutes: 0 }),
        ],
      },
      {
        id: 'day-b',
        index: 1,
        title: 'Day 2',
        stops: [stop('st-b1', 'Falls B', 10.2, 76.2, { orderInDay: 1, category: 'sightseeing' })],
      },
    ],
    expenses: [],
    members: [],
    coverEmoji: '🧭',
    visibility: 'private',
    createdAt: 1,
    updatedAt: 1,
    writeVersion: 7,
  }
}

const onRoute = hit({ id: 'on-route', name: 'Between the stops', latitude: 10.3, longitude: 76.3, cumKm: 20, offRouteKm: 1, category: 'sightseeing' })
const noPosition = hit({ id: 'no-position', name: 'No usable position', latitude: Number.NaN, longitude: Number.NaN, cumKm: 20, offRouteKm: 3, category: 'sightseeing' })

function dayForKm(km: number | null | undefined): number | null {
  if (km == null) return null
  return km < 60 ? 0 : 1
}

function makeSnapshot(): CorridorSnapshot {
  const pois = [segHit(0, 'sight', onRoute), segHit(1, 'sight', noPosition)]
  return {
    tripId: TRIP_ID,
    inputsHash: 'hash-net-added',
    scopeKm: 20,
    status: 'ready',
    source: 'scan',
    pois,
    anchors: [{ lat: 10, lng: 76 }],
    routePolyline: LINE,
    drivingPlan: deriveDrivingPlan({ totalKm: 120, driveMinutes: 180 }),
    dayAttribution: {
      dayForKm,
      dayOfSegment: sh => dayForKm(sh.hit?.cumKm),
      daySpanKm: () => ({ fromKm: 0, toKm: 120 }),
    },
    dayAttributionKey: dayAttributionKeyFor([60, 60], []),
    altPool: [],
    detourMinFor: place => place.offRouteKm ?? null,
    detourKmFor: place => place.offRouteKm ?? null,
    heldBackIds: new Set<string>(),
  }
}

const measuredRoad: JourneyNetAddedRoad = {
  routeKey: 'measured:net-added',
  routeKmOf: (lat, lng) => projectOntoPolyline({ latitude: lat, longitude: lng }, LINE)?.km ?? null,
}

function build(overrides: Partial<JourneyDaysInput> = {}) {
  const trip = overrides.trip ?? makeTrip()
  return buildJourneyDays({
    trip,
    snapshot: makeSnapshot(),
    presence: placeIdentity(trip),
    editable: true,
    decisions: [],
    dnaVector: DNA,
    legCorrections: undefined,
    manualPicksByDay: new Map(),
    netAddedRoad: measuredRoad,
    ...overrides,
  })
}

function rowFor(model: ReturnType<typeof buildJourneyDays>, name: string) {
  return model.byDay.get(0)?.projection.rows.find(row => row.hit.name === name)
}

describe('the real caller supplies the net-added seam', () => {
  it('gives an on-route candidate row a number equal to the impact preview delta', () => {
    const trip = makeTrip()
    const model = build({ trip })
    const row = rowFor(model, onRoute.name)
    expect(row).toBeDefined()
    expect(typeof row?.netAddedMin).toBe('number')
    expect(Number.isFinite(row?.netAddedMin)).toBe(true)

    // The preview's own path: insert the stop the writer would create, at the
    // position the planner proves, then run the real impact function.
    const plannedStop: ItineraryStop = {
      ...stop('planned', onRoute.name, onRoute.latitude, onRoute.longitude, {
        category: 'sightseeing',
        visitMinutes: confirmedVisitMinutes(onRoute) ?? intendedVisitMinutes(onRoute),
      }),
    }
    const insertAt = 1
    const proposedDay = withCandidateInserted(trip.days[0], { key: 'row', stop: plannedStop, insertAt })
    expect(proposedDay).not.toBeNull()
    const proposed: Trip = { ...trip, days: trip.days.map(day => (day.index === 0 ? proposedDay! : day)) }
    const preview = computeImpact(trip, proposed, 'add', 0).timeDeltaMin
    expect(row?.netAddedMin).toBe(preview)
  })

  it('keeps every row null when no caller supplies the seam', () => {
    const model = build({ netAddedRoad: null })
    const rows = [...model.byDay.values()].flatMap(day => day.projection.rows)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every(row => row.netAddedMin === null)).toBe(true)
  })

  it('keeps a candidate with no usable position null, without inventing a duration', () => {
    const model = build()
    const unknown = rowFor(model, noPosition.name)
    expect(unknown).toBeDefined()
    expect(unknown?.netAddedMin).toBeNull()
    expect(rowFor(model, onRoute.name)?.netAddedMin).not.toBeNull()
  })
})

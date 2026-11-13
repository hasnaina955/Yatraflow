// ============ Shared per-day journey producer (#08 S3) ============
// Real modules: the producer calls the real daySlots, the real manual builder,
// the real dayCards/simulateDay and the real projectJourney. Only the corridor
// snapshot is constructed here, because it is the Map's published data contract.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  deriveDrivingPlan,
  type PlaceHit,
  type RideSegment,
  type SegmentHit,
} from '../src/lib/geocode'
import { placeIdentity } from '../src/lib/placeIdentity'
import { dayAttributionKeyFor, type CorridorSnapshot } from '../src/pages/trip/map/corridorSnapshot'
import {
  buildJourneyDays,
  snapshotStatusOf,
  type JourneyDaysInput,
} from '../src/pages/trip/journey/journeyDays'
import type { DnaVector } from '../src/lib/tripDna'
import type { ItineraryStop, Trip } from '../src/data/types'
import type { ManualPicksForDay } from '../src/pages/trip/map/manualPicks'
import { captureManualPicks } from '../src/pages/trip/journey/useJourneyDays'
import { createJourneySelector } from '../src/pages/trip/journey/journeySelector'
import { mapManualSlotStore } from '../src/pages/trip/map/manualSlotContexts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path: string): string => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n')

const TRIP_ID = 'trip-s3'
const DNA: DnaVector = {
  accepts: 0,
  declines: 0,
  categoryAffinity: {},
  avgDetourMin: null,
  avgVisitMin: null,
}

it('assigns an unnamed meal from the shared engine schedule', () => {
  const trip = makeTrip()
  trip.days[0].startTime = '08:00'
  trip.days[0].stops[0].openTime = '06:00'
  trip.days[0].stops[0].closeTime = '23:00'
  const model = build({ trip })
  const slots = model.byDay.get(0)?.slots ?? []
  expect(slots.find(slot => slot.key === 'breakfast')?.filledStop?.id).toBe('st-a1')
  expect(slots.find(slot => slot.key === 'lunch')?.filledStop).toBeNull()
})

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

function stop(id: string, title: string, overrides: Partial<ItineraryStop> = {}): ItineraryStop {
  return {
    id,
    title,
    category: 'food',
    locationName: title,
    lat: 10.1,
    lng: 76.1,
    visitMinutes: 30,
    entryFeeInrPerPerson: 0,
    transportCostInrTotal: 0,
    priority: 'nice-to-have',
    status: 'confirmed',
    orderInDay: 1,
    ...overrides,
  }
}

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  const base: Trip = {
    id: TRIP_ID,
    name: 'S3 trip',
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
    destinationCoords: [{ lat: 10.5, lng: 76.5 }],
    days: [
      {
        id: 'day-a',
        index: 0,
        title: 'Day 1',
        stops: [
          stop('st-a1', 'Cafe A', { orderInDay: 1 }),
          stop('st-a2', 'Stay A', { orderInDay: 2, category: 'hotel', visitMinutes: 0 }),
        ],
      },
      {
        id: 'day-b',
        index: 1,
        title: 'Day 2',
        stops: [stop('st-b1', 'Falls B', { orderInDay: 1, category: 'sightseeing' })],
      },
    ],
    expenses: [],
    members: [],
    coverEmoji: '🧭',
    visibility: 'private',
    createdAt: 1,
    updatedAt: 1,
    writeVersion: 7,
    roundTrip: false,
  }
  return { ...base, ...overrides }
}

const hitA = hit({ id: 'a', name: 'A', source: 'google', placeId: 'g-a', cumKm: 20, offRouteKm: 2 })
const hitB = hit({ id: 'b', name: 'B', source: 'osm', cumKm: 80, offRouteKm: 0 })
const hitUnknownDay = hit({ id: 'n', name: 'N', source: 'osm', offRouteKm: 4 })
const hitOutOfRange = hit({ id: 'o', name: 'O', source: 'wikipedia', cumKm: 300, offRouteKm: 3 })
const sharedGoogle = hit({ id: 1, name: 'G1', source: 'google', placeId: 'g-one', cumKm: 25, offRouteKm: 1 })
const sharedOsm = hit({ id: 1, name: 'O1', source: 'osm', cumKm: 30, offRouteKm: 1 })
const altHit = hit({ id: 'alt', name: 'Alt', source: 'mappls', eLoc: 'm-alt', cumKm: 50, offRouteKm: 5 })

function dayForKm(km: number | null | undefined): number | null {
  if (km == null) return null
  if (km < 60) return 0
  if (km < 120) return 1
  return 5
}

const attribution = {
  dayForKm,
  dayOfSegment: (sh: SegmentHit): number | null => dayForKm(sh.hit?.cumKm),
  daySpanKm: () => ({ fromKm: 0, toKm: 120 }),
}

function makeSnapshot(overrides: Partial<CorridorSnapshot> = {}): CorridorSnapshot {
  return {
    tripId: TRIP_ID,
    inputsHash: 'hash-s3',
    scopeKm: 20,
    status: 'ready',
    source: 'scan',
    pois: [
      segHit(0, 'meal', hitA),
      segHit(1, 'sight', hitB),
      segHit(2, 'meal', hitUnknownDay),
      segHit(3, 'meal', hitOutOfRange),
      segHit(4, 'fuel', sharedGoogle),
      segHit(5, 'fuel', sharedOsm),
    ],
    anchors: [{ lat: 10, lng: 76 }],
    routePolyline: [{ lat: 10, lng: 76 }, { lat: 10.5, lng: 76.5 }],
    drivingPlan: deriveDrivingPlan({ totalKm: 120, driveMinutes: 180 }),
    dayAttribution: attribution,
    dayAttributionKey: dayAttributionKeyFor([60, 60], []),
    altPool: [altHit],
    detourMinFor: place => place.offRouteKm ?? null,
    detourKmFor: place => place.offRouteKm ?? null,
    heldBackIds: new Set(['b']),
    ...overrides,
  }
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
    ...overrides,
  })
}

describe('one assembly, one actual-day grouping', () => {
  it('groups day A/B by the real day and keeps unknown/out-of-range once', () => {
    const model = build()
    expect([...model.byDay.keys()].sort()).toEqual([0, 1])
    expect(model.unknownDayRows.map(row => row.hit.name)).toEqual(['N'])
    expect(model.outOfRangeRows.map(row => row.hit.name)).toEqual(['O'])
    expect(model.allDriveRows).toHaveLength(6)
    expect(model.byDay.get(0)?.driveRows.map(row => row.hit.name)).toEqual(['A', 'G1', 'O1'])
    expect(model.byDay.get(1)?.driveRows.map(row => row.hit.name)).toEqual(['B'])
  })

  it('never lets a foreign-day row enter another day projection', () => {
    const model = build()
    const dayZero = model.byDay.get(0)!
    const dayOne = model.byDay.get(1)!
    expect(dayZero.projection.rows.some(row => row.hit.name === 'B')).toBe(false)
    expect(dayOne.projection.rows.some(row => row.hit.name === 'A')).toBe(false)
    expect(dayZero.projection.unassigned).toEqual([])
  })

  it('keeps two providers that share raw id 1 apart', () => {
    const model = build()
    const dayZero = model.byDay.get(0)!
    const google = dayZero.projection.rows.find(row => row.hit.name === 'G1')
    const osm = dayZero.projection.rows.find(row => row.hit.name === 'O1')
    expect(google).toBeDefined()
    expect(osm).toBeDefined()
    expect(google?.key).not.toBe(osm?.key)
    expect(google?.placeKeys).not.toEqual(osm?.placeKeys)
  })
})

describe('authoritative schedule and context', () => {
  it('passes the real DayCardFacts.sim as daySchedule', () => {
    const model = build()
    const cards = model.cards.byDay.get(0)
    expect(cards).toBeDefined()
    expect(model.byDay.get(0)?.daySchedule).toBe(cards?.sim)
    expect((model.byDay.get(0)?.daySchedule?.activeStops.length ?? 0)).toBeGreaterThan(0)
  })

  it('keeps the query/day context stable on a plan-only change', () => {
    const first = build()
    const changed = makeTrip()
    changed.days = changed.days.map(day => day.index !== 0 ? day : {
      ...day,
      stops: day.stops.map(s => s.id === 'st-a1' ? { ...s, visitMinutes: 90 } : s),
    })
    const second = build({ trip: changed })
    expect(second.byDay.get(0)?.contextKey).toBe(first.byDay.get(0)?.contextKey)
    expect(second.byDay.get(0)?.projection).not.toBe(first.byDay.get(0)?.projection)
    const row = second.byDay.get(0)?.projection.rows.find(r => r.stopId === 'st-a1')
    expect(row?.visitMin).toBe(90)
  })

  it('updates rows on a same-size membership change, not on a size', () => {
    const trip = makeTrip()
    const withA = build({ trip, presence: placeIdentity(trip, undefined, new Set(['a'])) })
    const withB = build({ trip, presence: placeIdentity(trip, undefined, new Set(['b'])) })
    const rowA = withA.byDay.get(0)?.projection.rows.find(r => String(r.hit.id) === 'a')
    const rowB = withB.byDay.get(0)?.projection.rows.find(r => String(r.hit.id) === 'a')
    expect(rowA?.actions.add).toBe(false)
    expect(rowB?.actions.add).toBe(true)
  })
})

function selectorInput(trip: Trip, identityGeneration = 1) {
  return {
    trip,
    committedTrip: trip,
    snapshot: makeSnapshot(),
    presence: placeIdentity(trip),
    editable: true,
    decisions: [],
    dnaVector: DNA,
    legCorrections: undefined,
    manualPicksByDay: new Map<number, ManualPicksForDay>(),
    identityGeneration,
  }
}

describe('S2 stable per-day objects', () => {
  it('reuses day A across a same-id clone, and clears on identity change', () => {
    const selector = createJourneySelector()
    const trip = makeTrip()
    const firstSelection = selector.select(selectorInput(trip))
    selector.commit(firstSelection)
    const first = firstSelection.model
    const clone: Trip = {
      ...trip,
      days: trip.days.map(day => day.index === 1 ? {
        ...day,
        stops: day.stops.map(stop => ({ ...stop, visitMinutes: 75 })),
      } : day),
    }
    const second = selector.select(selectorInput(clone)).model
    expect(second.byDay.get(0)).toBe(first.byDay.get(0))
    expect(second.cards.byDay.get(0)).toBe(first.cards.byDay.get(0))
    expect(second.byDay.get(1)).not.toBe(first.byDay.get(1))

    const nextIdentity = selector.select(selectorInput(clone, 2)).model
    expect(nextIdentity.byDay.get(0)).not.toBe(first.byDay.get(0))
  })

  it('reuses day A while day B changes', () => {
    const trip = makeTrip()
    const first = build({ trip })
    const changed = {
      ...trip,
      days: trip.days.map(day => day.index === 1 ? {
        ...day,
        stops: day.stops.map(stop => ({ ...stop, visitMinutes: 75 })),
      } : day),
    }
    const second = build({ trip: changed, prev: first })
    expect(second.byDay.get(0)).toBe(first.byDay.get(0))
    expect(second.cards.byDay.get(0)).toBe(first.cards.byDay.get(0))
    expect(second.byDay.get(1)).not.toBe(first.byDay.get(1))
  })
})

// F6: a selection made during render must not move the reuse cache. Only the
// commit that follows a React commit may.
describe('F6 render-pure selection', () => {
  it('never lets an uncommitted selection replace the committed cache', () => {
    const selector = createJourneySelector()
    const trip = makeTrip()
    const committedA = selector.select(selectorInput(trip))
    selector.commit(committedA)
    const first = committedA.model

    // A speculative render whose every day changed. Selection happens during
    // render, and nothing commits it.
    const speculativeTrip: Trip = {
      ...trip,
      days: trip.days.map(day => ({
        ...day,
        stops: day.stops.map(stop => ({ ...stop, visitMinutes: stop.visitMinutes + 1 })),
      })),
    }
    const speculative = selector.select(selectorInput(speculativeTrip))
    expect(speculative.model.byDay.get(0)).not.toBe(first.byDay.get(0))

    // Back to A with no commit in between: A's exact objects must be reused.
    const again = selector.select(selectorInput(trip))
    expect(again.model.byDay.get(0)).toBe(first.byDay.get(0))
    expect(again.model.cards.byDay.get(0)).toBe(first.cards.byDay.get(0))

    // Only a real commit moves the cache.
    selector.commit(speculative)
    const afterCommit = selector.select(selectorInput(trip))
    expect(afterCommit.model.byDay.get(0)).not.toBe(first.byDay.get(0))
  })

  it('wires select into render and commit into an effect', () => {
    const hook = readFileSync(new URL('../src/pages/trip/journey/useJourneyDays.ts', import.meta.url), 'utf8')
    expect(hook).toContain('selector.select(modelInput)')
    expect(hook).toMatch(/useEffect\(\(\) => \{\s*selector\.commit\(selection\)/)
  })
})

describe('P4 committed identity', () => {
  it('keeps committed day ids and leaves a proposed new day unbound', () => {
    const committed = makeTrip()
    const effective: Trip = {
      ...committed,
      days: [...committed.days, { id: 'day-new', index: 2, title: 'New', stops: [] }],
    }
    const model = build({ trip: effective, committedTrip: committed })
    expect(model.byDay.get(0)?.dayId).toBe('day-a')
    expect(model.byDay.get(2)?.dayId).toBeNull()
    expect(model.byDay.get(0)?.contextKey.startsWith(`${committed.id}:`)).toBe(true)
  })
})

describe('P5 DNA fallback', () => {
  it('does not turn a ready snapshot with no DNA into a ready empty', () => {
    const model = build({ dnaVector: null })
    expect(model.status.kind).toBe('ready')
    expect(model.byDay.size).toBe(2)
    expect(model.allDriveRows.length).toBeGreaterThan(0)
  })
})

describe('P3 manual capture follows the real store', () => {
  it('reflects a file and a drop, and the hook depends on dnaTick', () => {
    const trip = makeTrip()
    const snapshot = makeSnapshot()
    const context = { tripId: trip.id, dayId: 'day-a', slotKey: 'lunch' }
    const manualHit = hit({ id: 'm-store', name: 'Store Pick', source: 'google', cumKm: 25 })
    mapManualSlotStore.clear()
    try {
      expect(mapManualSlotStore.file(context, manualHit)).toBe('filed')
      const captured = captureManualPicks(trip, snapshot, {})
      expect(captured.get(0)?.stable.lunch?.[0]?.hit.id).toBe('m-store')
      mapManualSlotStore.dropPlaced(context, [manualHit])
      const after = captureManualPicks(trip, snapshot, {})
      expect(after.get(0)?.stable.lunch ?? []).toHaveLength(0)
    } finally {
      mapManualSlotStore.clear()
    }
    const hook = readFileSync(new URL('../src/pages/trip/journey/useJourneyDays.ts', import.meta.url), 'utf8')
    expect(hook).toMatch(/input\.trip, input\.snapshot, input\.slotManual, input\.dnaTick/)
  })
})

describe('P8 retained quota/failure', () => {
  it('keeps quota distinct before and after retained rows', () => {
    const retained = build({ snapshot: makeSnapshot({ status: 'quota' }) })
    expect(retained.status.kind).toBe('quota')
    expect(retained.byDay.size).toBe(2)
    expect(retained.allDriveRows.length).toBeGreaterThan(0)

    const firstQuota = build({ snapshot: makeSnapshot({ status: 'quota', pois: [] }) })
    expect(firstQuota.status.kind).toBe('quota')
    expect(firstQuota.byDay.size).toBe(2)
    expect(firstQuota.allDriveRows).toHaveLength(0)
  })
})

describe('states and roles', () => {
  it('maps snapshot state to unscanned/scanning/failed/quota/ready', () => {
    expect(snapshotStatusOf(null, TRIP_ID)).toEqual({ kind: 'unscanned' })
    expect(snapshotStatusOf(makeSnapshot({ tripId: 'other' }), TRIP_ID)).toEqual({ kind: 'unscanned' })
    expect(snapshotStatusOf(makeSnapshot({ status: 'scanning' }), TRIP_ID)).toEqual({ kind: 'scanning' })
    expect(snapshotStatusOf(makeSnapshot({ status: 'failed' }), TRIP_ID)).toEqual({ kind: 'failed' })
    expect(snapshotStatusOf(makeSnapshot({ status: 'quota' }), TRIP_ID)).toEqual({ kind: 'quota' })
    expect(snapshotStatusOf(makeSnapshot({ status: 'quota', pois: [] }), TRIP_ID)).toEqual({ kind: 'quota' })
    expect(snapshotStatusOf(makeSnapshot({ status: 'ready', source: 'cache' }), TRIP_ID)).toEqual({ kind: 'ready', source: 'cache' })
  })

  it('keeps an unscanned model empty and a ready-empty model ready', () => {
    const trip = makeTrip()
    const unscanned = build({ trip, snapshot: null })
    expect(unscanned.status.kind).toBe('unscanned')
    expect(unscanned.byDay.size).toBe(0)
    expect(unscanned.cards.byDay.size).toBe(2)
    const empty = build({ trip, snapshot: makeSnapshot({ pois: [], altPool: [] }) })
    expect(empty.status.kind).toBe('ready')
    expect(empty.byDay.size).toBe(2)
    expect(empty.allDriveRows).toHaveLength(0)
  })

  it('removes mutation actions for a viewer', () => {
    const model = build({ editable: false })
    for (const row of model.byDay.get(0)?.projection.rows ?? []) {
      expect(row.actions.add).toBe(false)
      expect(row.actions.preview).toBe(false)
      expect(row.actions.shortlist).toBe(false)
      expect(row.actions.vote).toBe(false)
    }
  })
})

describe('manual picks stay on their own day', () => {
  it('uses captured ManualPicksForDay per day and never crosses days', () => {
    const trip = makeTrip()
    const candidate = {
      hit: hit({ id: 'm1', name: 'Manual', source: 'google', cumKm: 25 }),
      detourMin: 4,
      detourKm: 2,
      budgetSharePct: 9,
      posKm: null,
      arriveMin: null,
      arriveLabel: null,
      inWindow: false,
      score: 1,
      reason: 'manual pick',
    }
    // Use a real open slot on day 0, so the manual merge target exists in the
    // derived grammar rather than assuming a key the engine did not create.
    const base = build({ trip })
    const slotKey = base.byDay.get(0)?.slots.find(slot => slot.state === 'empty')?.key
    expect(slotKey).toBeDefined()
    if (!slotKey) return
    const manual: ManualPicksForDay = { stable: { [slotKey]: [candidate] }, legacy: {} }
    const model = build({ trip, manualPicksByDay: new Map([[0, manual]]) })
    const dayZero = model.byDay.get(0)?.dayPlan.slots ?? []
    const dayOne = model.byDay.get(1)?.dayPlan.slots ?? []
    expect(dayZero.some(slot => slot.candidates.some(row => row.hit.id === 'm1'))).toBe(true)
    expect(dayOne.some(slot => slot.candidates.some(row => row.hit.id === 'm1'))).toBe(false)
  })
})

describe('no provider call', () => {
  it('builds twice with a throwing fetch stub', () => {
    const original = globalThis.fetch
    globalThis.fetch = (() => { throw new Error('provider call attempted') }) as typeof fetch
    try {
      expect(() => build()).not.toThrow()
      expect(() => build()).not.toThrow()
    } finally {
      globalThis.fetch = original
    }
  })
})

describe('S3 prop threading pins', () => {
  const mapTab = read('src/pages/trip/MapTab.tsx')
  const workspace = read('src/pages/TripWorkspace.tsx')
  const timeline = read('src/pages/trip/TimelineTab.tsx')
  const daySection = read('src/pages/trip/timeline/DaySection.tsx')
  const producer = read('src/pages/trip/journey/journeyDays.ts')

  it('has one drive assembly and one day-schedule pass in the producer', () => {
    expect((producer.match(/driveRowsFromSegments\(/g) ?? []).length).toBe(1)
    expect(producer).toContain('daySchedule: sim')
    expect(producer).toContain('Number.isInteger(dayIndex)')
    expect(producer).toContain('unknownDayRows')
    expect(producer).toContain('outOfRangeRows')
  })

  it('moves the Map read-side assembly to the producer', () => {
    expect(mapTab).not.toMatch(/projectJourney\(/)
    expect(mapTab).not.toMatch(/driveRowsFromSegments\(/)
    expect(mapTab).not.toMatch(/useDaySlots\(/)
    expect(mapTab).toContain('journeyDays.byDay.get(activeDayIndex)')
    expect(mapTab).toContain('displayDayPlan: journeyDay?.dayPlan')
    expect(mapTab).toContain('mapAllJourneyRowsForDays(journeyDays.byDay.values(), journeyDays.allDriveRows)')
  })

  it('threads the model through Workspace, TimelineTab and DaySection', () => {
    expect(workspace).toContain('useJourneyDays({')
    expect(workspace).toContain('journeyDays={journeyDays}')
    expect(workspace).toContain('onCorridorState={publishCorridor}')
    expect(timeline).toContain('journeyDays.cards')
    expect(timeline).toContain('journeyDay={journeyDays.byDay.get(day.index)}')
    expect(timeline).not.toMatch(/buildDayCards\(/)
    expect(daySection).toContain('journeyDay?: JourneyDay')
    expect(daySection).toContain('journeyStatus?: JourneyStatus')
  })


})

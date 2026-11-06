// ============ Timeline consumer parity over the shared producer (#08 S4) ============
// Real producer, real core, real Map adapter and the real TravelPanel render.
// The only controlled input is the corridor snapshot (the Map's published data)
// and the transport, which throws if anything tries to fetch.
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildJourney } from '../src/lib/engine'
import { acceptProjection, projectJourney } from '../src/lib/journeyProjection'
import type { PlaceHit, RideSegment, SegmentHit } from '../src/lib/geocode'
import { deriveDrivingPlan } from '../src/lib/geocode'
import { placeIdentity } from '../src/lib/placeIdentity'
import { dayAttributionKeyFor, type CorridorSnapshot } from '../src/pages/trip/map/corridorSnapshot'
import { mapJourneyRows } from '../src/pages/trip/map/mapJourneyRows'
import { buildJourneyDays } from '../src/pages/trip/journey/journeyDays'
import type { JourneyRow } from '../src/lib/journeyProjection'
import { journeyFixture } from './helpers/journeyProjectionFixture'
import type { Trip, ItineraryStop } from '../src/data/types'
import type { DnaVector } from '../src/lib/tripDna'
import { useSuggestionCache } from '../src/hooks/useSuggestionCache'
import { TravelPanel } from '../src/pages/trip/timeline/TravelPanel'
import {
  journeyRowMeta,
  travelJourneyRows,
} from '../src/pages/trip/timeline/travelJourneyRows'
import { projectedPickFor } from '../src/pages/trip/timeline/timelineProjectedWriter'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path: string): string => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n')
const DNA: DnaVector = { accepts: 0, declines: 0, categoryAffinity: {}, avgDetourMin: null, avgVisitMin: null }
const TRIP_ID = 'trip-s4'

function hit(overrides: Partial<PlaceHit> & Pick<PlaceHit, 'id' | 'name'>): PlaceHit {
  return { latitude: 10.1, longitude: 76.1, kind: 'poi', ...overrides }
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

function segHit(index: number, purpose: RideSegment['purpose'], place: PlaceHit): SegmentHit {
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

function makeTrip(): Trip {
  return {
    id: TRIP_ID,
    name: 'S4 trip',
    startLocation: 'Kochi',
    destinations: ['Munnar'],
    startDate: '2026-11-01',
    endDate: '2026-11-01',
    travellers: 2,
    transportMode: 'car',
    budgetPerPersonInr: 5000,
    travelStyle: 'balanced',
    fixedCommitments: [],
    startLocationCoords: { lat: 10, lng: 76 },
    destinationCoords: [{ lat: 10.6, lng: 76.6 }],
    days: [{
      id: 'day-a',
      index: 0,
      title: 'Day 1',
      stops: [
        stop('st-a1', 'Cafe A', { orderInDay: 1, lat: 10.2, lng: 76.2 }),
        stop('st-a2', 'Stay A', { orderInDay: 2, category: 'hotel', visitMinutes: 0, lat: 10.4, lng: 76.4 }),
      ],
    }],
    expenses: [],
    members: [],
    coverEmoji: '🧭',
    visibility: 'private',
    createdAt: 1,
    updatedAt: 1,
    writeVersion: 7,
    roundTrip: false,
  }
}

const hitA = hit({ id: 'a', name: 'A', source: 'google', placeId: 'g-a', cumKm: 20, offRouteKm: 2 })
const hitB = hit({ id: 'b', name: 'B', source: 'osm', cumKm: 40, offRouteKm: 0 })
const sharedGoogle = hit({ id: 1, name: 'G1', source: 'google', placeId: 'g-one', cumKm: 25, offRouteKm: 1 })

const attribution = {
  dayForKm: (km: number | null | undefined): number | null => (km == null ? null : 0),
  dayOfSegment: (): number => 0,
  daySpanKm: () => ({ fromKm: 0, toKm: 80 }),
}

function makeSnapshot(): CorridorSnapshot {
  return {
    tripId: TRIP_ID,
    inputsHash: 'hash-s4',
    scopeKm: 20,
    status: 'ready',
    source: 'scan',
    pois: [segHit(0, 'meal', hitA), segHit(1, 'sight', hitB), segHit(2, 'fuel', sharedGoogle)],
    anchors: [{ lat: 10, lng: 76 }],
    routePolyline: [{ lat: 10, lng: 76 }, { lat: 10.6, lng: 76.6 }],
    drivingPlan: deriveDrivingPlan({ totalKm: 80, driveMinutes: 120 }),
    dayAttribution: attribution,
    dayAttributionKey: dayAttributionKeyFor([80], []),
    altPool: [hitB],
    detourMinFor: place => place.offRouteKm ?? null,
    detourKmFor: place => place.offRouteKm ?? null,
    heldBackIds: new Set(),
  }
}

function producerDay() {
  const trip = makeTrip()
  const model = buildJourneyDays({
    trip,
    snapshot: makeSnapshot(),
    presence: placeIdentity(trip),
    editable: true,
    decisions: [],
    dnaVector: DNA,
    legCorrections: undefined,
    manualPicksByDay: new Map(),
  })
  const day = model.byDay.get(0)
  if (!day) throw new Error('producer did not build the fixture day')
  return { trip, model, day }
}

const suggestionCache: ReturnType<typeof useSuggestionCache> = {
  cache: { map: null, fraction: null, halts: {} },
  setMapCache: () => {},
  setFractionCache: () => {},
  setHaltCache: () => {},
  clearMap: () => {},
}

function renderPanel(overrides: Partial<React.ComponentProps<typeof TravelPanel>> = {}): string {
  const { trip, model, day } = producerDay()
  const journey = buildJourney(trip, trip.days[0])
  return renderToStaticMarkup(React.createElement(TravelPanel, {
    trip,
    day: trip.days[0],
    editable: true,
    journey,
    onSetDayStart: () => {},
    onAddPlannedHalts: () => {},
    onAddProjectedRow: () => {},
    suggestionCache,
    journeyDay: day,
    journeyStatus: model.status,
    ...overrides,
  }))
}

function coveredMapRows(dayModel: ReturnType<typeof producerDay>['day']) {
  return mapJourneyRows(dayModel.projection, [])
    .filter(row => row.stopId == null)
}

describe('same covered rows through the real producer and both adapters', () => {
  it('matches key, identity, cost, time, reason, source, freshness and actions', () => {
    const { day } = producerDay()
    const timeline = travelJourneyRows(day)
    const map = coveredMapRows(day)
    expect(timeline.length).toBeGreaterThan(0)
    const byKey = new Map(map.map(row => [row.key, row]))
    for (const row of timeline) {
      const other = byKey.get(row.key)
      expect(other, `Map row ${row.key}`).toBeDefined()
      expect({
        key: row.key,
        tripId: row.tripId,
        dayId: row.dayId,
        dayIndex: row.dayIndex,
        slotKey: row.slotKey,
        slotRef: row.slotRef,
        stopId: row.stopId,
        placeKeys: row.placeKeys,
        detourMin: row.detourMin,
        detourKm: row.detourKm,
        budgetSharePct: row.budgetSharePct,
        visitMin: row.visitMin,
        arriveMin: row.arriveMin,
        arriveLabel: row.arriveLabel,
        arriveSource: row.arriveSource,
        reason: row.reason,
        source: row.source,
        freshness: row.freshness,
        actions: row.actions,
      }).toEqual({
        key: other!.key,
        tripId: other!.tripId,
        dayId: other!.dayId,
        dayIndex: other!.dayIndex,
        slotKey: other!.slotKey,
        slotRef: other!.slotRef,
        stopId: other!.stopId,
        placeKeys: other!.placeKeys,
        detourMin: other!.detourMin,
        detourKm: other!.detourKm,
        budgetSharePct: other!.budgetSharePct,
        visitMin: other!.visitMin,
        arriveMin: other!.arriveMin,
        arriveLabel: other!.arriveLabel,
        arriveSource: other!.arriveSource,
        reason: other!.reason,
        source: other!.source,
        freshness: other!.freshness,
        actions: other!.actions,
      })
    }
  })

  it('produces the same rows the Map adapter sees for the day', () => {
    const { day } = producerDay()
    const timeline = travelJourneyRows(day).map(row => row.key)
    const map = coveredMapRows(day).map(row => row.key)
    expect(timeline).toEqual(map)
  })
})

describe('truthful row facts and authority', () => {
  const base = (): JourneyRow => travelJourneyRows(producerDay().day)[0]!

  it('keeps unknown detour null and a known zero as on-route', () => {
    const unknown = { ...base(), detourMin: null }
    const zero = { ...base(), detourMin: 0 }
    const format = { clock: (v: string) => v, minute: (v: number) => String(v) }
    expect(journeyRowMeta(unknown, format).detour).toBe('Detour unknown')
    expect(journeyRowMeta(zero, format).detour).toBe('On the route')
  })

  it('discloses a stored arrival as saved and never invents freshness', () => {
    const row = { ...base(), arriveMin: null, arriveLabel: '13:05', arriveSource: 'stored' as const, freshness: 'unknown' as const }
    const meta = journeyRowMeta(row, { clock: (v: string) => v, minute: (v: number) => String(v) })
    expect(meta.arrival).toBe('Arrive 13:05 (saved)')
    expect(meta.freshness).toBeNull()
    expect(meta.source).toBe('Source: Google')
  })

  it('uses the schedule arrival, not the stored label, when the producer supplies it', () => {
    const fixture = journeyFixture()
    const fuel = fixture.dayPlan.slots.find(slot => slot.filledStop?.id === 'stop-fuel')
    expect(fuel).toBeDefined()
    const scheduleProjection = projectJourney({
      dayPlan: fixture.dayPlan,
      driveRows: fixture.driveRows,
      budgetMin: fixture.budgetMin,
      editable: true,
      presence: fixture.presence,
      contextKey: fixture.contextKey,
      daySchedule: { activeStops: [fixture.stops.fuel], arrivalTimes: ['12:10'] },
    })
    const scheduled = scheduleProjection.rows.find(row => row.stopId === 'stop-fuel')
    expect(scheduled?.arriveSource).toBe('schedule')
    expect(scheduled?.arriveMin).toBe(730)
    const storedProjection = projectJourney({
      dayPlan: fixture.dayPlan,
      driveRows: fixture.driveRows,
      budgetMin: fixture.budgetMin,
      editable: true,
      presence: fixture.presence,
      contextKey: fixture.contextKey,
    })
    const stored = storedProjection.rows.find(row => row.stopId === 'stop-fuel')
    expect(stored?.arriveSource).toBe('stored')
    expect(stored?.arriveMin).toBeNull()
    expect(stored?.arriveLabel).toBe('13:05')
  })

  it('keeps a viewer read-only and binds the covered row to the writer', () => {
    const { trip, day } = producerDay()
    const row = travelJourneyRows(day)[0]!
    expect(row.actions.add).toBe(true)
    const pick = projectedPickFor(row, 0)
    expect(pick).not.toBeNull()
    expect(pick?.slotKey).toBe(row.slotKey)
    expect(pick?.dayId).toBe(trip.days[0]!.id)
    expect(pick?.hit).toBe(row.hit)
    // Canonical hasCoords refuses the documented mixed-axis sentinel.
    expect(projectedPickFor({ ...row, hit: { ...row.hit, latitude: 0 } }, 0)).toBeNull()
    // A foreign day is not guessed.
    expect(projectedPickFor({ ...row, dayIndex: 1 }, 0)).toBeNull()
  })
})

describe('actual TravelPanel render', () => {
  it('renders the shared row, its facts and one Add target', () => {
    const html = renderPanel()
    expect(html).toContain('Along the drive')
    expect(html).toContain('Cafe A')
    expect(html).toContain('Arrival')
    expect(html).toContain('Detour')
    expect(html).toContain('Why:')
    expect(html).toContain('Source: Google')
    expect(html).toContain('aria-label="Add A to Day 1"')
  })

  it('renders no Add target for a viewer', () => {
    const html = renderPanel({ editable: false })
    expect(html).toContain('Along the drive')
    expect(html).toContain('Cafe A')
    expect(html).not.toContain('aria-label="Add A to Day 1"')
  })

  it('announces the status and explains a disabled Add without a writer', () => {
    const html = renderPanel({ onAddProjectedRow: undefined })
    expect(html).toContain('role="status" aria-live="polite"')
    expect(html).toContain('The shared writer is not connected yet.')
    expect(html).toMatch(/aria-describedby="[^"]+"/)
    expect(html).not.toContain('title="This place has no finite position')
  })

  it('refuses the covered Add while the preview is open', () => {
    const html = renderPanel({ previewOpen: true })
    expect(html).toContain('Finish or discard the current preview first.')
  })

  it('distinguishes quota with no retained rows from a route with no matches', () => {
    const { day } = producerDay()
    const empty = renderPanel({
      journeyDay: { ...day, projection: { ...day.projection, rows: [] } },
      journeyStatus: { kind: 'quota' },
    })
    expect(empty).toContain('No places were returned before the pause')
    expect(empty).not.toContain('No places matched along this route')
  })

  it('renders the unscanned and ready-empty states distinctly', () => {
    const { trip, day } = producerDay()
    const journey = buildJourney(trip, trip.days[0])
    const unscanned = renderToStaticMarkup(React.createElement(TravelPanel, {
      trip, day: trip.days[0], editable: true, journey,
      onSetDayStart: () => {}, onAddPlannedHalts: () => {}, suggestionCache,
      journeyDay: day, journeyStatus: { kind: 'unscanned' },
    }))
    expect(unscanned).toContain('Suggestions appear after the Map scans this route')
    const empty = renderToStaticMarkup(React.createElement(TravelPanel, {
      trip, day: trip.days[0], editable: true, journey,
      onSetDayStart: () => {}, onAddPlannedHalts: () => {}, suggestionCache,
      journeyDay: { ...day, projection: { ...day.projection, rows: [] } }, journeyStatus: { kind: 'ready', source: 'scan' },
    }))
    expect(empty).toContain('No places matched along this route')
  })
})

describe('retained failed rows', () => {
  it('keeps the places already found visible with truthful copy', () => {
    const html = renderPanel({ journeyStatus: { kind: 'failed' } })
    expect(html).toContain('Cafe A')
    expect(html).toContain('Showing the places already found')
    expect(html).not.toContain('These suggestions are unavailable, not empty')
  })
})

describe('context and purity', () => {
  it('keeps context stable and calls no fetch on a plan-only rerun', () => {
    const original = globalThis.fetch
    globalThis.fetch = (() => { throw new Error('provider call attempted') }) as typeof fetch
    try {
      const { trip } = producerDay()
      const first = buildJourneyDays({
        trip, snapshot: makeSnapshot(), presence: placeIdentity(trip), editable: true,
        decisions: [], dnaVector: DNA, legCorrections: undefined, manualPicksByDay: new Map(),
      })
      const changed = { ...trip, days: trip.days.map(day => ({ ...day, stops: day.stops.map(s => ({ ...s, visitMinutes: 60 })) })) }
      const second = buildJourneyDays({
        trip: changed, snapshot: makeSnapshot(), presence: placeIdentity(changed), editable: true,
        decisions: [], dnaVector: DNA, legCorrections: undefined, manualPicksByDay: new Map(),
      })
      expect(second.byDay.get(0)?.contextKey).toBe(first.byDay.get(0)?.contextKey)
    } finally {
      globalThis.fetch = original
    }
  })

  it('rejects a late projection from an older context', () => {
    const { day } = producerDay()
    const stale = projectJourney({
      dayPlan: day.dayPlan,
      driveRows: [],
      budgetMin: day.budgetMin,
      editable: true,
      presence: null,
      contextKey: 'stale-context',
    })
    expect(acceptProjection(day.projection, stale, day.contextKey)).toBe(day.projection)
  })
})

describe('S4 wiring pins', () => {
  const panel = read('src/pages/trip/timeline/TravelPanel.tsx')
  const daySection = read('src/pages/trip/timeline/DaySection.tsx')
  const timeline = read('src/pages/trip/TimelineTab.tsx')
  const adapter = read('src/pages/trip/timeline/travelJourneyRows.ts')

  it('uses the shared rows and never a second engine', () => {
    expect(adapter).not.toMatch(/projectJourney\(/)
    expect(adapter).not.toMatch(/daySlots\(/)
    expect(adapter).not.toMatch(/buildDayPlan\(/)
    expect(adapter).not.toMatch(/driveRowsFromSegments\(/)
    expect(panel).toContain("from './travelJourneyRows'")
    expect(panel).not.toMatch(/projectJourney\(/)
    expect(panel).not.toMatch(/daySlots\(/)
    expect(panel).not.toMatch(/buildDayPlan\(/)
    expect(panel).not.toMatch(/driveRowsFromSegments\(/)
  })

  it('uses the shared #841 writer for covered Add, never the halt callback', () => {
    expect(panel).toContain('onAddProjectedRow?.(row, day.index)')
    expect(panel).not.toContain('onAddPlannedHalts(day.index, [halt])')
    expect(panel).toContain('hasCoords(row.hit)')
    expect(timeline).toContain('useTimelineProjectedWriter(')
    expect(timeline).toContain('projectedWriter?: TimelineProjectedWriterHop')
    expect(timeline).toContain('onAddProjectedRow={projectedAdd.add}')
  })

  it('hops the model through TimelineTab and DaySection', () => {
    expect(timeline).toContain('journeyDay={journeyDays.byDay.get(day.index)}')
    expect(timeline).toContain('journeyStatus={journeyDays.status}')
    expect(daySection).toContain('journeyDay, journeyStatus')
    expect(daySection).toContain('journeyDay={journeyDay} journeyStatus={journeyStatus}')
    expect(panel).toContain('journeyDay?: JourneyDay')
    expect(panel).toContain('journeyStatus?: JourneyStatus')
  })
})

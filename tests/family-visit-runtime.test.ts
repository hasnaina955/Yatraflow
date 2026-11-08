// ============ Confirmed family visit duration at the runtime seam ============
// The facts table is the source of truth. This file prepares assertions for the
// helper and the shared writer's saved stop; private UI call sites are pinned,
// not executed. No provider, no network, no DOM.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { seedData } from '../src/data/seed'
import type { ItineraryDay, Trip } from '../src/data/types'
import type { PlaceHit } from '../src/lib/providers/hits'
import { placeHoursFromPeriods, type RawHoursPeriod } from '../src/lib/providers/hours'
import { confirmedVisitMinutes, hoursDisplayFor, intendedVisitMinutes } from '../src/lib/hoursContext'
import {
  isWriterReceipt,
  stageWriterPicks,
  type WriterApplyChange,
  type WriterCompletion,
  type WriterReceipt,
} from '../src/pages/trip/map/mapWriterActions'
import { createWriterOperationGate } from '../src/pages/trip/map/writerOperationGate'

const TRIP_ID = 'trip-09-duration'
const DAY_ID = 'day-09-duration'

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

function period(day: number, open: string, close: string): RawHoursPeriod {
  const [oh, om] = open.split(':').map(Number)
  const [ch, cm] = close.split(':').map(Number)
  return { open: { day, hour: oh, minute: om }, close: { day, hour: ch, minute: cm } }
}

const daily = (open: string, close: string) =>
  placeHoursFromPeriods([0, 1, 2, 3, 4, 5, 6].map(day => period(day, open, close)), undefined, '2026-11-01')

function hit(over: Partial<PlaceHit>): PlaceHit {
  return { id: 'place-09', name: 'Place', latitude: 10.1, longitude: 76.2, kind: 'poi', category: 'nature', ...over }
}

describe('confirmed subtype duration comes from the existing facts table', () => {
  it('water 45, faith temple 40 and culture park 180', () => {
    expect(confirmedVisitMinutes(hit({ family: 'water', subtype: 'waterfall' }))).toBe(45)
    expect(intendedVisitMinutes(hit({ family: 'water', subtype: 'waterfall' }))).toBe(45)
    expect(intendedVisitMinutes(hit({ category: 'temple', family: 'faith', subtype: 'temple' }))).toBe(40)
    expect(intendedVisitMinutes(hit({ category: 'sightseeing', family: 'culture', subtype: 'park' }))).toBe(180)
  })

  it('heritage, unknown subtype and non-family kinds keep the category fallback', () => {
    // Heritage visit + rain rows are incomplete in the source: no invention.
    expect(confirmedVisitMinutes(hit({ category: 'museum', family: 'heritage', subtype: 'monument' }))).toBeUndefined()
    expect(intendedVisitMinutes(hit({ category: 'museum', family: 'heritage', subtype: 'monument' }))).toBe(90)
    expect(intendedVisitMinutes(hit({ category: 'nature' }))).toBe(90)
    expect(intendedVisitMinutes(hit({ category: 'food' }))).toBe(45)
    expect(intendedVisitMinutes(hit({ category: 'sightseeing' }))).toBe(60)
    // A family with no subtype fact (water rain is absent) stays generic.
    expect(intendedVisitMinutes(hit({ category: 'nature', family: 'water' }))).toBe(90)
  })

  it('an explicit visit override still wins over the confirmed duration', () => {
    const waterfall = hit({ family: 'water', subtype: 'waterfall', hours: daily('09:00', '17:00') })
    // Arrives 16:30: 20 minutes fits; the confirmed 45 does not.
    expect(hoursDisplayFor(waterfall, { date: '2026-11-05', arrivalMin: 990, visitMin: 20 }).verdict).toBe('open')
    expect(hoursDisplayFor(waterfall, { date: '2026-11-05', arrivalMin: 990 }).verdict).toBe('closed')
  })
})

describe('the actual writer keeps the same confirmed duration', () => {
  it('stageWriterPicks saves 180 for a culture park even when the old pacing injects 45', async () => {
    const base = structuredClone(seedData.trips[0])
    const day: ItineraryDay = { id: DAY_ID, index: 0, title: 'Day 1', stops: [] }
    let current: Trip = { ...structuredClone(base), id: TRIP_ID, days: [day] }
    const proposals: Array<{ proposed: Trip; onKept: (receipt?: WriterReceipt) => void }> = []
    const applyChange: WriterApplyChange = (mutator, _kind, _dayIndex, onKept) => {
      if (!onKept) throw new Error('writer staged without a kept callback')
      const proposed = structuredClone(current)
      mutator(proposed)
      proposals.push({ proposed, onKept })
    }
    const gate = createWriterOperationGate()
    const completions: WriterCompletion[] = []

    const result = await stageWriterPicks({
      trip: current,
      applyChange,
      resolvePick: async pick => pick,
      mintStopId: () => 'stop-duration-1',
      gate,
      routeKmOf: () => 5,
      road: { routeKey: 'route-duration' },
      currentTrip: () => current,
      onCompletion: completion => { completions.push(completion) },
      poiVisitMinutes: () => 45,
    }, {
      context: { tripId: TRIP_ID, dayId: DAY_ID, dayIndex: 0 },
      intent: 'single',
      picks: [{ hit: hit({ name: 'Wonderla Park', category: 'sightseeing', family: 'culture', subtype: 'park' }), slotKey: null }],
    })

    expect(result.status).toBe('staged')
    if (result.status !== 'staged') throw new Error('writer did not stage')
    const staged = proposals[0]
    if (!staged) throw new Error('writer staged no proposal')
    const receipt: WriterReceipt = { kind: 'acknowledged', revision: 'rev-1', writeVersion: 1 }
    expect(isWriterReceipt(receipt)).toBe(true)
    current = staged.proposed
    staged.onKept(receipt)

    expect(completions).toHaveLength(1)
    const completion = completions[0]
    if (!completion) throw new Error('writer produced no completion')
    expect(completion.acknowledged).toBe(true)
    expect(completion.phase).toBe('applied')
    const placed = completion.placed[0]
    if (!placed) throw new Error('writer verified no placed stop')
    expect(placed.stop.visitMinutes).toBe(180)

    const saved = current.days[0].stops.find(stop => stop.title === 'Wonderla Park')
    expect(saved?.visitMinutes).toBe(180)
    expect(placed.stopId).toBe(saved?.id)
    expect(gate.operation(result.operationId)?.phase).toBe('applied')
    // The fit reads the same value: no advertised 45 / saved 180 split.
    expect(saved?.visitMinutes).toBe(intendedVisitMinutes(hit({
      category: 'sightseeing', family: 'culture', subtype: 'park',
    })))
  })
})

// The private UI handlers have no exported runtime seam in the node suite.
// These pins stop the confirmed-first expression from reverting; the shared
// saved-stop writer case is prepared separately and has not run.
describe('changed callers keep the confirmed-first fallback', () => {
  it('pins TravelPanel, DaySection and both draft builders', () => {
    expect(confirmedVisitMinutes(hit({ category: 'museum' }))).toBeUndefined()
    expect(read('../src/pages/trip/timeline/TravelPanel.tsx'))
      .toContain('visitMinutes: intendedVisitMinutes(h)')
    expect(read('../src/pages/trip/timeline/DaySection.tsx'))
      .toContain("visitMinutes: confirmedVisitMinutes(h) ?? (h.category === 'food' ? 45 : h.category === 'hotel' ? 0 : 60)")
    expect(read('../src/pages/trip/map/useMapWriters.ts'))
      .toContain('visitMinutes: confirmedVisitMinutes(c.hit) ?? poiVisitMinutes(c.hit.category)')
    expect(read('../src/pages/trip/map/useShortlist.ts'))
      .toContain('visitMinutes: confirmedVisitMinutes(h) ?? poiVisitMinutes(h.category)')
    expect(read('../src/pages/trip/map/mapWriterActions.ts'))
      .toContain('visitMinutes: confirmedVisitMinutes(pinned) ?? input.poiVisitMinutes(pinned.category)')
  })
})

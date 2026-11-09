// Package C, item 3 (#905-#907): the pure pieces under the edit wiring.
import { describe, expect, it } from 'vitest'
import type { Trip } from '../src/data/types'
import type { PlaceHit } from '../src/lib/geocode'
import { pickStopFor, roadInsertIndex, addMutator, UNDO_WINDOW_MS, undoSecondsLeft, settleFromOperation } from '../src/pages/trip/map/pickPreview'
import { previewRoadOf } from '../src/pages/trip/map/previewRoad'

const hit = { id: 'p1', name: 'Hot springs', latitude: 32.2, longitude: 77.1, category: 'sightseeing', source: 'osm' } as unknown as PlaceHit
const stop = (id: string, over: Record<string, unknown> = {}) => ({
  id, title: id, category: 'sightseeing', locationName: id, lat: 32, lng: 77, visitMinutes: 30,
  entryFeeInrPerPerson: 0, transportCostInrTotal: 0, priority: 'nice-to-have', status: 'confirmed', ...over,
})

describe('pickStopFor', () => {
  it('copies only what the hit knows and leaves the rest unset', () => {
    const s = pickStopFor(hit, 'new-1')
    expect(s).toMatchObject({ id: 'new-1', title: 'Hot springs', lat: 32.2, lng: 77.1, status: 'suggested' })
    expect(s.openTime).toBeUndefined()
  })
})

describe('roadInsertIndex', () => {
  const kmOf = (s: { id: string }) => ({ a: 10, b: 50, c: 90 } as Record<string, number>)[s.id] ?? null
  const day = (...ids: string[]) => ids.map(id => stop(id) as never)
  it('lands by road order', () => {
    expect(roadInsertIndex(day('a', 'b', 'c'), 60, kmOf)).toBe(2)
    expect(roadInsertIndex(day('a', 'b', 'c'), 5, kmOf)).toBe(0)
    expect(roadInsertIndex(day('a', 'b', 'c'), 95, kmOf)).toBe(3)
  })
  it('puts the first stop of an empty day at 0', () => {
    expect(roadInsertIndex([], 60, kmOf)).toBe(0)
  })
  it('is unknown when the pick or a stop has no road position', () => {
    expect(roadInsertIndex(day('a', 'b'), null, kmOf)).toBeNull()
    expect(roadInsertIndex(day('a', 'zz'), 60, kmOf)).toBeNull()
  })
})

describe('addMutator', () => {
  it('inserts into the newest day and never replaces the day', () => {
    const trip = { days: [{ index: 0, stops: [stop('a'), stop('b')] }] } as unknown as Trip
    addMutator(0, 1, stop('n') as never)(trip)
    expect(trip.days[0].stops.map(s => s.id)).toEqual(['a', 'n', 'b'])
  })
  it('does nothing when the day is gone', () => {
    const trip = { days: [] } as unknown as Trip
    expect(() => addMutator(3, 0, stop('n') as never)(trip)).not.toThrow()
  })
})

describe('undo window', () => {
  it('lasts 8 seconds and counts down to zero', () => {
    expect(UNDO_WINDOW_MS).toBe(8000)
    expect(undoSecondsLeft(1000, 1000)).toBe(8)
    expect(undoSecondsLeft(1000, 4500)).toBe(5)
    expect(undoSecondsLeft(1000, 20000)).toBe(0)
  })
})

describe('settleFromOperation', () => {
  it('maps each writer answer to its own outcome', () => {
    expect(settleFromOperation('discard')).toEqual({ kind: 'failed', reason: 'none' })
    expect(settleFromOperation('store-discarded')).toEqual({ kind: 'conflict', reason: 'superseded' })
    expect(settleFromOperation('uncertain')).toEqual({ kind: 'failed', reason: 'unavailable', uncertain: true })
  })
})

describe('previewRoadOf', () => {
  it('names the new road from the stop before to the stop after', () => {
    const trip = { days: [{ index: 0, stops: [stop('a', { lat: 1, lng: 1 }), stop('n', { lat: 2, lng: 2 }), stop('b', { lat: 3, lng: 3 })] }] } as unknown as Trip
    const road = previewRoadOf({ dayIndex: 0, stopId: 'n', proposedTrip: trip, road: { legIn: { measured: true }, legOut: { measured: false }, replaced: null } } as never)
    expect(road?.path).toEqual([{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }, { lat: 3, lng: 3 }])
    expect(road?.legInMeasured).toBe(true)
    expect(road?.legOutMeasured).toBe(false)
  })
  it('is null when the new stop is not on the day', () => {
    const trip = { days: [{ index: 0, stops: [stop('a')] }] } as unknown as Trip
    expect(previewRoadOf({ dayIndex: 0, stopId: 'n', proposedTrip: trip, road: {} } as never)).toBeNull()
  })
})

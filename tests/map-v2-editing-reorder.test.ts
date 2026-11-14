// ============ Map v2 package G, item 3: reorder (#907) ============
// A keyboard reorder and a pointer drag call one function, so they cannot
// produce different proposals. Road-snapped pointer drag is the TripMap handoff.
import { describe, expect, it } from 'vitest'
import { seedData } from '../src/data/seed'
import type { Trip } from '../src/data/types'
import { moveActiveStopWithinDay } from '../src/lib/stopOrder'
import { proposeEdit } from '../src/pages/trip/map/editing/stopEdit'
import {
  announceReorder,
  keyToReorderStep,
  proposeReorder,
  reorderFromKey,
  reorderRequest,
} from '../src/pages/trip/map/editing/reorder'

function freshTrip(): Trip {
  return structuredClone(seedData.trips[0]) as Trip
}
function richDay(trip: Trip) {
  const day = trip.days.find(d => d.stops.filter(s => s.status !== 'rejected').length >= 3)
  if (!day) throw new Error('seed has no day with three stops')
  return day
}

describe('keyboard reorder equals pointer reorder', () => {
  it('Alt+Down gives the same proposal as dropping one place later', () => {
    const trip = freshTrip()
    const day = richDay(trip)
    const id = day.stops[0].id
    const key = reorderFromKey({ trip, dayIndex: day.index, stopId: id, key: 'ArrowDown', altKey: true })
    const pointer = proposeReorder({ trip, dayIndex: day.index, stopId: id, toIndex: 1 })
    expect(key).toEqual(pointer)
    expect(key.kind).toBe('proposal')
    if (key.kind !== 'proposal') return
    expect(key.orderedIds.slice(0, 2)).toEqual([day.stops[1].id, day.stops[0].id])
  })
  it('Alt+Up moves a stop one place earlier', () => {
    const trip = freshTrip()
    const day = richDay(trip)
    const id = day.stops[2].id
    const key = reorderFromKey({ trip, dayIndex: day.index, stopId: id, key: 'ArrowUp', altKey: true })
    expect(key).toEqual(proposeReorder({ trip, dayIndex: day.index, stopId: id, toIndex: 1 }))
  })
  it('an arrow key without Alt is not a reorder', () => {
    expect(keyToReorderStep('ArrowDown', false)).toBeNull()
    expect(keyToReorderStep('ArrowUp', true)).toBe(-1)
    expect(keyToReorderStep('ArrowDown', true)).toBe(1)
    expect(keyToReorderStep('Enter', true)).toBeNull()
    const trip = freshTrip()
    const day = richDay(trip)
    expect(reorderFromKey({ trip, dayIndex: day.index, stopId: day.stops[0].id, key: 'ArrowDown', altKey: false }))
      .toEqual({ kind: 'refused', reason: 'not-a-reorder-key' })
  })
})

describe('refusals stay distinct', () => {
  it('refuses at the ends, out of range, missing and fixed', () => {
    const trip = freshTrip()
    const day = richDay(trip)
    const first = day.stops[0].id
    expect(reorderFromKey({ trip, dayIndex: day.index, stopId: first, key: 'ArrowUp', altKey: true }))
      .toEqual({ kind: 'refused', reason: 'no-move' })
    expect(proposeReorder({ trip, dayIndex: day.index, stopId: first, toIndex: 99 })).toEqual({ kind: 'refused', reason: 'out-of-range' })
    expect(proposeReorder({ trip, dayIndex: day.index, stopId: first, toIndex: 0.5 })).toEqual({ kind: 'refused', reason: 'out-of-range' })
    expect(proposeReorder({ trip, dayIndex: day.index, stopId: 'nope', toIndex: 1 })).toEqual({ kind: 'refused', reason: 'stop-missing' })
    expect(proposeReorder({ trip, dayIndex: 999, stopId: first, toIndex: 1 })).toEqual({ kind: 'refused', reason: 'day-missing' })
    const fixed = structuredClone(trip)
    fixed.fixedCommitments = [{ id: 'fc', title: 'Boat', type: 'other' as never, dayIndex: day.index, time: '15:00', stopId: day.stops[1].id }]
    expect(proposeReorder({ trip: fixed, dayIndex: day.index, stopId: day.stops[1].id, toIndex: 2 })).toEqual({ kind: 'refused', reason: 'fixed' })
    expect(reorderFromKey({ trip: fixed, dayIndex: day.index, stopId: day.stops[1].id, key: 'ArrowDown', altKey: true }))
      .toEqual({ kind: 'refused', reason: 'fixed' })
  })
})

describe('the request writes what Timeline writes', () => {
  it('matches moveActiveStopWithinDay and reports clocks by stop id', () => {
    const trip = freshTrip()
    const day = richDay(trip)
    const proposal = proposeReorder({ trip, dayIndex: day.index, stopId: day.stops[0].id, toIndex: 1 })
    if (proposal.kind !== 'proposal') throw new Error('expected proposal')
    const expected = structuredClone(trip)
    moveActiveStopWithinDay(expected.days.find(d => d.index === day.index)!, 0, 1)
    const edit = proposeEdit({ trip, request: reorderRequest(proposal) })
    expect(edit.request.kind).toBe('reorder')
    expect(edit.proposedTrip.days.find(d => d.index === day.index)!.stops.map(s => s.id))
      .toEqual(expected.days.find(d => d.index === day.index)!.stops.map(s => s.id))
    expect(edit.clocks.map(c => c.stopId)).toEqual(expect.arrayContaining([day.stops[0].id, day.stops[1].id]))
  })
  it('keeps a rejected stop in its slot', () => {
    const trip = freshTrip()
    const day = richDay(trip)
    day.stops[1].status = 'rejected'
    const active = day.stops.filter(s => s.status !== 'rejected')
    const proposal = proposeReorder({ trip, dayIndex: day.index, stopId: active[0].id, toIndex: 1 })
    if (proposal.kind !== 'proposal') throw new Error('expected proposal')
    const next = proposeEdit({ trip, request: reorderRequest(proposal) }).proposedTrip.days.find(d => d.index === day.index)!
    expect(next.stops[1].status).toBe('rejected')
  })
})

describe('screen reader announcement', () => {
  it('names the stop, its new place and the largest clock change', () => {
    const trip = freshTrip()
    const day = richDay(trip)
    const proposal = proposeReorder({ trip, dayIndex: day.index, stopId: day.stops[0].id, toIndex: 1 })
    if (proposal.kind !== 'proposal') throw new Error('expected proposal')
    const edit = proposeEdit({ trip, request: reorderRequest(proposal) })
    const text = announceReorder(proposal, edit)
    expect(text).toContain(day.stops[0].title)
    expect(text).toMatch(/stop 2 of \d+/)
  })
  it('says why a reorder was refused, in words that differ per reason', () => {
    const lines = (['no-move', 'fixed', 'out-of-range', 'stop-missing', 'day-missing', 'not-a-reorder-key'] as const)
      .map(reason => announceReorder({ kind: 'refused', reason }, null))
    expect(new Set(lines).size).toBe(lines.length)
  })
})

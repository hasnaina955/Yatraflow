// ============ Map v2 package G, item 2: edit a stop (#906) ============
// Visit steps, move to a day, swap and remove all go through one proposal.
// The proposal reuses Timeline's own helpers, so Map and Timeline agree.
import { describe, expect, it } from 'vitest'
import { seedData } from '../src/data/seed'
import type { ItineraryStop, Trip } from '../src/data/types'
import {
  fixedGuardFor,
  moveToDayRequest,
  proposeEdit,
  removeRequest,
  setVisitRequest,
  stepVisit,
  swapWithPickRequest,
  swapWithStopRequest,
  VISIT_STEP_MIN,
} from '../src/pages/trip/map/editing/stopEdit'

function freshTrip(): Trip {
  return structuredClone(seedData.trips[0]) as Trip
}

/** A day with at least three stops, so a fixed stop can sit in the middle. */
function richDay(trip: Trip) {
  const day = trip.days.find(d => d.stops.filter(s => s.status !== 'rejected').length >= 3)
  if (!day) throw new Error('seed has no day with three stops')
  return day
}

function withFixedStop(trip: Trip, dayIndex: number, stopId: string): Trip {
  const next = structuredClone(trip)
  next.fixedCommitments = [
    { id: 'fc_boat', title: 'Boat', type: 'other' as never, dayIndex, time: '23:30', stopId },
  ]
  return next
}

function pickStop(overrides: Partial<ItineraryStop> = {}): ItineraryStop {
  return {
    id: 'st_swap_pick', title: 'Swap pick', category: 'food', locationName: 'Nearby',
    lat: 10.0, lng: 77.0, visitMinutes: 45, entryFeeInrPerPerson: 0, transportCostInrTotal: 0,
    priority: 'nice-to-have', status: 'suggested', orderInDay: 1, ...overrides,
  }
}

describe('stepVisit: 15-minute steps', () => {
  it('steps by 15 from a stepped value', () => {
    expect(VISIT_STEP_MIN).toBe(15)
    expect(stepVisit(30, 1)).toBe(45)
    expect(stepVisit(45, -1)).toBe(30)
  })
  it('snaps an off-step value to the next step in the direction pressed', () => {
    expect(stepVisit(40, 1)).toBe(45)
    expect(stepVisit(40, -1)).toBe(30)
  })
  it('holds at the lowest and highest step', () => {
    expect(stepVisit(15, -1)).toBe(15)
    expect(stepVisit(720, 1)).toBe(720)
    expect(stepVisit(0, -1)).toBe(0)
  })
  it('stays unknown when the visit length is not a number', () => {
    expect(stepVisit(undefined, 1)).toBeNull()
    expect(stepVisit(Number.NaN, -1)).toBeNull()
    expect(stepVisit(null, 1)).toBeNull()
  })
})

describe('proposeEdit: visit length', () => {
  it('adds 15 minutes to the day and moves every later clock by 15', () => {
    const trip = freshTrip()
    const day = richDay(trip)
    const target = day.stops[0]
    const request = setVisitRequest(trip, target.id, target.visitMinutes + 15)
    expect(request.kind).toBe('ok')
    if (request.kind !== 'ok') return
    const proposal = proposeEdit({ trip, request: request.request })
    expect(proposal.impact.timeDeltaMin).toBe(15)
    expect(proposal.clocks.length).toBeGreaterThan(0)
    expect(proposal.clocks.every(c => c.deltaMin === 15)).toBe(true)
    expect(trip.days.find(d => d.index === day.index)!.stops[0].visitMinutes).toBe(target.visitMinutes)
  })
  it('refuses a missing stop and a negative or unknown length', () => {
    const trip = freshTrip()
    const id = richDay(trip).stops[0].id
    expect(setVisitRequest(trip, 'nope', 30)).toEqual({ kind: 'refused', reason: 'stop-missing' })
    expect(setVisitRequest(trip, id, -5)).toEqual({ kind: 'refused', reason: 'visit-invalid' })
    expect(setVisitRequest(trip, id, Number.NaN)).toEqual({ kind: 'refused', reason: 'visit-invalid' })
  })
})

describe('proposeEdit: move, swap and remove', () => {
  it('moves a stop to another day, in road order, and closes the gap', () => {
    const trip = freshTrip()
    const from = richDay(trip)
    const to = trip.days.find(d => d.index !== from.index)
    if (!to) return
    const moving = from.stops[1]
    const request = moveToDayRequest(trip, moving.id, to.index)
    if (request.kind !== 'ok') throw new Error('expected ok')
    expect(request.request.kind).toBe('move-day')
    const proposal = proposeEdit({ trip, request: request.request })
    const source = proposal.proposedTrip.days.find(d => d.index === from.index)!
    const target = proposal.proposedTrip.days.find(d => d.index === to.index)!
    expect(source.stops.some(s => s.id === moving.id)).toBe(false)
    expect(target.stops.some(s => s.id === moving.id)).toBe(true)
    expect(source.stops.map(s => s.orderInDay)).toEqual(source.stops.map((_, i) => i + 1))
    expect(target.stops.map(s => s.orderInDay)).toEqual(target.stops.map((_, i) => i + 1))
    expect(proposal.dayIndexes.sort()).toEqual([from.index, to.index].sort())
  })
  it('refuses a move to the same day, a missing day or a missing stop', () => {
    const trip = freshTrip()
    const day = richDay(trip)
    const id = day.stops[0].id
    expect(moveToDayRequest(trip, id, day.index)).toEqual({ kind: 'refused', reason: 'same-day' })
    expect(moveToDayRequest(trip, id, 999)).toEqual({ kind: 'refused', reason: 'day-missing' })
    expect(moveToDayRequest(trip, 'nope', 0)).toEqual({ kind: 'refused', reason: 'stop-missing' })
  })
  it('swaps a stop with a pick in place and keeps its order', () => {
    const trip = freshTrip()
    const day = richDay(trip)
    const old = day.stops[1]
    const request = swapWithPickRequest(trip, old.id, pickStop())
    if (request.kind !== 'ok') throw new Error('expected ok')
    const proposal = proposeEdit({ trip, request: request.request })
    const next = proposal.proposedTrip.days.find(d => d.index === day.index)!
    expect(next.stops).toHaveLength(day.stops.length)
    expect(next.stops[1].id).toBe('st_swap_pick')
    expect(next.stops[1].orderInDay).toBe(old.orderInDay)
    expect(next.stops.some(s => s.id === old.id)).toBe(false)
  })
  it('swaps two stops of one day and refuses across days', () => {
    const trip = freshTrip()
    const day = richDay(trip)
    const [a, b] = [day.stops[0], day.stops[2]]
    const request = swapWithStopRequest(trip, a.id, b.id)
    if (request.kind !== 'ok') throw new Error('expected ok')
    const next = proposeEdit({ trip, request: request.request }).proposedTrip.days.find(d => d.index === day.index)!
    expect(next.stops[0].id).toBe(b.id)
    expect(next.stops[2].id).toBe(a.id)
    expect(next.stops.map(s => s.orderInDay)).toEqual(next.stops.map((_, i) => i + 1))
    const other = trip.days.find(d => d.index !== day.index && d.stops.length)
    if (other) expect(swapWithStopRequest(trip, a.id, other.stops[0].id)).toEqual({ kind: 'refused', reason: 'different-days' })
  })
  it('removes a stop and renumbers the day', () => {
    const trip = freshTrip()
    const day = richDay(trip)
    const request = removeRequest(trip, day.stops[1].id)
    if (request.kind !== 'ok') throw new Error('expected ok')
    const next = proposeEdit({ trip, request: request.request }).proposedTrip.days.find(d => d.index === day.index)!
    expect(next.stops).toHaveLength(day.stops.length - 1)
    expect(next.stops.map(s => s.orderInDay)).toEqual(next.stops.map((_, i) => i + 1))
  })
})

describe('fixed-time confirmation', () => {
  it('asks first when an earlier edit would move a fixed stop', () => {
    const base = freshTrip()
    const day = richDay(base)
    const trip = withFixedStop(base, day.index, day.stops[1].id)
    const request = setVisitRequest(trip, day.stops[0].id, day.stops[0].visitMinutes + 15)
    if (request.kind !== 'ok') throw new Error('expected ok')
    const proposal = proposeEdit({ trip, request: request.request })
    expect(proposal.fixed.needsConfirm).toBe(true)
    expect(proposal.fixed.touched[0]).toMatchObject({ stopId: day.stops[1].id, commitTitle: 'Boat', change: 'moves' })
    expect(proposal.fixed.touched[0].from).not.toBe(proposal.fixed.touched[0].to)
  })
  it('does not ask when the edit comes after the fixed stop', () => {
    const base = freshTrip()
    const day = richDay(base)
    const trip = withFixedStop(base, day.index, day.stops[1].id)
    const request = setVisitRequest(trip, day.stops[2].id, day.stops[2].visitMinutes + 15)
    if (request.kind !== 'ok') throw new Error('expected ok')
    expect(proposeEdit({ trip, request: request.request }).fixed.needsConfirm).toBe(false)
  })
  it('asks first when removing the fixed stop would unlink its commitment', () => {
    const base = freshTrip()
    const day = richDay(base)
    const trip = withFixedStop(base, day.index, day.stops[1].id)
    const request = removeRequest(trip, day.stops[1].id)
    if (request.kind !== 'ok') throw new Error('expected ok')
    const guard = proposeEdit({ trip, request: request.request }).fixed
    expect(guard.needsConfirm).toBe(true)
    expect(guard.touched[0].change).toBe('unlinked')
  })
  it('lists every fixed stop id and reports none on a plan without commitments', () => {
    const base = freshTrip()
    const day = richDay(base)
    const trip = withFixedStop(base, day.index, day.stops[1].id)
    expect(fixedGuardFor(trip, trip, [day.index]).fixedStopIds).toEqual([day.stops[1].id])
    const none = structuredClone(base)
    none.fixedCommitments = []
    expect(fixedGuardFor(none, none, [day.index])).toEqual({ fixedStopIds: [], touched: [], needsConfirm: false })
  })
})

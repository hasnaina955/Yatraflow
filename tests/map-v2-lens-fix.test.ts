// ============ Fix lens (map v2) ============
// One pure module makes candidate fixes for one engine warning, runs each fix
// through the real engine, and offers only fixes that clear the warning.
// The fixture is a real trip with a real opening-hours warning: the boat closes
// 15 min after the visit would end, so a reorder can clear it.
import { describe, it, expect } from 'vitest'
import {
  applyFixChangeSet, fixCandidates, fixesForWarning, fixSummary, verifyFixSet, warningRefs,
} from '../src/pages/trip/map/fixLens'
import { isPlaceFree } from '../src/lib/mapLensContracts'
import type { FixChangeSet, FixChange } from '../src/lib/mapLensContracts'
import { collectWarnings } from '../src/lib/engine'
import type { ItineraryDay, ItineraryStop, Trip } from '../src/data/types'

// Every point shares one coordinate, so each leg is the engine's 10 min city pad.
const AT = { lat: 9.6, lng: 77.15 }

function stop(over: Partial<ItineraryStop> = {}): ItineraryStop {
  return {
    id: 's1', title: 'Stop', category: 'sightseeing', locationName: 'Thekkady',
    lat: AT.lat, lng: AT.lng, description: '', notes: '', visitMinutes: 60,
    openTime: '', closeTime: '', entryFeeInrPerPerson: 0, transportCostInrTotal: 0,
    priority: 'nice-to-have', sourceUrl: '', status: 'confirmed', orderInDay: 1,
    ...over,
  } as ItineraryStop
}

function day(index: number, stops: ItineraryStop[], startTime?: string): ItineraryDay {
  return { id: `d${index}`, index, stops, ...(startTime ? { startTime } : {}) } as ItineraryDay
}

function tripOf(days: ItineraryDay[], over: Partial<Trip> = {}): Trip {
  return {
    id: 't1', name: 'Fix trip', startLocation: 'Thekkady',
    startLocationCoords: { lat: AT.lat, lng: AT.lng },
    destinations: ['Thekkady'], destinationCoords: [{ lat: AT.lat, lng: AT.lng }],
    startDate: '2026-09-01', endDate: '2026-09-01', travellers: 2,
    transportMode: 'car', roundTrip: false, budgetPerPersonInr: 20000,
    travelStyle: 'balanced', fixedCommitments: [], days,
    expenses: [], coverEmoji: 'car', visibility: 'private', createdAt: 0, updatedAt: 0,
    ...over,
  } as Trip
}

// The day starts at 09:00. Arrival at the boat is 10:45 and the visit needs
// 60 min. Close 11:30 is 15 min too soon, so `hours` fires. Cutting 15 min
// from the farm makes the visit end at 11:30 and clears it.
const farm = () => stop({ id: 'prev', title: 'Spice farm walk', visitMinutes: 90, orderInDay: 1 })
const boat = (closeTime = '11:30') => stop({
  id: 'boat', title: 'Periyar boat', visitMinutes: 60, openTime: '09:00',
  closeTime, orderInDay: 2,
})

function baseTrip(): Trip {
  return tripOf([day(0, [farm(), boat()], '09:00')])
}

/** The one target warning of the fixture: the boat, on day 0. */
const target = { code: 'hours', stopId: 'boat' } as const

function setOf(changes: FixChange[], verification: FixChangeSet['verification'] = { kind: 'unverified' }): FixChangeSet {
  return { id: 'manual', dayIndex: 0, target, changes, verification }
}

function mustApply(trip: Trip, set: FixChangeSet): Trip {
  const next = applyFixChangeSet(trip, set)
  if (!next) throw new Error('the change set must apply')
  return next
}

const ids = (trip: Trip) => trip.days[0].stops.map(entry => entry.id)

describe('fixture truth', () => {
  it('raises exactly one real opening-hours warning', () => {
    expect(collectWarnings(baseTrip()).map(warning => warning.code)).toEqual(['hours'])
  })

  it('names the boat without a severe flag', () => {
    expect(warningRefs(baseTrip(), 0)).toEqual([{ code: 'hours', stopId: 'boat', severe: false }])
  })
})

describe('applyFixChangeSet', () => {
  it('returns a new trip and never mutates the input', () => {
    const trip = baseTrip()
    const before = JSON.parse(JSON.stringify(trip))
    const next = mustApply(trip, setOf([{ kind: 'move', stopId: 'boat', toIndex: 0 }]))
    expect(JSON.parse(JSON.stringify(trip))).toEqual(before)
    expect(next).not.toBe(trip)
    expect(next.days[0]).not.toBe(trip.days[0])
    expect(next.days[0].stops[0]).not.toBe(trip.days[0].stops[0])
    expect(ids(trip)).toEqual(['prev', 'boat'])
    // The engine schedules by orderInDay, so a move must rewrite it.
    expect(next.days[0].stops.map(stop => stop.orderInDay)).toEqual([1, 2])
  })

  it('applies a move, a swap, a remove, a set-visit and a shift-start', () => {
    const trip = baseTrip()
    expect(ids(mustApply(trip, setOf([{ kind: 'move', stopId: 'boat', toIndex: 0 }])))).toEqual(['boat', 'prev'])
    expect(ids(mustApply(trip, setOf([{ kind: 'swap', stopId: 'prev', withStopId: 'boat' }])))).toEqual(['boat', 'prev'])
    expect(ids(mustApply(trip, setOf([{ kind: 'remove', stopId: 'boat' }])))).toEqual(['prev'])
    const visited = mustApply(trip, setOf([{ kind: 'set-visit', stopId: 'prev', visitMin: 30 }]))
    expect(visited.days[0].stops[0].visitMinutes).toBe(30)
    const shifted = mustApply(trip, setOf([{ kind: 'shift-start', startMin: 8 * 60 }]))
    expect(shifted.days[0].startTime).toBe('08:00')
  })

  it('returns null for a missing stop, a bad index, a missing day and a missing field', () => {
    const trip = baseTrip()
    expect(applyFixChangeSet(trip, setOf([{ kind: 'move', stopId: 'ghost', toIndex: 0 }]))).toBeNull()
    expect(applyFixChangeSet(trip, setOf([{ kind: 'move', stopId: 'boat', toIndex: 9 }]))).toBeNull()
    expect(applyFixChangeSet(trip, { ...setOf([{ kind: 'remove', stopId: 'boat' }]), dayIndex: 7 })).toBeNull()
    // A stop with no visitMinutes field has no visit length to set.
    const noField = tripOf([day(0, [{ ...farm(), visitMinutes: undefined } as unknown as ItineraryStop], '09:00')])
    expect(applyFixChangeSet(noField, setOf([{ kind: 'set-visit', stopId: 'prev', visitMin: 30 }]))).toBeNull()
  })

  it('turns a missing stop into a failed verification, and never throws', () => {
    const result = verifyFixSet(baseTrip(), setOf([{ kind: 'move', stopId: 'ghost', toIndex: 0 }]))
    expect(result.verification.kind).toBe('failed')
    if (result.verification.kind !== 'failed') throw new Error('expected failed')
    expect(result.verification.reason.length).toBeGreaterThan(0)
  })
})

describe('offered fixes', () => {
  it('offers a fix that clears the warning', () => {
    const trip = baseTrip()
    const set = setOf([{ kind: 'move', stopId: 'boat', toIndex: 0 }])
    const check = verifyFixSet(trip, set).verification
    expect(check.kind).toBe('verified')
    if (check.kind !== 'verified') throw new Error('expected verified')
    expect(check.clearsTarget).toBe(true)
    expect(check.introduced).toEqual([])
    expect(fixesForWarning(trip, 0, target).map(entry => entry.id)).toContain('hours:boat:move-earlier-0')
  })

  it('does not offer a fix that leaves the warning in place', () => {
    // Close 30 min earlier: a 30 min earlier start still arrives too late.
    const trip = tripOf([day(0, [farm(), boat('11:00')], '09:00')])
    const shifted30 = setOf([{ kind: 'shift-start', startMin: 8 * 60 + 30 }])
    const check = verifyFixSet(trip, shifted30).verification
    expect(check.kind).toBe('verified')
    if (check.kind !== 'verified') throw new Error('expected verified')
    expect(check.clearsTarget).toBe(false)
    expect(fixesForWarning(trip, 0, target).map(entry => entry.id)).not.toContain('hours:boat:shift-start-30')
  })

  it('does not offer a fix that adds a severe warning', () => {
    // The train at 09:40 links to the farm. A later farm visit breaks it.
    const trip = tripOf([day(0, [farm(), boat()], '09:00')], {
      fixedCommitments: [{ id: 'fc1', title: 'Train', type: 'other', dayIndex: 0, time: '09:40', stopId: 'prev' }],
    })
    const check = verifyFixSet(trip, setOf([{ kind: 'move', stopId: 'boat', toIndex: 0 }])).verification
    expect(check.kind).toBe('verified')
    if (check.kind !== 'verified') throw new Error('expected verified')
    expect(check.clearsTarget).toBe(true)
    expect(check.introduced.some(warning => warning.severe)).toBe(true)
    expect(fixesForWarning(trip, 0, target).map(entry => entry.id)).not.toContain('hours:boat:move-earlier-0')
  })

  it('keeps three fixes, ranked by introduced count, then day change, then build order', () => {
    const trip = baseTrip()
    expect(fixCandidates(trip, 0, target)).toHaveLength(6)
    // Smallest absolute day change first. Zero-change sets keep build order.
    expect(fixesForWarning(trip, 0, target).map(entry => entry.id)).toEqual([
      'hours:boat:move-earlier-0',
      'hours:boat:swap-previous',
      'hours:boat:shift-start-30',
    ])
    expect(fixesForWarning(trip, 0, target, 99).map(entry => entry.id)).toEqual([
      'hours:boat:move-earlier-0',
      'hours:boat:swap-previous',
      'hours:boat:shift-start-30',
      'hours:boat:shift-start-60',
      'hours:boat:shorten-previous-15',
      'hours:boat:shorten-previous-30',
    ])
    expect(fixesForWarning(trip, 0, target, 1)).toHaveLength(1)
    const delta = verifyFixSet(trip, fixCandidates(trip, 0, target)[2]).verification
    if (delta.kind !== 'verified') throw new Error('expected verified')
    expect(delta.deltaMin).toBe(-15)
  })

  it('makes only shift-start sets when the target names the day', () => {
    const sets = fixCandidates(baseTrip(), 0, { code: 'hours', stopId: null })
    expect(sets.length).toBeGreaterThan(0)
    for (const set of sets) {
      expect(set.changes.every(change => change.kind === 'shift-start')).toBe(true)
      expect(set.target.stopId).toBeNull()
    }
  })

  it('offers only place-free sets', () => {
    const trip = baseTrip()
    const offered = fixesForWarning(trip, 0, target)
    expect(offered.length).toBe(3)
    for (const set of offered) expect(isPlaceFree(set)).toBe(true)
  })
})

describe('fixSummary', () => {
  const nameOf = (stopId: string) => ({ prev: 'Spice farm walk', boat: 'Periyar boat' })[stopId] ?? stopId
  const clock = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

  it('gives the title, the change and the result for a shortening fix', () => {
    const trip = baseTrip()
    const set = fixesForWarning(trip, 0, target, 99)
      .find(entry => entry.id === 'hours:boat:shorten-previous-15')
    if (!set) throw new Error('expected the shortening fix')
    expect(fixSummary(set, nameOf, clock)).toEqual({
      title: 'Shorten Spice farm walk to 75 min',
      change: 'Day 1: Spice farm walk stays 75 min',
      result: 'Clears it · 15 min shorter day',
    })
  })

  it('says the day length is the same when a reorder does not change it', () => {
    const trip = baseTrip()
    const set = fixesForWarning(trip, 0, target).find(entry => entry.id === 'hours:boat:move-earlier-0')
    if (!set) throw new Error('expected the move fix')
    const copy = fixSummary(set, nameOf, clock)
    expect(copy.title).toBe('Move Periyar boat to position 1')
    expect(copy.result).toBe('Clears it · same day length')
  })
})

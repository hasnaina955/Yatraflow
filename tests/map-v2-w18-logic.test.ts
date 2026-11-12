// ============ W18: logic defects found in the six-scene capture ============
// Five rules, each proven here against the pure modules that own it:
//  1. The map's layout effect must depend on ring CONTENT, not array identity.
//  2. One schedule: the Fix lens reads the same legs as the rail; a fixed
//     commitment warning names its stop; every computable fix is offered; and
//     "Clears it" needs a stop with no warning after the change.
//  3. The Fix sub line uses the reader's clock and states the arrival and the
//     boarding close (never "before 15:30" for a 15:30 arrival).
//  4. One free-evening function, starting after the fixed booking ends. The
//     pick's start sits inside that window, after the walk.
//  5. A manual pick's budget share is its detour against the day's budget.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { commitmentStopIndex, hmToMinutes, legKey } from '../src/lib/engine'
import type { LegEstimate } from '../src/lib/engine'
import { stayRingsDependencyKey } from '../src/lib/map/stayRings'
import { fixProblemFor } from '../src/pages/trip/map/useMapLenses'
import {
  applyFixChangeSet, fixCandidates, fixesForWarning, fixSummary, verifyFixSet, warningRefs,
} from '../src/pages/trip/map/fixLens'
import { fixIsOffered } from '../src/lib/mapLensContracts'
import { fixProblemSubLine } from '../src/components/map/railModel'
import { stayPickStartMin, stayWindows } from '../src/pages/trip/map/stayLens'
import { pickStopFor } from '../src/pages/trip/map/pickPreview'
import { readManualPicksForDay } from '../src/pages/trip/map/manualPicks'
import { createManualSlotStore } from '../src/pages/trip/map/manualSlotContexts'
import { formatHM } from '../src/lib/timefmt'
import type { PlaceHit } from '../src/lib/providers/hits'
import type { FixedCommitment, ItineraryDay, ItineraryStop, Trip } from '../src/data/types'

const here = dirname(fileURLToPath(import.meta.url))

function stop(over: Partial<ItineraryStop> = {}): ItineraryStop {
  return {
    id: 's1', title: 'Stop', category: 'sightseeing', locationName: 'Thekkady',
    lat: 9.6, lng: 77.15, description: '', notes: '', visitMinutes: 60,
    openTime: '', closeTime: '', entryFeeInrPerPerson: 0, transportCostInrTotal: 0,
    priority: 'nice-to-have', sourceUrl: '', status: 'confirmed', orderInDay: 1,
    ...over,
  } as ItineraryStop
}

function day(index: number, stops: ItineraryStop[], startTime?: string): ItineraryDay {
  return { id: `d${index}`, index, stops, ...(startTime ? { startTime } : {}) } as ItineraryDay
}

const HOME = { lat: 9.55, lng: 77.1 }
const BOAT_AT = { lat: 9.6, lng: 77.15 }

function tripOf(days: ItineraryDay[], over: Partial<Trip> = {}): Trip {
  return {
    id: 't-w18', name: 'W18 trip', startLocation: 'Munnar',
    startLocationCoords: HOME,
    destinations: ['Thekkady'], destinationCoords: [BOAT_AT],
    startDate: '2026-11-14', endDate: '2026-11-16', travellers: 2,
    transportMode: 'car', roundTrip: false, budgetPerPersonInr: 20000,
    travelStyle: 'balanced', fixedCommitments: [], days,
    expenses: [], coverEmoji: 'car', visibility: 'private', createdAt: 0, updatedAt: 0,
    ...over,
  } as Trip
}

function boatCommitment(over: Partial<FixedCommitment> = {}): FixedCommitment {
  return { id: 'fc-boat', title: 'Periyar boat', type: 'event', dayIndex: 0, time: '15:30', stopId: 'boat', ...over }
}

const boatStop = (over: Partial<ItineraryStop> = {}) => stop({
  id: 'boat', title: 'Periyar boat', category: 'adventure', lat: BOAT_AT.lat, lng: BOAT_AT.lng, visitMinutes: 90, ...over,
})

// A meal before the boat keeps the "no meal/rest break" warning out, so the
// boat warning is the one the Fix lens reads.
const mealStop = () => stop({
  id: 'meal', title: 'Lunch', category: 'food', lat: BOAT_AT.lat, lng: BOAT_AT.lng, visitMinutes: 45, orderInDay: 1,
})

// The day starts at 14:00 and arrives at the boat about 15:08 — a thin buffer
// before 15:30. With a slow measured leg the arrival is 15:45, after the
// boarding close: a different kind of warning for the same plan.
const bufferTrip = () => tripOf([
  day(0, [mealStop(), boatStop({ orderInDay: 2 })], '14:00'),
], { fixedCommitments: [boatCommitment()] })

// The same day with a slow measured leg: the arrival is ~16:00, after the
// boarding close. The Fix lens must read this leg, as the rail does.
const SLOW_LEG: Record<string, LegEstimate> = {
  [legKey(HOME, BOAT_AT)]: { distanceKm: 40, durationMinutes: 60 },
}

// A farm before the boat, arriving at the boat at 15:50: after the commitment.
const farmBoatTrip = () => tripOf([
  day(0, [
    stop({ id: 'farm', title: 'Spice farm walk', lat: BOAT_AT.lat, lng: BOAT_AT.lng, visitMinutes: 90, orderInDay: 1 }),
    boatStop({ orderInDay: 2 }),
  ], '14:00'),
], { fixedCommitments: [boatCommitment()] })

const clock24 = (hm: string) => formatHM(hm, '24h')
const clock12 = (hm: string) => formatHM(hm, '12h')
/** fixSummary renders a minute count, not a stored "HH:MM" string. */
const minuteClock = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

// ---------------------------------------------------------------- item 1
describe('item 1: the map layout effect depends on ring content', () => {
  const ring = (id: string, radius: number) => ({
    id,
    label: `${id} ring`,
    ring: [[radius, 9.6], [radius, 9.7], [radius, 9.6]] as [number, number][],
    active: true,
  })

  it('gives the same key for a fresh array with the same rings', () => {
    expect(stayRingsDependencyKey([ring('walk-15', 0.1)])).toBe(stayRingsDependencyKey([ring('walk-15', 0.1)]))
  })

  it('gives a new key when a ring moves or changes identity', () => {
    expect(stayRingsDependencyKey([ring('walk-15', 0.1)])).not.toBe(stayRingsDependencyKey([ring('walk-15', 0.2)]))
    expect(stayRingsDependencyKey([ring('walk-15', 0.1)])).not.toBe(stayRingsDependencyKey([ring('drive-30', 0.1)]))
  })

  it('gives one stable key for no rings', () => {
    expect(stayRingsDependencyKey([])).toBe('')
    expect(stayRingsDependencyKey(undefined)).toBe('')
  })

  it('keeps the ring ARRAY out of the layout effect dependency list', () => {
    const source = readFileSync(join(here, '../src/components/TripMap.tsx'), 'utf-8')
    // The old list re-ran the effect on every render: the default `[]` and the
    // page's inline rings are new arrays each time, and the effect writes state.
    expect(source).not.toContain('[workspaceChrome, mapLoaded, spreadKey, measureFrame, layoutOnMap, stayRings]')
    expect(source).toContain('stayRingsKey')
  })

  it('writes a view tick only when a ring caption actually changes', () => {
    const source = readFileSync(join(here, '../src/components/TripMap.tsx'), 'utf-8')
    expect(source).toContain('if (captionsChanged) setViewTick')
    expect(source).toContain('setMapZoom(prev => prev === zoom ? prev : zoom)')
    expect(source).not.toMatch(/^\s*setViewTick\(tick => tick \+ 1\)\s*$/m)
  })
})

// ---------------------------------------------------------------- item 2
describe('item 2: the Fix lens reads one schedule', () => {
  it('reads the same measured legs as the rail', () => {
    const trip = bufferTrip()
    expect(fixProblemFor(trip, 0)?.problem.title).toBe('Thin buffer before Periyar boat')
    const slow = fixProblemFor(trip, 0, SLOW_LEG)
    expect(slow?.problem.title).toBe('Conflicts with Periyar boat')
    expect(slow?.problem.evidence[0]).toContain('after the 15:30 commitment')
  })

  it('treats a boarding close as the deadline it is', () => {
    const trip = tripOf([day(0, [boatStop()], '15:00')], {
      fixedCommitments: [boatCommitment({ boardingTime: '15:20' })],
    })
    // The estimate arrives ~15:23: after boarding closes at 15:20, before the
    // 15:30 sailing. That is closed boarding, not a thin buffer.
    expect(fixProblemFor(trip, 0)?.problem.title).toBe('Conflicts with Periyar boat')
  })

  it('names the stop a fixed-commitment warning is about', () => {
    expect(warningRefs(bufferTrip(), 0)).toEqual([{ code: 'buffer', stopId: 'boat', severe: false }])
    expect(warningRefs(farmBoatTrip(), 0)).toContainEqual({ code: 'commitment', stopId: 'boat', severe: true })
  })

  it('offers the engine’s reorder and shorten fixes, and invents no other kind', () => {
    const trip = farmBoatTrip()
    const problem = fixProblemFor(trip, 0)
    if (!problem) throw new Error('the fixture must hold one problem')
    expect(problem.target.stopId).toBe('boat')
    const candidates = fixCandidates(trip, 0, problem.target)
    expect(candidates.some(set => set.changes.some(change => change.kind !== 'shift-start'))).toBe(true)
    const allowed = ['move', 'swap', 'remove', 'set-visit', 'shift-start']
    for (const set of candidates) {
      for (const change of set.changes) expect(allowed).toContain(change.kind)
    }
    expect(fixesForWarning(trip, 0, problem.target).length).toBeGreaterThan(0)
  })

  it('keeps the stop’s place when the arrival is late, and never re-sorts by the booking clock', () => {
    const trip = farmBoatTrip()
    const at = commitmentStopIndex(trip.days[0].stops, { stopId: 'boat' })
    expect(at).toBe(1)
    // The order is the plan's order; the late arrival belongs to the risk line.
    expect(trip.days[0].stops.map(entry => entry.id)).toEqual(['farm', 'boat'])
  })

  it('does not say Clears it when another warning remains on the stop', () => {
    const trip = farmBoatTrip()
    const set = fixCandidates(trip, 0, { code: 'commitment', stopId: 'boat' })
      .find(entry => entry.id.endsWith('shift-start-60'))
    if (!set) throw new Error('the earlier-start candidate must exist')
    const check = verifyFixSet(trip, set).verification
    if (check.kind !== 'verified') throw new Error('expected verified')
    // The commitment clears, but the arrival lands 27 min before the boat: a
    // buffer warning now sits on the same stop.
    expect(check.clearsTarget).toBe(true)
    expect(check.stopClear).toBe(false)
    expect(fixIsOffered({ ...set, verification: check })).toBe(false)
    const copy = fixSummary({ ...set, verification: check }, id => id, minuteClock)
    expect(copy.result.startsWith('Clears it')).toBe(false)
    expect(copy.result).toBe('Does not clear it')
  })

  it('keeps Clears it when the stop is clean after the change', () => {
    const trip = farmBoatTrip()
    const set = fixesForWarning(trip, 0, { code: 'commitment', stopId: 'boat' }, 99)
      .find(entry => entry.id.endsWith('move-earlier-0'))
    if (!set) throw new Error('the reorder fix must be offered')
    const check = verifyFixSet(trip, set).verification
    if (check.kind !== 'verified') throw new Error('expected verified')
    expect(check.stopClear).toBe(true)
    expect(fixSummary(set, id => id, minuteClock).result.startsWith('Clears it')).toBe(true)
  })

  it('offers a real next-day booking move and never invents one without a next day', () => {
    const withNextDay = tripOf([
      day(0, [mealStop(), boatStop({ orderInDay: 2 })], '14:00'),
      day(1, [stop({ id: 'walk', title: 'Forest walk', orderInDay: 1 })], '09:00'),
    ], { fixedCommitments: [boatCommitment({ dayIndex: 0 })] })
    const problem = fixProblemFor(withNextDay, 0)
    if (!problem) throw new Error('the fixture must hold one problem')
    const candidates = fixCandidates(withNextDay, 0, problem.target)
    const move = candidates.find(set => set.id.endsWith('move-commitment-next-day'))
    expect(move).toBeDefined()
    const proposed = applyFixChangeSet(withNextDay, move!)
    expect(proposed?.days[1].stops.map(entry => entry.id)).toContain('boat')
    expect(proposed?.fixedCommitments[0].dayIndex).toBe(1)
    expect(proposed?.fixedCommitments[0].time).toBe('09:30')
    const verified = verifyFixSet(withNextDay, move!)
    expect(verified.verification.kind).toBe('verified')
    if (verified.verification.kind === 'verified') expect(verified.verification.clearsTarget).toBe(true)
    const noNextDay = tripOf([day(0, [mealStop(), boatStop({ orderInDay: 2 })], '14:00')], {
      fixedCommitments: [boatCommitment({ dayIndex: 0 })],
    })
    expect(fixCandidates(noNextDay, 0, problem.target).some(set => set.id.includes('move-commitment'))).toBe(false)
  })
})

// ---------------------------------------------------------------- item 3
describe('item 3: the Fix sub line uses the reader’s clock', () => {
  it('says the arrival and the boarding close in 12 h', () => {
    expect(fixProblemSubLine({
      title: 'Conflicts with Periyar boat',
      evidence: ['You reach Periyar boat ~16:37, after boarding closes at 15:00.'],
    }, clock12)).toBe('Jetty 4:37 PM · boarding 3:00 PM')
  })

  it('says the arrival and the boarding close in 24 h', () => {
    expect(fixProblemSubLine({
      title: 'Conflicts with Periyar boat',
      evidence: ['You reach Periyar boat ~16:37, after boarding closes at 15:00.'],
    }, clock24)).toBe('Jetty 16:37 · boarding 15:00')
  })

  it('says before the commitment only when the arrival is early, in 12 h', () => {
    expect(fixProblemSubLine({
      title: 'Thin buffer before Periyar boat',
      evidence: ['You reach Periyar boat ~14:53, under ~45 min before the 15:30 commitment.'],
    }, clock12)).toBe('Jetty 2:53 PM · before 3:30 PM')
  })

  it('never says before a time the arrival has already passed', () => {
    expect(fixProblemSubLine({
      title: 'Thin buffer before Periyar boat',
      evidence: ['You reach Periyar boat ~15:30, under ~45 min before the 15:30 commitment.'],
    }, clock12)).toBe('Jetty 3:30 PM · boarding')
  })

  it('keeps a warning that names no jetty unchanged', () => {
    expect(fixProblemSubLine({
      title: 'Short rest',
      evidence: ['Day 1 ends ~23:40 and Day 2 starts 06:00.'],
    }, clock12)).toBe('Day 1 ends ~23:40 and Day 2 starts 06:00.')
  })
})

// ---------------------------------------------------------------- item 4
describe('item 4: one free-evening function', () => {
  const book = { startMin: 15 * 60 + 30, visitMin: 90, backMin: 4 }

  it('starts the evening after the fixed booking ends', () => {
    expect(stayWindows({ arriveAtBaseMin: 13 * 60 + 40, leaveBaseMin: null, eveningBook: book })).toEqual([
      { id: 'evening', label: 'Free evening', startMin: 17 * 60, endMin: 21 * 60 },
    ])
  })

  it('never starts before the base arrival', () => {
    expect(stayWindows({ arriveAtBaseMin: 18 * 60, leaveBaseMin: null, eveningBook: book })).toEqual([
      { id: 'evening', label: 'Free evening', startMin: 18 * 60, endMin: 21 * 60 },
    ])
  })

  it('treats an unknown booking length as ending at its start', () => {
    expect(stayWindows({ arriveAtBaseMin: 13 * 60, leaveBaseMin: null, eveningBook: { ...book, visitMin: null } })).toEqual([
      { id: 'evening', label: 'Free evening', startMin: 15 * 60 + 30, endMin: 21 * 60 },
    ])
  })

  it('offers a pick start inside the window, after the walk', () => {
    const window = { startMin: 17 * 60, endMin: 21 * 60 }
    expect(stayPickStartMin(window, 6)).toBe(17 * 60 + 6)
    expect(stayPickStartMin(window, 6)).toBeGreaterThan(window.startMin)
  })

  it('offers no pick start that would fall outside the window', () => {
    expect(stayPickStartMin({ startMin: 20 * 60 + 30, endMin: 21 * 60 }, 40)).toBeNull()
    expect(stayPickStartMin({ startMin: 17 * 60, endMin: 17 * 60 }, 0)).toBeNull()
  })

  it('stamps the offered start onto the stop the add writes', () => {
    const window = stayWindows({ arriveAtBaseMin: 13 * 60 + 40, leaveBaseMin: null, eveningBook: book })[0]
    const start = stayPickStartMin(window, 6)
    expect(start).toBe(17 * 60 + 6)
    const hit = { id: 'p1', name: 'Kalari', latitude: 9.6, longitude: 77.15, kind: 'poi', plannedStartMin: start } as unknown as PlaceHit
    const stop = pickStopFor(hit, 'new-stop')
    expect(stop.arrivalTime).toBe('17:06')
    expect(start).toBeGreaterThan(hmToMinutes('15:30') + 90)
  })
})

// ---------------------------------------------------------------- item 5
describe('item 5: a pick’s budget share is its detour against the day budget', () => {
  const hit = { id: 'h1', name: 'Nalla Ruchi Kitchen', latitude: 9.7, longitude: 77.2, category: 'restaurant' } as unknown as PlaceHit

  function filed() {
    const store = createManualSlotStore()
    store.file({ tripId: 't-w18', dayId: 'd0', slotKey: 'lunch' }, hit)
    return store
  }

  it('reads 1 min against a 40 min budget as 3 %', () => {
    const rows = filed().candidatesBySlot(
      { tripId: 't-w18', dayId: 'd0' },
      { detourMin: () => 1, detourKm: () => 1, budgetMin: 40 },
    )
    expect(rows.lunch?.[0]?.budgetSharePct).toBe(3)
  })

  it('keeps the whole-budget placeholder when the detour is unknown', () => {
    const rows = filed().candidatesBySlot(
      { tripId: 't-w18', dayId: 'd0' },
      { detourMin: () => null, detourKm: () => null, budgetMin: 40 },
    )
    expect(rows.lunch?.[0]?.budgetSharePct).toBe(100)
  })

  it('uses the same share for a legacy page pick', () => {
    const picks = readManualPicksForDay({
      store: filed(),
      tripId: 't-w18',
      dayId: 'd0',
      slotManual: { lunch: [hit] },
      detourMinFor: () => 1,
      detourKmFor: () => 1,
      budgetMin: 40,
    })
    expect(picks.legacy.lunch?.[0]?.budgetSharePct).toBe(3)
  })
})

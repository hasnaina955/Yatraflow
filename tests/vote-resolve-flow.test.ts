// ============ Vote resolution lands the winner on the timeline ============
// The last mile of shortlist → vote → resolved (user ask): a decision whose
// winning option carries a Map-rail place payload must ADD that place as a
// confirmed stop — which is what makes it reflect on Board + Timeline + Map,
// and drops it from the suggestion rail (name-based dedupe). Regression for
// the old behaviour where resolving only stamped the decision.
//
// Delete-from-map is pinned too: deleteStop must write through to the trips
// table, and restoreStop (the Undo path) must put the stop back at its old
// day and order.
import { describe, it, expect, vi } from 'vitest'
import { seedData } from '../src/data/seed'

const { calls } = vi.hoisted(() => ({
  calls: [] as Array<{ table: string; method: string; payload?: unknown }>,
}))

vi.mock('../src/lib/supabase', () => {
  const makeBuilder = (table: string) => {
    let method: string | undefined
    let payload: unknown
    const builder: Record<string, unknown> = {}
    const chain = (m: string, p?: unknown) => { method = m; payload = p; return builder }
    builder.update = (p: unknown) => chain('update', p)
    builder.insert = (p: unknown) => chain('insert', p)
    builder.delete = () => chain('delete')
    builder.select = () => builder
    builder.eq = () => builder
    builder.in = () => builder
    builder.order = () => builder
    builder.limit = () => builder
    builder.lt = () => builder
    builder.maybeSingle = () => builder
    builder.single = () => builder
    builder.then = (res: (v: { data: unknown; error: unknown }) => unknown) =>
      new Promise(resolve => { if (method) calls.push({ table, method, payload }); resolve({ data: null, error: null }) }).then(res)
    return builder
  }
  return {
    isSupabaseConfigured: false,
    supabase: { from: (t: string) => makeBuilder(t) },
  }
})

import {
  addDecision, voteOnDecision, resolveDecision, addStop, deleteStop, restoreStop,
  duplicateTrip, tripById, getSnapshot, _setTripWriteDebounceMs,
} from '../src/store/store'

_setTripWriteDebounceMs(0)

const keralaTrip = seedData.trips[0]
const ownerId = 'owner-test'

function singleTrip() {
  calls.length = 0
  return duplicateTrip(keralaTrip, ownerId)
}

function flush(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

function tripsUpdates() {
  return calls.filter(c => c.table === 'trips' && c.method === 'update')
}

const PLACE = {
  title: 'Food Express Durgapur',
  category: 'food' as const,
  locationName: 'Durgapur, West Bengal',
  lat: 23.52,
  lng: 87.31,
  description: 'Restaurant',
  visitMinutes: 45,
  dayIndex: 0,
}

function raisePlaceDecision(tripId: string, count = 2) {
  getSnapshot().sessionUserId = ownerId
  addDecision(tripId, {
    question: count === 1 ? `Should we add "${PLACE.title}"?` : 'Which of these should we add?',
    context: 'Shortlisted from the Map rail',
    options: Array.from({ length: count }, (_, i) => ({
      id: `tmp_${i}`,
      label: i === 0 ? PLACE.title : `Other place ${i}`,
      place: i === 0 ? PLACE : { ...PLACE, title: `Other place ${i}`, lat: PLACE.lat + 0.1 },
    })),
  })
  return getSnapshot().decisions[getSnapshot().decisions.length - 1]
}

describe('resolveDecision lands the winning place on the timeline', () => {
  it('a place-payload winner becomes a confirmed stop on the clamped day', () => {
    const copy = singleTrip()
    const before = tripById(copy.id)!.days[0].stops.length
    const d = raisePlaceDecision(copy.id)
    voteOnDecision(d.id, d.options[0].id)
    resolveDecision(d.id, d.options[0].id)

    const trip = tripById(copy.id)!
    expect(trip.days[0].stops.length).toBe(before + 1)
    const added = trip.days[0].stops.find(s => s.title === PLACE.title)
    expect(added).toBeTruthy()
    expect(added!.status).toBe('confirmed')
    expect(added!.lat).toBeCloseTo(PLACE.lat)
    expect(added!.lng).toBeCloseTo(PLACE.lng)
    expect(added!.notes).toContain('group vote')
    // resolveDecision clones the decision into the cache — read the live one
    const live = getSnapshot().decisions.find(x => x.id === d.id)!
    expect(live.status).toBe('resolved')
    expect(live.resolvedOptionId).toBe(d.options[0].id)
  })

  it('a losing option never lands; the decision still resolves', () => {
    const copy = singleTrip()
    const before = tripById(copy.id)!.days[0].stops.length
    const d = raisePlaceDecision(copy.id)
    resolveDecision(d.id, d.options[1].id)

    const trip = tripById(copy.id)!
    expect(trip.days[0].stops.length).toBe(before + 1) // option 1's place, not option 0's
    expect(trip.days[0].stops.some(s => s.title === PLACE.title)).toBe(false)
    expect(trip.days[0].stops.some(s => s.title === 'Other place 1')).toBe(true)
  })

  it('a hand-raised decision (no place payloads) resolves without touching the timeline', () => {
    const copy = singleTrip()
    getSnapshot().sessionUserId = ownerId
    const before = tripById(copy.id)!.days[0].stops.length
    addDecision(copy.id, {
      question: 'AC sleeper or ordinary bus?',
      context: 'Night journey preference',
      options: [{ id: 'tmp_0', label: 'AC sleeper' }, { id: 'tmp_1', label: 'Ordinary' }],
    })
    const d = getSnapshot().decisions[getSnapshot().decisions.length - 1]
    resolveDecision(d.id, d.options[0].id)
    expect(tripById(copy.id)!.days[0].stops.length).toBe(before)
    expect(getSnapshot().decisions.find(x => x.id === d.id)!.status).toBe('resolved')
  })

  it('dayIndex clamps to the trip\u2019s actual day range', () => {
    const copy = singleTrip()
    getSnapshot().sessionUserId = ownerId
    addDecision(copy.id, {
      question: 'Which of these should we add?',
      context: 'Shortlisted from the Map rail',
      options: [{ id: 'tmp_0', label: PLACE.title, place: { ...PLACE, dayIndex: 99 } }],
    })
    const d = getSnapshot().decisions[getSnapshot().decisions.length - 1]
    resolveDecision(d.id, d.options[0].id)
    const trip = tripById(copy.id)!
    const lastDay = trip.days[trip.days.length - 1]
    expect(lastDay.stops.some(s => s.title === PLACE.title)).toBe(true)
  })

  it('the landed stop persists to the trips table (write-through)', async () => {
    const copy = singleTrip()
    const d = raisePlaceDecision(copy.id)
    resolveDecision(d.id, d.options[0].id)
    await flush()
    expect(tripsUpdates().length).toBeGreaterThan(0)
    const persisted = tripsUpdates()[tripsUpdates().length - 1].payload as { days?: Array<{ index: number; stops: Array<{ title?: string }> }> }
    expect(persisted?.days?.some(day => (day.stops ?? []).some(s => s.title === PLACE.title))).toBe(true)
  })
})

describe('delete-from-map: deleteStop + restoreStop', () => {
  it('deleteStop removes the stop and writes through', async () => {
    const copy = singleTrip()
    const s = addStop(copy.id, 0, {
      title: 'Map Pin Cafe', category: 'food', locationName: 'Somewhere',
      lat: 10.1, lng: 76.7, description: '', visitMinutes: 30,
      entryFeeInrPerPerson: 0, transportCostInrTotal: 0, priority: 'nice-to-have',
      status: 'confirmed',
    })
    calls.length = 0
    deleteStop(copy.id, s.id)
    expect(tripById(copy.id)!.days[0].stops.some(x => x.id === s.id)).toBe(false)
    await flush()
    expect(tripsUpdates().length).toBeGreaterThan(0)
    const persisted = tripsUpdates()[tripsUpdates().length - 1].payload as { days?: Array<{ index: number; stops: Array<{ id?: string }> }> }
    expect(persisted?.days?.some(day => (day.stops ?? []).some(x => x.id === s.id))).toBe(false)
  })

  it('restoreStop (Undo) puts the stop back on its day at its old order', () => {
    const copy = singleTrip()
    const day0 = tripById(copy.id)!.days[0]
    const victim = day0.stops[1]
    const orderBefore = victim.orderInDay
    deleteStop(copy.id, victim.id)
    expect(tripById(copy.id)!.days[0].stops.some(x => x.id === victim.id)).toBe(false)
    restoreStop(copy.id, victim, 0)
    const restored = tripById(copy.id)!.days[0].stops.find(x => x.id === victim.id)
    expect(restored).toBeTruthy()
    expect(restored!.orderInDay).toBe(orderBefore)
  })

  it('deleting an unknown stop is a safe no-op', () => {
    const copy = singleTrip()
    const before = tripById(copy.id)!.days[0].stops.length
    expect(() => deleteStop(copy.id, 'no-such-stop')).not.toThrow()
    expect(tripById(copy.id)!.days[0].stops.length).toBe(before)
  })
})

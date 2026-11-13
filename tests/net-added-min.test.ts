// ============ Net added minutes (#08 AC2) ============
// The per-row producer. The number must equal the impact preview's own
// `timeDeltaMin` for the same inserted plan, because the rail card and the
// preview must not disagree. Facts the caller cannot prove stay null.
import { describe, expect, it } from 'vitest'
import { computeImpact } from '../src/lib/impact'
import { seedData } from '../src/data/seed'
import type { ItineraryStop, Trip } from '../src/data/types'
import {
  createNetAddedProducer,
  netAddedMinutes,
  rememberBounded,
  withCandidateInserted,
  type NetAddedCandidate,
} from '../src/lib/netAddedMin'

const base = structuredClone(seedData.trips[0]) as Trip

function candidateStop(overrides: Partial<ItineraryStop> = {}): ItineraryStop {
  const day = base.days[0]
  const a = day.stops[0]
  const b = day.stops[1] ?? day.stops[0]
  return {
    id: 'st_net_added',
    title: 'Net added place',
    category: 'sightseeing',
    locationName: 'Between two stops',
    lat: (a.lat + b.lat) / 2,
    lng: (a.lng + b.lng) / 2,
    visitMinutes: 30,
    entryFeeInrPerPerson: 0,
    transportCostInrTotal: 0,
    priority: 'nice-to-have',
    status: 'suggested',
    orderInDay: 2,
    ...overrides,
  }
}

function candidate(overrides: Partial<NetAddedCandidate> = {}): NetAddedCandidate {
  return { key: 'row:between', stop: candidateStop(), insertAt: 1, ...overrides }
}

describe('net added minutes — one producer, one number', () => {
  it('equals the impact preview’s time delta for the same inserted plan', () => {
    const cand = candidate()
    const proposed = withCandidateInserted(base.days[0], cand)
    if (!proposed) throw new Error('expected the candidate to fit the day')
    const trip: Trip = { ...base, days: base.days.map(day => (day.index === 0 ? proposed : day)) }
    const preview = computeImpact(base, trip, 'add', 0).timeDeltaMin
    expect(netAddedMinutes({ trip: base, dayIndex: 0 }, cand)).toBe(preview)
  })

  it('a known zero visit length stays a computed number, not an unknown', () => {
    const result = netAddedMinutes({ trip: base, dayIndex: 0 }, candidate({ stop: candidateStop({ visitMinutes: 0 }) }))
    expect(result).not.toBeNull()
    expect(typeof result).toBe('number')
    expect(Number.isFinite(result)).toBe(true)
  })

  it('keeps an unknown visit length null', () => {
    const dirty = candidateStop()
    ;(dirty as { visitMinutes?: number }).visitMinutes = undefined
    expect(netAddedMinutes({ trip: base, dayIndex: 0 }, candidate({ stop: dirty }))).toBeNull()
    expect(netAddedMinutes({ trip: base, dayIndex: 0 }, candidate({ stop: candidateStop({ visitMinutes: Number.NaN }) }))).toBeNull()
  })

  it('keeps an unmeasured road placement null', () => {
    expect(netAddedMinutes({ trip: base, dayIndex: 0 }, candidate({ insertAt: null }))).toBeNull()
    expect(netAddedMinutes({ trip: base, dayIndex: 0 }, candidate({ insertAt: -1 }))).toBeNull()
    expect(netAddedMinutes({ trip: base, dayIndex: 0 }, candidate({ insertAt: 999 }))).toBeNull()
  })

  it('keeps an unknown day or trip null', () => {
    expect(netAddedMinutes({ trip: base, dayIndex: 99 }, candidate())).toBeNull()
    expect(netAddedMinutes({ trip: base, dayIndex: 0 }, candidate({ stop: candidateStop({ lat: Number.NaN }) }))).toBeNull()
  })
})

describe('net added minutes — memoised per row', () => {
  it('simulates each distinct candidate once and then serves the cache', () => {
    // Cost bound: each distinct candidate runs computeImpact once. That call
    // simulates the whole trip twice, for the baseline and for the proposed plan.
    // A repeat call with the same facts is served from this producer's memo.
    const producer = createNetAddedProducer({ trip: base, dayIndex: 0 })
    expect(producer.memoSize).toBe(0)
    const first = producer.netAddedFor(candidate())
    expect(producer.memoSize).toBe(1)
    const second = producer.netAddedFor(candidate())
    expect(second).toBe(first)
    expect(producer.memoSize).toBe(1)
    producer.netAddedFor(candidate({ key: 'row:other', insertAt: 2 }))
    expect(producer.memoSize).toBe(2)
  })

  it('caches a null answer too, and a changed fact is a new key', () => {
    const producer = createNetAddedProducer({ trip: base, dayIndex: 0 })
    expect(producer.netAddedFor(candidate({ insertAt: null }))).toBeNull()
    expect(producer.memoSize).toBe(1)
    expect(producer.netAddedFor(candidate({ insertAt: 1 }))).not.toBeNull()
    expect(producer.memoSize).toBe(2)
  })
})

describe('net added minutes — the memo is bounded', () => {
  it('keeps at most 512 entries per producer, and a re-asked number is unchanged', () => {
    const producer = createNetAddedProducer({ trip: base, dayIndex: 0 })
    const real = candidate({ key: 'row:kept', insertAt: 1 })
    const expected = netAddedMinutes({ trip: base, dayIndex: 0 }, real)
    expect(producer.netAddedFor(real)).toBe(expected)
    // Unusable rows are memoised as null too. They fill the memo without any simulation.
    for (let i = 0; i < 600; i++) {
      producer.netAddedFor(candidate({ key: `row:bulk-${i}`, stop: candidateStop({ lat: Number.NaN }) }))
    }
    expect(producer.memoSize).toBeLessThanOrEqual(512)
    expect(producer.netAddedFor(real)).toBe(expected)
  })
})

describe('rememberBounded — the oldest entry leaves first', () => {
  it('evicts the oldest entry once the memo is full', () => {
    const memo = new Map<string, number>()
    rememberBounded(memo, 'k0', 0, 3)
    rememberBounded(memo, 'k1', 1, 3)
    rememberBounded(memo, 'k2', 2, 3)
    rememberBounded(memo, 'k3', 3, 3)
    expect([...memo.keys()]).toEqual(['k1', 'k2', 'k3'])
  })

  it('an existing key takes its new value in place and evicts nothing', () => {
    const memo = new Map<string, number>([['a', 1], ['b', 2]])
    rememberBounded(memo, 'a', 9, 2)
    expect([...memo.entries()]).toEqual([['a', 9], ['b', 2]])
  })
})

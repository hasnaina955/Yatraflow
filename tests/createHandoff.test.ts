// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { stashHandoff, readHandoff, clearHandoff, HANDOFF_KEY, type HandoffStore, type CreateHandoff } from '../src/lib/createHandoff'

function fakeStore(): HandoffStore & { map: Map<string, string> } {
  const map = new Map<string, string>()
  return {
    map,
    getItem: k => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => { map.set(k, v) },
    removeItem: k => { map.delete(k) },
  }
}

const h: CreateHandoff = {
  tripId: 't1', tripName: 'Kerala with the crew', plannerName: 'Asha',
  roadKm: 412, rangeKm: 720, days: 6, travellers: 4,
  crew: [{ name: 'Ammu', phone: '9845021234' }, { name: 'Rahul', phone: null }],
  bill: { roadKm: 412, perHead: 12700, total: 50800 },
}

describe('create handoff - the one hop to the moment-after screen', () => {
  it('round-trips for the trip it belongs to', () => {
    const store = fakeStore()
    expect(stashHandoff(h, { store })).toBe(true)
    const got = readHandoff('t1', { store })!
    expect(got.tripName).toBe('Kerala with the crew')
    expect(got.roadKm).toBe(412)
    expect(got.crew).toHaveLength(2)
    // the bill travels verbatim - the moment-after screen must not recompute it
    expect(got.bill).toEqual({ roadKm: 412, perHead: 12700, total: 50800 })
    expect(store.map.has(HANDOFF_KEY)).toBe(true)
  })

  it('refuses a handoff for a different trip - no stale crew leaks into a new trip', () => {
    const store = fakeStore()
    stashHandoff(h, { store })
    expect(readHandoff('t2', { store })).toBeNull()
  })

  it('degrades to null on junk, a denied store, or nothing stashed', () => {
    const store = fakeStore()
    expect(readHandoff('t1', { store })).toBeNull()
    store.map.set(HANDOFF_KEY, '{oops')
    expect(readHandoff('t1', { store })).toBeNull()
    store.map.set(HANDOFF_KEY, JSON.stringify({ tripId: 't1' }))
    const partial = readHandoff('t1', { store })!
    // a partial handoff is still usable, with honest defaults
    expect(partial.crew).toEqual([])
    expect(partial.bill).toBeNull()
    expect(partial.roadKm).toBeNull()
    expect(partial.travellers).toBe(1)
    expect(readHandoff('t1', { store: null })).toBeNull()
  })

  it('clear removes it, and clearing twice is harmless', () => {
    const store = fakeStore()
    stashHandoff(h, { store })
    expect(clearHandoff({ store })).toBe(true)
    expect(readHandoff('t1', { store })).toBeNull()
    expect(clearHandoff({ store })).toBe(true)
  })
})

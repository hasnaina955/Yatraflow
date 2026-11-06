import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { seedData } from '../src/data/seed'
import type { QueuedWrite, WriteQueueStore } from '../src/lib/writeQueue'

const { state } = vi.hoisted(() => ({
  state: {
    updates: [] as Array<{ payload: unknown; eq: Record<string, unknown> }>,
    refuse: null as null | { message: string },
  },
}))

vi.mock('../src/lib/supabase', async () => {
  const { tripWriteClient } = await import('./helpers/tripWriteClient')
  const makeBuilder = (table: string) => {
    let method: string | undefined
    let payload: unknown
    const eqs: Record<string, unknown> = {}
    const builder: Record<string, unknown> = {}
    const chain = (m: string, p?: unknown) => { method = m; payload = p; return builder }
    builder.update = (p: unknown) => chain('update', p)
    builder.insert = (p: unknown) => chain('insert', p)
    builder.delete = () => chain('delete')
    builder.select = () => builder
    builder.eq = (col: string, val: unknown) => { eqs[col] = val; return builder }
    builder.in = () => builder
    builder.order = () => builder
    builder.limit = () => builder
    builder.maybeSingle = () => builder
    builder.single = () => builder
    builder.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
      if (method === 'update' && table === 'trips') {
        state.updates.push({ payload, eq: { ...eqs } })
        return Promise.resolve({ data: null, error: state.refuse }).then(res, rej)
      }
      return Promise.resolve({ data: null, error: null }).then(res, rej)
    }
    return builder
  }
  return { isSupabaseConfigured: false, supabase: tripWriteClient({ from: (t: string) => makeBuilder(t) }) }
})

// The queue normally lives in IndexedDB, which Node does not have. Swap only the
// backend for an in-memory store; the real queue logic still runs. That lets the
// test see whether a refused edit stayed queued for replay.
vi.mock('../src/lib/writeQueue', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/lib/writeQueue')>()
  const map = new Map<string, QueuedWrite>()
  const mem: WriteQueueStore = {
    list: async () => [...map.values()],
    put: async entry => { map.set(actual.writeQueueKey(entry.ownerId, entry.tripId), entry) },
    remove: async tripId => { map.delete(tripId) },
    removeIf: async (key, capturedAt, revision) => {
      const current = map.get(key)
      if (!current || current.revision !== revision || (revision === undefined && current.capturedAt !== capturedAt)) return false
      map.delete(key)
      return true
    },
    putIf: async (entry, expectedCapturedAt, expectedRevision) => {
      const key = actual.writeQueueKey(entry.ownerId, entry.tripId)
      const current = map.get(key)
      if (!current || current.revision !== expectedRevision || (expectedRevision === undefined && current.capturedAt !== expectedCapturedAt)) return false
      map.set(key, entry)
      return true
    },
  }
  return {
    ...actual,
    queueWrite: (entry: QueuedWrite) => actual.queueWrite(entry, mem),
    dropWrite: (tripId: string) => actual.dropWrite(tripId, mem),
    dropQueuedWrite: (entry: QueuedWrite) => actual.dropQueuedWrite(entry, mem),
    dropWriteIfCurrent: (tripId: string, capturedAt: number) => actual.dropWriteIfCurrent(tripId, capturedAt, mem),
    requeueIfCurrent: (entry: QueuedWrite) => actual.requeueIfCurrent(entry, mem),
    pendingWrites: () => actual.pendingWrites(mem),
    pendingWriteCount: (ownerId?: string) => actual.pendingWriteCount(ownerId, mem),
    clearWritesFor: (ownerId: string) => actual.clearWritesFor(ownerId, mem),
  }
})

import {
  duplicateTrip, updateTrip, tripById, tripWriteVerdict, getSnapshot, subscribe,
  _setTripWriteDebounceMs, _flushTripWrites, _cancelTripWrites,
} from '../src/store/store'
import { clearWritesFor, pendingWrites } from '../src/lib/writeQueue'

const tick = async () => { await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0)) }
const keralaTrip = seedData.trips[0]

beforeEach(async () => {
  getSnapshot().sessionUserId = 'owner-test'
  _setTripWriteDebounceMs(0)
  await clearWritesFor('owner-test')
  state.updates.length = 0
  state.refuse = null
})

afterEach(() => {
  _cancelTripWrites()
  _setTripWriteDebounceMs(0)
})

describe('reentrant trip writes', () => {
  it('keeps the nested edit in the queued and saved snapshot', async () => {
    _setTripWriteDebounceMs(10_000)
    const trip = duplicateTrip(keralaTrip, 'owner-test')
    let nested = 0
    const unsubscribe = subscribe(() => {
      if (nested === 0 && tripById(trip.id)?.name === 'Outer edit') {
        nested += 1
        expect(updateTrip(trip.id, { travellers: 7 })).toBe(true)
      }
    })
    try {
      expect(updateTrip(trip.id, { name: 'Outer edit' })).toBe(true)
      expect(nested).toBe(1)
      await tick()
      const queued = (await pendingWrites()).find(write => write.tripId === trip.id)
      expect(queued?.trip.name).toBe('Outer edit')
      expect(queued?.trip.travellers).toBe(7)
      const verdict = tripWriteVerdict(trip.id)
      _flushTripWrites()
      await tick()
      await expect(verdict).resolves.toBe(true)
      expect(state.updates).toHaveLength(1)
      expect(state.updates[0].payload).toMatchObject({ name: 'Outer edit', travellers: 7 })
    } finally {
      unsubscribe()
    }
  })

  it('persists a normal update', async () => {
    _setTripWriteDebounceMs(10_000)
    const trip = duplicateTrip(keralaTrip, 'owner-test')
    expect(updateTrip(trip.id, { name: 'Normal edit' })).toBe(true)
    const verdict = tripWriteVerdict(trip.id)
    _flushTripWrites()
    await tick()
    await expect(verdict).resolves.toBe(true)
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0].payload).toMatchObject({ name: 'Normal edit' })
  })
})

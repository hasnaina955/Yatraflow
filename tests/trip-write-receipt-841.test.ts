import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { seedData } from '../src/data/seed'
import type { QueuedWrite, WriteQueueStore } from '../src/lib/writeQueue'

const { state } = vi.hoisted(() => ({
  state: {
    updates: [] as Array<{ payload: unknown; eq: Record<string, unknown> }>,
    refuse: null as null | { message: string },
    hold: null as null | Promise<{ data: null; error: null | { message: string }; count?: number }>,
    count: undefined as number | undefined,
    deny: false,
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
    builder.maybeSingle = () => {
      if (table === 'trip_members' && state.deny) builder.maybeSingleHasRow = true
      return builder
    }
    builder.single = () => builder
    builder.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
      if (table === 'trip_members' && state.deny) return Promise.resolve({ data: null, error: null }).then(res, rej)
      if (method === 'update' && table === 'trips') {
        state.updates.push({ payload, eq: { ...eqs } })
        return (state.hold ?? Promise.resolve({ data: null, error: state.refuse, count: state.count })).then(res, rej)
      }
      return Promise.resolve({ data: null, error: null }).then(res, rej)
    }
    return builder
  }
  return { isSupabaseConfigured: false, supabase: tripWriteClient({ auth: { signOut: async () => ({ error: null }) }, from: (t: string) => makeBuilder(t) }) }
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
  duplicateTrip, updateTrip, tripById, tripWriteReceipt, resolveQueuedTripWrite, getSnapshot, logout,
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
  state.hold = null
  state.count = undefined
  state.deny = false
})

afterEach(() => {
  _cancelTripWrites()
  _setTripWriteDebounceMs(0)
})

describe('generation-bound trip write receipts', () => {
  it('waits for a validated response and returns its actual revision', async () => {
    let release: (result: { data: null; error: null }) => void = () => {}
    state.hold = new Promise(resolve => { release = resolve })
    const trip = duplicateTrip(keralaTrip, 'owner-test')
    await tick()
    expect(updateTrip(trip.id, { name: 'Held' })).toBe(true)
    const receipt = tripWriteReceipt(trip.id)
    const queued = (await pendingWrites()).find(write => write.tripId === trip.id)
    let settled = false
    void receipt.then(() => { settled = true })
    await tick()
    expect(state.updates).toHaveLength(1)
    expect(settled).toBe(false)
    release({ data: null, error: null })
    await expect(receipt).resolves.toEqual({ kind: 'acknowledged', revision: queued?.revision, writeVersion: 1 })
  })

  it('supersedes a coalesced generation', async () => {
    _setTripWriteDebounceMs(10_000)
    const trip = duplicateTrip(keralaTrip, 'owner-test')
    await tick()
    updateTrip(trip.id, { name: 'First' })
    const first = tripWriteReceipt(trip.id)
    updateTrip(trip.id, { name: 'Second' })
    const second = tripWriteReceipt(trip.id)
    await expect(first).resolves.toMatchObject({ kind: 'superseded' })
    _flushTripWrites()
    await expect(second).resolves.toMatchObject({ kind: 'acknowledged', writeVersion: 1 })
  })

  it('does not let a delayed old response settle the newer generation', async () => {
    let release: (result: { data: null; error: null }) => void = () => {}
    state.hold = new Promise(resolve => { release = resolve })
    const trip = duplicateTrip(keralaTrip, 'owner-test')
    await tick()
    updateTrip(trip.id, { name: 'First' })
    const first = tripWriteReceipt(trip.id)
    await tick()
    updateTrip(trip.id, { name: 'Second' })
    const second = tripWriteReceipt(trip.id)
    await expect(first).resolves.toMatchObject({ kind: 'superseded' })
    state.hold = null
    release({ data: null, error: null })
    await expect(second).resolves.toMatchObject({ kind: 'acknowledged', writeVersion: 2 })
    expect(state.updates).toHaveLength(2)
  })

  it.each(['failure', 'malformed'] as const)('reports %s and retains the queued edit', async kind => {
    const trip = duplicateTrip(keralaTrip, 'owner-test')
    await tick()
    if (kind === 'failure') state.refuse = { message: 'offline' }
    else state.count = 0
    updateTrip(trip.id, { name: 'Unsaved' })
    const receipt = tripWriteReceipt(trip.id)
    await expect(receipt).resolves.toMatchObject({ kind: kind === 'failure' ? 'unavailable' : 'conflict' })
    expect((await pendingWrites()).some(write => write.tripId === trip.id)).toBe(true)
  })

  it('retries the same stored generation and payload after an uncertain failure', async () => {
    const trip = duplicateTrip(keralaTrip, 'owner-test')
    await tick()
    state.refuse = { message: 'connection lost' }
    updateTrip(trip.id, { name: 'Retry me' })
    await expect(tripWriteReceipt(trip.id)).resolves.toMatchObject({ kind: 'unavailable' })
    const saved = (await pendingWrites()).find(write => write.tripId === trip.id)
    expect(saved?.revision).toBeTruthy()
    state.refuse = null
    expect(await resolveQueuedTripWrite(trip.id, 'retry')).toBe(true)
    expect(state.updates).toHaveLength(2)
    expect(state.updates[1].payload).toEqual(state.updates[0].payload)
    expect(saved?.trip).toMatchObject({ name: 'Retry me' })
    await expect(tripWriteReceipt(trip.id)).resolves.toEqual({ kind: 'unavailable', revision: null })
  })

  it('reports a conflicting server baseline', async () => {
    const trip = duplicateTrip(keralaTrip, 'owner-test')
    await tick()
    const cached = tripById(trip.id)
    if (!cached) throw new Error('Missing trip')
    cached.writeVersion = 55
    updateTrip(trip.id, { name: 'Conflicting' })
    const receipt = tripWriteReceipt(trip.id)
    await expect(receipt).resolves.toMatchObject({ kind: 'conflict' })
    expect((await pendingWrites()).find(write => write.tripId === trip.id)?.state).toBe('conflict')
  })

  it('reports a server permission loss', async () => {
    const trip = duplicateTrip(keralaTrip, 'owner-test')
    await tick()
    state.deny = true
    updateTrip(trip.id, { name: 'Revoked' })
    await expect(tripWriteReceipt(trip.id)).resolves.toMatchObject({ kind: 'forbidden' })
    expect((await pendingWrites()).find(write => write.tripId === trip.id)?.reason).toBe('access-removed')
  })

  it('settles an in-flight observer on logout', async () => {
    let release: (result: { data: null; error: null }) => void = () => {}
    state.hold = new Promise(resolve => { release = resolve })
    const trip = duplicateTrip(keralaTrip, 'owner-test')
    await tick()
    updateTrip(trip.id, { name: 'Departing' })
    const receipt = tripWriteReceipt(trip.id)
    await tick()
    await logout()
    await expect(receipt).resolves.toMatchObject({ kind: 'unavailable' })
    release({ data: null, error: null })
    await tick()
  })

  it('settles a cancelled observer even if the transport never responds', async () => {
    state.hold = new Promise(() => {})
    const trip = duplicateTrip(keralaTrip, 'owner-test')
    await tick()
    updateTrip(trip.id, { name: 'Pending' })
    const receipt = tripWriteReceipt(trip.id)
    await tick()
    _cancelTripWrites()
    await expect(receipt).resolves.toMatchObject({ kind: 'unavailable' })
    expect((await pendingWrites()).some(write => write.tripId === trip.id)).toBe(true)
  })
})

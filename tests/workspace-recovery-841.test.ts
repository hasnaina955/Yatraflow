// #841 UI recovery: the workspace consumes the store's exact admission trace
// (trackTripPreview), pending state (tripPreviewPending) and late acknowledgement
// (observeTripPreview). These tests run the real exported workspace actions, the
// real store and the real queue logic. Only the Supabase transport, the in-memory
// queue backend and the toast are controlled.
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
    /** Holds the controlled queue-storage read after it took its snapshot. */
    queueHold: null as null | Promise<void>,
    /** Makes the controlled queue-storage read fail. */
    queueFail: false,
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
    builder.is = () => builder
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
    list: async () => { if (state.queueFail) throw new Error('queue read failed'); const snapshot = [...map.values()]; if (state.queueHold) await state.queueHold; return snapshot },
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

const { messages, undoToasts } = vi.hoisted(() => ({ messages: [] as string[], undoToasts: [] as Array<{ run: () => void }> }))
vi.mock('../src/components/ui', async importOriginal => ({
  ...await importOriginal<typeof import('../src/components/ui')>(),
  toast: (message: string) => { messages.push(message) },
  undoToast: (_message: string, run: () => void) => { undoToasts.push({ run }) },
}))

import {
  duplicateTrip, updateTrip, tripById, getSnapshot, _setTripWriteDebounceMs, _cancelTripWrites, resolveQueuedTripWrite, logout, subscribe,
} from '../src/store/store'
import { clearWritesFor, pendingWrites } from '../src/lib/writeQueue'
import { workspacePreviewActions, abandonPendingPreview, type PendingChange } from '../src/pages/TripWorkspace'
import { KEEP_UNCERTAIN_HOLD } from '../src/lib/previewChain'
import type { Trip } from '../src/data/types'

const tick = async () => { await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0)) }
const keralaTrip = seedData.trips[0]
const RECEIPT = expect.objectContaining({ kind: 'acknowledged', revision: expect.any(String), writeVersion: expect.any(Number) })

beforeEach(async () => {
  getSnapshot().sessionUserId = 'owner-test'
  _setTripWriteDebounceMs(0)
  await clearWritesFor('owner-test')
  state.updates.length = 0
  state.refuse = null
  state.hold = null
  state.count = undefined
  state.deny = false
  state.queueHold = null
  state.queueFail = false
  messages.length = 0
  undoToasts.length = 0
})
afterEach(() => { _cancelTripWrites(); state.hold = null; state.queueHold = null; state.queueFail = false })

function workspace(tripId: string) {
  const pendingRef: { current: PendingChange | null } = { current: null }
  const baseRef: { current: Trip | null } = { current: null }
  const setPending = vi.fn()
  let lastTrip: Trip | undefined
  const actions = () => {
    lastTrip = tripById(tripId) ?? lastTrip
    return workspacePreviewActions({ trip: lastTrip, pendingRef, baseRef, legCorrRef: { current: undefined }, setPending })
  }
  return { pendingRef, baseRef, setPending, actions }
}
const rename = (name: string) => (draft: Trip) => { draft.name = name }
const meta = (id: string, onDiscard?: () => void) => ({ id, onDiscard })
const newTrip = async () => { const t = duplicateTrip(keralaTrip, 'owner-test'); await tick(); return t }

/** A Keep whose first send failed: the write is on this device, not acknowledged. */
async function uncertainKeep(name: string, kept = vi.fn(), drop = vi.fn()) {
  const trip = await newTrip()
  const ws = workspace(trip.id)
  ws.actions().applyChange(rename(name), 'edit', 0, kept, meta('op-first', drop))
  state.refuse = { message: 'offline' }
  await expect(ws.actions().keepPending()).resolves.toEqual({ kind: 'unavailable', uncertain: true })
  state.refuse = null
  messages.length = 0
  return { trip, ws, kept, drop }
}

describe('a failed first save that Saved edits later saves (late acknowledgement)', () => {
  it('runs the captured callbacks once, with the real receipt, and never at the first failure', async () => {
    const { trip, ws, kept, drop } = await uncertainKeep('Late')
    expect(kept).not.toHaveBeenCalled()
    expect(ws.pendingRef.current?.uncertain).toBe(true)
    const sent = state.updates.length
    await expect(resolveQueuedTripWrite(trip.id, 'retry')).resolves.toBe(true)
    await tick()
    // One retry of the same stored write: no second writer was created.
    expect(state.updates).toHaveLength(sent + 1)
    expect(kept).toHaveBeenCalledTimes(1)
    expect(kept).toHaveBeenCalledWith(RECEIPT)
    expect(drop).not.toHaveBeenCalled()
    expect(ws.pendingRef.current).toBeNull()
    // Nothing runs a second time when the user presses Keep afterwards.
    await expect(ws.actions().keepPending()).resolves.toEqual({ kind: 'none' })
    expect(kept).toHaveBeenCalledTimes(1)
  })

  it('disposes the subscription once it settles', async () => {
    const { trip, ws } = await uncertainKeep('Cleanup')
    const watch = ws.pendingRef.current!.gate.watch!
    expect(watch.settled).toBe(false)
    expect(watch.subscription).not.toBeNull()
    await resolveQueuedTripWrite(trip.id, 'retry')
    await tick()
    expect(watch.settled).toBe(true)
    expect(watch.subscription).toBeNull()
    expect(watch.receipt).toEqual(RECEIPT)
    expect(ws.pendingRef.current).toBeNull()
  })

  it('a later chained edit stays open, keeps its own records, and never gets the earlier receipt', async () => {
    const early = vi.fn()
    const { trip, ws } = await uncertainKeep('Old', early)
    const lateKept = vi.fn()
    const lateDrop = vi.fn()
    ws.actions().applyChange(d => { d.coverEmoji = '🌊' }, 'edit', 0, lateKept, meta('op-late', lateDrop))
    const newer = ws.pendingRef.current!
    await resolveQueuedTripWrite(trip.id, 'retry')
    await tick()
    expect(early).toHaveBeenCalledTimes(1)
    expect(lateKept).not.toHaveBeenCalled()
    expect(lateDrop).not.toHaveBeenCalled()
    const after = ws.pendingRef.current
    expect(after?.proposed.coverEmoji).toBe('🌊')
    expect(after?.revision).toBe(newer.revision)
    expect(after?.operations.map(record => record.operationId)).toEqual(['op-late'])
    expect(after?.uncertain).toBe(false)
  })
})

describe('what is not proof (the preview stays held and no callback runs)', () => {
  it('a write that vanished from the durable queue without a decision is unknown, never resolved', async () => {
    const { ws, kept, drop } = await uncertainKeep('Vanished')
    await clearWritesFor('owner-test')
    await expect(ws.actions().removePending()).resolves.toBe(false)
    expect(messages).toEqual([KEEP_UNCERTAIN_HOLD])
    expect(ws.pendingRef.current).not.toBeNull()
    expect(kept).not.toHaveBeenCalled()
    expect(drop).not.toHaveBeenCalled()
  })

  it('a queue that cannot be read is unknown, never empty', async () => {
    const { ws, kept } = await uncertainKeep('Unreadable')
    state.queueFail = true
    await expect(ws.actions().removePending()).resolves.toBe(false)
    expect(messages).toEqual([KEEP_UNCERTAIN_HOLD])
    state.queueFail = false
    expect(ws.pendingRef.current?.uncertain).toBe(true)
    expect(kept).not.toHaveBeenCalled()
  })

  it('a newer generation from another edit cannot lend its receipt to the earlier Keep', async () => {
    const { trip, ws, kept } = await uncertainKeep('First')
    // Another writer saves the trip after the first Keep failed.
    expect(updateTrip(trip.id, { coverEmoji: '🌋' })).toBe(true)
    await tick()
    await tick()
    expect(kept).not.toHaveBeenCalled()
    expect(messages.join()).not.toMatch(/Change saved to your plan/)
    // The earlier Keep still claims nothing.
    await ws.actions().keepPending()
    expect(kept).not.toHaveBeenCalled()
  })
})

describe('leaving, switching trip and signing out', () => {
  it('a late acknowledgement after the user left the trip still runs the captured callbacks once', async () => {
    const { trip, ws, kept, drop } = await uncertainKeep('Left')
    expect(abandonPendingPreview(ws)).toBe('uncertain')
    expect(ws.pendingRef.current).toBeNull()
    await resolveQueuedTripWrite(trip.id, 'retry')
    await tick()
    expect(kept).toHaveBeenCalledTimes(1)
    expect(kept).toHaveBeenCalledWith(RECEIPT)
    expect(drop).not.toHaveBeenCalled()
  })

  it('signing out settles the subscription without a callback, so no later account gets the success', async () => {
    const { trip, ws, kept, drop } = await uncertainKeep('Logout')
    const watch = ws.pendingRef.current!.gate.watch!
    await logout()
    getSnapshot().sessionUserId = 'owner-test'
    await tick()
    await resolveQueuedTripWrite(trip.id, 'retry')
    await tick()
    expect(kept).not.toHaveBeenCalled()
    expect(drop).not.toHaveBeenCalled()
    expect(watch.receipt).toBeNull()
    expect(messages.join()).not.toMatch(/Change saved to your plan/)
  })
})

describe('the exact admission trace replaces the cache guess', () => {
  it('a stale result before any admission releases only never-admitted records', async () => {
    const trip = await newTrip()
    const ws = workspace(trip.id)
    const kept = vi.fn()
    const drop = vi.fn()
    ws.actions().applyChange(rename('Stale'), 'edit', 0, kept, meta('op-stale', drop))
    // A direct write lands while the preview is open, so Keep is refused as stale.
    updateTrip(trip.id, { coverEmoji: '🏔️' })
    await tick()
    await expect(ws.actions().keepPending()).resolves.toEqual({ kind: 'stale' })
    expect(kept).not.toHaveBeenCalled()
    expect(ws.pendingRef.current?.gate.watch).toBeNull()
    // Never admitted: Remove may discard it again.
    expect(ws.actions().removePending()).toBe(true)
    expect(drop).toHaveBeenCalledTimes(1)
  })

  it('a superseded admission was admitted: it stays uncertain, runs no callback and Remove waits', async () => {
    const trip = await newTrip()
    const ws = workspace(trip.id)
    const kept = vi.fn()
    const drop = vi.fn()
    ws.actions().applyChange(rename('Preview'), 'edit', 0, kept, meta('op-superseded', drop))
    // A synchronous subscriber queues a newer generation while Keep admits, so
    // this Keep has no sender of its own. Every field it proposed now differs,
    // which a cache comparison would read as "never written".
    const unsubscribe = subscribe(() => {
      if (tripById(trip.id)?.name === 'Preview') updateTrip(trip.id, { name: 'Different', travellers: 2 })
    })
    let outcome: Awaited<ReturnType<ReturnType<ReturnType<typeof workspace>['actions']>['keepPending']>>
    try { outcome = await ws.actions().keepPending() } finally { unsubscribe() }
    expect(outcome).toEqual({ kind: 'superseded', uncertain: true })
    await tick()
    expect(tripById(trip.id)?.name).toBe('Different')
    expect(kept).not.toHaveBeenCalled()
    expect(drop).not.toHaveBeenCalled()
    expect(ws.pendingRef.current?.uncertain).toBe(true)
    // Remove must not claim a discard of a write that may be on this device.
    messages.length = 0
    await expect(ws.actions().removePending()).resolves.toBe(false)
    expect(messages).toContain(KEEP_UNCERTAIN_HOLD)
    expect(drop).not.toHaveBeenCalled()
  })
})

describe('a write proven discarded in Saved edits runs the proven-abandoned settlement once', () => {
  it('fires onStoreDiscarded once, never onDiscard/onKept, and cannot double-settle', async () => {
    const trip = await newTrip()
    const ws = workspace(trip.id)
    const kept = vi.fn()
    const drop = vi.fn()
    const storeDiscarded = vi.fn()
    ws.actions().applyChange(rename('Discard me'), 'edit', 0, kept, {
      id: 'op-proven', onDiscard: drop, onStoreDiscarded: storeDiscarded,
    })
    state.refuse = { message: 'offline' }
    await ws.actions().keepPending()
    state.refuse = null
    const watch = ws.pendingRef.current!.gate.watch!
    expect(watch.settled).toBe(false)
    messages.length = 0

    await expect(resolveQueuedTripWrite(trip.id, 'discard')).resolves.toBe(true)
    await tick()
    expect(storeDiscarded, 'the exact captured record must be notified').toHaveBeenCalledTimes(1)
    expect(kept, 'no acknowledged success may be claimed').not.toHaveBeenCalled()
    expect(drop, 'an attempted save must not get the ordinary onDiscard').not.toHaveBeenCalled()
    expect(watch.settled).toBe(true)
    expect(watch.subscription).toBeNull()

    // A late foreign observation (identity switch) and a second discard cannot
    // fire any callback twice: the settled watch is disposed.
    await logout()
    getSnapshot().sessionUserId = 'owner-test'
    await tick()
    await resolveQueuedTripWrite(trip.id, 'discard')
    await tick()
    expect(storeDiscarded).toHaveBeenCalledTimes(1)
    expect(kept).not.toHaveBeenCalled()
    expect(drop).not.toHaveBeenCalled()
  })

  it('an unknown disappearance does NOT run the proven-discard settlement', async () => {
    const trip = await newTrip()
    const ws = workspace(trip.id)
    const storeDiscarded = vi.fn()
    ws.actions().applyChange(rename('Vanished'), 'edit', 0, undefined, {
      id: 'op-unknown', onStoreDiscarded: storeDiscarded,
    })
    state.refuse = { message: 'offline' }
    await ws.actions().keepPending()
    state.refuse = null
    await clearWritesFor('owner-test')
    messages.length = 0
    await expect(ws.actions().removePending()).resolves.toBe(false)
    expect(messages).toContain(KEEP_UNCERTAIN_HOLD)
    expect(storeDiscarded, 'unknown is not proven-discarded').not.toHaveBeenCalled()
    expect(ws.pendingRef.current).not.toBeNull()
  })
})

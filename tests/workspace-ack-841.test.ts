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

const { messages, undoToasts } = vi.hoisted(() => ({ messages: [] as string[], undoToasts: [] as Array<{ run: () => void }> }))
vi.mock('../src/components/ui', async importOriginal => ({
  ...await importOriginal<typeof import('../src/components/ui')>(),
  toast: (message: string) => { messages.push(message) },
  undoToast: (_message: string, run: () => void) => { undoToasts.push({ run }) },
}))

import {
  duplicateTrip, updateTrip, tripById, getSnapshot, _setTripWriteDebounceMs, _cancelTripWrites,
} from '../src/store/store'
import { clearWritesFor, pendingWrites } from '../src/lib/writeQueue'
import { workspacePreviewActions, type PendingChange } from '../src/pages/TripWorkspace'
import { KEEP_IN_FLIGHT } from '../src/lib/previewChain'
import type { Trip } from '../src/data/types'

const tick = async () => { await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0)) }
const keralaTrip = seedData.trips[0]
/** The actual receipt fields a successful Keep reports. */
const ACK = { kind: 'acknowledged', revision: expect.any(String), writeVersion: expect.any(Number) }

beforeEach(async () => {
  getSnapshot().sessionUserId = 'owner-test'
  _setTripWriteDebounceMs(0)
  await clearWritesFor('owner-test')
  state.updates.length = 0
  state.refuse = null
  state.hold = null
  state.count = undefined
  state.deny = false
  messages.length = 0
  undoToasts.length = 0
})
afterEach(() => { _cancelTripWrites(); _setTripWriteDebounceMs(0) })

/** One workspace over the real exported actions. Like the component, every call
 *  rebuilds the actions from the CURRENT cached trip. */
function workspace(tripId: string) {
  const pendingRef: { current: PendingChange | null } = { current: null }
  const baseRef: { current: Trip | null } = { current: null }
  const setPending = vi.fn()
  const actions = () => workspacePreviewActions({
    trip: tripById(tripId), pendingRef, baseRef, legCorrRef: { current: undefined }, setPending,
  })
  return { pendingRef, baseRef, setPending, actions }
}
const rename = (name: string) => (draft: Trip) => { draft.name = name }
const hold = () => {
  let release: () => void = () => {}
  state.hold = new Promise(resolve => { release = () => resolve({ data: null, error: null }) })
  return () => release()
}
const newTrip = async () => { const t = duplicateTrip(keralaTrip, 'owner-test'); await tick(); return t }

describe('workspace Keep waits for a validated acknowledgement', () => {
  it('runs nothing and clears nothing while the save is held, then acts once', async () => {
    const trip = await newTrip()
    const ws = workspace(trip.id)
    const kept = vi.fn()
    ws.actions().applyChange(rename('Held'), 'edit', 0, kept)
    const release = hold()
    const keep = ws.actions().keepPending()
    await tick()
    expect(kept).not.toHaveBeenCalled()
    expect(ws.pendingRef.current?.busy).toBe(true)
    expect(messages).toEqual([])
    release()
    await expect(keep).resolves.toEqual(ACK)
    expect(kept).toHaveBeenCalledTimes(1)
    expect(ws.pendingRef.current).toBeNull()
    expect(ws.baseRef.current).toBeNull()
    expect(state.updates).toHaveLength(1)
    expect(tripById(trip.id)?.name).toBe('Held')
    // The callback owns the announcement, so no generic toast is added.
    expect(messages).toEqual([])
  })

  it('announces the save only after the acknowledgement when no callback exists', async () => {
    const trip = await newTrip()
    const ws = workspace(trip.id)
    ws.actions().applyChange(rename('Plain'), 'edit', 0)
    const release = hold()
    const keep = ws.actions().keepPending()
    await tick()
    expect(messages).toEqual([])
    release()
    await keep
    expect(messages).toEqual(['Change saved to your plan'])
  })

  it('composes every operation callback, and a throwing callback blocks neither its peers nor cleanup', async () => {
    const trip = await newTrip()
    const ws = workspace(trip.id)
    const calls: string[] = []
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    ws.actions().applyChange(rename('One'), 'edit', 0, () => { calls.push('first') })
    ws.actions().applyChange(d => { d.days[0].title = 'Chained' }, 'edit', 0, () => { calls.push('boom'); throw new Error('callback failed') })
    ws.actions().applyChange(d => { d.coverEmoji = '🌊' }, 'edit', 0, () => { calls.push('third') })
    expect(ws.pendingRef.current?.operations).toHaveLength(3)
    expect(ws.pendingRef.current?.proposed.name).toBe('One')
    expect(ws.pendingRef.current?.proposed.days[0].title).toBe('Chained')
    await expect(ws.actions().keepPending()).resolves.toEqual(ACK)
    expect(calls).toEqual(['first', 'boom', 'third'])
    expect(ws.pendingRef.current).toBeNull()
    err.mockRestore()
    // Nothing is stuck: the next preview stages and keeps normally.
    ws.actions().applyChange(rename('Next'), 'edit', 0)
    await expect(ws.actions().keepPending()).resolves.toEqual(ACK)
    expect(calls).toEqual(['first', 'boom', 'third'])
  })

  it('keeps the preview and every callback when the save fails, and frees the busy state', async () => {
    const trip = await newTrip()
    const ws = workspace(trip.id)
    const kept = vi.fn()
    ws.actions().applyChange(rename('Fails'), 'edit', 0, kept)
    state.refuse = { message: 'offline' }
    const outcome = await ws.actions().keepPending()
    expect(outcome.kind).toBe('unavailable')
    expect(kept).not.toHaveBeenCalled()
    expect(ws.pendingRef.current?.proposed.name).toBe('Fails')
    expect(ws.pendingRef.current?.busy).toBe(false)
    expect(ws.pendingRef.current?.gate.inFlight).toBeNull()
    // The store speaks its own recovery line; Keep adds that the preview is kept.
    expect(messages.some(m => m.includes('Your preview is kept'))).toBe(true)
    expect(messages.join()).not.toMatch(/saved to your plan/i)
  })

  it('keeps the preview when earlier queued work is in conflict', async () => {
    const trip = await newTrip()
    const current = tripById(trip.id)!
    current.writeVersion = 55
    updateTrip(trip.id, { name: 'Existing' })
    await tick()
    const ws = workspace(trip.id)
    const kept = vi.fn()
    ws.actions().applyChange(rename('Blocked'), 'edit', 0, kept)
    const before = (await pendingWrites()).find(write => write.tripId === trip.id)
    const outcome = await ws.actions().keepPending()
    expect(outcome.kind).toBe('conflict')
    expect(kept).not.toHaveBeenCalled()
    expect(ws.pendingRef.current?.proposed.name).toBe('Blocked')
    expect(ws.pendingRef.current?.busy).toBe(false)
    expect((await pendingWrites()).find(write => write.tripId === trip.id)).toEqual(before)
    expect(tripById(trip.id)?.name).toBe('Existing')
  })

  it('a repeated Keep joins the write in flight instead of starting another', async () => {
    const trip = await newTrip()
    const ws = workspace(trip.id)
    const kept = vi.fn()
    ws.actions().applyChange(rename('Once'), 'edit', 0, kept)
    const release = hold()
    const first = ws.actions().keepPending()
    const second = ws.actions().keepPending()
    expect(second).toBe(first)
    await tick()
    release()
    await Promise.all([first, second])
    expect(state.updates).toHaveLength(1)
    expect(kept).toHaveBeenCalledTimes(1)
  })

  it('refuses Remove while a Keep is in flight and never says discarded', async () => {
    const trip = await newTrip()
    const ws = workspace(trip.id)
    const kept = vi.fn()
    ws.actions().applyChange(rename('Racing'), 'edit', 0, kept)
    const release = hold()
    const keep = ws.actions().keepPending()
    await tick()
    expect(ws.actions().removePending()).toBe(false)
    expect(ws.pendingRef.current).not.toBeNull()
    expect(messages).toEqual([KEEP_IN_FLIGHT])
    expect(messages.join()).not.toMatch(/discarded/i)
    release()
    await keep
    expect(kept).toHaveBeenCalledTimes(1)
    expect(ws.pendingRef.current).toBeNull()
  })

  it('a discard before Keep releases the operations and writes nothing', async () => {
    const trip = await newTrip()
    const ws = workspace(trip.id)
    const kept = vi.fn()
    ws.actions().applyChange(rename('Never'), 'edit', 0, kept)
    expect(ws.actions().removePending()).toBe(true)
    expect(messages).toEqual(['Change discarded'])
    await expect(ws.actions().keepPending()).resolves.toEqual({ kind: 'none' })
    expect(kept).not.toHaveBeenCalled()
    expect(state.updates).toHaveLength(0)
    expect(tripById(trip.id)?.name).toBe(trip.name)
  })

  it('refuses a stale base without a write and keeps the preview', async () => {
    const trip = await newTrip()
    const ws = workspace(trip.id)
    const kept = vi.fn()
    const notified = vi.fn()
    ws.actions().applyChange(rename('Staged'), 'edit', 0, kept, { id: 'op-stale', onUncertain: notified })
    updateTrip(trip.id, { name: 'Crew edit' })
    await tick()
    state.updates.length = 0
    await expect(ws.actions().keepPending()).resolves.toEqual({ kind: 'stale' })
    expect(state.updates).toHaveLength(0)
    expect(kept).not.toHaveBeenCalled()
    // A refusal before any admission is not uncertainty: nothing was captured,
    // so no operation may be told that its write might be saved.
    expect(notified).not.toHaveBeenCalled()
    expect(ws.pendingRef.current?.proposed.name).toBe('Staged')
    expect(tripById(trip.id)?.name).toBe('Crew edit')
    expect(messages).toEqual([expect.stringContaining('plan changed while you were reviewing')])
  })

  it('captures a detached complete base when staging starts', async () => {
    const trip = await newTrip()
    const ws = workspace(trip.id)
    ws.actions().applyChange(rename('Detached'), 'edit', 0)
    const base = ws.pendingRef.current!.base
    expect(base).toEqual(tripById(trip.id))
    expect(base).not.toBe(tripById(trip.id))
    ws.actions().applyChange(d => { d.coverEmoji = '🌊' }, 'edit', 0)
    expect(ws.pendingRef.current!.base).toBe(base)
  })
})

describe('an old response never overwrites a newer preview', () => {
  it('a late acknowledgement runs its own callbacks and leaves the newer preview alone', async () => {
    const first = await newTrip()
    const second = await newTrip()
    const ws = workspace(first.id)
    const oldKept = vi.fn()
    ws.actions().applyChange(rename('Old'), 'edit', 0, oldKept)
    const release = hold()
    const keep = ws.actions().keepPending()
    await tick()
    // The user left the trip: the workspace drops the preview, then stages another.
    ws.actions().stage(null)
    const other = workspacePreviewActions({
      trip: tripById(second.id), pendingRef: ws.pendingRef, baseRef: ws.baseRef, legCorrRef: { current: undefined }, setPending: ws.setPending,
    })
    const newKept = vi.fn()
    other.applyChange(rename('New'), 'edit', 0, newKept)
    const newer = ws.pendingRef.current
    release()
    await expect(keep).resolves.toEqual(ACK)
    expect(oldKept).toHaveBeenCalledTimes(1)
    expect(newKept).not.toHaveBeenCalled()
    expect(ws.pendingRef.current).toBe(newer)
    expect(ws.pendingRef.current?.busy).toBeFalsy()
    expect(ws.pendingRef.current?.proposed.name).toBe('New')
  })

  it('a late failure neither clears nor flags the newer preview', async () => {
    const first = await newTrip()
    const second = await newTrip()
    const ws = workspace(first.id)
    const oldKept = vi.fn()
    ws.actions().applyChange(rename('Old'), 'edit', 0, oldKept)
    let fail: () => void = () => {}
    state.hold = new Promise(resolve => { fail = () => resolve({ data: null, error: { message: 'offline' } } as never) })
    const keep = ws.actions().keepPending()
    await tick()
    ws.actions().stage(null)
    const other = workspacePreviewActions({
      trip: tripById(second.id), pendingRef: ws.pendingRef, baseRef: ws.baseRef, legCorrRef: { current: undefined }, setPending: ws.setPending,
    })
    other.applyChange(rename('New'), 'edit', 0)
    const newer = ws.pendingRef.current
    fail()
    expect((await keep).kind).not.toBe('acknowledged')
    expect(oldKept).not.toHaveBeenCalled()
    expect(ws.pendingRef.current).toBe(newer)
  })

  it('an edit chained while Keep is in flight survives the acknowledgement, minus the saved operations', async () => {
    const trip = await newTrip()
    const ws = workspace(trip.id)
    const early = vi.fn()
    const late = vi.fn()
    ws.actions().applyChange(rename('Early'), 'edit', 0, early)
    const release = hold()
    const keep = ws.actions().keepPending()
    await tick()
    ws.actions().applyChange(d => { d.coverEmoji = '🌊' }, 'edit', 0, late)
    release()
    await expect(keep).resolves.toEqual(ACK)
    expect(early).toHaveBeenCalledTimes(1)
    expect(late).not.toHaveBeenCalled()
    const remaining = ws.pendingRef.current!
    expect(remaining.operations).toHaveLength(1)
    expect(remaining.busy).toBe(false)
    // Its base is behind the saved plan, so Keep refuses instead of overwriting.
    await expect(ws.actions().keepPending()).resolves.toEqual({ kind: 'stale' })
    expect(late).not.toHaveBeenCalled()
  })
})

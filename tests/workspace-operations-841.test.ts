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
    list: async () => { const snapshot = [...map.values()]; if (state.queueHold) await state.queueHold; return snapshot },
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
  duplicateTrip, updateTrip, tripById, getSnapshot, _setTripWriteDebounceMs, _cancelTripWrites, resolveQueuedTripWrite,
} from '../src/store/store'
import { clearWritesFor, pendingWrites } from '../src/lib/writeQueue'
import { workspacePreviewActions, abandonPendingPreview, type PendingChange } from '../src/pages/TripWorkspace'
import {
  KEEP_CLOSED_UNCERTAIN, KEEP_IN_FLIGHT, KEEP_LEFT_BEHIND, KEEP_UNCERTAIN, KEEP_UNCERTAIN_HOLD, KEEP_UNCERTAIN_RESOLVED,
} from '../src/lib/previewChain'
import { ImpactPreviewPanel } from '../src/components/ImpactPreview'
import { computeImpact } from '../src/lib/impact'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Trip } from '../src/data/types'

const tick = async () => { await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0)) }
const keralaTrip = seedData.trips[0]
/** The actual receipt fields a successful Keep reports. */
/** The existing Saved edits path: an explicit discard of this trip's held write. The
 *  store records it against the exact generation, so the answer is `discarded`, not
 *  a write that merely vanished from the queue (which stays unknown). */
const savedEditsDiscards = (tripId: string) => resolveQueuedTripWrite(tripId, 'discard')
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
  state.queueHold = null
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
  // An explicit Saved edits discard removes the local copy from the cache, as it
  // does for the real page. The harness keeps the last trip it saw so the actions
  // under test can still stage and keep, which the mounted component would also
  // still hold until it unmounts.
  let lastTrip: Trip | undefined
  const actions = () => {
    lastTrip = tripById(tripId) ?? lastTrip
    return workspacePreviewActions({ trip: lastTrip, pendingRef, baseRef, legCorrRef: { current: undefined }, setPending })
  }
  return { pendingRef, baseRef, setPending, actions }
}
const rename = (name: string) => (draft: Trip) => { draft.name = name }
const hold = () => {
  let release: () => void = () => {}
  state.hold = new Promise(resolve => { release = () => resolve({ data: null, error: null }) })
  return () => release()
}
const newTrip = async () => { const t = duplicateTrip(keralaTrip, 'owner-test'); await tick(); return t }


// The staged-lifecycle cases below run the real exported workspace actions, the
// real store admission and the real queue logic. Only the Supabase transport,
// the in-memory queue backend and the toast are controlled.

const RECEIPT_ONLY = expect.objectContaining({ kind: 'acknowledged', revision: expect.any(String), writeVersion: expect.any(Number) })
const meta = (id: string, onDiscard?: () => void) => ({ id, onDiscard })

describe('a Keep callback receives the actual acknowledged receipt', () => {
  it('hands the same validated receipt to every callback, only after the held save settles', async () => {
    const trip = await newTrip()
    const ws = workspace(trip.id)
    const first = vi.fn()
    const second = vi.fn()
    ws.actions().applyChange(rename('Receipt'), 'edit', 0, first, meta('op-1'))
    ws.actions().applyChange(d => { d.coverEmoji = '🌊' }, 'edit', 0, second, meta('op-2'))
    const release = hold()
    const keep = ws.actions().keepPending()
    await tick()
    expect(first).not.toHaveBeenCalled()
    expect(second).not.toHaveBeenCalled()
    release()
    const outcome = await keep
    expect(outcome).toEqual(ACK)
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
    expect(first).toHaveBeenCalledWith(RECEIPT_ONLY)
    const receipt = first.mock.calls[0]![0]
    expect(Number.isInteger(receipt.writeVersion) && receipt.writeVersion >= 0).toBe(true)
    expect(receipt.revision.length).toBeGreaterThan(0)
    // Both operations rode one write and saw the identical receipt.
    expect(second.mock.calls[0]![0]).toEqual(receipt)
    expect(outcome).toEqual({ kind: 'acknowledged', revision: receipt.revision, writeVersion: receipt.writeVersion })
    expect(state.updates).toHaveLength(1)
  })

  it('never fabricates a receipt: a failed save hands nothing to any callback', async () => {
    const trip = await newTrip()
    const ws = workspace(trip.id)
    const kept = vi.fn()
    ws.actions().applyChange(rename('Nope'), 'edit', 0, kept, meta('op-x'))
    state.refuse = { message: 'offline' }
    await ws.actions().keepPending()
    expect(kept).not.toHaveBeenCalled()
  })
})

describe('discard callbacks run only for a proposal that was never admitted', () => {
  it('a discard before Keep runs each discard once, writes nothing and runs no Keep callback', async () => {
    const trip = await newTrip()
    const ws = workspace(trip.id)
    const kept = vi.fn()
    const dropA = vi.fn()
    const dropB = vi.fn()
    ws.actions().applyChange(rename('Never'), 'edit', 0, kept, meta('op-a', dropA))
    // An onDiscard-only operation still owns a record.
    ws.actions().applyChange(d => { d.coverEmoji = '🌊' }, 'edit', 0, undefined, meta('op-b', dropB))
    expect(ws.pendingRef.current?.operations).toHaveLength(2)
    expect(ws.actions().removePending()).toBe(true)
    expect(dropA).toHaveBeenCalledTimes(1)
    expect(dropB).toHaveBeenCalledTimes(1)
    expect(kept).not.toHaveBeenCalled()
    expect(state.updates).toHaveLength(0)
    expect(tripById(trip.id)?.name).toBe(trip.name)
    expect(messages).toEqual(['Change discarded'])
    await expect(ws.actions().keepPending()).resolves.toEqual({ kind: 'none' })
  })

  it('a throwing discard callback blocks neither its peers nor the removal', async () => {
    const trip = await newTrip()
    const ws = workspace(trip.id)
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const calls: string[] = []
    ws.actions().applyChange(rename('One'), 'edit', 0, undefined, meta('op-1', () => { calls.push('one') }))
    ws.actions().applyChange(d => { d.coverEmoji = '🌊' }, 'edit', 0, undefined, meta('op-2', () => { calls.push('two'); throw new Error('boom') }))
    ws.actions().applyChange(d => { d.days[0].title = 'T' }, 'edit', 0, undefined, meta('op-3', () => { calls.push('three') }))
    expect(ws.actions().removePending()).toBe(true)
    err.mockRestore()
    expect(calls).toEqual(['one', 'two', 'three'])
    expect(ws.pendingRef.current).toBeNull()
    // Nothing is stuck.
    ws.actions().applyChange(rename('Next'), 'edit', 0)
    await expect(ws.actions().keepPending()).resolves.toEqual(ACK)
  })

  it('a stable operation id staged twice keeps one record, so its callbacks run once', async () => {
    const trip = await newTrip()
    const ws = workspace(trip.id)
    const kept = vi.fn()
    const again = vi.fn()
    const drop = vi.fn()
    ws.actions().applyChange(rename('Twice'), 'edit', 0, kept, meta('same', drop))
    ws.actions().applyChange(d => { d.coverEmoji = '🌊' }, 'edit', 0, again, meta('same', drop))
    expect(ws.pendingRef.current?.operations).toHaveLength(1)
    await expect(ws.actions().keepPending()).resolves.toEqual(ACK)
    expect(kept).toHaveBeenCalledTimes(1)
    expect(again).not.toHaveBeenCalled()
    expect(drop).not.toHaveBeenCalled()
  })

  it('a refused save that never reached the cache keeps the records, and a later Remove then discards', async () => {
    const trip = await newTrip()
    const current = tripById(trip.id)!
    current.writeVersion = 55
    updateTrip(trip.id, { name: 'Existing' })
    await tick()
    const ws = workspace(trip.id)
    const kept = vi.fn()
    const drop = vi.fn()
    ws.actions().applyChange(rename('Blocked'), 'edit', 0, kept, meta('op-blocked', drop))
    const outcome = await ws.actions().keepPending()
    // The earlier queued work stopped the admission before any cache write.
    expect(outcome).toEqual({ kind: 'conflict' })
    expect(tripById(trip.id)?.name).toBe('Existing')
    expect(drop).not.toHaveBeenCalled()
    expect(kept).not.toHaveBeenCalled()
    expect(ws.pendingRef.current?.operations[0]?.state).toBe('staged')
    expect(ws.pendingRef.current?.uncertain).toBeFalsy()
    // The change was never admitted, so an explicit Remove is a true discard.
    expect(ws.actions().removePending()).toBe(true)
    expect(drop).toHaveBeenCalledTimes(1)
    expect(kept).not.toHaveBeenCalled()
  })
})

describe('an uncertain save is never claimed as unwritten', () => {
  it('flags the save, keeps every record and refuses a Remove while Saved edits holds the write', async () => {
    const trip = await newTrip()
    const ws = workspace(trip.id)
    const kept = vi.fn()
    const drop = vi.fn()
    ws.actions().applyChange(rename('Maybe'), 'edit', 0, kept, meta('op-maybe', drop))
    state.refuse = { message: 'offline' }
    const outcome = await ws.actions().keepPending()
    expect(outcome).toEqual({ kind: 'unavailable', uncertain: true })
    // The store wrote its cache before it sent, so the change is on this device.
    expect(tripById(trip.id)?.name).toBe('Maybe')
    expect((await pendingWrites()).some(write => write.tripId === trip.id)).toBe(true)
    expect(ws.pendingRef.current?.uncertain).toBe(true)
    expect(ws.pendingRef.current?.busy).toBe(false)
    expect(messages).toContain(KEEP_UNCERTAIN)
    expect(messages.join()).not.toMatch(/try Keep again/i)
    messages.length = 0
    const sent = state.updates.length

    // Keep must not retry blindly.
    state.refuse = null
    await expect(ws.actions().keepPending()).resolves.toEqual({ kind: 'conflict', uncertain: true })
    expect(state.updates).toHaveLength(sent)
    expect(messages).toEqual([KEEP_UNCERTAIN_HOLD])
    messages.length = 0

    // Remove must neither discard nor release a reservation.
    await expect(ws.actions().removePending()).resolves.toBe(false)
    expect(drop).not.toHaveBeenCalled()
    expect(kept).not.toHaveBeenCalled()
    expect(ws.pendingRef.current).not.toBeNull()
    expect(ws.pendingRef.current?.operations[0]?.state).toBe('staged')
    expect(messages).toEqual([KEEP_UNCERTAIN_HOLD])
    expect(messages.join()).not.toMatch(/discarded/i)
    expect(state.updates).toHaveLength(sent)
  })

  it('notifies the captured operation once, and a repeated Keep is a Saved edits read, not a second notification', async () => {
    const trip = await newTrip()
    const ws = workspace(trip.id)
    const notified = vi.fn()
    ws.actions().applyChange(rename('Notify once'), 'edit', 0, vi.fn(), { id: 'op-notify', onUncertain: notified })
    state.refuse = { message: 'offline' }
    await expect(ws.actions().keepPending()).resolves.toEqual({ kind: 'unavailable', uncertain: true })
    expect(notified, 'an admitted unconfirmed write notifies its captured operation').toHaveBeenCalledTimes(1)
    expect(ws.pendingRef.current?.operations[0]?.uncertainNotified).toBe(true)
    state.refuse = null
    messages.length = 0
    // Keep after uncertainty reads Saved edits; it never admits twice and never
    // sends a second uncertainty notification.
    await expect(ws.actions().keepPending()).resolves.toEqual({ kind: 'conflict', uncertain: true })
    expect(notified).toHaveBeenCalledTimes(1)
    expect(messages).toEqual([KEEP_UNCERTAIN_HOLD])
  })

  it('once Saved edits no longer holds the write, Remove closes the preview without a discard claim', async () => {
    const trip = await newTrip()
    const ws = workspace(trip.id)
    const kept = vi.fn()
    const drop = vi.fn()
    ws.actions().applyChange(rename('Resolved'), 'edit', 0, kept, meta('op-resolved', drop))
    state.refuse = { message: 'offline' }
    await ws.actions().keepPending()
    state.refuse = null
    messages.length = 0
    // The existing Saved edits path decided; the durable queue no longer holds the trip.
    await savedEditsDiscards(trip.id)
    await expect(ws.actions().removePending()).resolves.toBe(true)
    expect(ws.pendingRef.current).toBeNull()
    expect(messages).toEqual([KEEP_CLOSED_UNCERTAIN])
    expect(messages.join()).not.toMatch(/discarded/i)
    // Nothing can say whether it was saved, so no callback of either kind ran.
    expect(drop).not.toHaveBeenCalled()
    expect(kept).not.toHaveBeenCalled()
  })

  it('Keep after Saved edits resolved the write says so and still does not write', async () => {
    const trip = await newTrip()
    const ws = workspace(trip.id)
    ws.actions().applyChange(rename('Resolved'), 'edit', 0, vi.fn(), meta('op-r', vi.fn()))
    state.refuse = { message: 'offline' }
    await ws.actions().keepPending()
    state.refuse = null
    await savedEditsDiscards(trip.id)
    messages.length = 0
    const sent = state.updates.length
    await expect(ws.actions().keepPending()).resolves.toEqual({ kind: 'stale', uncertain: true })
    expect(state.updates).toHaveLength(sent)
    expect(messages).toEqual([KEEP_UNCERTAIN_RESOLVED])
    expect(ws.pendingRef.current?.uncertain).toBe(false)
  })

})

describe('busy state follows the real save', () => {
  it('is busy while held, refuses Remove without a discard callback, and is idle after the receipt', async () => {
    const trip = await newTrip()
    const ws = workspace(trip.id)
    const kept = vi.fn()
    const drop = vi.fn()
    ws.actions().applyChange(rename('Busy'), 'edit', 0, kept, meta('op-busy', drop))
    expect(ws.pendingRef.current?.busy).toBeFalsy()
    const release = hold()
    const keep = ws.actions().keepPending()
    await tick()
    expect(ws.pendingRef.current?.busy).toBe(true)
    expect(ws.actions().keepPending()).toBe(keep)
    expect(ws.actions().removePending()).toBe(false)
    expect(drop).not.toHaveBeenCalled()
    expect(messages).toEqual([KEEP_IN_FLIGHT])
    release()
    await keep
    expect(kept).toHaveBeenCalledTimes(1)
    expect(drop).not.toHaveBeenCalled()
    expect(ws.pendingRef.current).toBeNull()
    expect(state.updates).toHaveLength(1)
  })

  it('a failed save releases the busy state so the day stays usable', async () => {
    const trip = await newTrip()
    const ws = workspace(trip.id)
    ws.actions().applyChange(rename('Busy fail'), 'edit', 0, vi.fn(), meta('op-bf', vi.fn()))
    state.refuse = { message: 'offline' }
    await ws.actions().keepPending()
    expect(ws.pendingRef.current?.busy).toBe(false)
    expect(ws.pendingRef.current?.gate.inFlight).toBeNull()
  })
})

describe('chained operations and late responses keep their own ownership', () => {
  it('an operation chained during flight keeps its own records after the first is acknowledged', async () => {
    const trip = await newTrip()
    const ws = workspace(trip.id)
    const early = vi.fn()
    const lateKept = vi.fn()
    const lateDrop = vi.fn()
    ws.actions().applyChange(rename('Early'), 'edit', 0, early, meta('op-early', vi.fn()))
    const release = hold()
    const keep = ws.actions().keepPending()
    await tick()
    ws.actions().applyChange(d => { d.coverEmoji = '🌊' }, 'edit', 0, lateKept, meta('op-late', lateDrop))
    release()
    await expect(keep).resolves.toEqual(ACK)
    expect(early).toHaveBeenCalledTimes(1)
    expect(lateKept).not.toHaveBeenCalled()
    const remaining = ws.pendingRef.current!
    expect(remaining.operations.map(record => record.operationId)).toEqual(['op-late'])
    expect(remaining.busy).toBe(false)
    // The late operation was never admitted: Remove discards only that one.
    expect(ws.actions().removePending()).toBe(true)
    expect(lateDrop).toHaveBeenCalledTimes(1)
    expect(lateKept).not.toHaveBeenCalled()
  })

  it('a late acknowledgement runs only its own callbacks and leaves a new independent preview alone', async () => {
    const first = await newTrip()
    const second = await newTrip()
    const ws = workspace(first.id)
    const oldKept = vi.fn()
    const oldDrop = vi.fn()
    ws.actions().applyChange(rename('Old'), 'edit', 0, oldKept, meta('op-old', oldDrop))
    const release = hold()
    const keep = ws.actions().keepPending()
    await tick()
    // The user left the trip while the save was in flight.
    expect(abandonPendingPreview(ws)).toBe('saving')
    expect(oldDrop).not.toHaveBeenCalled()
    const other = workspacePreviewActions({
      trip: tripById(second.id), pendingRef: ws.pendingRef, baseRef: ws.baseRef, legCorrRef: { current: undefined }, setPending: ws.setPending,
    })
    const newKept = vi.fn()
    const newDrop = vi.fn()
    other.applyChange(rename('New'), 'edit', 0, newKept, meta('op-new', newDrop))
    const newer = ws.pendingRef.current
    release()
    await expect(keep).resolves.toEqual(ACK)
    expect(oldKept).toHaveBeenCalledTimes(1)
    expect(oldKept).toHaveBeenCalledWith(RECEIPT_ONLY)
    expect(newKept).not.toHaveBeenCalled()
    expect(newDrop).not.toHaveBeenCalled()
    expect(oldDrop).not.toHaveBeenCalled()
    expect(ws.pendingRef.current).toBe(newer)
    expect(ws.pendingRef.current?.busy).toBeFalsy()
    expect(ws.pendingRef.current?.uncertain).toBeFalsy()
    expect(ws.pendingRef.current?.proposed.name).toBe('New')
  })

  it('a late uncertain failure neither flags nor clears the new preview and runs no discard', async () => {
    const first = await newTrip()
    const second = await newTrip()
    const ws = workspace(first.id)
    const oldKept = vi.fn()
    const oldDrop = vi.fn()
    ws.actions().applyChange(rename('Old'), 'edit', 0, oldKept, meta('op-old', oldDrop))
    let fail: () => void = () => {}
    state.hold = new Promise(resolve => { fail = () => resolve({ data: null, error: { message: 'offline' } } as never) })
    const keep = ws.actions().keepPending()
    await tick()
    expect(abandonPendingPreview(ws)).toBe('saving')
    const other = workspacePreviewActions({
      trip: tripById(second.id), pendingRef: ws.pendingRef, baseRef: ws.baseRef, legCorrRef: { current: undefined }, setPending: ws.setPending,
    })
    const newDrop = vi.fn()
    other.applyChange(rename('New'), 'edit', 0, undefined, meta('op-new', newDrop))
    const newer = ws.pendingRef.current
    messages.length = 0
    fail()
    const outcome = await keep
    expect(outcome).toEqual({ kind: 'unavailable', uncertain: true })
    expect(oldKept).not.toHaveBeenCalled()
    expect(oldDrop).not.toHaveBeenCalled()
    expect(newDrop).not.toHaveBeenCalled()
    expect(ws.pendingRef.current).toBe(newer)
    expect(ws.pendingRef.current?.uncertain).toBeFalsy()
    // The message does not claim the new preview was kept or saved.
    expect(messages).toContain(KEEP_LEFT_BEHIND)
    expect(messages.join()).not.toMatch(/preview is kept|saved to your plan/i)
  })
})

describe('leaving the trip or unmounting', () => {
  it('discards a proposal that was never admitted and releases its operations', async () => {
    const trip = await newTrip()
    const ws = workspace(trip.id)
    const kept = vi.fn()
    const drop = vi.fn()
    ws.actions().applyChange(rename('Left'), 'edit', 0, kept, meta('op-left', drop))
    expect(abandonPendingPreview(ws)).toBe('discarded')
    expect(drop).toHaveBeenCalledTimes(1)
    expect(kept).not.toHaveBeenCalled()
    expect(ws.pendingRef.current).toBeNull()
    expect(ws.baseRef.current).toBeNull()
    expect(abandonPendingPreview(ws)).toBe('none')
    expect(state.updates).toHaveLength(0)
  })

  it('keeps the records of an uncertain save instead of claiming a discard', async () => {
    const trip = await newTrip()
    const ws = workspace(trip.id)
    const drop = vi.fn()
    ws.actions().applyChange(rename('Left uncertain'), 'edit', 0, vi.fn(), meta('op-lu', drop))
    state.refuse = { message: 'offline' }
    await ws.actions().keepPending()
    expect(abandonPendingPreview(ws)).toBe('uncertain')
    expect(drop).not.toHaveBeenCalled()
    expect(ws.pendingRef.current).toBeNull()
  })
})

/** Hold the controlled queue-storage read. The read keeps its snapshot, so the
 *  caller sees a queue state that is older than anything staged meanwhile. */
const holdQueueRead = () => {
  let release: () => void = () => {}
  state.queueHold = new Promise<void>(resolve => { release = () => resolve() })
  return () => { release(); state.queueHold = null }
}
/** A workspace whose first Keep ended uncertain. The refusal is cleared again. */
async function uncertainSave(name: string, early: { kept?: () => void; drop?: () => void } = {}) {
  const trip = await newTrip()
  const ws = workspace(trip.id)
  ws.actions().applyChange(rename(name), 'edit', 0, early.kept, meta('op-early', early.drop))
  state.refuse = { message: 'offline' }
  await expect(ws.actions().keepPending()).resolves.toEqual({ kind: 'unavailable', uncertain: true })
  state.refuse = null
  messages.length = 0
  return { trip, ws }
}

describe('Remove after an uncertain save validates the exact chain and revision after its queue read', () => {
  it('a newer same-chain proposal staged during the held queue read is neither closed nor discarded', async () => {
    const early = { kept: vi.fn(), drop: vi.fn() }
    const { trip, ws } = await uncertainSave('Old', early)
    // The store still holds the write (pending), so the held read cannot resolve it.
    const release = holdQueueRead()
    const remove = ws.actions().removePending() as Promise<boolean>
    await tick()
    const lateKept = vi.fn()
    const lateDrop = vi.fn()
    ws.actions().applyChange(d => { d.coverEmoji = '🌊' }, 'edit', 0, lateKept, meta('op-late', lateDrop))
    const newer = ws.pendingRef.current!
    release()
    await expect(remove).resolves.toBe(false)
    expect(ws.pendingRef.current).toBe(newer)
    expect(ws.pendingRef.current?.proposed.coverEmoji).toBe('🌊')
    expect(messages).not.toContain(KEEP_CLOSED_UNCERTAIN)
    expect(messages.join()).not.toMatch(/discarded/i)
    expect(early.drop).not.toHaveBeenCalled()
    expect(lateDrop).not.toHaveBeenCalled()
    expect(lateKept).not.toHaveBeenCalled()
    // Saved edits then discards the write. The store tells the gate, and the next
    // Remove sees the newer revision and closes exactly that one.
    await savedEditsDiscards(trip.id)
    messages.length = 0
    await expect(ws.actions().removePending()).resolves.toBe(true)
    expect(ws.pendingRef.current).toBeNull()
    expect(lateDrop).toHaveBeenCalledTimes(1)
    expect(early.drop).not.toHaveBeenCalled()
    expect(messages).toEqual([KEEP_CLOSED_UNCERTAIN])
  })

  it('a newer independent preview staged during the held queue read is left alone', async () => {
    const early = { drop: vi.fn() }
    const { ws } = await uncertainSave('Old', early)
    const release = holdQueueRead()
    const remove = ws.actions().removePending() as Promise<boolean>
    await tick()
    expect(abandonPendingPreview(ws)).toBe('uncertain')
    const other = await newTrip()
    const otherDrop = vi.fn()
    workspacePreviewActions({
      trip: tripById(other.id), pendingRef: ws.pendingRef, baseRef: ws.baseRef, legCorrRef: { current: undefined }, setPending: ws.setPending,
    }).applyChange(rename('Independent'), 'edit', 0, undefined, meta('op-ind', otherDrop))
    const independent = ws.pendingRef.current!
    release()
    await expect(remove).resolves.toBe(false)
    expect(ws.pendingRef.current).toBe(independent)
    expect(independent.uncertain).toBeFalsy()
    expect(independent.gate.uncertain).toBeNull()
    expect(otherDrop).not.toHaveBeenCalled()
    expect(early.drop).not.toHaveBeenCalled()
    expect(messages).not.toContain(KEEP_CLOSED_UNCERTAIN)
    expect(messages.join()).not.toMatch(/discarded/i)
  })

  it('does not clear the uncertain flag of a newer same-chain proposal when the old read resolves', async () => {
    const { ws } = await uncertainSave('Old')
    const release = holdQueueRead()
    const remove = ws.actions().removePending() as Promise<boolean>
    await tick()
    ws.actions().applyChange(d => { d.coverEmoji = '🌊' }, 'edit', 0, undefined, meta('op-late', vi.fn()))
    const newer = ws.pendingRef.current!
    release()
    await remove
    expect(ws.pendingRef.current).toBe(newer)
    expect(newer.uncertain).toBe(true)
  })

  it('still closes an unchanged preview once Saved edits has discarded the exact write', async () => {
    const early = { drop: vi.fn() }
    const { trip, ws } = await uncertainSave('Old', early)
    await savedEditsDiscards(trip.id)
    const remove = ws.actions().removePending() as Promise<boolean>
    await expect(remove).resolves.toBe(true)
    expect(ws.pendingRef.current).toBeNull()
    expect(messages).toEqual([KEEP_CLOSED_UNCERTAIN])
    expect(early.drop).not.toHaveBeenCalled()
  })
})

describe('operations chained after a Keep are released only if they were never admitted', () => {
  it('marks the captured records as attempted and leaves later records unattempted', async () => {
    const trip = await newTrip()
    const ws = workspace(trip.id)
    ws.actions().applyChange(rename('Early'), 'edit', 0, vi.fn(), meta('op-early'))
    const release = hold()
    const keep = ws.actions().keepPending()
    await tick()
    ws.actions().applyChange(d => { d.coverEmoji = '🌊' }, 'edit', 0, vi.fn(), meta('op-late'))
    const flags = Object.fromEntries(ws.pendingRef.current!.operations.map(record => [record.operationId, record.attempted]))
    expect(flags).toEqual({ 'op-early': true, 'op-late': false })
    release()
    await keep
    expect(ws.pendingRef.current!.operations.map(record => [record.operationId, record.attempted])).toEqual([['op-late', false]])
  })

  it('closing an uncertain preview releases later records and never the captured ones', async () => {
    const early = { kept: vi.fn(), drop: vi.fn() }
    const { trip, ws } = await uncertainSave('Maybe', early)
    const lateKept = vi.fn()
    const lateDrop = vi.fn()
    ws.actions().applyChange(d => { d.coverEmoji = '🌊' }, 'edit', 0, lateKept, meta('op-late', lateDrop))
    await savedEditsDiscards(trip.id)
    await expect(ws.actions().removePending()).resolves.toBe(true)
    expect(messages).toEqual([KEEP_CLOSED_UNCERTAIN])
    expect(early.drop).not.toHaveBeenCalled()
    expect(early.kept).not.toHaveBeenCalled()
    expect(lateDrop).toHaveBeenCalledTimes(1)
    expect(lateKept).not.toHaveBeenCalled()
  })

  it('leaving the trip while a save is in flight releases later records and keeps the captured ones', async () => {
    const trip = await newTrip()
    const ws = workspace(trip.id)
    const early = { kept: vi.fn(), drop: vi.fn() }
    const lateKept = vi.fn()
    const lateDrop = vi.fn()
    ws.actions().applyChange(rename('Early'), 'edit', 0, early.kept, meta('op-early', early.drop))
    const release = hold()
    const keep = ws.actions().keepPending()
    await tick()
    ws.actions().applyChange(d => { d.coverEmoji = '🌊' }, 'edit', 0, lateKept, meta('op-late', lateDrop))
    expect(abandonPendingPreview(ws)).toBe('saving')
    expect(early.drop).not.toHaveBeenCalled()
    expect(lateDrop).toHaveBeenCalledTimes(1)
    release()
    await expect(keep).resolves.toEqual(ACK)
    // The older acknowledgement runs only the captured callback.
    expect(early.kept).toHaveBeenCalledTimes(1)
    expect(lateKept).not.toHaveBeenCalled()
    expect(lateDrop).toHaveBeenCalledTimes(1)
    expect(early.drop).not.toHaveBeenCalled()
  })

  it('leaving the trip after an uncertain save releases later records only', async () => {
    const early = { drop: vi.fn() }
    const { ws } = await uncertainSave('Maybe', early)
    const lateDrop = vi.fn()
    ws.actions().applyChange(d => { d.coverEmoji = '🌊' }, 'edit', 0, undefined, meta('op-late', lateDrop))
    expect(abandonPendingPreview(ws)).toBe('uncertain')
    expect(early.drop).not.toHaveBeenCalled()
    expect(lateDrop).toHaveBeenCalledTimes(1)
  })

  it('an acknowledgement runs only the captured callbacks and keeps the later record releasable', async () => {
    const trip = await newTrip()
    const ws = workspace(trip.id)
    const early = vi.fn()
    const lateKept = vi.fn()
    const lateDrop = vi.fn()
    ws.actions().applyChange(rename('Early'), 'edit', 0, early, meta('op-early', vi.fn()))
    const release = hold()
    const keep = ws.actions().keepPending()
    await tick()
    ws.actions().applyChange(d => { d.coverEmoji = '🌊' }, 'edit', 0, lateKept, meta('op-late', lateDrop))
    release()
    await keep
    expect(early).toHaveBeenCalledTimes(1)
    expect(lateKept).not.toHaveBeenCalled()
    expect(abandonPendingPreview(ws)).toBe('discarded')
    expect(lateDrop).toHaveBeenCalledTimes(1)
    expect(lateKept).not.toHaveBeenCalled()
  })

  it('a save proven not written resets the records so a later Remove releases all of them', async () => {
    const trip = await newTrip()
    tripById(trip.id)!.writeVersion = 55
    updateTrip(trip.id, { name: 'Existing' })
    await tick()
    const ws = workspace(trip.id)
    const drops = [vi.fn(), vi.fn()]
    ws.actions().applyChange(rename('Blocked'), 'edit', 0, undefined, meta('op-1', drops[0]))
    await expect(ws.actions().keepPending()).resolves.toEqual({ kind: 'conflict' })
    ws.actions().applyChange(d => { d.coverEmoji = '🌊' }, 'edit', 0, undefined, meta('op-2', drops[1]))
    expect(ws.pendingRef.current!.operations.map(record => record.attempted)).toEqual([false, false])
    expect(ws.actions().removePending()).toBe(true)
    expect(drops[0]).toHaveBeenCalledTimes(1)
    expect(drops[1]).toHaveBeenCalledTimes(1)
  })
})

describe('the impact sheet shows the real lifecycle state', () => {
  const sheet = (props: { busy?: boolean; uncertain?: boolean }) => {
    const base = tripById(newTripSync().id)!
    const proposed = structuredClone(base)
    proposed.name = 'Sheet'
    return renderToStaticMarkup(createElement(ImpactPreviewPanel, {
      result: computeImpact(base, proposed, 'edit', 0), onKeep: () => {}, onMoveDay: () => {}, onRemove: () => {}, ...props,
    }))
  }
  const newTripSync = () => duplicateTrip(keralaTrip, 'owner-test')

  it('disables every button and says Saving while busy', () => {
    const html = sheet({ busy: true })
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('Saving…')
    expect((html.match(/disabled=""/g) ?? []).length).toBe(3)
    expect(html).not.toContain('Save not confirmed')
  })

  it('names Saved edits instead of offering a retry when the save is uncertain', () => {
    const html = sheet({ uncertain: true })
    expect(html).toContain('Save not confirmed')
    expect(html).toContain('Open Saved edits to retry or discard it')
    expect(html).toContain('role="alert"')
    expect(html).toContain('Keep change')
    expect((html.match(/disabled=""/g) ?? []).length).toBe(0)
  })

  it('is quiet in the ordinary state', () => {
    const html = sheet({})
    expect(html).not.toContain('Save not confirmed')
    expect(html).toContain('aria-busy="false"')
    expect(html).toContain('Keep change')
  })
})

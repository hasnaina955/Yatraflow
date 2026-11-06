// ============ #841 — a write proven discarded in Saved edits must tell the writer gate ============
//
// The Medium defect: a Keep was admitted, no validated receipt arrived (so the
// writer record stayed `staged`, with no ticket and no retry toast), and Saved
// edits later proved that EXACT generation `discarded`. The workspace settled
// the watch without any callback, so the writer's own reservation stayed held
// for the page session: a repeat was refused with "Wait for it to finish" when
// it would never finish.
//
// This test drives the REAL exported workspace actions, the REAL store observer
// (observeTripPreview / recordPreviewDiscard through resolveQueuedTripWrite) and
// the REAL production writer gate (createWriterOperationGate). Only the
// Supabase transport, the in-memory queue backend and the toast are controlled.
// It is NOT a lower-level isolated mocked-gate test: the settlement has to reach
// the gate through the actual Keep -> watch -> Saved-edits-discard sequence.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { seedData } from '../src/data/seed'
import type { QueuedWrite, WriteQueueStore } from '../src/lib/writeQueue'
import type { PlaceHit } from '../src/lib/providers/hits'
import type { Trip } from '../src/data/types'

const { state } = vi.hoisted(() => ({
  state: {
    updates: [] as Array<{ payload: unknown; eq: Record<string, unknown> }>,
    refuse: null as null | { message: string },
    hold: null as null | Promise<{ data: null; error: null | { message: string }; count?: number }>,
    count: undefined as number | undefined,
    deny: false,
    configured: false,
    queueHold: null as null | Promise<void>,
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
  return { get isSupabaseConfigured() { return state.configured }, supabase: tripWriteClient({ auth: { signOut: async () => ({ error: null }) }, from: (t: string) => makeBuilder(t) }) }
})

// The queue normally lives in IndexedDB. Swap only the backend for an in-memory
// store; the real queue logic still runs. The discard path stays real.
vi.mock('../src/lib/writeQueue', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/lib/writeQueue')>()
  const map = new Map<string, QueuedWrite>()
  const mem: WriteQueueStore = {
    list: async () => {
      if (state.queueFail) throw new Error('queue read failed')
      const snapshot = [...map.values()]
      if (state.queueHold) await state.queueHold
      return snapshot
    },
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
  duplicateTrip, tripById, getSnapshot, _setTripWriteDebounceMs, _cancelTripWrites,
  resolveQueuedTripWrite, logout,
} from '../src/store/store'
import { clearWritesFor } from '../src/lib/writeQueue'
import { workspacePreviewActions, type PendingChange } from '../src/pages/TripWorkspace'
import { createWriterOperationGate, type WriterOperationGate } from '../src/pages/trip/map/writerOperationGate'
import { KEEP_UNCERTAIN_HOLD, type OperationMeta } from '../src/lib/previewChain'

const tick = async () => { await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0)) }
const keralaTrip = seedData.trips[0]

const PICK_A: PlaceHit = { id: 'p-store-a', name: 'Cafe A', latitude: 10.4, longitude: 70.4, kind: 'poi', category: 'food', placeId: 'P-STORE-A', source: 'google' }
const PICK_B: PlaceHit = { id: 'p-store-b', name: 'Cafe B', latitude: 10.5, longitude: 70.5, kind: 'poi', category: 'food', placeId: 'P-STORE-B', source: 'google' }

let gate: WriterOperationGate

beforeEach(async () => {
  gate = createWriterOperationGate()
  getSnapshot().sessionUserId = 'owner-test'
  _setTripWriteDebounceMs(0)
  await clearWritesFor('owner-test')
  state.updates.length = 0
  state.refuse = null
  state.hold = null
  state.count = undefined
  state.deny = false
  state.configured = false
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
const newTrip = async () => { const t = duplicateTrip(keralaTrip, 'owner-test'); await tick(); return t }

/** Enter a REAL production-gate reservation and stage it, so its phase matches
 *  the held `staged` defect state (a Keep admitted, no acknowledgement yet). */
function reserve(operationId: string, pick: PlaceHit, tripId: string): void {
  const entered = gate.begin({
    context: { tripId, dayId: null, dayIndex: -1 },
    intent: 'single',
    requestKey: `rk-${operationId}`,
    entries: [{ slotKey: 'lunch', hit: pick, dayId: null, dayIndex: 0 }],
    mintStopId: () => `stop-${operationId}`,
    mintOperationId: () => operationId,
  })
  expect(entered.status, 'the writer gate must hold a real reservation').toBe('entered')
  if (entered.status !== 'entered') return
  gate.stage(operationId, { plannedItemIds: entered.operation.items.map(item => item.itemId), skippedItemIds: [] })
}

/** The lifecycle metadata the production stageWriterPicks supplies: onDiscard
 *  for a pre-admission refusal, onStoreDiscarded for the proven-abandoned
 *  settlement. Both call the REAL production gate, never a mock. A separate
 *  writer-side test proves stageWriterPicks itself wires this surface. */
function writerOperation(operationId: string) {
  const onKept = vi.fn()
  const onDiscard = vi.fn()
  const onStoreDiscarded = vi.fn()
  const meta: OperationMeta = {
    id: operationId,
    onDiscard: () => { onDiscard(); gate.discard(operationId) },
    onStoreDiscarded: () => { onStoreDiscarded(); gate.settleProvenDiscarded(operationId) },
  }
  return { meta, onKept, onDiscard, onStoreDiscarded, operationId }
}
type WriterOp = ReturnType<typeof writerOperation>

/** A real Keep admitted whose first send failed: no validated receipt, writer
 *  record still `staged`, no ticket, no retry toast. The exact defect trigger. */
async function heldKeep(trip: Trip, ws: ReturnType<typeof workspace>, name: string, op: WriterOp) {
  ws.actions().applyChange(rename(name), 'edit', 0, op.onKept, op.meta)
  state.refuse = { message: 'offline' }
  const outcome = await ws.actions().keepPending()
  state.refuse = null
  messages.length = 0
  return outcome
}

describe('Saved edits proving the exact admitted write discarded tells the writer gate', () => {
  it('releases ONLY that operation\'s own held reservation and settles it truthfully', async () => {
    const op = writerOperation('op-store-a')
    const trip = await newTrip()
    const ws = workspace(trip.id)
    reserve(op.operationId, PICK_A, trip.id)

    // Known-bad control: the writer holds a reservation while the write is
    // unresolved. On the un-repaired source it stays held after the discard.
    expect(gate.operation(op.operationId)?.phase).toBe('staged')
    expect(gate.isReserved(PICK_A, trip.id)).toBe(true)

    const outcome = await heldKeep(trip, ws, 'Discarded in Saved edits', op)
    expect(outcome).toEqual({ kind: 'unavailable', uncertain: true })
    const watch = ws.pendingRef.current!.gate.watch!
    expect(watch.settled, 'the watch is still live before the store decides').toBe(false)

    // Saved edits proves the exact generation was discarded.
    await expect(resolveQueuedTripWrite(trip.id, 'discard')).resolves.toBe(true)
    await tick()

    // The proven-abandoned settlement ran once, on the captured records only.
    expect(op.onStoreDiscarded, 'the exact operation must be notified').toHaveBeenCalledTimes(1)
    expect(op.onDiscard, 'an attempted save must NOT get the ordinary onDiscard').not.toHaveBeenCalled()
    expect(op.onKept, 'a discarded write must NOT be claimed as acknowledged').not.toHaveBeenCalled()
    expect(watch.settled).toBe(true)
    expect(watch.subscription, 'the settled watch disposes its subscription').toBeNull()

    // The gate reached a truthful terminal state and released its OWN reservation.
    expect(gate.operation(op.operationId)?.phase, 'no indefinite staged record').toBe('abandoned')
    expect(gate.isReserved(PICK_A, trip.id)).toBe(false)
    expect(gate.reservations()).toHaveLength(0)

    // No more "Wait for it to finish": the same choice can start a fresh write.
    const repeat = gate.begin({
      context: { tripId: trip.id, dayId: null, dayIndex: -1 },
      intent: 'single',
      requestKey: `rk-${op.operationId}`,
      entries: [{ slotKey: 'lunch', hit: PICK_A, dayId: null, dayIndex: 0 }],
      mintStopId: () => 'stop-fresh',
      mintOperationId: () => 'op-store-a-fresh',
    })
    expect(repeat.status, 'a discarded operation must not block a fresh repeat').toBe('entered')
  })

  it('keeps a later chained operation intact (never releases another operation)', async () => {
    const opA = writerOperation('op-chain-a')
    const opB = writerOperation('op-chain-b')
    const trip = await newTrip()
    const ws = workspace(trip.id)
    reserve(opA.operationId, PICK_A, trip.id)

    await heldKeep(trip, ws, 'First', opA)
    const watch = ws.pendingRef.current!.gate.watch!
    // A newer chained preview is NOT in the Keep's captured records.
    expect(watch.records.map(record => record.operationId)).toEqual(['op-chain-a'])
    reserve(opB.operationId, PICK_B, trip.id)
    ws.actions().applyChange(rename('Second chained edit'), 'edit', 0, opB.onKept, opB.meta)

    await expect(resolveQueuedTripWrite(trip.id, 'discard')).resolves.toBe(true)
    await tick()

    // Only the captured operation is settled.
    expect(opA.onStoreDiscarded).toHaveBeenCalledTimes(1)
    expect(gate.operation(opA.operationId)?.phase).toBe('abandoned')
    expect(gate.isReserved(PICK_A, trip.id)).toBe(false)

    // The unrelated, later operation keeps its reservation and stays live.
    expect(opB.onStoreDiscarded, 'a newer preview must not be released').not.toHaveBeenCalled()
    expect(opB.onDiscard).not.toHaveBeenCalled()
    expect(opB.onKept).not.toHaveBeenCalled()
    expect(gate.operation(opB.operationId)?.phase).toBe('staged')
    expect(gate.isReserved(PICK_B, trip.id)).toBe(true)
    const laterRecord = ws.pendingRef.current!.operations.find(record => record.operationId === 'op-chain-b')
    expect(laterRecord?.state, 'the later record stays staged').toBe('staged')
  })

  it('pending and unknown states never release a reservation', async () => {
    const op = writerOperation('op-held-a')
    const trip = await newTrip()
    const ws = workspace(trip.id)
    reserve(op.operationId, PICK_A, trip.id)
    await heldKeep(trip, ws, 'Still pending', op)

    // Still pending on this device: Remove must hold, not settle.
    await expect(ws.actions().removePending()).resolves.toBe(false)
    expect(messages).toContain(KEEP_UNCERTAIN_HOLD)
    expect(op.onStoreDiscarded).not.toHaveBeenCalled()
    expect(gate.isReserved(PICK_A, trip.id)).toBe(true)

    // A durable copy that vanished without a decision is unknown, never discarded.
    await clearWritesFor('owner-test')
    messages.length = 0
    await expect(ws.actions().removePending()).resolves.toBe(false)
    expect(messages).toContain(KEEP_UNCERTAIN_HOLD)
    expect(op.onStoreDiscarded, 'unknown must not be treated as proven-discarded').not.toHaveBeenCalled()
    expect(gate.operation(op.operationId)?.phase).toBe('staged')
    expect(gate.isReserved(PICK_A, trip.id)).toBe(true)
  })

  it('a late ack / second discard cannot double-settle the watch', async () => {
    const op = writerOperation('op-once-a')
    const trip = await newTrip()
    const ws = workspace(trip.id)
    reserve(op.operationId, PICK_A, trip.id)
    await heldKeep(trip, ws, 'Once', op)
    const watch = ws.pendingRef.current!.gate.watch!

    await expect(resolveQueuedTripWrite(trip.id, 'discard')).resolves.toBe(true)
    await tick()
    expect(op.onStoreDiscarded).toHaveBeenCalledTimes(1)

    // A second discard of the now-absent write emits nothing; the settled watch
    // is disposed, so a late foreign/ack observation cannot reach it either.
    await expect(resolveQueuedTripWrite(trip.id, 'discard')).resolves.toBe(false)
    await logout()
    getSnapshot().sessionUserId = 'owner-test'
    await tick()
    await resolveQueuedTripWrite(trip.id, 'retry')
    await tick()

    expect(op.onStoreDiscarded, 'the settlement fires exactly once').toHaveBeenCalledTimes(1)
    expect(op.onKept, 'a late ack cannot fabricate success').not.toHaveBeenCalled()
    expect(op.onDiscard, 'a late discard cannot re-run onDiscard').not.toHaveBeenCalled()
    expect(watch.settled).toBe(true)
    expect(watch.subscription).toBeNull()
    expect(gate.operation(op.operationId)?.phase).toBe('abandoned')
    expect(gate.isReserved(PICK_A, trip.id)).toBe(false)
  })
})

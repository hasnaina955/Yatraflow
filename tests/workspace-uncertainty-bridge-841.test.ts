// ============ #841 — a real failed save makes the REAL writer uncertain =====
//
// Sol's final review found that the workspace only ran a Keep's operation
// callbacks on a validated acknowledgement, while the writer gate created its
// uncertain phase and retry ticket only inside that same kept callback. A real
// admitted generation with no acknowledgement thus left the writer record
// `staged`: no ticket, no Retry, and a dead reservation. The earlier caller test
// hid this by calling `onKept(undefined)`, which the real workspace never does.
//
// This file is the composition regression. It runs the ACTUAL production chain:
//
//   own-manual-day guard -> useMapWriters (the real hook)
//     -> stageWriterPicks / the writer operation gate
//       -> workspacePreviewActions.applyChange (the real workspace)
//         -> trackTripPreview / observeTripPreview / tripPreviewPending (the
//            real store records and observer)
//           -> the controlled Supabase transport and in-memory queue backend.
//
// Only the provider resolver, the persistence transport, the session and the
// toast are controlled. A failed real receipt must make the writer uncertain
// WITHOUT any manual `gate.uncertain` call and without calling a kept callback
// with no receipt. The Saved edits recovery path then decides the same exact
// operation.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
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
// backend for an in-memory store; the real queue logic still runs.
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

const { toasts, undoToasts } = vi.hoisted(() => ({
  toasts: [] as Array<{ message: string; tone?: 'ok' | 'err'; action?: { label: string; run: () => void } }>,
  undoToasts: [] as Array<{ message: string; run: () => void }>,
}))
vi.mock('../src/components/ui', async importOriginal => ({
  ...await importOriginal<typeof import('../src/components/ui')>(),
  toast: (message: string, tone?: 'ok' | 'err', action?: { label: string; run: () => void }) => {
    toasts.push({ message, ...(tone ? { tone } : {}), ...(action ? { action } : {}) })
  },
  undoToast: (message: string, run: () => void) => { undoToasts.push({ message, run }) },
}))

import {
  duplicateTrip, tripById, updateTrip, getSnapshot, _setTripWriteDebounceMs, _cancelTripWrites,
  resolveQueuedTripWrite,
} from '../src/store/store'
import { clearWritesFor, pendingWrites } from '../src/lib/writeQueue'
import { workspacePreviewActions, type PendingChange } from '../src/pages/TripWorkspace'
import { createWriterOperationGate, type WriterOperationGate } from '../src/pages/trip/map/writerOperationGate'
import { useMapWriters } from '../src/pages/trip/map/useMapWriters'
import { KEEP_UNCERTAIN, KEEP_UNCERTAIN_HOLD } from '../src/lib/previewChain'
import type { WriterApplyChange } from '../src/pages/trip/map/mapWriterActions'

const tick = async () => { await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0)) }
const keralaTrip = seedData.trips[0]
const ROUTE = 'route-bridge-841'

/** A measured km for every finite coordinate. Day 1's own stops and the picks
 *  below all get distinct positions, so the real planner can insert by road. */
const routeKmOf = (lat: number) => Math.round((lat - 9) * 10000) / 10

const PICK: PlaceHit = {
  id: 'p-bridge-a', name: 'Bridge View Cafe', latitude: 10.05, longitude: 76.95,
  kind: 'poi', category: 'food', placeId: 'P-BRIDGE-A', source: 'google',
}
const PICK_CHAINED: PlaceHit = {
  id: 'p-bridge-b', name: 'Bridge Tea Stop', latitude: 10.06, longitude: 76.96,
  kind: 'poi', category: 'food', placeId: 'P-BRIDGE-B', source: 'google',
}

beforeEach(async () => {
  getSnapshot().sessionUserId = 'owner-test'
  _setTripWriteDebounceMs(0)
  await clearWritesFor('owner-test')
  state.updates.length = 0
  state.refuse = null
  state.hold = null
  state.count = undefined
  state.deny = false
  toasts.length = 0
  undoToasts.length = 0
})
afterEach(() => { _cancelTripWrites(); state.hold = null; state.refuse = null })

const newTrip = async (): Promise<Trip> => {
  const trip = duplicateTrip(keralaTrip, 'owner-test')
  await tick()
  return trip
}

/** The REAL exported workspace, rebuilt per call from the current cache, exactly
 *  as the component does. */
function workspace(tripId: string) {
  const pendingRef: { current: PendingChange | null } = { current: null }
  const baseRef: { current: Trip | null } = { current: null }
  const setPending = vi.fn()
  const actions = () => workspacePreviewActions({
    trip: tripById(tripId), pendingRef, baseRef, legCorrRef: { current: undefined }, setPending,
  })
  const applyChange: WriterApplyChange = (mutator, kind, dayIndex, onKept, operation) => {
    actions().applyChange(mutator, kind, dayIndex, onKept, operation)
  }
  return { pendingRef, baseRef, setPending, actions, applyChange }
}

/** Mount the REAL writer hook. Its four actions call stageWriterPicks; its
 *  completion callback registers the production Retry it offers. */
function mountWriter(trip: Trip, applyChange: WriterApplyChange, gate: WriterOperationGate) {
  let api: ReturnType<typeof useMapWriters> | null = null
  const resolverCalls = { count: 0 }
  const resolvePick = async (requested: PlaceHit) => {
    resolverCalls.count += 1
    return requested
  }
  function Probe() {
    api = useMapWriters({
      resolvePick,
      applyChange,
      trip,
      pois: [],
      routeKmOf,
      anchors: [],
      routePolyline: null,
      activeDayIndex: 0,
      activeDaySlots: [],
      markStaged: () => {},
      addingAny: false,
      addingIdsRef: { current: new Set<string>() },
      setAddingIds: () => {},
      setAddingAny: () => {},
      fillingDay: false,
      setFillingDay: () => {},
      setDnaTick: () => {},
      setOpenSlotKey: () => {},
      currentTrip: () => tripById(trip.id),
      operationGate: gate,
      roadMeasured: true,
      routeKey: ROUTE,
    })
    return null
  }
  renderToStaticMarkup(createElement(Probe))
  if (!api) throw new Error('the writer hook did not mount')
  return { api: api as ReturnType<typeof useMapWriters>, resolverCalls }
}

function deferredHold() {
  let release: (value: { data: null; error: null | { message: string }; count?: number }) => void = () => {}
  state.hold = new Promise(resolve => { release = resolve })
  return (error?: { message: string }) => release({ data: null, error: error ?? null })
}

function retryToasts() {
  return toasts.filter(entry => entry.action?.label === 'Retry')
}

describe('the real workspace tells the real writer that an admitted save is uncertain', () => {
  it('fails the receipt through the real store, reaches the writer gate, and offers the captured retry', async () => {
    const trip = await newTrip()
    const ws = workspace(trip.id)
    const gate = createWriterOperationGate()
    const { api, resolverCalls } = mountWriter(trip, ws.applyChange, gate)

    await api.addPoiToDay(PICK, 0)
    const staged = ws.pendingRef.current
    expect(staged?.operations).toHaveLength(1)
    const operationId = staged!.operations[0].operationId!
    expect(operationId.length).toBeGreaterThan(0)
    const stopId = gate.operation(operationId)!.items[0].stopId
    expect(gate.operation(operationId)?.phase).toBe('staged')
    expect(resolverCalls.count).toBe(1)
    expect(retryToasts()).toHaveLength(0)

    // The real transport fails the receipt of the admitted generation. The
    // cache and the durable queue keep the write.
    state.refuse = { message: 'offline' }
    const outcome = await ws.actions().keepPending()
    expect(outcome).toEqual({ kind: 'unavailable', uncertain: true })
    expect(tripById(trip.id)?.days.some(day => day.stops.some(stop => stop.id === stopId))).toBe(true)
    expect((await pendingWrites()).some(write => write.tripId === trip.id)).toBe(true)

    // The writer record became uncertain WITHOUT a kept callback or a manual
    // gate call: the workspace's own uncertainty notification drove it.
    const record = ws.pendingRef.current!.operations[0]
    expect(record.operationId).toBe(operationId)
    expect(record.state).toBe('staged')
    expect(record.attempted).toBe(true)
    expect(record.uncertainNotified).toBe(true)
    expect(gate.operation(operationId)?.phase).toBe('uncertain')
    expect(gate.isReserved(PICK, trip.id)).toBe(true)

    // A real captured retry ticket, and the production hook registered the
    // Retry action for it.
    const ticket = gate.retryTicket(operationId)
    expect(ticket?.operationId).toBe(operationId)
    expect(ticket?.picks[0]?.hit).toEqual(PICK)
    const offered = retryToasts()
    expect(offered).toHaveLength(1)
    expect(offered[0].message).toMatch(/not confirmed/i)
    expect(toasts.map(entry => entry.message)).toContain(KEEP_UNCERTAIN)

    // A repeated Keep does not admit again and does not duplicate anything.
    const sentBefore = state.updates.length
    await expect(ws.actions().keepPending()).resolves.toEqual({ kind: 'conflict', uncertain: true })
    expect(toasts.map(entry => entry.message)).toContain(KEEP_UNCERTAIN_HOLD)
    expect(state.updates).toHaveLength(sentBefore)
    expect(record.uncertainNotified).toBe(true)
    expect(retryToasts()).toHaveLength(1)

    // The production Retry action replays the exact captured operation. It is
    // observed at the real gate: no second resolver, no new stop, no new write.
    const beginOperationIds: Array<string | undefined> = []
    const realBegin = gate.begin
    gate.begin = request => { beginOperationIds.push(request.operationId); return realBegin(request) }
    await api.retryUncertain(operationId)
    expect(beginOperationIds).toContain(operationId)
    expect(resolverCalls.count).toBe(1)
    expect(state.updates).toHaveLength(sentBefore)
    expect(gate.operation(operationId)?.items.map(item => item.stopId)).toEqual([stopId])
    const savedStops = tripById(trip.id)!.days.flatMap(day => day.stops.filter(stop => stop.id === stopId))
    expect(savedStops).toHaveLength(1)
    expect(ws.pendingRef.current!.operations.filter(entry => entry.operationId === operationId)).toHaveLength(1)
  })

  it('Saved edits resolves the same exact generation later: a late ack completes once and never reopens it', async () => {
    const trip = await newTrip()
    const ws = workspace(trip.id)
    const gate = createWriterOperationGate()
    const { api } = mountWriter(trip, ws.applyChange, gate)

    await api.addPoiToDay(PICK, 0)
    const operationId = ws.pendingRef.current!.operations[0].operationId!
    const stopId = gate.operation(operationId)!.items[0].stopId
    state.refuse = { message: 'offline' }
    await expect(ws.actions().keepPending()).resolves.toEqual({ kind: 'unavailable', uncertain: true })
    const watch = ws.pendingRef.current!.gate.watch!
    const notifications = retryToasts().length
    expect(watch.settled).toBe(false)

    // Saved edits retries the SAME store generation. The real observer delivers
    // the validated receipt to the same watch.
    state.refuse = null
    await expect(resolveQueuedTripWrite(trip.id, 'retry')).resolves.toBe(true)
    await tick()

    expect(gate.operation(operationId)?.phase).toBe('applied')
    expect(gate.retryTicket(operationId)).toBeNull()
    expect(undoToasts).toHaveLength(1)
    expect(ws.pendingRef.current).toBeNull()
    expect(watch.settled).toBe(true)
    expect(watch.subscription).toBeNull()
    // A late ack does not re-run the uncertainty notification.
    expect(retryToasts()).toHaveLength(notifications)
    expect(tripById(trip.id)!.days.flatMap(day => day.stops.filter(stop => stop.id === stopId))).toHaveLength(1)

    // The old runner is refused by the gate as settled: no second write.
    const sent = state.updates.length
    await api.retryUncertain(operationId)
    expect(state.updates).toHaveLength(sent)
    expect(gate.operation(operationId)?.phase).toBe('applied')
  })

  it('Saved edits proving the exact generation discarded settles the writer once and retires its ticket', async () => {
    const trip = await newTrip()
    const ws = workspace(trip.id)
    const gate = createWriterOperationGate()
    const { api } = mountWriter(trip, ws.applyChange, gate)

    await api.addPoiToDay(PICK, 0)
    const operationId = ws.pendingRef.current!.operations[0].operationId!
    state.refuse = { message: 'offline' }
    await expect(ws.actions().keepPending()).resolves.toEqual({ kind: 'unavailable', uncertain: true })
    expect(gate.operation(operationId)?.phase).toBe('uncertain')
    expect(gate.retryTicket(operationId)).not.toBeNull()

    await expect(resolveQueuedTripWrite(trip.id, 'discard')).resolves.toBe(true)
    await tick()

    expect(gate.operation(operationId)?.phase).toBe('abandoned')
    expect(gate.retryTicket(operationId)).toBeNull()
    expect(gate.isReserved(PICK, trip.id)).toBe(false)
    expect(ws.pendingRef.current!.operations[0].state).toBe('abandoned')
    expect(undoToasts).toHaveLength(0)

    // A second discard and the stale runner cannot fire anything again.
    await expect(resolveQueuedTripWrite(trip.id, 'discard')).resolves.toBe(false)
    await api.retryUncertain(operationId)
    expect(gate.operation(operationId)?.phase).toBe('abandoned')
    expect(ws.pendingRef.current!.operations[0].state).toBe('abandoned')
  })

  it('a pre-admission refusal notifies nobody: the writer stays staged and keeps no ticket', async () => {
    const trip = await newTrip()
    const ws = workspace(trip.id)
    const gate = createWriterOperationGate()
    const { api } = mountWriter(trip, ws.applyChange, gate)

    await api.addPoiToDay(PICK, 0)
    const operationId = ws.pendingRef.current!.operations[0].operationId!
    // A crew edit lands while the preview is open: the base is stale.
    updateTrip(trip.id, { name: 'Crew renamed this trip' })
    await tick()
    const sent = state.updates.length

    await expect(ws.actions().keepPending()).resolves.toEqual({ kind: 'stale' })
    expect(state.updates).toHaveLength(sent)
    expect(gate.operation(operationId)?.phase).toBe('staged')
    expect(gate.retryTicket(operationId)).toBeNull()
    expect(retryToasts()).toHaveLength(0)
    const record = ws.pendingRef.current!.operations[0]
    expect(record.attempted).toBe(false)
    expect(record.uncertainNotified).toBe(false)

    // The never-admitted preview still discards, and only then releases.
    expect(ws.actions().removePending()).toBe(true)
    expect(gate.operation(operationId)?.phase).toBe('discarded')
    expect(gate.isReserved(PICK, trip.id)).toBe(false)
  })

  it('an operation chained after the captured generation is never notified or unsettled', async () => {
    const trip = await newTrip()
    const ws = workspace(trip.id)
    const gate = createWriterOperationGate()
    const { api } = mountWriter(trip, ws.applyChange, gate)

    await api.addPoiToDay(PICK, 0)
    const firstOperationId = ws.pendingRef.current!.operations[0].operationId!

    const release = deferredHold()
    const keep = ws.actions().keepPending()
    await tick()
    await tick()
    expect(ws.pendingRef.current?.gate.watch).not.toBeNull()

    // A newer edit is chained while the first Keep is in flight. It was not in
    // the captured patch and must stay outside the uncertainty.
    await api.addPoiToDay(PICK_CHAINED, 0)
    const chained = ws.pendingRef.current!.operations.find(entry => entry.operationId !== firstOperationId)
    expect(chained?.operationId).toBeTruthy()
    const chainedOperationId = chained!.operationId!

    release({ message: 'offline' })
    await expect(keep).resolves.toEqual({ kind: 'unavailable', uncertain: true })
    await tick()

    const firstRecord = ws.pendingRef.current!.operations.find(entry => entry.operationId === firstOperationId)!
    const chainedRecord = ws.pendingRef.current!.operations.find(entry => entry.operationId === chainedOperationId)!
    expect(firstRecord.uncertainNotified).toBe(true)
    expect(chainedRecord.attempted).toBe(false)
    expect(chainedRecord.uncertainNotified).toBe(false)
    expect(gate.operation(firstOperationId)?.phase).toBe('uncertain')
    expect(gate.operation(chainedOperationId)?.phase).toBe('staged')
    expect(gate.isReserved(PICK_CHAINED, trip.id)).toBe(true)
    expect(gate.retryTicket(chainedOperationId)).toBeNull()
    expect(retryToasts()).toHaveLength(1)
    expect(ws.pendingRef.current!.gate.watch!.records.map(entry => entry.operationId)).toEqual([firstOperationId])
  })
})

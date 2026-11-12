// ============ #08 R8 — real Timeline/workspace/store lifecycle composition ====
//
// This is the missing acknowledged/retry/discard orchestration proof for the
// Timeline covered-row Add. It drives the ACTUAL production chain:
//
//   runTimelineProjectedAdd / runTimelineProjectedRetry (the runner the hook
//   calls)
//     -> stageProjectedRow / retryProjectedRow
//       -> stageWriterPicks + the real operation gate + planner
//         -> workspacePreviewActions.applyChange (the exported workspace)
//           -> trackTripPreview / observeTripPreview / tripPreviewPending (the
//              real store records and observer)
//             -> the controlled Supabase transport and in-memory queue backend
//               -> the captured Timeline controller and its onAcknowledged.
//
// Only the provider resolver, the Supabase transport, the queue backend and the
// toast are controlled. The real store, queue logic, preview observer, writer
// gate, planner, workspace handlers and controller all run. No React mount is
// needed: the runner is the production loop the hook calls. The probe callbacks
// below are test observers; they are not a claim about the Workspace's private
// presentation or a browser render.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import ts from 'typescript'
import { seedData } from '../src/data/seed'
import type { QueuedWrite, WriteQueueStore } from '../src/lib/writeQueue'
import type { PlaceHit } from '../src/lib/providers/hits'
import type { Trip } from '../src/data/types'
import type { WriterCompletion } from '../src/pages/trip/map/mapWriterActions'

const { transport } = vi.hoisted(() => ({
  transport: {
    updates: [] as Array<{ payload: unknown; eq: Record<string, unknown> }>,
    refuse: null as null | { message: string },
    hold: null as null | Promise<{ data: null; error: null | { message: string }; count?: number }>,
    count: undefined as number | undefined,
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
    builder.maybeSingle = () => builder
    builder.single = () => builder
    builder.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
      if (method === 'update' && table === 'trips') {
        transport.updates.push({ payload, eq: { ...eqs } })
        return (transport.hold ?? Promise.resolve({ data: null, error: transport.refuse, count: transport.count })).then(res, rej)
      }
      return Promise.resolve({ data: null, error: null }).then(res, rej)
    }
    return builder
  }
  return {
    isSupabaseConfigured: false,
    supabase: tripWriteClient({
      auth: { signOut: async () => ({ error: null }) },
      from: (t: string) => makeBuilder(t),
    }),
  }
})

// The queue normally lives in IndexedDB. Swap only the storage backend for an
// in-memory store; the real queue logic, generation guard and discard path run.
vi.mock('../src/lib/writeQueue', async importOriginal =>
  (await import('./helpers/memoryWriteQueue')).memoryWriteQueue(importOriginal))

const { messages, undoToasts } = vi.hoisted(() => ({
  messages: [] as string[],
  undoToasts: [] as Array<{ message: string; run: () => void }>,
}))

vi.mock('../src/components/ui', async importOriginal => ({
  ...await importOriginal<typeof import('../src/components/ui')>(),
  toast: (message: string) => { messages.push(message) },
  undoToast: (message: string, run: () => void) => { undoToasts.push({ message, run }) },
}))

import {
  duplicateTrip, tripById, updateTrip, getSnapshot, _setTripWriteDebounceMs,
  _cancelTripWrites, resolveQueuedTripWrite, admitTripPreview,
} from '../src/store/store'
import { clearWritesFor, pendingWrites } from '../src/lib/writeQueue'
import {
  createWriterOperationGate,
  type WriterOperationGate,
} from '../src/pages/trip/map/writerOperationGate'
import {
  acknowledgedStopsFrom,
  guardedUndo,
} from '../src/pages/trip/map/mapWriterActions'
import { mapManualSlotStore } from '../src/pages/trip/map/manualSlotContexts'
import { applyVerifiedPlacement } from '../src/pages/trip/map/verifiedPlacementEffects'
import {
  ABANDONED_COPY,
  createTimelineWriterController,
  type TimelineWriterController,
} from '../src/pages/trip/timeline/timelineWriterController'
import {
  runTimelineProjectedAdd,
  runTimelineProjectedRetry,
} from '../src/pages/trip/timeline/timelineWriterRunner'
import type { WriterRoadBinding } from '../src/pages/trip/map/writerRoadBinding'
import { KEEP_UNCERTAIN_HOLD } from '../src/lib/previewChain'
import {
  bindingFor,
  controllerFor,
  createWorkspace,
  rowFor,
  settleTicks,
  timelineConfig,
  type WorkspaceHarness,
} from './helpers/timelineWorkspaceHarness'

const keralaTrip = seedData.trips[0]

const PICK_A: PlaceHit = {
  id: 'p-r8-a', name: 'R8 Cafe A', latitude: 10.05, longitude: 76.95,
  kind: 'poi', category: 'food', placeId: 'P-R8-A', source: 'google',
}
const PICK_B: PlaceHit = {
  id: 'p-r8-b', name: 'R8 Cafe B', latitude: 10.06, longitude: 76.96,
  kind: 'poi', category: 'food', placeId: 'P-R8-B', source: 'google',
}

beforeEach(async () => {
  getSnapshot().sessionUserId = 'owner-test'
  _setTripWriteDebounceMs(0)
  await clearWritesFor('owner-test')
  transport.updates.length = 0
  transport.refuse = null
  transport.hold = null
  transport.count = undefined
  messages.length = 0
  undoToasts.length = 0
  mapManualSlotStore.clear()
})

afterEach(() => {
  _cancelTripWrites()
  transport.hold = null
  transport.refuse = null
})

async function newTrip(): Promise<Trip> {
  const trip = duplicateTrip(keralaTrip, 'owner-test')
  await settleTicks()
  return trip
}

function probe() {
  const calls: WriterCompletion[] = []
  return {
    calls,
    onAcknowledged: (completion: WriterCompletion) => { calls.push(completion) },
  }
}

function operationIdOf(ws: WorkspaceHarness): string {
  const id = ws.pendingRef.current?.operations[0]?.operationId
  if (!id) throw new Error('the workspace preview has no operation id')
  return id
}

/** Keep a staged operation with a failed receipt. The real workspace admits the
 *  generation, the transport fails, and the store observer leaves it pending. */
async function keepUncertain(ws: WorkspaceHarness): Promise<void> {
  transport.refuse = { message: 'offline' }
  const outcome = await ws.actions().keepPending()
  transport.refuse = null
  expect(outcome).toEqual({ kind: 'unavailable', uncertain: true })
}

describe('Timeline add acknowledged composition', () => {
  it('stages through the real runner, keeps a valid receipt, and reaches the captured acknowledgement once', async () => {
    const trip = await newTrip()
    const ws = createWorkspace(trip.id)
    const gate = createWriterOperationGate()
    const ack = probe()
    const uncertain = probe()
    const binding = bindingFor(trip)
    const resolver = { calls: 0 }
    let controller: TimelineWriterController | null = null

    const config = timelineConfig({
      tripId: trip.id,
      applyChange: ws.applyChange,
      resolvePick: async hit => { resolver.calls += 1; return hit },
      onAcknowledged: ack.onAcknowledged,
      onUncertain: uncertain.onAcknowledged,
      gate,
      binding,
      currentRoad: () => binding,
    })
    controller = controllerFor(trip.id)

    await runTimelineProjectedAdd({ controller, config, row: rowFor(trip, PICK_A), dayIndex: 0 })

    const operationId = operationIdOf(ws)
    const stopId = gate.operation(operationId)?.items[0]?.stopId
    expect(stopId).toBeTruthy()
    expect(gate.operation(operationId)?.phase).toBe('staged')
    expect(resolver.calls).toBe(1)
    expect(ack.calls).toHaveLength(0)

    // A real Keep on the real workspace/store. The controlled transport answers
    // a valid receipt, and the store's observer settles the captured record.
    const outcome = await ws.actions().keepPending()
    expect(outcome.kind).toBe('acknowledged')
    await settleTicks()

    expect(ack.calls).toHaveLength(1)
    const completion = ack.calls[0]!
    expect(completion.acknowledged).toBe(true)
    expect(completion.phase).toBe('applied')
    expect(completion.operationId).toBe(operationId)
    expect(completion.receipt).toMatchObject({ kind: 'acknowledged' })
    expect(typeof completion.receipt?.writeVersion).toBe('number')
    expect(completion.placed).toHaveLength(1)
    expect(completion.placed[0]!.stopId).toBe(stopId)
    expect(completion.placed[0]!.stop.title).toBe(PICK_A.name)
    expect(uncertain.calls).toHaveLength(0)

    // The saved trip holds exactly the verified stop. This is the store's
    // acknowledged row, not the staged proposal.
    const saved = tripById(trip.id)
    const savedStop = saved?.days.flatMap(day => day.stops).find(stop => stop.id === stopId)
    expect(savedStop).toBeDefined()
    expect(savedStop).toEqual(completion.placed[0]!.stop)
    expect(gate.operation(operationId)?.phase).toBe('applied')
    expect(gate.retryTicket(operationId)).toBeNull()

    // The shared verified-placement helper is the same one the Workspace calls.
    // The manual store is real; the DNA/tick probes are test observers.
    const context = { tripId: trip.id, dayId: completion.placed[0]!.dayId, slotKey: 'lunch' }
    const unrelated: PlaceHit = {
      id: 'p-r8-unrelated', name: 'Unrelated', latitude: 10.2, longitude: 77.1,
      kind: 'poi', category: 'food', placeId: 'P-R8-UNRELATED', source: 'google',
    }
    expect(mapManualSlotStore.file(context, PICK_A)).toBe('filed')
    expect(mapManualSlotStore.file(context, unrelated)).toBe('filed')
    const dna: string[] = []
    const dropped: string[] = []
    let placedTicks = 0
    const applied = applyVerifiedPlacement(completion, {
      onDna: item => { dna.push(item.stopId) },
      onDrop: item => {
        dropped.push(item.stopId)
        mapManualSlotStore.dropPlaced(context, [item.hit])
      },
      onPlaced: count => { placedTicks += count },
    })
    expect(applied).toBe(1)
    expect(dna).toEqual([stopId])
    expect(dropped).toEqual([stopId])
    expect(placedTicks).toBe(1)
    expect(mapManualSlotStore.picksFor(context).map(hit => hit.id)).toEqual(['p-r8-unrelated'])

    // Guarded Undo: a changed target refuses before admission; the unchanged
    // target removes only its own stop through the real store admission.
    const stops = acknowledgedStopsFrom(completion)
    const changed = stops.map(stop => ({ ...stop, expected: { ...stop.expected, title: `${stop.expected.title} changed` } }))
    let admitCalls = 0
    const admit = async (input: Parameters<typeof admitTripPreview>[0]) => {
      admitCalls += 1
      return admitTripPreview(input)
    }
    const refused = await guardedUndo(
      { currentTrip: () => tripById(trip.id), admit },
      { tripId: trip.id, operationId: completion.operationId, stops: changed },
    )
    expect(refused).toMatchObject({ status: 'refused', reason: 'changed-target' })
    expect(admitCalls).toBe(0)
    expect(tripById(trip.id)?.days.flatMap(day => day.stops).some(stop => stop.id === stopId)).toBe(true)

    const unrelatedStop = tripById(trip.id)?.days
      .flatMap(day => day.stops)
      .find(stop => stop.id !== stopId)
    expect(unrelatedStop).toBeDefined()
    const undone = await guardedUndo(
      { currentTrip: () => tripById(trip.id), admit },
      { tripId: trip.id, operationId: completion.operationId, stops },
    )
    expect(undone.status).toBe('undone')
    expect(admitCalls).toBe(1)
    const after = tripById(trip.id)?.days.flatMap(day => day.stops) ?? []
    expect(after.some(stop => stop.id === stopId)).toBe(false)
    expect(after.some(stop => stop.id === unrelatedStop!.id)).toBe(true)
    expect((await pendingWrites()).some(write => write.tripId === trip.id)).toBe(false)
  })
})

describe('Timeline add measured-road revalidation', () => {
  it('refuses a live road generation change after a held resolver with no apply, outbound or mint duplicate', async () => {
    const trip = await newTrip()
    const ws = createWorkspace(trip.id)
    const gate = createWriterOperationGate()
    const ack = probe()
    const base = bindingFor(trip)
    let live: WriterRoadBinding = base
    let release: ((hit: PlaceHit | null) => void) | null = null
    let resolverCalls = 0
    const config = timelineConfig({
      tripId: trip.id,
      applyChange: ws.applyChange,
      resolvePick: hit => {
        resolverCalls += 1
        return new Promise<PlaceHit | null>(resolve => { release = resolve })
      },
      onAcknowledged: ack.onAcknowledged,
      gate,
      binding: base,
      currentRoad: () => live,
    })
    const controller = controllerFor(trip.id)

    const pending = runTimelineProjectedAdd({ controller, config, row: rowFor(trip, PICK_A), dayIndex: 0 })
    await settleTicks()
    expect(resolverCalls).toBe(1)
    const reservation = gate.reservations()[0]
    expect(reservation).toBeDefined()
    const operationId = reservation!.operationId
    const stopId = gate.operation(operationId)?.items[0]?.stopId
    expect(stopId).toBeTruthy()
    expect(gate.operation(operationId)?.items).toHaveLength(1)

    // A newer measured generation arrives while the provider lookup is held.
    live = bindingFor(trip, { distanceKm: 13 })
    release!(PICK_A)
    await pending

    expect(controller.getSnapshot().error).toMatch(/measured road cannot place/i)
    expect(ws.pendingRef.current).toBeNull()
    expect(transport.updates).toHaveLength(0)
    expect(ack.calls).toHaveLength(0)
    expect(gate.reservations()).toHaveLength(0)
    expect(gate.operation(operationId)?.phase).toBe('discarded')
    expect(gate.operation(operationId)?.items).toHaveLength(1)
    expect(gate.operation(operationId)?.items[0]?.stopId).toBe(stopId)
    expect(tripById(trip.id)?.days.flatMap(day => day.stops).some(stop => stop.id === stopId)).toBe(false)
  })

  it('refuses a committed stop-chain change after a held resolver with no apply or extra outbound', async () => {
    const trip = await newTrip()
    const ws = createWorkspace(trip.id)
    const gate = createWriterOperationGate()
    const ack = probe()
    const base = bindingFor(trip)
    let release: ((hit: PlaceHit | null) => void) | null = null
    let resolverCalls = 0
    const config = timelineConfig({
      tripId: trip.id,
      applyChange: ws.applyChange,
      resolvePick: hit => {
        resolverCalls += 1
        return new Promise<PlaceHit | null>(resolve => { release = resolve })
      },
      onAcknowledged: ack.onAcknowledged,
      gate,
      binding: base,
      currentRoad: () => base,
    })
    const controller = controllerFor(trip.id)

    const pending = runTimelineProjectedAdd({ controller, config, row: rowFor(trip, PICK_A), dayIndex: 0 })
    await settleTicks()
    expect(resolverCalls).toBe(1)
    const operationId = gate.reservations()[0]!.operationId
    const stopId = gate.operation(operationId)?.items[0]?.stopId

    // A real store edit changes the committed stop chain during the wait.
    const current = tripById(trip.id)!
    const changedDays = current.days.map((day, index) => index === 0
      ? { ...day, stops: day.stops.map((stop, stopIndex) => stopIndex === 0
        ? { ...stop, lat: stop.lat + 0.01 }
        : stop) }
      : day)
    expect(updateTrip(trip.id, { days: changedDays })).toBe(true)
    await settleTicks()
    const sentAfterEdit = transport.updates.length

    release!(PICK_A)
    await pending

    expect(controller.getSnapshot().error).toMatch(/measured road cannot place/i)
    expect(ws.pendingRef.current).toBeNull()
    expect(transport.updates).toHaveLength(sentAfterEdit)
    expect(ack.calls).toHaveLength(0)
    expect(gate.reservations()).toHaveLength(0)
    expect(gate.operation(operationId)?.phase).toBe('discarded')
    expect(gate.operation(operationId)?.items[0]?.stopId).toBe(stopId)
  })
})

describe('Timeline uncertain capture and completion ownership', () => {
  it('turns a failed admitted receipt into one real uncertain ticket and one onUncertain notification', async () => {
    const trip = await newTrip()
    const ws = createWorkspace(trip.id)
    const gate = createWriterOperationGate()
    const ack = probe()
    const uncertain = probe()
    const binding = bindingFor(trip)
    const config = timelineConfig({
      tripId: trip.id,
      applyChange: ws.applyChange,
      resolvePick: async hit => hit,
      onAcknowledged: ack.onAcknowledged,
      onUncertain: uncertain.onAcknowledged,
      gate,
      binding,
      currentRoad: () => binding,
    })
    const controller = controllerFor(trip.id)

    await runTimelineProjectedAdd({ controller, config, row: rowFor(trip, PICK_A), dayIndex: 0 })
    const operationId = operationIdOf(ws)
    await keepUncertain(ws)

    expect(uncertain.calls).toHaveLength(1)
    expect(uncertain.calls[0]!.phase).toBe('uncertain')
    expect(uncertain.calls[0]!.acknowledged).toBe(false)
    const ticket = controller.getSnapshot().ticket
    expect(ticket?.operationId).toBe(operationId)
    expect(ticket?.picks[0]?.hit).toEqual(PICK_A)
    expect(controller.getSnapshot().error).toMatch(/not confirmed/i)
    expect(gate.operation(operationId)?.phase).toBe('uncertain')
    expect(gate.isReserved(PICK_A, trip.id)).toBe(true)
    expect(ack.calls).toHaveLength(0)
  })

  it('runs the captured acknowledgement once after a real late ack', async () => {
    const trip = await newTrip()
    const ws = createWorkspace(trip.id)
    const gate = createWriterOperationGate()
    const first = probe()
    const second = probe()
    const binding = bindingFor(trip)
    const config = timelineConfig({
      tripId: trip.id,
      applyChange: ws.applyChange,
      resolvePick: async hit => hit,
      onAcknowledged: first.onAcknowledged,
      gate,
      binding,
      currentRoad: () => binding,
    })
    const controller = controllerFor(trip.id)

    await runTimelineProjectedAdd({ controller, config, row: rowFor(trip, PICK_A), dayIndex: 0 })
    const operationId = operationIdOf(ws)
    await keepUncertain(ws)
    expect(controller.getSnapshot().ticket).not.toBeNull()

    // The hook now supplies a NEW hop (new callback, same trip). The captured
    // operation still owns its callback; the new config is never called.
    const newer = timelineConfig({
      tripId: trip.id,
      applyChange: ws.applyChange,
      resolvePick: async hit => hit,
      onAcknowledged: second.onAcknowledged,
      gate,
      binding: bindingFor(tripById(trip.id)!),
      currentRoad: () => bindingFor(tripById(trip.id)!),
    })
    expect(newer.onAcknowledged).not.toBe(first.onAcknowledged)

    expect(await resolveQueuedTripWrite(trip.id, 'retry')).toBe(true)
    await settleTicks()

    expect(first.calls).toHaveLength(1)
    expect(second.calls).toHaveLength(0)
    expect(first.calls[0]!.operationId).toBe(operationId)
    expect(first.calls[0]!.acknowledged).toBe(true)
    expect(gate.operation(operationId)?.phase).toBe('applied')
  })

  it('blocks a newer Add while an older operation is unresolved', async () => {
    const tripA = await newTrip()
    const wsA = createWorkspace(tripA.id)
    const gate = createWriterOperationGate()
    const ackA = probe()
    const bindingA = bindingFor(tripA)
    const configA = timelineConfig({
      tripId: tripA.id,
      applyChange: wsA.applyChange,
      resolvePick: async hit => hit,
      onAcknowledged: ackA.onAcknowledged,
      gate,
      binding: bindingA,
      currentRoad: () => bindingA,
    })
    const controller = controllerFor(tripA.id)
    await runTimelineProjectedAdd({ controller, config: configA, row: rowFor(tripA, PICK_A), dayIndex: 0 })
    const operationA = operationIdOf(wsA)
    await keepUncertain(wsA)
    const ticketA = controller.getSnapshot().ticket
    expect(ticketA?.operationId).toBe(operationA)

    // A new Add is blocked while A's unresolved ticket is held. It must not
    // create a second operation or replace A's retry.
    const tripB = await newTrip()
    const wsB = createWorkspace(tripB.id)
    const ackB = probe()
    const bindingB = bindingFor(tripB)
    const configB = timelineConfig({
      tripId: tripB.id,
      applyChange: wsB.applyChange,
      resolvePick: async hit => hit,
      onAcknowledged: ackB.onAcknowledged,
      gate,
      binding: bindingB,
      currentRoad: () => bindingB,
    })
    controller.setCurrentIdentity({ tripId: tripB.id, identityGeneration: 1 })
    await runTimelineProjectedAdd({ controller, config: configB, row: rowFor(tripB, PICK_B), dayIndex: 0 })
    expect(controller.getSnapshot().error).toMatch(/Resolve the unconfirmed save/)
    expect(controller.getSnapshot().ticket?.operationId).toBe(operationA)

    // Back to A: the older late ack must deliver A's captured callback once and
    // clear only A's own ticket.
    controller.setCurrentIdentity({ tripId: tripA.id, identityGeneration: 1 })
    transport.refuse = null
    expect(await resolveQueuedTripWrite(tripA.id, 'retry')).toBe(true)
    await settleTicks()

    expect(ackA.calls).toHaveLength(1)
    expect(ackA.calls[0]!.operationId).toBe(operationA)
    expect(ackB.calls).toHaveLength(0)
    expect(controller.getSnapshot().ticket).toBeNull()
    expect(gate.operation(operationA)?.phase).toBe('applied')
  })

  it('suppresses the captured callback when the live identity generation changes before the late ack', async () => {
    const trip = await newTrip()
    const ws = createWorkspace(trip.id)
    const gate = createWriterOperationGate()
    const ack = probe()
    const binding = bindingFor(trip)
    const config = timelineConfig({
      tripId: trip.id,
      applyChange: ws.applyChange,
      resolvePick: async hit => hit,
      onAcknowledged: ack.onAcknowledged,
      gate,
      binding,
      currentRoad: () => binding,
    })
    const controller = controllerFor(trip.id)
    await runTimelineProjectedAdd({ controller, config, row: rowFor(trip, PICK_A), dayIndex: 0 })
    const operationId = operationIdOf(ws)
    await keepUncertain(ws)

    // The user's live identity generation moved before the old save answered.
    controller.setCurrentIdentity({ tripId: trip.id, identityGeneration: 2 })
    transport.refuse = null
    expect(await resolveQueuedTripWrite(trip.id, 'retry')).toBe(true)
    await settleTicks()

    expect(ack.calls).toHaveLength(0)
    expect(controller.getSnapshot().ticket).toBeNull()
    expect(controller.getSnapshot().error).toBeNull()
    expect(controller.getSnapshot().terminal).toBeNull()
    // The write still landed in the store and the gate; only the foreign owner's
    // UI is suppressed.
    expect(gate.operation(operationId)?.phase).toBe('applied')
  })

  it('keeps the captured callback when the live hop is null before a real late ack', async () => {
    const trip = await newTrip()
    const ws = createWorkspace(trip.id)
    const gate = createWriterOperationGate()
    const ack = probe()
    const binding = bindingFor(trip)
    const config = timelineConfig({
      tripId: trip.id,
      applyChange: ws.applyChange,
      resolvePick: async hit => hit,
      onAcknowledged: ack.onAcknowledged,
      gate,
      binding,
      currentRoad: () => binding,
    })
    const controller = controllerFor(trip.id)
    await runTimelineProjectedAdd({ controller, config, row: rowFor(trip, PICK_A), dayIndex: 0 })
    await keepUncertain(ws)

    // The hook's effect sets this exact identity when the hop becomes null
    // (`config?.currentTrip()?.id ?? ''`). The captured config still owns the
    // acknowledged callback, so the save must not disappear from the UI.
    controller.setCurrentIdentity({ tripId: '', identityGeneration: 1 })
    transport.refuse = null
    expect(await resolveQueuedTripWrite(trip.id, 'retry')).toBe(true)
    await settleTicks()

    // Green regression: an empty live trip id means the road hop is
    // unavailable, not that the owner changed. The explicit owner trip id and
    // the controller's empty-id rule keep the captured `onAcknowledged`.
    expect(ack.calls).toHaveLength(1)
  })
})

describe('Timeline proven discard and held uncertainty', () => {
  it('settles a proven Saved-edits discard once, leaves another reservation, and does not let a late retry resurrect it', async () => {
    const trip = await newTrip()
    const ws = createWorkspace(trip.id)
    const gate = createWriterOperationGate()
    const ack = probe()
    const binding = bindingFor(trip)
    const config = timelineConfig({
      tripId: trip.id,
      applyChange: ws.applyChange,
      resolvePick: async hit => hit,
      onAcknowledged: ack.onAcknowledged,
      gate,
      binding,
      currentRoad: () => binding,
    })
    const controller = controllerFor(trip.id)
    await runTimelineProjectedAdd({ controller, config, row: rowFor(trip, PICK_A), dayIndex: 0 })
    const operationA = operationIdOf(ws)
    await keepUncertain(ws)
    expect(controller.getSnapshot().ticket?.operationId).toBe(operationA)
    const watch = ws.pendingRef.current!.gate.watch!
    expect(watch.settled).toBe(false)

    // A second, unrelated operation keeps its own reservation while A's exact
    // generation is decided in Saved edits.
    const wsB = createWorkspace(trip.id)
    const ackB = probe()
    const liveB = bindingFor(tripById(trip.id)!)
    const configB = timelineConfig({
      tripId: trip.id,
      applyChange: wsB.applyChange,
      resolvePick: async hit => hit,
      onAcknowledged: ackB.onAcknowledged,
      gate,
      binding: liveB,
      currentRoad: () => liveB,
    })
    const controllerB = controllerFor(trip.id)
    await runTimelineProjectedAdd({ controller: controllerB, config: configB, row: rowFor(tripById(trip.id)!, PICK_B), dayIndex: 0 })
    const operationB = operationIdOf(wsB)
    expect(gate.operation(operationB)?.phase).toBe('staged')
    expect(gate.isReserved(PICK_B, trip.id)).toBe(true)

    expect(await resolveQueuedTripWrite(trip.id, 'discard')).toBe(true)
    await settleTicks()

    expect(gate.operation(operationA)?.phase).toBe('abandoned')
    expect(gate.retryTicket(operationA)).toBeNull()
    expect(watch.settled).toBe(true)
    expect(watch.subscription).toBeNull()
    expect(gate.isReserved(PICK_A, trip.id)).toBe(false)
    expect(controller.getSnapshot().ticket).toBeNull()
    expect(controller.getSnapshot().terminal).toBe(ABANDONED_COPY)
    expect(ack.calls).toHaveLength(0)

    // The unrelated operation is untouched.
    expect(gate.operation(operationB)?.phase).toBe('staged')
    expect(gate.isReserved(PICK_B, trip.id)).toBe(true)
    expect(ackB.calls).toHaveLength(0)

    // A late retry has no ticket and no queue generation, so it cannot
    // resurrect the abandoned operation or send anything.
    const sent = transport.updates.length
    await runTimelineProjectedRetry({ controller, config })
    expect(transport.updates).toHaveLength(sent)
    expect(gate.operation(operationA)?.phase).toBe('abandoned')
    expect(controller.getSnapshot().terminal).toBe(ABANDONED_COPY)
    expect(await resolveQueuedTripWrite(trip.id, 'retry')).toBe(false)
    expect(ack.calls).toHaveLength(0)
  })

  it('keeps an unknown pending generation held with its ticket and reservation', async () => {
    const trip = await newTrip()
    const ws = createWorkspace(trip.id)
    const gate = createWriterOperationGate()
    const ack = probe()
    const binding = bindingFor(trip)
    const config = timelineConfig({
      tripId: trip.id,
      applyChange: ws.applyChange,
      resolvePick: async hit => hit,
      onAcknowledged: ack.onAcknowledged,
      gate,
      binding,
      currentRoad: () => binding,
    })
    const controller = controllerFor(trip.id)
    await runTimelineProjectedAdd({ controller, config, row: rowFor(trip, PICK_A), dayIndex: 0 })
    const operationId = operationIdOf(ws)
    await keepUncertain(ws)

    // The durable copy vanishes without a decision. Unknown is not proof that
    // the write was discarded, so the operation stays held.
    await clearWritesFor('owner-test')
    await expect(ws.actions().removePending()).resolves.toBe(false)
    expect(messages).toContain(KEEP_UNCERTAIN_HOLD)
    expect(controller.getSnapshot().ticket?.operationId).toBe(operationId)
    expect(gate.operation(operationId)?.phase).toBe('uncertain')
    expect(gate.isReserved(PICK_A, trip.id)).toBe(true)
    expect(ack.calls).toHaveLength(0)
  })
})

describe('Timeline retry revalidation after a real Keep', () => {
  it('truthfully refuses a same-ticket retry once the Keep changed the committed stop chain, with no extra resolver, id or outbound', async () => {
    const trip = await newTrip()
    const ws = createWorkspace(trip.id)
    const gate = createWriterOperationGate()
    const ack = probe()
    const binding = bindingFor(trip)
    let resolverCalls = 0
    const config = timelineConfig({
      tripId: trip.id,
      applyChange: ws.applyChange,
      resolvePick: async hit => { resolverCalls += 1; return hit },
      onAcknowledged: ack.onAcknowledged,
      gate,
      binding,
      currentRoad: () => binding,
    })
    const controller = controllerFor(trip.id)

    const beginOperationIds: Array<string | undefined> = []
    const realBegin = gate.begin
    gate.begin = request => {
      beginOperationIds.push(request.operationId)
      return realBegin(request)
    }

    await runTimelineProjectedAdd({ controller, config, row: rowFor(trip, PICK_A), dayIndex: 0 })
    const operationId = operationIdOf(ws)
    const stopId = gate.operation(operationId)?.items[0]?.stopId
    expect(resolverCalls).toBe(1)
    await keepUncertain(ws)
    expect(controller.getSnapshot().ticket?.operationId).toBe(operationId)
    expect(gate.isReserved(PICK_A, trip.id)).toBe(true)

    const sent = transport.updates.length
    const begins = beginOperationIds.length

    // Reachability limit: the real Keep committed the new stop, so the captured
    // ticket binding's routeKey no longer equals roadChainSig(currentTrip). The
    // strict service must refuse as trip-changed instead of silently replaying
    // at a new anchor. A successful strict same-bytes replay is not reachable
    // through this real workspace after a Keep; the test records that limit.
    await runTimelineProjectedRetry({ controller, config })

    expect(controller.getSnapshot().terminal).toMatch(/saved trip changed after Keep/i)
    expect(transport.updates).toHaveLength(sent)
    expect(resolverCalls).toBe(1)
    expect(beginOperationIds).toHaveLength(begins)
    expect(gate.operation(operationId)?.phase).toBe('uncertain')
    expect(gate.operation(operationId)?.items[0]?.stopId).toBe(stopId)
    expect(gate.isReserved(PICK_A, trip.id)).toBe(true)
    expect(controller.getSnapshot().ticket).toBeNull()
    expect(ack.calls).toHaveLength(0)
  })
})

describe('real uncertain save survives a Timeline remount with a null/changed hop', () => {
  const HOOK_FILE = readFileSync(new URL('../src/pages/trip/timeline/useTimelineProjectedWriter.ts', import.meta.url), 'utf8')
  const hookAst = ts.createSourceFile('hook.ts', HOOK_FILE, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const hookNode = hookAst.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'useTimelineProjectedWriter')
  if (!hookNode) throw new Error('useTimelineProjectedWriter is missing')
  const HOOK_JS = ts.transpileModule(hookNode.getText(hookAst), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText

  function mountHook(
    controller: TimelineWriterController,
    config: ReturnType<typeof timelineConfig> | null,
    generation: number,
    previewOpen = false,
  ) {
    let slots: unknown[] = []
    let deps: unknown[][] = []
    let index = 0
    let effects: Array<() => void> = []
    const context: Record<string, unknown> = {
      exports: {},
      module: { exports: {} },
      createTimelineWriterController,
      runTimelineProjectedAdd,
      runTimelineProjectedRetry,
      PREVIEW_RETRY_BLOCK: 'Resolve the unconfirmed save in Saved edits before retrying.',
      BUSY_RETRY_BLOCK: 'Wait for the current save action to finish before retrying.',
      useMemo(fn: () => unknown, values: unknown[]) {
        const i = index++
        if (!deps[i] || values.some((v, k) => !Object.is(v, deps[i][k]))) { deps[i] = values; slots[i] = fn() }
        return slots[i]
      },
      useRef(initial: unknown) {
        const i = index++
        return slots[i] ?? (slots[i] = { current: initial })
      },
      useCallback(fn: unknown, values: unknown[]) {
        const i = index++
        if (!deps[i] || values.some((v, k) => !Object.is(v, deps[i][k]))) { deps[i] = values; slots[i] = fn }
        return slots[i]
      },
      useEffect(fn: () => void, values: unknown[]) {
        const i = index++
        if (!deps[i] || values.some((v, k) => !Object.is(v, deps[i][k]))) { deps[i] = values; effects.push(fn) }
      },
      useSyncExternalStore(_s: unknown, get: () => unknown) { return get() },
    }
    context.module = { exports: context.exports }
    runInContext(HOOK_JS, createContext(context))
    const hook = (context.exports as Record<string, unknown>).useTimelineProjectedWriter as (
      c: unknown, p: boolean, g: number, owner: string, ctrl: unknown,
    ) => { retryAvailable: boolean; unresolved: boolean; retryBlockedReason: string | null; retry?: () => void }
    index = 0
    slots = []
    deps = []
    effects = []
    const result = hook(config, previewOpen, generation, tripIdForTest, controller)
    for (const effect of effects.splice(0)) effect()
    return result
  }
  let tripIdForTest = ''

  it('keeps the real ticket/reservation and terminalizes on a changed live road', async () => {
    const trip = await newTrip()
    tripIdForTest = trip.id
    const ws = createWorkspace(trip.id)
    const gate = createWriterOperationGate()
    const ack = probe()
    const uncertain = probe()
    const binding = bindingFor(trip)
    let live = binding
    const resolverCalls = { count: 0 }
    const config = timelineConfig({
      tripId: trip.id,
      applyChange: ws.applyChange,
      resolvePick: async hit => { resolverCalls.count += 1; return hit },
      onAcknowledged: ack.onAcknowledged,
      onUncertain: uncertain.onAcknowledged,
      gate,
      binding,
      currentRoad: () => live,
    })
    const controller = controllerFor(trip.id)
    await runTimelineProjectedAdd({ controller, config, row: rowFor(trip, PICK_A), dayIndex: 0 })
    const operationId = operationIdOf(ws)
    await keepUncertain(ws)
    expect(controller.getSnapshot().ticket?.operationId).toBe(operationId)
    expect(gate.isReserved(PICK_A, trip.id)).toBe(true)
    const sent = transport.updates.length

    // While the failed Keep preview is still open, Retry must be explicitly
    // blocked, not an enabled silent no-op.
    const blocked = mountHook(controller, config, 1, true)
    expect(blocked.retryAvailable).toBe(true)
    expect(blocked.retryBlockedReason).toMatch(/Saved edits/i)
    blocked.retry?.()
    await settleTicks()
    expect(transport.updates).toHaveLength(sent)
    expect(resolverCalls.count).toBe(1)
    expect(controller.getSnapshot().ticket?.operationId).toBe(operationId)

    // The Timeline tab unmounts; the Workspace-owned controller survives and the
    // hook remounts with a null hop. The live measurement then changes.
    const remounted = mountHook(controller, null, 1)
    expect(remounted.retryAvailable).toBe(true)
    expect(remounted.unresolved).toBe(true)
    live = bindingFor(trip, { distanceKm: 13 })
    remounted.retry?.()
    await settleTicks()

    expect(controller.getSnapshot().terminal).toMatch(/changed/i)
    expect(controller.getSnapshot().ticket).toBeNull()
    expect(controller.hasUnresolved()).toBe(true)
    expect(resolverCalls.count).toBe(1)
    expect(transport.updates).toHaveLength(sent)
    expect(gate.operation(operationId)?.phase).toBe('uncertain')
    expect(gate.isReserved(PICK_A, trip.id)).toBe(true)
    expect(ack.calls).toHaveLength(0)

    // The real Saved-edits discard settles the captured operation.
    expect(await resolveQueuedTripWrite(trip.id, 'discard')).toBe(true)
    await settleTicks()
    expect(gate.operation(operationId)?.phase).toBe('abandoned')
    expect(controller.hasUnresolved()).toBe(false)
    expect(controller.getSnapshot().terminal).toBe(ABANDONED_COPY)
  })
})

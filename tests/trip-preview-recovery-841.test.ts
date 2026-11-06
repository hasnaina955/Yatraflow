import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { seedData } from '../src/data/seed'
import type { QueuedWrite, WriteQueueStore } from '../src/lib/writeQueue'

const { state } = vi.hoisted(() => ({
  state: {
    updates: [] as Array<{ payload: unknown; eq: Record<string, unknown> }>,
    refuse: null as null | { message: string },
    hold: null as null | Promise<{ data: null; error: null | { message: string } }>,
    deny: false,
    listFails: false,
    rejectWrites: false,
    configured: false,
    heldList: null as null | Promise<unknown[]>,
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
        return (state.hold ?? Promise.resolve({ data: null, error: state.refuse })).then(res, rej)
      }
      return Promise.resolve({ data: null, error: null }).then(res, rej)
    }
    return builder
  }
  return { get isSupabaseConfigured() { return state.configured }, supabase: tripWriteClient({ auth: { signOut: async () => ({ error: null }) }, from: (t: string) => makeBuilder(t) }) }
})

vi.mock('../src/lib/writeQueue', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/lib/writeQueue')>()
  const map = new Map<string, QueuedWrite>()
  const mem: WriteQueueStore = {
    list: async () => {
      if (state.heldList) return state.heldList
      if (state.listFails) throw new Error('storage read failed')
      return [...map.values()]
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
    pendingWrites: () => state.rejectWrites
      ? Promise.reject(new Error('storage read failed'))
      : actual.pendingWrites(mem),
    pendingWriteCount: (ownerId?: string) => actual.pendingWriteCount(ownerId, mem),
    clearWritesFor: (ownerId: string) => actual.clearWritesFor(ownerId, mem),
  }
})

import {
  duplicateTrip, updateTrip, tripById, tripWriteReceipt, admitTripPreview, trackTripPreview,
  observeTripPreview, tripPreviewPending, resolveQueuedTripWrite, getSnapshot, logout, subscribe,
  _setTripWriteDebounceMs, _cancelTripWrites,
  type TripPreviewObservation,
} from '../src/store/store'
import { clearWritesFor, pendingWrites } from '../src/lib/writeQueue'

const tick = async () => { await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0)) }
const keralaTrip = seedData.trips[0]

beforeEach(async () => {
  state.heldList = null
  state.listFails = false
  state.rejectWrites = false
  state.hold = null
  getSnapshot().sessionUserId = 'owner-test'
  _setTripWriteDebounceMs(0)
  await clearWritesFor('owner-test')
  state.updates.length = 0
  state.refuse = null
  state.hold = null
  state.deny = false
  state.listFails = false
  state.rejectWrites = false
  state.configured = false
  state.heldList = null
})

afterEach(() => {
  _cancelTripWrites()
  _setTripWriteDebounceMs(0)
  state.heldList = null
})

const baseOf = (id: string) => {
  const trip = tripById(id)
  if (!trip) throw new Error('Missing trip')
  return structuredClone(trip)
}

describe('exact preview admission facts', () => {
  it('attributes a same-content synchronous subscriber to the real own generation', async () => {
    const trip = duplicateTrip(keralaTrip, 'owner-test')
    await tick()
    const base = baseOf(trip.id)
    const patch = { name: 'Preview' }
    // A synchronous subscriber queues a nested write with the SAME content
    // during the cache commit. The outer admission still passes its
    // stillAdmissible check, because JSON equality cannot tell the two
    // admissions apart, and persists its own generation afterwards.
    let nested = 0
    const unsubscribe = subscribe(() => {
      if (nested !== 0 || tripById(trip.id)?.name !== 'Preview') return
      nested += 1
      updateTrip(trip.id, { name: 'Preview' })
    })
    let admission: Awaited<ReturnType<typeof trackTripPreview>>
    try {
      admission = await trackTripPreview({ tripId: trip.id, expectedBase: base, patch })
    } finally {
      unsubscribe()
    }
    expect(nested).toBe(1)
    expect(admission.kind).toBe('admitted')
    if (admission.kind !== 'admitted') return
    const queued = (await pendingWrites()).find(write => write.tripId === trip.id)
    expect(admission.operation.revision).toBe(queued?.revision)
    const observations: TripPreviewObservation[] = []
    const subscription = observeTripPreview(admission.operation, observation => observations.push(observation))
    const receipt = await admission.receipt
    expect(receipt).toMatchObject({ kind: 'acknowledged', revision: admission.operation.revision })
    expect(observations.filter(observation => observation.kind === 'acknowledged')).toHaveLength(1)
    expect(subscription.observation().kind).toBe('acknowledged')
    expect((await tripPreviewPending(admission.operation)).state).toBe('settled')
    subscription.dispose()
  })

  it('captures the expected base, patch and own generation at admission', async () => {
    let release: (result: { data: null; error: null }) => void = () => {}
    state.hold = new Promise(resolve => { release = resolve })
    const trip = duplicateTrip(keralaTrip, 'owner-test')
    await tick()
    const base = baseOf(trip.id)
    const patch = { name: 'Preview', travellers: 9 }
    const admission = await trackTripPreview({ tripId: trip.id, expectedBase: base, patch })
    expect(admission.kind).toBe('admitted')
    if (admission.kind !== 'admitted') return
    patch.name = 'Changed after admission'
    const queued = (await pendingWrites()).find(write => write.tripId === trip.id)
    expect(queued?.trip.name).toBe('Preview')
    expect(admission.operation.revision).toBe(queued?.revision)
    expect(admission.operation.capturedAt).toBe(queued?.capturedAt)
    expect(admission.operation.userId).toBe('owner-test')
    expect(admission.operation.tripId).toBe(trip.id)
    release({ data: null, error: null })
    const receipt = await admission.receipt
    expect(receipt).toEqual({ kind: 'acknowledged', revision: queued?.revision, writeVersion: 1 })
    const pending = await tripPreviewPending(admission.operation)
    expect(pending.state).toBe('settled')
  })

  it('distinguishes a pre-admission refusal from an admitted, superseded operation whose fields all differ', async () => {
    const trip = duplicateTrip(keralaTrip, 'owner-test')
    await tick()
    const stale = await trackTripPreview({ tripId: trip.id, expectedBase: { ...baseOf(trip.id), name: 'Old' }, patch: { name: 'Preview' } })
    expect(stale.kind).toBe('stale')
    // A synchronous subscriber queues a newer generation during admission, so
    // this operation has no own sender. It stays admitted-but-superseded.
    const unsubscribe = subscribe(() => {
      if (tripById(trip.id)?.name === 'Preview') {
        updateTrip(trip.id, { name: 'Different', travellers: 2, budgetPerPersonInr: 999 })
      }
    })
    let operation: Awaited<ReturnType<typeof trackTripPreview>>
    try {
      operation = await trackTripPreview({ tripId: trip.id, expectedBase: baseOf(trip.id), patch: { name: 'Preview', travellers: 5 } })
    } finally { unsubscribe() }
    expect(operation.kind).toBe('superseded')
    if (operation.kind !== 'superseded' && operation.kind !== 'admitted') return
    await tick()
    expect(tripById(trip.id)?.name).toBe('Different')
    expect(tripById(trip.id)?.travellers).toBe(2)
    const pending = await tripPreviewPending(operation.operation)
    expect(['pending', 'unknown']).toContain(pending.state)
    expect(pending.state).not.toBe('settled')
    expect(stale.kind).toBe('stale')
  })

  it('does not lend a newer generation receipt to an older operation', async () => {
    const trip = duplicateTrip(keralaTrip, 'owner-test')
    await tick()
    const first = await trackTripPreview({ tripId: trip.id, expectedBase: baseOf(trip.id), patch: { name: 'First' } })
    expect(first.kind).toBe('admitted')
    if (first.kind !== 'admitted') return
    await first.receipt
    await tick()
    const second = await trackTripPreview({ tripId: trip.id, expectedBase: baseOf(trip.id), patch: { name: 'Second' } })
    expect(second.kind).toBe('admitted')
    if (second.kind !== 'admitted') return
    await second.receipt
    expect(first.operation.revision).not.toBe(second.operation.revision)
    const firstPending = await tripPreviewPending(first.operation)
    const secondPending = await tripPreviewPending(second.operation)
    expect(firstPending.state).toBe('settled')
    expect(secondPending.state).toBe('settled')
  })

  it('keeps admitTripPreview and updateTrip contracts unchanged', async () => {
    const trip = duplicateTrip(keralaTrip, 'owner-test')
    await tick()
    expect(updateTrip(trip.id, { name: 'Boolean' })).toBe(true)
    await expect(tripWriteReceipt(trip.id)).resolves.toMatchObject({ kind: 'acknowledged' })
    await expect(admitTripPreview({ tripId: trip.id, expectedBase: baseOf(trip.id), patch: { name: 'Preview' } }))
      .resolves.toMatchObject({ kind: 'acknowledged' })
  })
})

describe('identity-scoped pending and recovery', () => {
  it('holds a memory-only debounced write even when the durable queue is absent', async () => {
    _setTripWriteDebounceMs(10_000)
    const trip = duplicateTrip(keralaTrip, 'owner-test')
    await tick()
    const admission = await trackTripPreview({ tripId: trip.id, expectedBase: baseOf(trip.id), patch: { name: 'Held' } })
    expect(admission.kind).toBe('admitted')
    if (admission.kind !== 'admitted') return
    // The queue write is still in flight; remove any durable entry to prove the
    // in-memory debounce and sender tail are the facts that keep it pending.
    const durable = (await pendingWrites()).find(write => write.tripId === trip.id)
    if (durable) {
      const { dropQueuedWrite } = await import('../src/lib/writeQueue')
      await dropQueuedWrite(durable)
    }
    const pending = await tripPreviewPending(admission.operation)
    expect(pending.state).toBe('pending')
    expect(pending.sources).toContain('memory')
  })

  it('holds an active sender tail with the durable queue absent', async () => {
    let release: (result: { data: null; error: null }) => void = () => {}
    state.hold = new Promise(resolve => { release = resolve })
    const trip = duplicateTrip(keralaTrip, 'owner-test')
    await tick()
    const admission = await trackTripPreview({ tripId: trip.id, expectedBase: baseOf(trip.id), patch: { name: 'In flight' } })
    expect(admission.kind).toBe('admitted')
    if (admission.kind !== 'admitted') return
    await tick()
    const pending = await tripPreviewPending(admission.operation)
    expect(pending.state).toBe('pending')
    expect(pending.sources).toContain('sender-tail')
    release({ data: null, error: null })
    await admission.receipt
    expect((await tripPreviewPending(admission.operation)).state).toBe('settled')
  })

  it('treats a failed storage read as unknown, never empty', async () => {
    let release: (result: { data: null; error: null }) => void = () => {}
    state.hold = new Promise(resolve => { release = resolve })
    const trip = duplicateTrip(keralaTrip, 'owner-test')
    await tick()
    const admission = await trackTripPreview({ tripId: trip.id, expectedBase: baseOf(trip.id), patch: { name: 'Unreadable' } })
    expect(admission.kind).toBe('admitted')
    if (admission.kind !== 'admitted') return
    await tick()
    state.rejectWrites = true
    const pending = await tripPreviewPending(admission.operation)
    expect(pending.state).toBe('unknown')
    expect(pending.reason).toBe('queue-read-failed')
    expect(pending.sources).toContain('read-failed')
    state.rejectWrites = false
    release({ data: null, error: null })
    await admission.receipt
  })

  it('rechecks owner, identity and access after the queue read', async () => {
    let release: (result: { data: null; error: null }) => void = () => {}
    state.hold = new Promise(resolve => { release = resolve })
    const trip = duplicateTrip(keralaTrip, 'owner-test')
    await tick()
    const admission = await trackTripPreview({ tripId: trip.id, expectedBase: baseOf(trip.id), patch: { name: 'Departing' } })
    expect(admission.kind).toBe('admitted')
    if (admission.kind !== 'admitted') return
    await tick()
    let releaseList: (rows: unknown[]) => void = () => {}
    state.heldList = new Promise<unknown[]>(resolve => { releaseList = resolve })
    const pending = tripPreviewPending(admission.operation)
    await logout()
    releaseList([])
    release({ data: null, error: null })
    expect((await pending).state).toBe('foreign')
  })

  it('does not let an unrelated trip or user block or leak', async () => {
    const trip = duplicateTrip(keralaTrip, 'owner-test')
    const other = duplicateTrip(keralaTrip, 'owner-test')
    await tick()
    const admission = await trackTripPreview({ tripId: trip.id, expectedBase: baseOf(trip.id), patch: { name: 'Mine' } })
    expect(admission.kind).toBe('admitted')
    if (admission.kind !== 'admitted') return
    await admission.receipt
    updateTrip(other.id, { name: 'Unrelated', travellers: 3 })
    await tick()
    const pending = await tripPreviewPending(admission.operation)
    expect(pending.state).toBe('settled')
  })
})

describe('late acknowledgement of the exact generation', () => {
  it('receives the real validated receipt once after a Saved edits retry', async () => {
    const trip = duplicateTrip(keralaTrip, 'owner-test')
    await tick()
    state.refuse = { message: 'connection lost' }
    const admission = await trackTripPreview({ tripId: trip.id, expectedBase: baseOf(trip.id), patch: { name: 'Retry me' } })
    expect(admission.kind).toBe('admitted')
    if (admission.kind !== 'admitted') return
    const observations: TripPreviewObservation[] = []
    const subscription = observeTripPreview(admission.operation, observation => observations.push(observation))
    await expect(admission.receipt).resolves.toMatchObject({ kind: 'unavailable' })
    expect(observations.some(observation => observation.kind === 'acknowledged')).toBe(false)
    state.refuse = null
    expect(await resolveQueuedTripWrite(trip.id, 'retry')).toBe(true)
    expect(state.updates).toHaveLength(2)
    expect(state.updates[1].payload).toEqual(state.updates[0].payload)
    const acknowledged = observations.filter(observation => observation.kind === 'acknowledged')
    expect(acknowledged).toHaveLength(1)
    expect(acknowledged[0]).toMatchObject({ kind: 'acknowledged', receipt: { revision: admission.operation.revision } })
    expect(subscription.observation().kind).toBe('acknowledged')
    expect((await tripPreviewPending(admission.operation)).state).toBe('settled')
    subscription.dispose()
  })

  it('lets a late subscriber replay the stored same-generation receipt', async () => {
    const trip = duplicateTrip(keralaTrip, 'owner-test')
    await tick()
    const admission = await trackTripPreview({ tripId: trip.id, expectedBase: baseOf(trip.id), patch: { name: 'Late' } })
    expect(admission.kind).toBe('admitted')
    if (admission.kind !== 'admitted') return
    await admission.receipt
    const observations: TripPreviewObservation[] = []
    const subscription = observeTripPreview(admission.operation, observation => observations.push(observation))
    expect(observations).toHaveLength(1)
    expect(observations[0].kind).toBe('acknowledged')
    expect(subscription.observation().kind).toBe('acknowledged')
    subscription.dispose()
  })

  it('does not let a replacement or rebased payload lend its receipt', async () => {
    const trip = duplicateTrip(keralaTrip, 'owner-test')
    await tick()
    const admission = await trackTripPreview({ tripId: trip.id, expectedBase: baseOf(trip.id), patch: { name: 'First' } })
    expect(admission.kind).toBe('admitted')
    if (admission.kind !== 'admitted') return
    const observations: TripPreviewObservation[] = []
    const subscription = observeTripPreview(admission.operation, observation => observations.push(observation))
    await admission.receipt
    await tick()
    const replacement = await trackTripPreview({ tripId: trip.id, expectedBase: baseOf(trip.id), patch: { name: 'Replacement' } })
    expect(replacement.kind).toBe('admitted')
    if (replacement.kind === 'admitted') await replacement.receipt
    expect(observations.filter(observation => observation.kind === 'acknowledged')).toHaveLength(1)
    expect(observations[0]).toMatchObject({ receipt: { revision: admission.operation.revision } })
    subscription.dispose()
  })

  it('distinguishes an explicit queued discard from an unknown disappearance', async () => {
    const trip = duplicateTrip(keralaTrip, 'owner-test')
    await tick()
    state.refuse = { message: 'offline' }
    const admission = await trackTripPreview({ tripId: trip.id, expectedBase: baseOf(trip.id), patch: { name: 'Discard me' } })
    expect(admission.kind).toBe('admitted')
    if (admission.kind !== 'admitted') return
    const observations: TripPreviewObservation[] = []
    const subscription = observeTripPreview(admission.operation, observation => observations.push(observation))
    await admission.receipt
    state.refuse = null
    expect(await resolveQueuedTripWrite(trip.id, 'discard')).toBe(true)
    const discarded = observations.filter(observation => observation.kind === 'discarded')
    expect(discarded).toHaveLength(1)
    expect((await tripPreviewPending(admission.operation)).state).toBe('discarded')
    subscription.dispose()
  })

  it('keeps an unresolved disappearance unknown rather than fabricating success', async () => {
    const trip = duplicateTrip(keralaTrip, 'owner-test')
    await tick()
    const admission = await trackTripPreview({ tripId: trip.id, expectedBase: baseOf(trip.id), patch: { name: 'Vanished' } })
    expect(admission.kind).toBe('admitted')
    if (admission.kind !== 'admitted') return
    await admission.receipt
    const forged = { ...admission.operation, revision: `${admission.operation.revision}-other` }
    const pending = await tripPreviewPending(forged)
    expect(pending.state).toBe('unknown')
    expect(pending.reason).toBe('no-operation-record')
    const observation = observeTripPreview(forged, () => {})
    expect(observation.observation().kind).toBe('foreign')
    observation.dispose()
  })

  it('does not notify a new identity with the old account late acknowledgement', async () => {
    let release: (result: { data: null; error: null }) => void = () => {}
    state.hold = new Promise(resolve => { release = resolve })
    const trip = duplicateTrip(keralaTrip, 'owner-test')
    await tick()
    const admission = await trackTripPreview({ tripId: trip.id, expectedBase: baseOf(trip.id), patch: { name: 'Old account' } })
    expect(admission.kind).toBe('admitted')
    if (admission.kind !== 'admitted') return
    const observations: TripPreviewObservation[] = []
    const subscription = observeTripPreview(admission.operation, observation => observations.push(observation))
    await tick()
    await logout()
    release({ data: null, error: null })
    await tick()
    expect(observations.some(observation => observation.kind === 'acknowledged')).toBe(false)
    expect(observations.some(observation => observation.kind === 'foreign')).toBe(true)
    expect((await tripPreviewPending(admission.operation)).state).toBe('foreign')
    expect(subscription.observation().kind).not.toBe('acknowledged')
    subscription.dispose()
  })

  it('cleans listeners and records on disposal', async () => {
    const trip = duplicateTrip(keralaTrip, 'owner-test')
    await tick()
    const admission = await trackTripPreview({ tripId: trip.id, expectedBase: baseOf(trip.id), patch: { name: 'Dispose' } })
    expect(admission.kind).toBe('admitted')
    if (admission.kind !== 'admitted') return
    const observations: TripPreviewObservation[] = []
    const subscription = observeTripPreview(admission.operation, observation => observations.push(observation))
    subscription.dispose()
    await admission.receipt
    expect(observations).toHaveLength(0)
    expect(subscription.observation().kind).toBe('acknowledged')
  })
})

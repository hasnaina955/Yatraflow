import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { QueuedWrite, WriteQueueStore } from '../../src/lib/writeQueue'

const { state } = vi.hoisted(() => ({
  state: {
    rpcCalls: [] as Array<{ commandId: string; command: Record<string, unknown> }>,
    rpcResponse: null as unknown,
    rpcThrows: false,
    rpcHold: null as null | { entered: () => void; release: Promise<void> },
    updates: [] as Array<{ payload: unknown; eq: Record<string, unknown> }>,
    fromCalls: [] as Array<{ table: string; method: string }>,
    updateHold: null as null | { entered: () => void; release: Promise<void> },
    configured: false,
    ownerMember: null as null | { user_id: string; role: string; joined_at: number },
    currentTripRow: null as null | { id: string; owner_id: string; write_version: number; deleted_at: string | null },
  },
}))

vi.mock('../../src/lib/supabase', () => {
  const makeBuilder = (table: string) => {
    let method = 'select'
    let payload: unknown
    const eqs: Record<string, unknown> = {}
    const builder: Record<string, unknown> = {}
    const chain = (name: string, value?: unknown) => { method = name; payload = value; return builder }
    builder.update = (value: unknown) => chain('update', value)
    builder.insert = (value: unknown) => chain('insert', value)
    builder.delete = () => chain('delete')
    builder.select = () => builder
    builder.eq = (column: string, value: unknown) => { eqs[column] = value; return builder }
    builder.in = () => builder
    builder.is = () => builder
    builder.order = () => builder
    builder.limit = () => builder
    builder.maybeSingle = () => builder
    builder.single = () => builder
    builder.setHeader = () => builder
    builder.then = (resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) => {
      state.fromCalls.push({ table, method })
      if (method === 'select' && table === 'trip_members' && state.ownerMember) {
        return Promise.resolve({ data: state.ownerMember, error: null }).then(resolve, reject)
      }
      if (method === 'select' && table === 'trips' && state.currentTripRow) {
        return Promise.resolve({ data: state.currentTripRow, error: null }).then(resolve, reject)
      }
      if (method === 'update' && table === 'trips') {
        state.updates.push({ payload, eq: { ...eqs } })
        const hold = state.updateHold
        if (hold) {
          hold.entered()
          return hold.release.then(() => ({ data: [{ id: tripId, write_version: 8, updated_at: 1 }], error: null, count: 1 })).then(resolve, reject)
        }
        return Promise.resolve({ data: [{ id: tripId, write_version: 8, updated_at: 1 }], error: null, count: 1 }).then(resolve, reject)
      }
      return Promise.resolve({ data: null, error: null, count: 1 }).then(resolve, reject)
    }
    return builder
  }
  return {
    get isSupabaseConfigured() { return state.configured },
    supabase: {
      rpc: async (_name: string, args: { p_command_id: string; p_command: Record<string, unknown> }) => {
        state.rpcCalls.push({ commandId: args.p_command_id, command: args.p_command })
        const hold = state.rpcHold
        if (hold) { hold.entered(); await hold.release }
        if (state.rpcThrows) throw new Error('transport down')
        return { data: state.rpcResponse, error: null }
      },
      from: (table: string) => makeBuilder(table),
      auth: {
        getSession: async () => {
          const { getSnapshot } = await import('../../src/store/store')
          const userId = getSnapshot().sessionUserId
          return { data: { session: userId ? { user: { id: userId }, access_token: `fixture-${userId}` } : null }, error: null }
        },
        signOut: async () => ({ error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
      channel: () => ({ on: () => ({ subscribe: () => ({}) }), unsubscribe: () => {} }),
      removeChannel: () => {},
    },
  }
})

vi.mock('../../src/lib/writeQueue', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/lib/writeQueue')>()
  const map = new Map<string, QueuedWrite>()
  const mem: WriteQueueStore = {
    list: async () => [...map.values()],
    put: async entry => { map.set(actual.writeQueueKey(entry.ownerId, entry.tripId), entry) },
    remove: async tripId => { map.delete(tripId) },
    removeIf: async (key, capturedAt, revision, ownerId) => {
      const current = map.get(key)
      if (!current || (ownerId !== undefined && current.ownerId !== ownerId)) return false
      if (current.revision !== revision || (revision === undefined && current.capturedAt !== capturedAt)) return false
      map.delete(key)
      return true
    },
    putIf: async (entry, expectedCapturedAt, expectedRevision) => {
      const key = actual.writeQueueKey(entry.ownerId, entry.tripId)
      const current = map.get(key)
      if (!current || current.ownerId !== entry.ownerId || current.revision !== expectedRevision
        || (expectedRevision === undefined && current.capturedAt !== expectedCapturedAt)) return false
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

import type { Trip } from '../../src/data/types'
import { clearWritesFor, queueWrite, pendingWrites } from '../../src/lib/writeQueue'

const owner = 'owner-binding-841'
const tripId = 'trip-binding-841'
const otherTripId = 'trip-other-841'

function trip(id = tripId): Trip {
  return {
    id, name: 'Trip', startLocation: 'Test', destinations: ['Test'], startDate: '2026-11-01', endDate: '2026-11-02',
    travellers: 2, transportMode: 'car', budgetPerPersonInr: 5000, travelStyle: 'balanced',
    fixedCommitments: [], coverEmoji: '🧭', visibility: 'private',
    writeVersion: 7, createdAt: 1, updatedAt: 1,
    days: [
      { id: 'day-a', index: 0, title: 'Day 1', stops: [] },
      { id: 'day-b', index: 1, title: 'Day 2', stops: [] },
    ],
    members: [{ userId: owner, role: 'owner', joinedAt: 1 }],
    expenses: [],
  }
}

function applied() {
  return {
    status: 'applied', tripRevision: 8, winnerId: 'slot:lunch:winner',
    placementStatus: 'applied', stopId: 'st_winner',
    decision: {
      id: 'decision-841', trip_id: tripId, question: 'Lunch?', options: [],
      votes_by_user_id: {}, comments: [], status: 'resolved',
      resolved_option_id: 'slot:lunch:winner', resolved_stop_id: 'st_winner', raised_by: owner,
    },
  }
}

const freshStore = async () => {
  const store = await import('../../src/store/store')
  store._setTripWriteDebounceMs(0)
  return store
}

function seed(store: Awaited<ReturnType<typeof freshStore>>, id = tripId): void {
  const db = store.getSnapshot()
  db.sessionUserId = owner
  db.trips = [trip(id)]
  db.decisions = [{
    id: 'decision-841', tripId: id, question: 'Lunch?', context: '',
    options: [
      { id: 'slot:lunch:winner', label: 'Winner', place: { title: 'Cafe', category: 'food', locationName: 'Cafe', lat: 15.5, lng: 73.9, visitMinutes: 45, dayId: 'day-a', dayIndex: 0 } },
      { id: 'slot:lunch:other', label: 'Other' },
    ],
    votesByUserId: { [owner]: 'slot:lunch:winner' }, comments: [], status: 'open',
    raisedBy: owner, createdAt: 1,
  }]
}

describe('stage-c/841 ordered resolution captured intent and write admission', () => {
  let store: Awaited<ReturnType<typeof freshStore>>

  beforeEach(async () => {
    vi.resetModules()
    state.rpcCalls = []
    state.rpcResponse = applied()
    state.rpcThrows = false
    state.rpcHold = null
    state.updates = []
    state.fromCalls = []
    state.updateHold = null
    state.configured = false
    state.ownerMember = null
    state.currentTripRow = null
    store = await freshStore()
    await clearWritesFor(owner)
    seed(store)
  })

  afterEach(async () => {
    await clearWritesFor(owner)
    store._setTripWriteDebounceMs(600)
  })

  const intent = (expectedRevision: number, beforeStopId: string | null = 'st-stay') => ({
    dayId: 'day-a', dayIndex: 0,
    orderedPlacement: { dayId: 'day-a', beforeStopId, expectedRevision },
  })

  it('keeps the captured revision when the cache writeVersion advances', async () => {
    const captured = intent(7)
    const db = store.getSnapshot()
    db.trips = [{ ...store.tripById(tripId)!, writeVersion: 12 }]
    const outcome = await store.resolveDecision('decision-841', 'slot:lunch:winner', captured)
    expect(outcome).toMatchObject({ status: 'conflict' })
    expect(state.rpcCalls).toHaveLength(0)
    expect(state.fromCalls.some(call => call.table === 'decisions')).toBe(false)
    expect(captured.orderedPlacement).toEqual({ dayId: 'day-a', beforeStopId: 'st-stay', expectedRevision: 7 })
  })

  it('sends only the server wire shape with the captured revision', async () => {
    await store.resolveDecision('decision-841', 'slot:lunch:winner', intent(7))
    expect(state.rpcCalls).toHaveLength(1)
    expect(state.rpcCalls[0].command).toEqual({
      type: 'decision.resolve', decisionId: 'decision-841', optionId: 'slot:lunch:winner',
      expectedRevision: 7, dayId: 'day-a', dayIndex: 0,
      orderedPlacement: { dayId: 'day-a', beforeStopId: 'st-stay' },
    })
  })

  it('replays the exact same command id and bytes after an uncertain reply and a cache version change', async () => {
    state.rpcThrows = true
    const captured = intent(7)
    const first = await store.resolveDecision('decision-841', 'slot:lunch:winner', captured)
    expect(first).toMatchObject({ status: 'unavailable' })
    const db = store.getSnapshot()
    db.trips = [{ ...store.tripById(tripId)!, writeVersion: 12 }]
    const second = await store.resolveDecision('decision-841', 'slot:lunch:winner', captured)
    expect(second).toMatchObject({ status: 'unavailable' })
    expect(state.rpcCalls).toHaveLength(2)
    expect(state.rpcCalls[1].commandId).toBe(state.rpcCalls[0].commandId)
    expect(state.rpcCalls[1].command).toEqual(state.rpcCalls[0].command)
    expect(state.rpcCalls[1].command).toEqual({
      type: 'decision.resolve', decisionId: 'decision-841', optionId: 'slot:lunch:winner',
      expectedRevision: 7, dayId: 'day-a', dayIndex: 0,
      orderedPlacement: { dayId: 'day-a', beforeStopId: 'st-stay' },
    })
  })

  it('mints a new command id for a deliberately reevaluated captured intent', async () => {
    state.rpcThrows = true
    await store.resolveDecision('decision-841', 'slot:lunch:winner', intent(7))
    await store.resolveDecision('decision-841', 'slot:lunch:winner', intent(8, 'st-new'))
    expect(state.rpcCalls).toHaveLength(2)
    expect(state.rpcCalls[1].commandId).not.toBe(state.rpcCalls[0].commandId)
    expect(state.rpcCalls[1].command.expectedRevision).toBe(8)
  })

  it('refuses an ordered resolve while an earlier debounced edit is pending', async () => {
    store._setTripWriteDebounceMs(600)
    expect(store.updateTrip(tripId, { name: 'Renamed' })).toBe(true)
    const before = await pendingWrites()
    expect(before.some(write => write.tripId === tripId && write.ownerId === owner)).toBe(true)
    const outcome = await store.resolveDecision('decision-841', 'slot:lunch:winner', intent(7))
    expect(outcome.status === 'conflict' || outcome.status === 'unavailable').toBe(true)
    expect(state.rpcCalls).toHaveLength(0)
    expect(await pendingWrites()).toEqual(before)
    expect(store.tripById(tripId)?.name).toBe('Renamed')
  })

  it('refuses an ordered resolve while an earlier durable queued write exists', async () => {
    await queueWrite({
      tripId, ownerId: owner, capturedAt: 1700000000000, baseVersion: 7,
      attempts: 0, revision: 'held-edit', trip: trip(),
    })
    const before = await pendingWrites()
    const outcome = await store.resolveDecision('decision-841', 'slot:lunch:winner', intent(7))
    expect(outcome.status === 'conflict' || outcome.status === 'unavailable').toBe(true)
    expect(state.rpcCalls).toHaveLength(0)
    expect(await pendingWrites()).toEqual(before)
  })

  it('does not let an unrelated trip edit block this ordered resolve', async () => {
    const db = store.getSnapshot()
    db.trips = [store.tripById(tripId)!, trip(otherTripId)]
    store._setTripWriteDebounceMs(600)
    expect(store.updateTrip(otherTripId, { name: 'Other plan' })).toBe(true)
    const outcome = await store.resolveDecision('decision-841', 'slot:lunch:winner', intent(7))
    expect(outcome).toMatchObject({ status: 'applied' })
    expect(state.rpcCalls).toHaveLength(1)
  })

  it('waits behind a held earlier sender and refuses after access changes', async () => {
    let entered: () => void = () => {}
    const enteredPromise = new Promise<void>(resolve => { entered = resolve })
    let release: () => void = () => {}
    const releasePromise = new Promise<void>(resolve => { release = resolve })
    state.updateHold = { entered: () => entered(), release: releasePromise }
    state.configured = true
    state.ownerMember = { user_id: owner, role: 'owner', joined_at: 1 }
    state.currentTripRow = { id: tripId, owner_id: owner, write_version: 7, deleted_at: null }
    store._setTripWriteDebounceMs(600)
    expect(store.updateTrip(tripId, { name: 'In flight' })).toBe(true)
    store._flushTripWrites()
    await enteredPromise
    const resolvePromise = store.resolveDecision('decision-841', 'slot:lunch:winner', intent(7))
    expect(state.rpcCalls).toHaveLength(0)
    store._applyRealtimeEventForTest('trip_members', {
      schema: 'public', table: 'trip_members', commitTimestamp: '2026-11-06T00:00:00Z',
      eventType: 'UPDATE', new: { trip_id: tripId, user_id: owner, role: 'viewer' },
      old: { trip_id: tripId, user_id: owner, role: 'owner' }, errors: null,
    } as never)
    release()
    const outcome = await resolvePromise
    expect(outcome.status === 'conflict' || outcome.status === 'unavailable' || outcome.status === 'forbidden').toBe(true)
    expect(state.rpcCalls).toHaveLength(0)
  })

  it('keeps the legacy append path unchanged when orderedPlacement is absent', async () => {
    await store.resolveDecision('decision-841', 'slot:lunch:winner', { dayId: 'day-a' })
    expect(state.rpcCalls).toHaveLength(1)
    expect(state.rpcCalls[0].command).not.toHaveProperty('orderedPlacement')
    expect(state.rpcCalls[0].command.expectedRevision).toBe(7)
  })

  it('refuses a malformed captured intent without borrowing the current revision', async () => {
    const malformed = {
      dayId: 'day-a', dayIndex: 0,
      orderedPlacement: { dayId: 'day-a', beforeStopId: 'st-stay' } as never,
    }
    const outcome = await store.resolveDecision('decision-841', 'slot:lunch:winner', malformed)
    expect(outcome).toMatchObject({ status: 'unavailable' })
    expect(state.rpcCalls).toHaveLength(0)
  })

  it('refuses a conflicting outer day without transmitting the intent', async () => {
    const outcome = await store.resolveDecision('decision-841', 'slot:lunch:winner', {
      dayId: 'day-b', dayIndex: 0,
      orderedPlacement: { dayId: 'day-a', beforeStopId: 'st-stay', expectedRevision: 7 },
    })
    expect(outcome).toMatchObject({ status: 'unavailable' })
    expect(state.rpcCalls).toHaveLength(0)
  })

  it('clears the retry identity after an acknowledged receipt', async () => {
    state.rpcThrows = true
    const captured = intent(7)
    await store.resolveDecision('decision-841', 'slot:lunch:winner', captured)
    state.rpcThrows = false
    state.rpcResponse = applied()
    const outcome = await store.resolveDecision('decision-841', 'slot:lunch:winner', captured)
    expect(outcome).toMatchObject({ status: 'applied' })
    expect(state.rpcCalls).toHaveLength(2)
    expect(state.rpcCalls[1].commandId).toBe(state.rpcCalls[0].commandId)
  })
})

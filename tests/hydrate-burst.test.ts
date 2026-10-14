// ============ Auth burst dedupe (issue #757) ============
// hydrate dedupes a second auth event for the same user while a hydrate is
// active. Take A, then B, then A again. B's cold snapshot read is still
// pending when the second A arrives. activeHydrate still points at A's
// first run, so the second A joins that stale run and patches nothing. The
// cache keeps B's rows under A's session until the next hydrate.
//
// The dedupe now also checks the newest auth intent (lastAuthUserId). B's
// arrival moved the intent, so the second A starts a fresh hydrate and wins.
// These tests fire the burst while B's snapshot read is held open.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TripRow } from '../src/lib/tripRow'

const { state } = vi.hoisted(() => ({
  state: {
    /** Rows per user id, so two concurrent hydrates each read their own rows. */
    tablesByUser: {} as Record<string, Record<string, unknown[]>>,
    /** One gate per user id; every query of that account waits on it. */
    gates: {} as Record<string, Promise<void>>,
    /** Snapshot holds per user id; B's stays shut while the burst lands. */
    snapshotHolds: {} as Record<string, Promise<void>>,
    activeUser: null as string | null,
    authHandler: null as ((event: string, session: unknown) => void) | null,
  },
}))

vi.mock('../src/lib/offlineCache', () => ({
  clearSnapshot: vi.fn(async () => undefined),
  loadSnapshot: vi.fn(async (userId: string) => {
    const hold = state.snapshotHolds[userId]
    if (hold) await hold
    return null
  }),
  saveSnapshot: vi.fn(async () => undefined),
}))

vi.mock('../src/lib/supabase', () => {
  const makeBuilder = (table: string) => {
    const owner = state.activeUser ?? ''
    const rows = state.tablesByUser[owner]?.[table] ?? []
    const gate = state.gates[owner] ?? Promise.resolve()
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      is: () => builder,
      in: () => builder,
      update: () => builder,
      insert: () => builder,
      delete: () => builder,
      limit: () => builder,
      maybeSingle: () => builder,
      then: (
        res: (v: { data: unknown; error: unknown }) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => gate.then(() => ({ data: rows, error: null })).then(res, reject),
    }
    return builder
  }
  return {
    isSupabaseConfigured: true,
    supabase: {
      from: (t: string) => makeBuilder(t),
      channel: () => ({ on: function () { return this }, subscribe: function () { return this } }),
      removeChannel: () => Promise.resolve(),
      auth: {
        getSession: () => new Promise(() => undefined),
        onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
          state.authHandler = cb
          return { data: { subscription: {} } }
        },
        signOut: () => Promise.resolve({ error: null }),
      },
      rpc: () => Promise.resolve({ data: [], error: null }),
    },
  }
})

/** A row shaped enough for `rowToTrip` to map without throwing. */
function tripRow(id: string, ownerId: string): TripRow {
  return {
    id, owner_id: ownerId, name: `Trip ${id}`, start_location: 'Kochi',
    start_location_coords: null, destinations: ['Kochi'], destination_coords: null,
    start_date: '2026-10-01', end_date: '2026-10-03', travellers: 2, transport_mode: 'car',
    budget_per_person_inr: 5000, travel_style: 'balanced', fixed_commitments: [],
    days: [], expenses: [], cover_emoji: '🧭', visibility: 'private',
    created_at: 1, updated_at: 1,
  }
}

function memberRow(tripId: string, userId: string) {
  return { trip_id: tripId, user_id: userId, role: 'owner', joined_at: 1 }
}

function sessionFor(userId: string) {
  return { user: { id: userId, app_metadata: {} } }
}

/** Let the store's fire-and-forget async work drain. */
function flush(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

function gateOf(user: string) {
  let release!: () => void
  state.gates[user] = new Promise<void>(r => (release = r))
  return () => release()
}

function holdSnapshot(user: string) {
  let release!: () => void
  state.snapshotHolds[user] = new Promise<void>(r => (release = r))
  return () => release()
}

beforeEach(() => {
  state.tablesByUser = {}
  state.gates = {}
  state.snapshotHolds = {}
  state.activeUser = null
  state.authHandler = null
})

describe('auth burst dedupe (#757)', () => {
  it('an A-B-A burst while B holds its cold snapshot ends on A', async () => {
    vi.resetModules()
    const store = await import('../src/store/store')
    state.tablesByUser = {
      userA: {
        profiles: [], published_itineraries: [],
        trip_members: [memberRow('tripA', 'userA')],
        trips: [tripRow('tripA', 'userA')],
        suggestions: [], decisions: [], activity: [], notifications: [],
      },
      userB: {
        profiles: [], published_itineraries: [],
        trip_members: [memberRow('tripB', 'userB')],
        trips: [tripRow('tripB', 'userB')],
        suggestions: [], decisions: [], activity: [], notifications: [],
      },
    }
    const releaseA = gateOf('userA')
    const releaseB = gateOf('userB')
    const releaseSnapshotB = holdSnapshot('userB')
    store.init()

    state.activeUser = 'userA'
    state.authHandler!('SIGNED_IN', sessionFor('userA'))
    await flush()
    state.activeUser = 'userB'
    state.authHandler!('SIGNED_IN', sessionFor('userB'))
    await flush()
    state.activeUser = 'userA'
    state.authHandler!('SIGNED_IN', sessionFor('userA'))
    await flush()

    releaseSnapshotB()
    await flush()
    releaseB()
    await flush()
    releaseA()
    await flush()
    await flush()

    const db = store.getSnapshot()
    expect(db.sessionUserId).toBe('userA')
    expect(db.trips.map(t => t.id)).toEqual(['tripA'])
  })

  it('a same-user double-fire still joins the in-flight hydrate', async () => {
    vi.resetModules()
    const store = await import('../src/store/store')
    state.tablesByUser = {
      userA: {
        profiles: [], published_itineraries: [],
        trip_members: [memberRow('tripA', 'userA')],
        trips: [tripRow('tripA', 'userA')],
        suggestions: [], decisions: [], activity: [], notifications: [],
      },
    }
    const releaseA = gateOf('userA')
    store.init()

    state.activeUser = 'userA'
    state.authHandler!('SIGNED_IN', sessionFor('userA'))
    await flush()
    state.authHandler!('SIGNED_IN', sessionFor('userA'))
    await flush()
    releaseA()
    await flush()
    await flush()

    const db = store.getSnapshot()
    expect(db.sessionUserId).toBe('userA')
    expect(db.trips.map(t => t.id)).toEqual(['tripA'])
  })
})

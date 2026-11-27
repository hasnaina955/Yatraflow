// ============ The automatic demo seed runs once per account (#1054) ============
// The seed used to run in every page context that hydrated an empty account, so
// two tabs added the three demo trips twice and each trip showed twice on My
// trips and on the native home. The guard is now a conditional update on
// `profiles.demo_seeded_at`: one context claims the row, and every other
// context matches no row and seeds nothing.
//
// The harness is the one `tests/hydrate-race.test.ts` uses — the same mock
// builder, the same gates, the same `init()` and `resumeSync()` entry points.
// This copy also counts `trips` inserts and records every `profiles` update
// with the filters it applied, because those two counts are the whole rule.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { profileSession } from './helpers/profileSession'

const { state } = vi.hoisted(() => ({
  state: {
    /** Table rows served by the next query. */
    tables: {} as Record<string, unknown[]>,
    errors: {} as Record<string, unknown>,
    rejects: {} as Record<string, unknown>,
    adminUser: null as string | null,
    queriedTables: [] as string[],
    channelNames: [] as string[],
    gates: {} as Record<string, Promise<void>>,
    queryGates: {} as Record<string, Promise<void>[]>,
    rpcGates: {} as Record<string, Promise<void>>,
    rpcResponses: {} as Record<string, { data: unknown; error: unknown; rejection?: unknown }>,
    savedSnapshots: [] as Array<{ userId: string; trashedTripIds: string[] }>,
    activeUser: null as string | null,
    authHandler: null as ((event: string, session: unknown) => void) | null,
    resolveSession: null as (() => void) | null,
    sessionUser: null as string | null,
    holdSignOut: false,
    resolveSignOut: null as (() => void) | null,
    /** Every `profiles` update this run issued, in order. The filters are the
     *  `.eq` and `.is` calls, which is how the claim narrows itself to a row
     *  whose marker is still empty. */
    profileUpdates: [] as Array<{ values: unknown; filters: string[] }>,
    /** What the next `profiles` update answers. #1054's claim reads it: one row
     *  means this context won, an empty list means another context won. */
    claimResponse: { data: null as unknown, error: null as unknown, rejection: undefined as unknown },
    /** `trips` inserts. `seedDemoFor` issues one per demo trip. */
    tripInserts: 0,
  },
}))

vi.mock('../src/lib/offlineCache', () => ({
  clearSnapshot: vi.fn(async () => undefined),
  loadSnapshot: vi.fn(async () => null),
  saveSnapshot: vi.fn(async (userId: string, snapshot: { trashedTrips: Array<{ id: string }> }) => {
    state.savedSnapshots.push({
      userId,
      trashedTripIds: snapshot.trashedTrips.map(trip => trip.id),
    })
  }),
}))

vi.mock('../src/lib/supabase', () => {
  const makeBuilder = (table: string) => {
    state.queriedTables.push(table)
    const rows = state.tables[table] ?? []
    const queryKey = `${state.activeUser ?? ''}:${table}`
    const queryGate = state.queryGates[queryKey]?.shift()
    const gate = queryGate ?? state.gates[state.activeUser ?? ''] ?? Promise.resolve()
    const error = state.errors[table] ?? null
    const rejection = state.rejects[table]
    /** The filters this query applied, in call order. */
    const filters: string[] = []
    const builder: Record<string, unknown> = {
      select: () => builder,
      setHeader: () => builder,
      eq: (column: string, value: unknown) => { filters.push(`${column} = ${String(value)}`); return builder },
      is: (column: string, value: unknown) => { filters.push(`${column} is ${String(value)}`); return builder },
      in: () => builder,
      update: (values: unknown) => {
        if (table === 'profiles') {
          state.profileUpdates.push({ values, filters })
          builder.isProfileUpdate = true
        }
        return builder
      },
      insert: () => {
        if (table === 'trips') state.tripInserts += 1
        return builder
      },
      delete: () => builder,
      limit: () => builder,
      maybeSingle: () => { builder.singleUsed = true; return builder },
      single: () => { builder.singleUsed = true; return builder },
      // Chainable + thenable, but the response is withheld until this account's
      // gate is released. A `profiles` update answers from `claimResponse`.
      then: (
        res: (v: { data: unknown; error: unknown }) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => gate.then(() => {
        if (builder.isProfileUpdate === true) {
          const claim = state.claimResponse
          if (claim.rejection !== undefined) throw claim.rejection
          return { data: claim.error ? null : claim.data, error: claim.error }
        }
        if (rejection !== undefined) throw rejection
        // A `.maybeSingle()` / `.single()` read asks for ONE row, and the code it
        // feeds maps that row directly.
        const single = builder.singleUsed === true ? (rows[0] ?? null) : rows
        return { data: error ? null : single, error }
      }).then(res, reject),
    }
    return builder
  }
  const chain: Record<string, unknown> = { on: () => chain, subscribe: () => ({}) }
  return {
    isSupabaseConfigured: true,
    supabase: {
      from: (t: string) => makeBuilder(t),
      channel: (name: string) => { state.channelNames.push(name); return chain },
      removeChannel: () => Promise.resolve(),
      auth: {
        getSession: () =>
          new Promise(resolve => {
            state.resolveSession = () =>
              resolve({
                data: {
                  session: state.sessionUser
                    ? profileSession({ user: {
                        id: state.sessionUser,
                        app_metadata: state.adminUser === state.sessionUser ? { role: 'masteradmin' } : {},
                      } })
                    : null,
                },
              })
          }),
        onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
          state.authHandler = (event, session) => cb(event, session && typeof session === 'object' && 'user' in session ? profileSession(session as { user: { id: string } }) : session)
          return { data: { subscription: {} } }
        },
        signOut: () => state.holdSignOut
          ? new Promise(resolve => {
            state.resolveSignOut = () => resolve({ error: null })
          })
          : Promise.resolve({ error: null }),
      },
      rpc: (name: string) => {
        const key = `${state.activeUser ?? ''}:${name}`
        const gate = state.rpcGates[key] ?? Promise.resolve()
        const response = state.rpcResponses[key] ?? { data: [], error: null }
        const result = gate.then(() => {
          if (response.rejection !== undefined) throw response.rejection
          return { data: response.error ? null : response.data, error: response.error }
        })
        return { setHeader() { return this }, then: result.then.bind(result) }
      },
    },
  }
})

/** Let the store's fire-and-forget async work drain. */
function flush(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

/** Several ticks, because the seed inserts, bootstraps and re-hydrates. */
async function settle(times = 16): Promise<void> {
  for (let i = 0; i < times; i += 1) await flush()
}

async function freshStore() {
  vi.resetModules()
  return await import('../src/store/store')
}

/** An account with nothing in it: no trips, no memberships, no rows. */
function emptyAccount() {
  return { profiles: [], published_itineraries: [], trip_members: [], trips: [] }
}

/** Boot one store for `user` and wait for its hydrate (and any seed) to finish. */
async function bootStore(user = 'userA', options: { admin?: boolean } = {}) {
  const store = await freshStore()
  state.tables = emptyAccount()
  state.adminUser = options.admin ? user : null
  state.activeUser = user
  state.sessionUser = user
  store.init()
  state.resolveSession!()
  await settle()
  return store
}

function resetMock() {
  state.tables = {}
  state.errors = {}
  state.rejects = {}
  state.adminUser = null
  state.queriedTables = []
  state.channelNames = []
  state.gates = {}
  state.queryGates = {}
  state.rpcGates = {}
  state.rpcResponses = {}
  state.savedSnapshots = []
  state.activeUser = null
  state.authHandler = null
  state.resolveSession = null
  state.sessionUser = null
  state.holdSignOut = false
  state.resolveSignOut = null
  state.profileUpdates = []
  // One claimed row is the happy path: this context won the marker.
  state.claimResponse = { data: [{ id: 'claimed' }], error: null, rejection: undefined }
  state.tripInserts = 0
}

beforeEach(resetMock)

describe('the demo seed runs once per account (#1054)', () => {
  it('case 1: a claimed marker adds the three demo trips', async () => {
    await bootStore()
    expect(state.profileUpdates).toHaveLength(1)
    expect(state.tripInserts).toBe(3)
  })

  it('case 2: a claim that matches no row adds no trip', async () => {
    state.claimResponse = { data: [], error: null, rejection: undefined }
    await bootStore()
    expect(state.profileUpdates).toHaveLength(1)
    expect(state.tripInserts).toBe(0)
  })

  it('case 3: a failed claim, and a rejected claim, add no trip', async () => {
    state.claimResponse = { data: null, error: new Error('claim failed'), rejection: undefined }
    await bootStore()
    expect(state.tripInserts).toBe(0)

    resetMock()
    state.claimResponse = { data: null, error: null, rejection: new Error('network down') }
    await bootStore()
    expect(state.tripInserts).toBe(0)
  })

  it('case 4: a failed trips read never uses the marker', async () => {
    // The memberships read is the one that decides that the account has no
    // trips. When it fails the seed branch is skipped altogether (#94), so the
    // account keeps its marker for a read that actually worked.
    state.errors = {
      trips: new Error('trips unavailable'),
      trip_members: new Error('memberships unavailable'),
    }
    await bootStore()
    expect(state.profileUpdates).toHaveLength(0)
    expect(state.tripInserts).toBe(0)
  })

  it('case 5: an admin account never claims the marker', async () => {
    await bootStore('userA', { admin: true })
    expect(state.profileUpdates).toHaveLength(0)
    expect(state.tripInserts).toBe(0)
  })

  it('case 6: a second page context on the same empty account adds no second set', async () => {
    await bootStore()
    expect(state.tripInserts).toBe(3)

    // A second tab: its own store, the same empty account, and now the marker is
    // taken, so its claim matches no row. This is the race the issue reports.
    state.claimResponse = { data: [], error: null, rejection: undefined }
    await bootStore()

    expect(state.tripInserts).toBe(3)
  })

  it('case 7: the manual seed still adds the demo trips, then marks the account', async () => {
    state.claimResponse = { data: [], error: null, rejection: undefined }
    const store = await bootStore()
    expect(state.tripInserts).toBe(0)

    state.profileUpdates = []
    store.addDemoTrips()
    await settle()

    expect(state.tripInserts).toBe(3)
    expect(state.profileUpdates).toHaveLength(1)
    expect(state.profileUpdates[0].filters).toContain('demo_seeded_at is null')
  })

  it('case 8: the claim is filtered to this row while its marker is empty', async () => {
    await bootStore()
    expect(state.profileUpdates).toHaveLength(1)
    expect(state.profileUpdates[0].filters).toContain('id = userA')
    expect(state.profileUpdates[0].filters).toContain('demo_seeded_at is null')
  })
})

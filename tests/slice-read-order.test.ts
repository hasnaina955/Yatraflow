// ============ Same-user read order (issue #758) ============
// identityEpoch separates users. Two reads for the same user share it. A
// slow older read lands after a newer one and replaces its result. Each
// read now takes the next number for its slice. A result applies only
// while its number is still the newest. These tests resolve the newer
// read first and the older read second.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TripRow } from '../src/lib/tripRow'

type Row = { data: unknown; error: unknown }

const { state } = vi.hoisted(() => ({
  state: {
    /** Pending select calls, in the order the store issued them. The entry is
     *  pushed when the query builds. `await` on a custom thenable runs `then`
     *  on a later microtask, so the resolver lands after a flush. */
    queryCalls: [] as Array<{ resolve: null | ((v: Row) => void) }>,
    /** Pending RPC calls, in the order the store issued them. */
    rpcCalls: [] as Array<{ resolve: (v: Row) => void }>,
  },
}))

vi.mock('../src/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: () => {
      const entry: { resolve: null | ((v: Row) => void) } = { resolve: null }
      state.queryCalls.push(entry)
      const builder: Record<string, unknown> = {
        select: () => builder,
        then: (
          res: (v: Row) => unknown,
          reject?: (reason: unknown) => unknown,
        ) => new Promise<Row>(resolve => {
          entry.resolve = resolve
        }).then(res, reject),
      }
      return builder
    },
    channel: () => ({ on: function () { return this }, subscribe: function () { return this } }),
    removeChannel: () => Promise.resolve(),
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: {} } }),
      signOut: () => Promise.resolve({ error: null }),
    },
    rpc: () => new Promise<Row>(resolve => {
      state.rpcCalls.push({ resolve })
    }),
  },
}))

/** A row shaped enough for `rowToTrip` to map without throwing. */
function trashRow(id: string): TripRow {
  return {
    id, owner_id: 'userA', name: `Trash ${id}`, start_location: 'Kochi',
    start_location_coords: null, destinations: ['Kochi'], destination_coords: null,
    start_date: '2026-10-01', end_date: '2026-10-03', travellers: 2, transport_mode: 'car',
    budget_per_person_inr: 5000, travel_style: 'balanced', fixed_commitments: [],
    days: [], expenses: [], cover_emoji: '🧭', visibility: 'private',
    created_at: 1, updated_at: 1,
  }
}

function auditRow(id: string) {
  return {
    id, actor_id: 'userA', action: `Action ${id}`, target_type: null,
    target_id: null, detail: {}, at: 1,
  }
}

beforeEach(() => {
  state.queryCalls = []
  state.rpcCalls = []
})

/** Let the store's awaits reach the mocked `then`. */
function flush(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

describe('same-user read order (#758)', () => {
  it('a late older Trash read never replaces a newer one', async () => {
    vi.resetModules()
    const store = await import('../src/store/store')
    store.getSnapshot().sessionUserId = 'userA'

    const older = store.fetchTrashedTrips()
    const newer = store.fetchTrashedTrips()
    state.rpcCalls[1].resolve({ data: [trashRow('trash-new')], error: null })
    await newer
    state.rpcCalls[0].resolve({ data: [trashRow('trash-old')], error: null })
    await older

    expect(store.getSnapshot().trashedTrips.map(t => t.id)).toEqual(['trash-new'])
  })

  it('a late older audit read never replaces a newer one', async () => {
    vi.resetModules()
    const store = await import('../src/store/store')
    const { setAdminForTest } = await import('../src/lib/adminSession')
    setAdminForTest(true)
    store.getSnapshot().sessionUserId = 'userA'

    const older = store.refreshAdminAuditNow()
    const newer = store.refreshAdminAuditNow()
    await flush()
    state.queryCalls[1].resolve!({ data: [auditRow('audit-new')], error: null })
    await newer
    state.queryCalls[0].resolve!({ data: [auditRow('audit-old')], error: null })
    await older

    expect(store.getSnapshot().adminAudit.map(a => a.id)).toEqual(['audit-new'])
  })

  it('a newer read still lands after an older one resolves first', async () => {
    vi.resetModules()
    const store = await import('../src/store/store')
    store.getSnapshot().sessionUserId = 'userA'

    const older = store.fetchTrashedTrips()
    state.rpcCalls[0].resolve({ data: [trashRow('trash-old')], error: null })
    await older
    const newer = store.fetchTrashedTrips()
    state.rpcCalls[1].resolve({ data: [trashRow('trash-new')], error: null })
    await newer

    expect(store.getSnapshot().trashedTrips.map(t => t.id)).toEqual(['trash-new'])
  })
})

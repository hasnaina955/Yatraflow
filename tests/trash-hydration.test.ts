// Trip trash (soft-delete) — the hydration contract after the RLS repair.
//
// The live project's "trips read hide trashed" policy rejected the tombstone
// UPDATE (42501 on the added-row check — the policy had no owner clause), so
// "Delete" silently no-oped and the trip reappeared. The repair (Sep 14 2026)
// lets tombstoned rows reach their owner/editor; that means HYDRATION must
// keep them out of the live list itself — the Trash view reads them via
// get_trashed_trips. These tests pin that filter.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TripRow } from '../src/lib/tripRow'

const { state } = vi.hoisted(() => ({
  state: {
    tables: {} as Record<string, unknown[]>,
    sessionUser: null as string | null,
  },
}))

vi.mock('../src/lib/supabase', () => {
  const makeBuilder = (table: string) => {
    const rows = state.tables[table] ?? []
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      update: () => builder,
      insert: () => builder,
      delete: () => builder,
      limit: () => builder,
      order: () => builder,
      maybeSingle: () => builder,
      then: (res: (v: { data: unknown; error: unknown }) => unknown) =>
        Promise.resolve({ data: rows, error: null }).then(res),
    }
    return builder
  }
  const chain: Record<string, unknown> = { on: () => chain, subscribe: () => ({}) }
  return {
    isSupabaseConfigured: true,
    supabase: {
      from: (t: string) => makeBuilder(t),
      channel: () => chain,
      removeChannel: () => Promise.resolve(),
      auth: {
        getSession: () => Promise.resolve({ data: { session: state.sessionUser ? { user: { id: state.sessionUser } } : null } }),
        onAuthStateChange: () => ({ data: { subscription: {} } }),
      },
    },
  }
})

function tripRow(id: string, ownerId: string, deletedAt?: string): TripRow {
  return {
    id, owner_id: ownerId, name: `Trip ${id}`, start_location: 'Kochi',
    start_location_coords: null, destinations: ['Kochi'], destination_coords: null,
    start_date: '2026-10-01', end_date: '2026-10-03', travellers: 2, transport_mode: 'car',
    budget_per_person_inr: 5000, travel_style: 'balanced', fixed_commitments: [],
    days: [], expenses: [], cover_emoji: '🧭', visibility: 'private',
    created_at: 1, updated_at: 1,
    ...(deletedAt ? { deleted_at: deletedAt } : {}),
  } as TripRow
}

function memberRow(tripId: string, userId: string) {
  return { trip_id: tripId, user_id: userId, role: 'owner', joined_at: 1 }
}

beforeEach(() => {
  state.tables = {}
  state.sessionUser = 'userA'
})

describe('trashed trips stay out of the hydrated live list', () => {
  it('filters tombstoned rows from hydration (owner reads them via get_trashed_trips)', async () => {
    state.tables = {
      profiles: [],
      published_itineraries: [],
      trip_members: [memberRow('live1', 'userA'), memberRow('dead1', 'userA')],
      trips: [tripRow('live1', 'userA'), tripRow('dead1', 'userA', '2026-09-14T10:00:00Z')],
      suggestions: [],
      decisions: [],
      activity: [],
      notifications: [],
      admin_audit: [],
    }
    vi.resetModules()
    const store = await import('../src/store/store')
    store.init()
    await new Promise(resolve => setTimeout(resolve, 0))
    const live = store.tripsForUser('userA')
    expect(live.map(t => t.id)).toEqual(['live1'])
  })

  it('treats rows without the deleted_at field (un-migrated DB) as live', async () => {
    state.tables = {
      profiles: [],
      published_itineraries: [],
      trip_members: [memberRow('old1', 'userA')],
      trips: [tripRow('old1', 'userA')],
      suggestions: [],
      decisions: [],
      activity: [],
      notifications: [],
      admin_audit: [],
    }
    vi.resetModules()
    const store = await import('../src/store/store')
    store.init()
    await new Promise(resolve => setTimeout(resolve, 0))
    const live = store.tripsForUser('userA')
    expect(live.map(t => t.id)).toEqual(['old1'])
  })
})

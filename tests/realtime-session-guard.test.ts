// ============ Realtime session guard (issue #756) ============
// applyRealtimeEvent applied every payload to the cache. It never asked which
// session the channel belonged to. A payload that arrived after a sign-out or
// an account switch wrote its rows into the next session's cache.
//
// connectRealtime now captures the user id and the identity epoch beside the
// channel. applyRealtimeEvent drops any payload that arrives after either
// value moved. These tests deliver a payload across each boundary.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { state } = vi.hoisted(() => ({
  state: {
    /** The callback the store registered for each table. */
    handlers: {} as Record<string, (payload: unknown) => void>,
  },
}))

vi.mock('../src/lib/offlineCache', () => ({
  clearSnapshot: vi.fn(async () => undefined),
  loadSnapshot: vi.fn(async () => null),
  saveSnapshot: vi.fn(async () => undefined),
}))

vi.mock('../src/lib/supabase', () => {
  const chain: Record<string, unknown> = {
    on: (_kind: string, filter: { table: string }, cb: (p: unknown) => void) => {
      state.handlers[filter.table] = cb
      return chain
    },
    subscribe: () => ({}),
  }
  return {
    isSupabaseConfigured: true,
    supabase: {
      from: () => {
        throw new Error('no queries in this suite')
      },
      channel: () => chain,
      removeChannel: () => Promise.resolve(),
      auth: {
        getSession: () => Promise.resolve({ data: { session: null } }),
        onAuthStateChange: () => ({ data: { subscription: {} } }),
        signOut: () => Promise.resolve({ error: null }),
      },
    },
  }
})

const suggestionInsert = {
  eventType: 'INSERT',
  new: {
    id: 'sg-9', trip_id: 'trip-1', day_index: 0, proposed_by: 'user-a', title: 'Late idea',
    category: 'food', location_name: 'Diner', lat: 9.93, lng: 76.26, visit_minutes: 45,
    estimated_entry_fee_inr: 0, estimated_transport_inr: 0, votes: [], comments: [], status: 'open', created_at: 1,
  },
  old: {},
}

async function connectedAs(userId: string) {
  vi.resetModules()
  const store = await import('../src/store/store')
  store.getSnapshot().sessionUserId = userId
  store.connectRealtime(userId)
  return store
}

beforeEach(() => {
  state.handlers = {}
})

describe('realtime session guard (#756)', () => {
  it('a payload for the live session still lands', async () => {
    const store = await connectedAs('user-a')
    state.handlers['suggestions'](suggestionInsert)
    expect(store.getSnapshot().suggestions.map(s => s.id)).toContain('sg-9')
  })

  it('a payload after sign-out is dropped', async () => {
    const store = await connectedAs('user-a')
    await store.logout()
    state.handlers['suggestions'](suggestionInsert)
    expect(store.getSnapshot().suggestions.map(s => s.id)).not.toContain('sg-9')
  })

  it('a payload on a stale channel after an account switch is dropped', async () => {
    const store = await connectedAs('user-a')
    // B signed in. The old channel is still subscribed. connectRealtime is a
    // no-op while it lives, so the event below arrives on A's channel.
    store.getSnapshot().sessionUserId = 'user-b'
    state.handlers['suggestions'](suggestionInsert)
    expect(store.getSnapshot().suggestions.map(s => s.id)).not.toContain('sg-9')
  })

  it('a payload after the same account signs in again without a reconnect is dropped', async () => {
    const store = await connectedAs('user-a')
    await store.logout()
    // The account signs in again, but no channel connected yet. logout moved
    // the epoch, so the old capture is stale.
    store.getSnapshot().sessionUserId = 'user-a'
    state.handlers['suggestions'](suggestionInsert)
    expect(store.getSnapshot().suggestions.map(s => s.id)).not.toContain('sg-9')
  })

  it('a payload lands again after the reconnect captures the new session', async () => {
    const store = await connectedAs('user-a')
    await store.logout()
    store.getSnapshot().sessionUserId = 'user-a'
    store.disconnectRealtime()
    store.connectRealtime('user-a')
    state.handlers['suggestions'](suggestionInsert)
    expect(store.getSnapshot().suggestions.map(s => s.id)).toContain('sg-9')
  })
})

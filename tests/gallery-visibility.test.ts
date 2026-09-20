// ============ The public gallery vs. trip-row visibility ============
// Explore is a catalog of OTHER creators' itineraries, and the paywall
// hardening (20260918_payments_security.sql) deliberately stopped trip rows
// from being world-readable: a signed-in non-member can no longer SELECT the
// trips behind the publications on the shelf, while an anonymous visitor still
// can. Hydration gated the whole publication list on the viewer's own readable
// trip ids, so the same person saw every card logged out and an EMPTY Explore
// logged in — the rows were read, then thrown away by the client. Nothing
// downstream needed that cache: the public page (`fetchPublicTrip` →
// `get_public_trip`) and the fork path both read the trip through the RPC, the
// server deciding what each viewer may see.
//
// These pin the gallery's own rule: a publication IS the public artifact, and
// the database already ties it to its trip for life
// (`published_itineraries.trip_id ... on delete cascade`), so a client-side
// visibility test can only ever hide cards that exist.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { state } = vi.hoisted(() => ({
  state: {
    /** Table rows served by the next query — the mock applies no filters, so a
     *  table holds exactly what PostgREST's policies would have returned. */
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

function publishedRow(id: string, tripId: string, creatorId: string, title: string, at: number) {
  return {
    id, trip_id: tripId, creator_id: creatorId, title,
    tagline: null, cover_image_url: null, route_summary: ['Kochi'],
    duration_days: 4, estimated_budget_per_person_inr: 20000, travel_style: 'balanced',
    best_season: null, travel_tips: [], warnings_and_assumptions: [], free_day_indexes: [],
    premium_price_inr: null, subscriber_cta: null, published_at: at, views: 0, copies: 0,
  }
}

/** The tables a viewer can see, as the live policies would return them. */
function tables(pubs: unknown[], ownTripId: string | null) {
  return {
    profiles: [],
    published_itineraries: pubs,
    trip_members: ownTripId ? [{ trip_id: ownTripId, user_id: 'me', role: 'owner', joined_at: 1 }] : [],
    trips: ownTripId ? [{
      id: ownTripId, owner_id: 'me', name: 'My trip', start_location: 'Kochi',
      start_location_coords: null, destinations: ['Kochi'], destination_coords: null,
      start_date: '2026-10-01', end_date: '2026-10-03', travellers: 2, transport_mode: 'car',
      budget_per_person_inr: 5000, travel_style: 'balanced', fixed_commitments: [],
      days: [], expenses: [], cover_emoji: '🧭', visibility: 'private',
      created_at: 1, updated_at: 1,
    }] : [],
    suggestions: [], decisions: [], activity: [], notifications: [], admin_audit: [],
  }
}

function flush() { return new Promise(resolve => setTimeout(resolve, 0)) }

async function hydrateAs(user: string | null, rows: Record<string, unknown[]>) {
  state.sessionUser = user
  state.tables = rows
  vi.resetModules()
  const store = await import('../src/store/store')
  store.init()
  await flush()
  await flush()
  return store
}

beforeEach(() => {
  state.tables = {}
  state.sessionUser = null
})

describe('a signed-in visitor still sees the public gallery', () => {
  it('keeps foreign publications when their trips are not readable (the RLS case)', async () => {
    // userA is a signed-in non-member: they own no trip that appears on the
    // shelf, and the paywall hardening hides the trips behind every card.
    const rows = tables([
      publishedRow('pub_1', 'trip-foreign-1', 'creator-1', 'Spiti Valley', 100),
      publishedRow('pub_2', 'trip-foreign-2', 'creator-2', 'Goa Weekend', 200),
      publishedRow('pub_3', 'trip-foreign-3', 'creator-3', 'Kerala Backwaters', 300),
    ], null)
    const store = await hydrateAs('userA', rows)
    expect(store.getSnapshot().sessionUserId).toBe('userA')
    expect(store.getSnapshot().published.map(p => p.id)).toEqual(['pub_1', 'pub_2', 'pub_3'])
  })

  it('keeps them when the visitor has trips of their own too', async () => {
    const rows = tables([
      publishedRow('pub_1', 'trip-foreign-1', 'creator-1', 'Spiti Valley', 100),
    ], 'my-trip')
    const store = await hydrateAs('userA', rows)
    expect(store.getSnapshot().trips.map(t => t.id)).toEqual(['my-trip'])
    expect(store.getSnapshot().published.map(p => p.id)).toEqual(['pub_1'])
  })

  it('agrees with what an anonymous visitor sees', async () => {
    const pubs = [
      publishedRow('pub_1', 'trip-foreign-1', 'creator-1', 'Spiti Valley', 100),
      publishedRow('pub_2', 'trip-foreign-2', 'creator-2', 'Goa Weekend', 200),
    ]
    const anon = await hydrateAs(null, tables(pubs, null))
    const anonIds = anon.getSnapshot().published.map(p => p.id)
    const signedIn = await hydrateAs('userA', tables(pubs, null))
    // The gallery is a public catalog: signing in must not shrink it.
    expect(signedIn.getSnapshot().published.map(p => p.id)).toEqual(anonIds)
  })
})

describe('the gallery still de-duplicates the rows it keeps', () => {
  it('collapses repeated publications of one itinerary to the newest row', async () => {
    const rows = tables([
      publishedRow('pub_old', 'trip-a', 'creator-1', 'Spiti Valley', 100),
      publishedRow('pub_new', 'trip-b', 'creator-1', 'Spiti Valley', 200),
    ], null)
    const store = await hydrateAs('userA', rows)
    expect(store.getSnapshot().published.map(p => p.id)).toEqual(['pub_new'])
  })

  it('keeps two creators’ same-named itineraries apart', async () => {
    // The dedupe key is the itinerary's identity, and a creator is part of it:
    // two people publishing "Goa Weekend" from Goa are two cards, not one.
    const rows = tables([
      publishedRow('pub_a', 'trip-a', 'creator-1', 'Goa Weekend', 100),
      publishedRow('pub_b', 'trip-b', 'creator-2', 'Goa Weekend', 200),
    ], null)
    const store = await hydrateAs('userA', rows)
    expect(store.getSnapshot().published.map(p => p.id).sort()).toEqual(['pub_a', 'pub_b'])
  })
})

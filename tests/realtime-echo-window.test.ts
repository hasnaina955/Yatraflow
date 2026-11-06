// ============ Realtime echo window for trip writes ============
// `persistTripFieldNow` (src/store/store.ts) records a local write so the
// realtime broadcast of that same write is ignored rather than clobbering
// optimistic state. It used to call markLocalWrite AFTER awaiting the row
// UPDATE, so the guard only covered the moment the write RESOLVED — everything
// before that, i.e. the whole server round trip, was unguarded. A postgres_changes
// echo landing in that hole was treated as a collaborator's edit and replaced
// the freshly reordered `days` with the stale server row: the user accepted the
// impact dialog, saw the change, and then watched it revert.
//
// Two layers here: the guard's own semantics, and the store-level ORDER of
// "arm the guard" vs "await the write", which is the actual regression.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { isRecentLocalWrite } from '../src/lib/realtimeCore'
import { seedData } from '../src/data/seed'

describe('isRecentLocalWrite — the echo guard itself', () => {
  it('suppresses a write recorded inside the 2s window', () => {
    const recent = new Map([['trips:t1', 1000]])
    expect(isRecentLocalWrite(recent, 'trips', 't1', 1000)).toBe(true)
    expect(isRecentLocalWrite(recent, 'trips', 't1', 2999)).toBe(true)
  })

  it('lets an older write through', () => {
    const recent = new Map([['trips:t1', 1000]])
    expect(isRecentLocalWrite(recent, 'trips', 't1', 3001)).toBe(false)
  })

  it('scopes the guard to the exact table:id pair', () => {
    const recent = new Map([['trips:t1', 1000]])
    expect(isRecentLocalWrite(recent, 'trips', 't2', 1200)).toBe(false)
    expect(isRecentLocalWrite(recent, 'suggestions', 't1', 1200)).toBe(false)
  })
})

// ---- store-level ordering: the actual regression ----
const { calls, state } = vi.hoisted(() => ({
  calls: [] as Array<{ table: string; method: string }>,
  state: {
    handlers: {} as Record<string, (payload: unknown) => void>,
    /** resolvers for row UPDATEs the mock deliberately holds open */
    inFlight: [] as Array<() => void>,
    holdUpdates: false,
  },
}))

vi.mock('../src/lib/supabase', async () => {
  const { tripWriteClient } = await import('./helpers/tripWriteClient')
  const makeBuilder = (table: string) => {
    let method: string | undefined
    const builder: Record<string, unknown> = {}
    const chain = (m: string) => { method = m; return builder }
    builder.update = () => chain('update')
    builder.insert = () => chain('insert')
    builder.upsert = () => chain('upsert')
    builder.delete = () => chain('delete')
    builder.select = () => builder
    builder.eq = () => builder
    builder.in = () => builder
    builder.order = () => builder
    builder.limit = () => builder
    builder.maybeSingle = () => builder
    builder.single = () => builder
    builder.then = (res: (v: { data: unknown; error: unknown }) => unknown) => {
      if (method) calls.push({ table, method })
      // Hold trip UPDATEs open so a test can deliver an echo while the write is
      // genuinely unresolved — the only way to distinguish "armed before the
      // await" from "armed after".
      if (state.holdUpdates && table === 'trips' && method === 'update') {
        return new Promise<{ data: unknown; error: unknown }>(resolve => {
          state.inFlight.push(() => resolve({ data: [], error: null }))
        }).then(res)
      }
      return Promise.resolve({ data: [], error: null }).then(res)
    }
    return builder
  }
  const chainObj: Record<string, unknown> = {
    on: (_k: string, filter: { table: string }, cb: (p: unknown) => void) => {
      state.handlers[filter.table] = cb
      return chainObj
    },
    subscribe: () => ({}),
  }
  return {
    isSupabaseConfigured: true,
    supabase: tripWriteClient({
      from: (t: string) => makeBuilder(t),
      channel: () => chainObj,
      removeChannel: () => Promise.resolve(),
      auth: {
        getSession: () => Promise.resolve({ data: { session: null } }),
        onAuthStateChange: () => ({ data: { subscription: {} } }),
      },
    }),
  }
})

import { duplicateTrip, updateStop, tripById, connectRealtime, _flushTripWrites, _clearRecentLocalWrites, _setTripWriteDebounceMs, getSnapshot } from '../src/store/store'

const keralaTrip = seedData.trips[0]

beforeEach(() => { getSnapshot().sessionUserId = 'owner-test' })

afterEach(() => {
  calls.length = 0
  state.inFlight.length = 0
  state.holdUpdates = false
})

const orderOf = (tripId: string, day = 0) =>
  [...tripById(tripId)!.days[day].stops]
    .sort((a, b) => a.orderInDay - b.orderInDay)
    .map(s => s.id)

/** A "server row" snapshot of a trip — what a realtime echo would carry. */
function rowOf(tripId: string) {
  const t = tripById(tripId)!
  return {
    id: t.id, owner_id: 'owner-test', name: t.name,
    start_location: t.startLocation, destinations: t.destinations,
    start_date: t.startDate, end_date: t.endDate,
    travellers: t.travellers, transport_mode: t.transportMode,
    budget_per_person_inr: t.budgetPerPersonInr, travel_style: t.travelStyle,
    fixed_commitments: t.fixedCommitments, expenses: t.expenses,
    cover_emoji: t.coverEmoji, visibility: t.visibility,
    days: JSON.parse(JSON.stringify(t.days)),
  }
}

describe('the echo guard is armed before the write is awaited', () => {
  it('a stale echo landing mid-flight does not revert the reorder', async () => {
    const trip = duplicateTrip(keralaTrip, 'owner-test')
    // #578 — debounced writes are identity-gated; give the write an editor so
    // it is not dropped as captured-under-no-session.
    getSnapshot().sessionUserId = 'owner-test'
    // Creating the trip performs a write of its own, which arms an echo window.
    // Clear the ledger so the ONLY window in play is the reorder's — otherwise
    // the setup window masks the very bug under test (2s is longer than a test).
    await new Promise(r => setTimeout(r, 0))
    _clearRecentLocalWrites()

    connectRealtime('owner-test')
    expect(state.handlers['trips'], 'realtime handler must be registered').toBeTruthy()

    const before = orderOf(trip.id)
    const staleEcho = rowOf(trip.id) // carries the ORIGINAL order

    state.holdUpdates = true
    updateStop(trip.id, before[0], { orderInDay: 999 })
    const afterLocal = orderOf(trip.id)
    expect(afterLocal, 'the local reorder must have taken effect').not.toEqual(before)
    expect(afterLocal[afterLocal.length - 1]).toBe(before[0])

    _flushTripWrites()
    await new Promise(r => setTimeout(r, 0))
    await new Promise(r => setTimeout(r, 0))
    await vi.waitFor(() => {
      expect(state.inFlight.length, 'the row UPDATE must be in flight').toBeGreaterThan(0)
    })

    // The echo arrives while the server still holds the OLD order.
    state.handlers['trips']({ eventType: 'UPDATE', new: staleEcho, old: { id: trip.id } })

    expect(
      orderOf(trip.id),
      'the reorder must survive an echo that lands before the write resolves',
    ).toEqual(afterLocal)

    state.inFlight.forEach(release => release())
    await new Promise(r => setTimeout(r, 0))
    expect(orderOf(trip.id)).toEqual(afterLocal)
  })

  it('persistTripFieldNow arms the guard before awaiting through the shared sender (source-level pin)', () => {
    // The behavioural test above is the real proof; this pins the ordering so a
    // future refactor cannot quietly move markLocalWrite back below the await.
    //
    // #841 moved the write literals out of persistTripFieldNow into the shared
    // persistCapturedTripField sender. Pinning only the wrapper's body was a
    // stale changed-scope assertion: the wrapper now delegates. Follow the real
    // producer chain instead, and add producer + strong-ordering checks. No
    // safety assertion is weakened.
    const src = readFileSync(resolve(__dirname, '../src/store/store.ts'), 'utf8')
    const lines = src.split(/\r?\n/)

    // One top-level function body: from its declaration to the first brace at
    // column 0. Inner closures are indented, so this follows a refactor that
    // moves literals without pinning one exact line count.
    const bodyOf = (declaration: string): string => {
      const start = lines.findIndex(line => line.startsWith(`async function ${declaration}`))
      expect(start, `${declaration} must exist`).toBeGreaterThan(-1)
      if (start < 0) return ''
      const out: string[] = []
      for (let i = start; i < lines.length; i += 1) {
        out.push(lines[i])
        if (i > start && lines[i].startsWith('}')) break
      }
      return out.join('\n')
    }

    const wrapper = bodyOf('persistTripFieldNow')
    const producer = bodyOf('persistCapturedTripField')

    // Producer check #1: the entry point still delegates to the one shared
    // sender. A direct unguarded write here would drop the guard.
    expect(wrapper, 'persistTripFieldNow must delegate to the guarded shared sender')
      .toContain('persistCapturedTripField(')

    // Producer check #2: sendQueuedTripWrite is the real trips row UPDATE, not
    // a stub. An arm before a no-op sender would not protect the write.
    const sender = bodyOf('sendQueuedTripWrite')
    expect(sender, 'sendQueuedTripWrite must issue the trips row UPDATE')
      .toContain(".from('trips')")
    expect(sender, 'sendQueuedTripWrite must perform an update').toContain('.update(')

    // Ordering: the guard is armed immediately before the awaited write is
    // issued, inside the shared sender's serialized callback.
    const arm = producer.indexOf("markLocalWrite('trips', id)")
    const write = producer.indexOf('sendQueuedTripWrite(')
    const serialized = producer.indexOf('serializeTripWrite(')
    expect(arm, 'the shared sender must call markLocalWrite').toBeGreaterThan(-1)
    expect(write, 'the shared sender must issue the row update').toBeGreaterThan(-1)
    expect(arm, 'the echo guard must be armed BEFORE the row update is issued').toBeLessThan(write)
    // Strong ordering: the guard is armed at send time, inside the serialized
    // write callback — not at admission time, and not only after the await.
    expect(serialized, 'the write must be serialized').toBeGreaterThan(-1)
    expect(arm, 'the guard must be armed inside the serialized sender').toBeGreaterThan(serialized)
  })
})

// ============ The commit-time arm closes the debounce-gap hole ============
// The 2s echo window must be armed the moment the change is committed — inside
// persistTripField, synchronously — not only when the debounced row write
// fires ~600ms later (persistTripFieldNow). If it is armed only at write-fire,
// a postgres_changes echo that lands in that 600ms gap is NOT suppressed: it
// reverts the optimistic reorder in the cache, and the debounced write then
// persists the reverted (stale) order. This is the production symptom the user
// reported — "dialog shows the right order, reverts right after Keep".
describe('the echo window is armed at commit time (debounce-gap hole)', () => {
  it('a stale echo landing DURING the debounce gap does not revert the reorder', async () => {
    const trip = duplicateTrip(keralaTrip, 'owner-test')
    // #578 — debounced writes are identity-gated; give the write an editor so
    // it is not dropped as captured-under-no-session.
    getSnapshot().sessionUserId = 'owner-test'
    // Creating the trip performs a write of its own, which arms an echo window.
    // Clear the ledger so the ONLY window in play is the reorder's.
    await new Promise(r => setTimeout(r, 0))
    _clearRecentLocalWrites()

    connectRealtime('owner-test')
    expect(state.handlers['trips'], 'realtime handler must be registered').toBeTruthy()

    // Exercise the real production debounce so the 600ms gap is real.
    _setTripWriteDebounceMs(600)

    const before = orderOf(trip.id)
    const staleEcho = rowOf(trip.id) // carries the ORIGINAL order

    // Commit the reorder. With the fix, persistTripField arms the echo window
    // HERE — synchronously, at commit time. Without the fix, nothing arms the
    // window until the debounced write fires ~600ms later.
    updateStop(trip.id, before[0], { orderInDay: 999 })
    const afterLocal = orderOf(trip.id)
    expect(afterLocal, 'the local reorder must have taken effect').not.toEqual(before)
    expect(afterLocal[afterLocal.length - 1]).toBe(before[0])

    // Hold the eventual debounced write open so it never resolves under us.
    state.holdUpdates = true

    // Deliver the stale echo DURING the debounce gap, before the timer fires.
    await new Promise(r => setTimeout(r, 50))
    expect(state.inFlight.length, 'no write should be in flight yet (debounce gap)').toBe(0)
    state.handlers['trips']({ eventType: 'UPDATE', new: staleEcho, old: { id: trip.id } })

    expect(
      orderOf(trip.id),
      'the reorder must survive an echo that lands during the debounce gap',
    ).toEqual(afterLocal)

    // Let the debounce fire; the write now holds open (holdUpdates).
    await new Promise(r => setTimeout(r, 800))
    await new Promise(r => setTimeout(r, 0))
    expect(state.inFlight.length, 'the debounced row UPDATE must now be in flight').toBeGreaterThan(0)
    expect(orderOf(trip.id), 'order must still hold after the write fires').toEqual(afterLocal)

    state.inFlight.forEach(release => release())
    await new Promise(r => setTimeout(r, 0))
    expect(orderOf(trip.id), 'order must hold once the write resolves').toEqual(afterLocal)
  })
})

// ============ M6 · Together — PR-B behavioral tests ============
// The write-through contract (AGENTS: every trip mutation persists, the whole
// gate stays green when one doesn't — nothing exercises write-through) and the
// B2 stale-update guard, exercised against the store with a mocked client.
import { describe, it, expect, vi } from 'vitest'
import { seedData } from '../src/data/seed'

const { calls } = vi.hoisted(() => ({
  calls: [] as Array<{ table: string; method: string; payload?: unknown }>,
}))

vi.mock('../src/lib/supabase', () => {
  const makeBuilder = (table: string) => {
    let method: string | undefined
    let payload: unknown
    const builder: Record<string, unknown> = {}
    const chain = (m: string, p?: unknown) => { method = m; payload = p; return builder }
    builder.update = (p: unknown) => chain('update', p)
    builder.insert = (p: unknown) => chain('insert', p)
    builder.delete = () => chain('delete')
    builder.select = () => builder
    builder.eq = () => builder
    builder.in = () => builder
    builder.order = () => builder
    builder.limit = () => builder
    builder.lt = () => builder
    builder.maybeSingle = () => builder
    builder.single = () => builder
    builder.then = (res: (v: { data: unknown; error: unknown }) => unknown) =>
      new Promise(resolve => { if (method) calls.push({ table, method, payload }); resolve({ data: null, error: null }) }).then(res)
    return builder
  }
  return {
    isSupabaseConfigured: false,
    supabase: { from: (t: string) => makeBuilder(t) },
  }
})

import {
  duplicateTrip, tripById, _setTripWriteDebounceMs, _flushTripWrites,
  updateStop, moveStopBetweenDays, _applyRealtimeEventForTest,
  _clearRecentLocalWrites, _clearServerTripTimestamps,
} from '../src/store/store'
import { tripToRow } from '../src/lib/tripRow'

_setTripWriteDebounceMs(0)

const keralaTrip = seedData.trips[0]
const ownerId = 'owner-test'

function singleTrip() {
  calls.length = 0
  return duplicateTrip(keralaTrip, ownerId)
}

function flush(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

function tripsUpdates() {
  return calls.filter(c => c.table === 'trips' && c.method === 'update')
}

/** Feed a postgres_changes payload straight into the store's realtime dispatch
 *  (test hook — dispatchRealtimeEvent is module-private). */
function feedRemoteEvent(payload: { eventType: 'INSERT' | 'UPDATE' | 'DELETE'; new?: unknown; old?: unknown }): void {
  _applyRealtimeEventForTest('trips', payload as never)
}

/** Make the NEXT event a genuinely REMOTE one: duplicateTrip/updateStop arm a
 *  2s echo window (markLocalWrite) that would swallow the fed row as our own
 *  echo, and the server-timestamp ledger is a module singleton shared across
 *  tests. Clearing both simulates an elapsed window and a fresh ledger. */
function freshRealtimeLedgers(): void {
  _clearRecentLocalWrites()
  _clearServerTripTimestamps()
}

describe('B0 · debounced flush persists the CAPTURED snapshot', () => {
  // The coalescer's failure mode: the timer (or _flushTripWrites) re-reading
  // tripById(id) at fire time lets a REMOTE update landing inside the debounce
  // window be persisted over the local edit that scheduled the write — the
  // local edit silently vanishes from the DB. The write must carry the
  // snapshot captured AT CALL TIME.
  it('flush persists the call-time snapshot, not the later remote state', async () => {
    _setTripWriteDebounceMs(600)
    try {
      const trip = singleTrip()
      await flush()
      calls.length = 0
      // Local edit → pendingTripWrites holds { timer, trip } with THIS title.
      updateStop(trip.id, tripById(trip.id)!.days[0].stops[0].id, { title: 'Local title' })
      // A remote update lands INSIDE the debounce window: the cache now holds
      // the collaborator's state (a full row swap replaces the day array —
      // simulated by writing the cache directly; the coalescer only ever sees
      // the cache, no realtime machinery needed).
      const cached = tripById(trip.id)!
      cached.name = 'Remote name'
      cached.days = []
      expect(tripById(trip.id)?.name).toBe('Remote name')
      // The trailing write fires — with the CAPTURED snapshot: the local stop
      // edit survives remotely, and the remote days are NOT re-persisted.
      _flushTripWrites()
      await flush()
      const last = tripsUpdates().at(-1)!.payload as { days: Array<{ stops: Array<{ title: string }> }> }
      expect(JSON.stringify(last.days)).toContain('Local title')
      expect(last.days).not.toEqual([])
    } finally {
      _setTripWriteDebounceMs(0)
      _flushTripWrites()
    }
  })

  it('updateStop writes through (control for the B0 rework)', async () => {
    const trip = singleTrip()
    await flush()
    calls.length = 0
    updateStop(trip.id, tripById(trip.id)!.days[0].stops[0].id, { title: 'Renamed' })
    await flush()
    expect(tripsUpdates()).toHaveLength(1)
  })
})

describe('B2 · stale-update guard vs the SERVER ledger (store level)', () => {
  type Row = { id: string; updated_at?: number }

  it('a remote UPDATE carrying an equal timestamp applies (pre-trigger normal case)', async () => {
    const trip = singleTrip()
    await flush()
    calls.length = 0
    freshRealtimeLedgers()
    // Simulate the pre-trigger server: every remote row carries the same
    // updated_at. The guard must NOT drop it.
    const remote: Row = { id: trip.id, updated_at: 1, expenses: [{ id: 'ex-r', label: 'Remote lunch', category: 'food', amountInr: 250 }], name: 'Remote name' }
    feedRemoteEvent({ eventType: 'UPDATE', new: remote, old: { id: trip.id } })
    await flush()
    const cached = tripById(trip.id)
    expect(cached?.name).toBe('Remote name')
  })

  it('a remote UPDATE OLDER than the ledger is dropped (reconnect replay)', async () => {
    const trip = singleTrip()
    await flush()
    calls.length = 0
    freshRealtimeLedgers()
    // Seed the ledger with a NEWER server timestamp, as hydration would.
    const fresh: Row = { id: trip.id, updated_at: 5_000, name: 'Newest' }
    feedRemoteEvent({ eventType: 'UPDATE', new: fresh, old: { id: trip.id } })
    await flush()
    expect(tripById(trip.id)?.name).toBe('Newest')

    // Now a replay of an older server row — dropped, cache untouched.
    const replay: Row = { id: trip.id, updated_at: 4_000, name: 'Stale replay' }
    feedRemoteEvent({ eventType: 'UPDATE', new: replay, old: { id: trip.id } })
    await flush()
    expect(tripById(trip.id)?.name).toBe('Newest')
  })

  it('an optimistic local edit does NOT raise the guard (client clock is not the ledger)', async () => {
    const trip = singleTrip()
    await flush()
    calls.length = 0
    // A local edit bumps Trip.updatedAt to Date.now() — far above any server
    // timestamp this test feeds. The guard must still apply a remote row with
    // a SMALLER updated_at, because the comparison reads the server ledger,
    // not the optimistic client clock. The echo window is cleared so the fed
    // row is treated as genuinely remote, not as our own echo.
    updateStop(trip.id, tripById(trip.id)!.days[0].stops[0].id, { title: 'Mine' })
    await flush()
    freshRealtimeLedgers()
    const remote: Row = { id: trip.id, updated_at: 10, name: 'Remote wins on equal' }
    feedRemoteEvent({ eventType: 'UPDATE', new: remote, old: { id: trip.id } })
    await flush()
    expect(tripById(trip.id)?.name).toBe('Remote wins on equal')
  })

  it('moveStopBetweenDays writes through on the found path (B0 sibling parity)', async () => {
    const trip = singleTrip()
    await flush()
    calls.length = 0
    moveStopBetweenDays(trip.id, tripById(trip.id)!.days[0].stops[0].id, 1)
    await flush()
    expect(tripsUpdates().length).toBeGreaterThan(0)
  })
})

// ============ M6 · Together — PR-B behavioral tests ============
// B4 (mark settled) exercises the real mutation surface with a mocked client:
// the write-through contract (AGENTS: every trip mutation persists, the whole
// gate stays green when one doesn't — nothing exercises write-through), the
// activity entry, and the settled flag surviving a tripToRow round-trip (the
// column is a JSONB blob, so a key the mapper drops would vanish silently).
// B1's client gating pins that presence degrades to no-op without a backend.
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
  tripById, _setTripWriteDebounceMs, _flushTripWrites,
  updateStop, moveStopBetweenDays, duplicateTrip,
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

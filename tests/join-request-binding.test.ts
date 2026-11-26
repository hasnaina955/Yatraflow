import { beforeEach, describe, expect, it, vi } from 'vitest'
import { seedData } from '../src/data/seed'

const wire = vi.hoisted(() => ({
  actor: 'owner', sessionGate: null as Promise<void> | null,
  responseGate: null as Promise<void> | null, holdName: '',
  calls: [] as Array<{ name: string; header: string }>,
}))
vi.mock('../src/components/ui', () => ({ toast: vi.fn() }))
vi.mock('../src/lib/supabase', () => {
  function builder(name: string) {
    let header = ''
    const query = {
      setHeader(key: string, value: string) { header = `${key}: ${value}`; return query },
      eq() { return query }, order() { return query },
      then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
        wire.calls.push({ name, header })
        return (async () => {
          if (!wire.holdName || wire.holdName === name) await wire.responseGate
          return { data: name === 'trip_join_requests' ? [{ id: 'r', user_id: 'guest', role: 'viewer', created_at: '2026-01-01' }] : [], error: null }
        })().then(resolve, reject)
      },
    }
    return query
  }
  return { isSupabaseConfigured: false, supabase: {
    auth: { getSession: async () => {
      await wire.sessionGate
      return { data: { session: { user: { id: wire.actor }, access_token: `token-${wire.actor}` } }, error: null }
    } },
    rpc: (name: string) => builder(name),
    from: (name: string) => ({ select: () => builder(name) }),
  } }
})

let store: typeof import('../src/store/store')
let joins: typeof import('../src/lib/joinRequests')
function deferred() {
  let resolve = () => {}
  const promise = new Promise<void>(r => { resolve = r })
  return { promise, resolve }
}
beforeEach(async () => {
  vi.resetModules()
  store = await import('../src/store/store')
  joins = await import('../src/lib/joinRequests')
  wire.actor = 'owner'
  wire.sessionGate = null
  wire.responseGate = null
  wire.holdName = ''
  wire.calls.length = 0
  const db = store.getSnapshot()
  db.sessionUserId = 'owner'
  db.trips = [{ ...structuredClone(seedData.trips[0]), id: 'trip', members: [{ userId: 'owner', role: 'owner', joinedAt: 1 }] }]
})

describe('join request account binding', () => {
  const calls = [
    () => joins.requestTripJoin('CODE'),
    () => joins.decideTripJoin('r', true, 'trip'),
    () => joins.listPendingJoinRequests('trip'),
  ]
  it.each(calls)('cancels before dispatch when the account changes during session lookup', async call => {
    const gate = deferred()
    wire.sessionGate = gate.promise
    const pending = call()
    store.getSnapshot().sessionUserId = 'other'
    wire.actor = 'other'
    gate.resolve()
    expect(await pending).toEqual({ kind: 'cancelled' })
    expect(wire.calls).toEqual([])
  })
  it.each(calls)('cancels a held result after the account changes', async call => {
    const gate = deferred()
    wire.responseGate = gate.promise
    const pending = call()
    await vi.waitFor(() => expect(wire.calls).toHaveLength(1))
    store.getSnapshot().sessionUserId = 'other'
    wire.actor = 'other'
    gate.resolve()
    expect(await pending).toEqual({ kind: 'cancelled' })
    expect(wire.calls).toEqual([{ name: wire.calls[0].name, header: 'Authorization: Bearer token-owner' }])
  })
  it('drops a card response after the account switches', async () => {
    const gate = deferred()
    wire.holdName = 'get_public_profile_cards'
    wire.responseGate = gate.promise
    const pending = joins.listPendingJoinRequests('trip')
    await vi.waitFor(() => expect(wire.calls).toHaveLength(2))
    store.getSnapshot().sessionUserId = 'other'
    wire.actor = 'other'
    gate.resolve()
    expect(await pending).toEqual({ kind: 'cancelled' })
    expect(wire.calls.every(c => c.header === 'Authorization: Bearer token-owner')).toBe(true)
  })
  it('pins the account bearer on each fresh builder, including the card read', async () => {
    expect((await joins.requestTripJoin('CODE')).kind).toBe('ok')
    expect((await joins.decideTripJoin('r', true, 'trip')).kind).toBe('ok')
    expect((await joins.listPendingJoinRequests('trip')).kind).toBe('ok')
    expect(wire.calls.map(c => c.name)).toEqual(['request_trip_join', 'decide_trip_join', 'trip_join_requests', 'get_public_profile_cards'])
    expect(wire.calls.every(c => c.header === 'Authorization: Bearer token-owner')).toBe(true)
  })
})

// Join requests (D4) on the client. The module only calls the two RPCs and reads
// the owner's pending rows. These tests pin the three things that matter: a
// failed call is never reported as success, a failed read is never an empty
// list, and only pending rows are asked for.
import { describe, it, expect, beforeEach, vi } from 'vitest'

const { rpc, selectResult, eqCalls } = vi.hoisted(() => ({
  rpc: vi.fn(),
  selectResult: { value: { data: [] as unknown, error: null as unknown } },
  eqCalls: [] as Array<[string, string]>,
}))

vi.mock('../src/lib/supabase', () => {
  const builder = {
    eq(column: string, value: string) { eqCalls.push([column, value]); return builder },
    order() { return builder },
    then(resolve: (v: unknown) => unknown) { return Promise.resolve(selectResult.value).then(resolve) },
  }
  return {
    supabase: {
      rpc,
      from: () => ({ select: () => builder }),
    },
  }
})

import { requestTripJoin, listPendingJoinRequests, decideTripJoin } from '../src/lib/joinRequests'

beforeEach(() => {
  rpc.mockReset()
  rpc.mockResolvedValue({ error: null })
  selectResult.value = { data: [], error: null }
  eqCalls.length = 0
})

describe('requestTripJoin', () => {
  it('sends the invite code and reports ok when the RPC accepts it', async () => {
    expect(await requestTripJoin('GOA-K7QF')).toEqual({ kind: 'ok' })
    expect(rpc).toHaveBeenCalledWith('request_trip_join', { p_code: 'GOA-K7QF' })
  })

  it('reports failed when the RPC returns an error, never ok', async () => {
    rpc.mockResolvedValue({ error: { message: 'not signed in' } })
    expect(await requestTripJoin('GOA-K7QF')).toEqual({ kind: 'failed' })
  })

  it('reports failed when the call throws, so a dropped connection is not "Request sent"', async () => {
    rpc.mockRejectedValue(new Error('network down'))
    expect(await requestTripJoin('GOA-K7QF')).toEqual({ kind: 'failed' })
  })
})

describe('listPendingJoinRequests', () => {
  it('asks only for pending rows of this trip and maps them', async () => {
    selectResult.value = {
      data: [{ id: 'req-1', user_id: 'u-1', role: 'editor', created_at: '2026-11-26T10:00:00Z' }],
      error: null,
    }
    const out = await listPendingJoinRequests('trip-1')
    expect(out).toEqual({
      kind: 'ok',
      requests: [{ id: 'req-1', userId: 'u-1', role: 'editor', createdAt: '2026-11-26T10:00:00Z' }],
    })
    expect(eqCalls).toEqual([['trip_id', 'trip-1'], ['status', 'pending']])
  })

  it('reports failed on a read error, never an empty list', async () => {
    selectResult.value = { data: null, error: { message: 'denied' } }
    expect(await listPendingJoinRequests('trip-1')).toEqual({ kind: 'failed' })
  })

  it('reports failed when the rows are not an array', async () => {
    selectResult.value = { data: { oops: true }, error: null }
    expect(await listPendingJoinRequests('trip-1')).toEqual({ kind: 'failed' })
  })

  it('an accepted read with no rows is ok and empty, which is a different state from failed', async () => {
    expect(await listPendingJoinRequests('trip-1')).toEqual({ kind: 'ok', requests: [] })
  })
})

describe('decideTripJoin', () => {
  it('passes the request id and the decision', async () => {
    expect(await decideTripJoin('req-1', true)).toEqual({ kind: 'ok' })
    expect(rpc).toHaveBeenCalledWith('decide_trip_join', { p_request: 'req-1', p_approve: true })
  })

  it('reports failed when the decision is refused', async () => {
    rpc.mockResolvedValue({ error: { message: 'not the owner' } })
    expect(await decideTripJoin('req-1', false)).toEqual({ kind: 'failed' })
  })
})

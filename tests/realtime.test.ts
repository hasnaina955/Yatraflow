// ============ Realtime collaboration hot-path reducers (issue #18) ============
// Tests the pure helpers in src/lib/realtimeCore.ts that the store's
// postgres_changes handlers run for every remote event.
import { describe, it, expect } from 'vitest'
import {
  reduceSlice, applyMemberChange, isRecentLocalWrite, isStaleServerRow,
  canonicalKey, stopWasRemotelyEdited,
} from '../src/lib/realtimeCore'
import type { TripMember } from '../src/data/types'

type Item = { id: string; n: number }

describe('reduceSlice', () => {
  const base: Item[] = [
    { id: 'a', n: 1 },
    { id: 'b', n: 2 },
  ]

  it('INSERT appends a new row', () => {
    expect(reduceSlice(base, 'INSERT', { id: 'c', n: 3 })).toEqual([...base, { id: 'c', n: 3 }])
  })

  it('INSERT is idempotent for an already-present id (prevents duplicate cards on echo)', () => {
    expect(reduceSlice(base, 'INSERT', { id: 'a', n: 99 })).toEqual(base)
  })

  it('UPDATE replaces in place, preserving order', () => {
    expect(reduceSlice(base, 'UPDATE', { id: 'a', n: 10 })).toEqual([{ id: 'a', n: 10 }, { id: 'b', n: 2 }])
    expect(reduceSlice(base, 'UPDATE', { id: 'b', n: 20 })).toEqual([{ id: 'a', n: 1 }, { id: 'b', n: 20 }])
  })

  it('UPDATE for an unknown id appends (remote added a row we had not seen)', () => {
    expect(reduceSlice(base, 'UPDATE', { id: 'c', n: 3 })).toEqual([...base, { id: 'c', n: 3 }])
  })

  it('DELETE removes by id (falls back to row.id)', () => {
    expect(reduceSlice(base, 'DELETE', undefined, 'a')).toEqual([{ id: 'b', n: 2 }])
    expect(reduceSlice(base, 'DELETE', { id: 'b', n: 2 })).toEqual([{ id: 'a', n: 1 }])
  })
})

describe('applyMemberChange', () => {
  const members: TripMember[] = [
    { userId: 'u1', role: 'owner', joinedAt: 1 },
    { userId: 'u2', role: 'editor', joinedAt: 2 },
  ]

  it('inserts a new member', () => {
    const next = applyMemberChange(members, { event: 'INSERT', userId: 'u3', role: 'editor', joinedAt: 3 })
    expect(next.map(m => m.userId)).toEqual(['u1', 'u2', 'u3'])
  })

  it('updates a role in place (user promoted to owner)', () => {
    const next = applyMemberChange(members, { event: 'UPDATE', userId: 'u2', role: 'owner', joinedAt: 2 })
    expect(next).toEqual([
      { userId: 'u1', role: 'owner', joinedAt: 1 },
      { userId: 'u2', role: 'owner', joinedAt: 2 },
    ])
  })

  it('removes a member on DELETE', () => {
    expect(applyMemberChange(members, { event: 'DELETE', userId: 'u2', role: 'editor', joinedAt: 2 }).map(m => m.userId)).toEqual(['u1'])
  })
})

describe('isStaleServerRow (B2 stale-update guard, server ledger vs incoming)', () => {
  // The guard is STRICTLY-OLDER-ONLY: a row is dropped only when its updated_at
  // is LESS than the last server-applied timestamp. EQUAL timestamps APPLY —
  // before 20260919_trip_touch_updated_at.sql lands, updated_at never advances,
  // so equal timestamps are the NORMAL case for every remote update; the old
  // `cached >= incoming` rule dropped all of them and killed realtime sync.

  it('applies an incoming row NEWER than the ledger', () => {
    expect(isStaleServerRow(100, 200)).toBe(false)
  })

  it('ignores an incoming row OLDER than the ledger (reconnect replay)', () => {
    expect(isStaleServerRow(300, 200)).toBe(true)
  })

  it('APPLIES an incoming row with an EQUAL timestamp (pre-trigger normal case)', () => {
    expect(isStaleServerRow(300, 300)).toBe(false)
  })

  it('applies when the ledger has no entry for the trip (unknown id)', () => {
    expect(isStaleServerRow(undefined, 200)).toBe(false)
  })

  it('applies when the ledger timestamp is not a usable number', () => {
    expect(isStaleServerRow(Number.NaN, 200)).toBe(false)
  })

  it('applies when the incoming row carries NO timestamp (pre-trigger rows)', () => {
    expect(isStaleServerRow(300, undefined)).toBe(false)
    expect(isStaleServerRow(300, Number.NaN)).toBe(false)
    expect(isStaleServerRow(300, 'not-a-number')).toBe(false)
  })

  it('applies when NEITHER side carries a timestamp (guard is a no-op)', () => {
    expect(isStaleServerRow(undefined, undefined)).toBe(false)
  })

  it('coerces the snake_case wire spelling / numeric strings honestly', () => {
    expect(isStaleServerRow(300, '200')).toBe(true)
    expect(isStaleServerRow(300, '400')).toBe(false)
    expect(isStaleServerRow(300, 400)).toBe(false)
  })
})

describe('canonicalKey / stopWasRemotelyEdited (B3 detection)', () => {
  it('is invariant to object key order at every depth (jsonb normalization)', () => {
    const a = { title: 'X', meta: { b: 2, a: 1 }, tags: ['p', 'q'] }
    const b = { tags: ['p', 'q'], meta: { a: 1, b: 2 }, title: 'X' }
    expect(canonicalKey(a)).toBe(canonicalKey(b))
    expect(stopWasRemotelyEdited(a, b)).toBe(false)
  })

  it('detects a genuine field change', () => {
    const mine = { id: 's1', title: 'Beach', visitMinutes: 60 }
    const theirs = { id: 's1', title: 'Beach', visitMinutes: 90 }
    expect(stopWasRemotelyEdited(mine, theirs)).toBe(true)
  })

  it('respects array order (a reorder IS a change)', () => {
    expect(stopWasRemotelyEdited({ t: [1, 2, 3] }, { t: [3, 2, 1] })).toBe(true)
  })

  it('returns false for missing inputs (never flags on undefined)', () => {
    expect(stopWasRemotelyEdited(undefined, { a: 1 })).toBe(false)
    expect(stopWasRemotelyEdited({ a: 1 }, undefined)).toBe(false)
  })

  it('treats added/removed keys as a change', () => {
    expect(stopWasRemotelyEdited({ a: 1 }, { a: 1, notes: 'new' })).toBe(true)
    expect(stopWasRemotelyEdited({ a: 1, notes: 'x' }, { a: 1 })).toBe(true)
  })
})

describe('isRecentLocalWrite (echo guard)', () => {
  it('suppresses events within the echo window', () => {
    const recent = new Map<string, number>([['trips:t1', 1000]])
    expect(isRecentLocalWrite(recent, 'trips', 't1', 1500)).toBe(true)
    expect(isRecentLocalWrite(recent, 'trips', 't1', 2999)).toBe(true)
  })

  it('lets events through once the window expires or the id differs', () => {
    const recent = new Map<string, number>([['trips:t1', 1000]])
    expect(isRecentLocalWrite(recent, 'trips', 't1', 3001, 2000)).toBe(false)
    expect(isRecentLocalWrite(recent, 'trips', 't2', 1200)).toBe(false)
    expect(isRecentLocalWrite(recent, 'suggestions', 't1', 1200)).toBe(false)
  })
})
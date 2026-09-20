// ============ Realtime collaboration core (pure helpers) ============
// Pure, framework-free helpers for the supabase postgres_changes handlers in
// src/store/store.ts (issue #18). Kept side-effect free so the node test
// environment can exercise every branch.
import type { TripMember } from '../data/types'

export type RealtimeEventType = 'INSERT' | 'UPDATE' | 'DELETE'

/**
 * B2 stale-update guard — TRIPS ONLY, against the SERVER ledger (see the
 * caller in store.ts: `serverTripTimestamps`, written only from hydration and
 * applyRealtimeEvent, never from optimistic mutations — Trip.updatedAt is the
 * optimistic client clock and must never feed this comparison).
 *
 * STALE means strictly older: an incoming row is dropped only when its
 * updated_at is LESS than the last server-applied timestamp we hold. EQUAL
 * timestamps APPLY — do not "fix" this back to <=:
 *
 *  `20260919_trip_touch_updated_at.sql` is applied by a human in the
 *  Dashboard, and until it lands `updated_at` never advances — every remote
 *  update of a trip carries the SAME timestamp as the row we already hold.
 *  Equal-is-stale would therefore drop every remote update and kill the
 *  realtime sync that already ships. Equal applies because a same-timestamp
 *  row is (a) the normal pre-trigger case and (b) harmless post-trigger: it
 *  re-renders with equivalent data.
 *
 * Either side without a usable (finite) timestamp ⇒ apply: the guard is a
 * no-op on pre-trigger rows, missing columns, or poisoned numerics — never a
 * blocker. Reconnect replays and out-of-order delivery are what this drops.
 */
export function isStaleServerRow(serverLedgerTs: number | undefined, incomingTs: unknown): boolean {
  const incoming = Number(incomingTs)
  if (!Number.isFinite(incoming)) return false
  if (serverLedgerTs === undefined || !Number.isFinite(serverLedgerTs)) return false
  return incoming < serverLedgerTs
}

/** Generic reduce a cache slice by one realtime change. Plain and generic:
 *  the B2 stale-update guard does NOT live here — it needs the server
 *  timestamp ledger, which only the trips caller keeps (no other table
 *  carries a comparable timestamp pair; profiles has no updated_at at all).
 *  The caller's own echo suppression lives separately in isRecentLocalWrite
 *  + markLocalWrite; keep both. */
export function reduceSlice<T extends { id: string }>(list: T[], event: RealtimeEventType, row?: T, oldId?: string): T[] {
  if (event === 'DELETE') return list.filter(x => x.id !== (oldId ?? row?.id))
  if (!row) return list
  if (event === 'INSERT') {
    return list.some(x => x.id === row.id) ? list : [...list, row]
  }
  // UPDATE: replace in place, preserving array order (avoids card re-ordering).
  const idx = list.findIndex(x => x.id === row.id)
  if (idx < 0) return [...list, row]
  const next = [...list]
  next[idx] = row
  return next
}

/**
 * Apply one trip_members change to a members array. INSERT/UPDATE upsert the
 * membership (role/joinedAt could have changed); DELETE removes the member.
 */
export function applyMemberChange(
  members: TripMember[],
  change: { event: RealtimeEventType; userId: string; role: TripMember['role']; joinedAt: number },
): TripMember[] {
  if (change.event === 'DELETE') return members.filter(m => m.userId !== change.userId)
  const idx = members.findIndex(m => m.userId === change.userId)
  if (idx < 0) return [...members, { userId: change.userId, role: change.role, joinedAt: change.joinedAt }]
  const next = [...members]
  next[idx] = { userId: change.userId, role: change.role, joinedAt: change.joinedAt }
  return next
}

/**
 * Echo-loop guard: whether a realtime event for (table, id) is our OWN write
 * landing back on us. Mutations optimistically update the cache first; a
 * broadcast of that exact write should be ignored so the fresh server row
 * doesn't clobber concurrent optimistic state. `recent` is a Map of
 * "table:id" -> Date.now() maintained by markLocalWrite().
 */
export function isRecentLocalWrite(recent: Map<string, number>, table: string, id: string, now: number, windowMs = 2000): boolean {
  const t = recent.get(`${table}:${id}`)
  return t !== undefined && now - t < windowMs
}

// ---------------- B3 · remote-edit conflict surfacing ----------------

/**
 * Canonical JSON key for a value: object keys sorted at every depth, arrays
 * kept in order. Needed because Postgres jsonb does NOT preserve object key
 * order (it normalizes by key length, then alphabetically) — a remote row
 * parsed out of the trips.days jsonb can hold byte-identical data in a
 * different key order, and a plain JSON.stringify comparison would report a
 * phantom "remote edit" on every hydration.
 */
export function canonicalKey(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalKey).join(',')}]`
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o).sort().map(k => `${k}:${canonicalKey(o[k])}`).join(',')}}`
  }
  return JSON.stringify(v) ?? 'null'
}

/**
 * Whether a stop the user has open in an editor was remotely changed while it
 * sat open: the editor's draft only writes through on save, so while the
 * editor is open ANY difference between the stop snapshot taken at open and
 * the live trip's version of the same stop is a remote (or another-surface)
 * edit — keep-mine / take-theirs territory, no data loss either direction.
 */
export function stopWasRemotelyEdited(openedAt: unknown, live: unknown): boolean {
  if (!openedAt || !live) return false
  return canonicalKey(openedAt) !== canonicalKey(live)
}
// ============ Pending trip writes — the offline write queue (PWA phase 3) ====
// An edit made without a connection waits here until it reaches the server. It
// plugs into the ONE place a trip write is sent (`store.ts`
// persistTripFieldNow), which is what makes this tractable: the app's write
// model is already a whole-trip snapshot UPDATE per burst (the debounced
// coalescer), so an "unsynced edit" is one well-defined payload rather than a
// replayable operation log to invent.
//
// Three rules, each a silent failure if broken:
//   1. ONE entry per trip — a newer snapshot REPLACES the older one, exactly
//      like the in-memory coalescer it mirrors. Replaying an older snapshot
//      after a newer one would resurrect stops the user deleted.
//   2. Bounded retries. An entry carries an attempt count; a write that keeps
//      failing (RLS, a validation rejection — not just the network) is dropped
//      LOUDLY rather than retried forever behind the user's back.
//   3. Cleared with its account. An entry names its owner, sign-out drops that
//      account's entries, and replay only ever sends entries whose owner is
//      still the signed-in user — the snapshot cache's rule, for its reason.
import { WRITE_STORE, openOfflineDb } from './offlineCache'

/** Attempts before an entry is abandoned (with a toast, never silently). */
export const MAX_WRITE_ATTEMPTS = 3

export interface QueuedWrite {
  /** Also the store key: one pending snapshot per trip. */
  tripId: string
  ownerId: string
  /** When the edit was captured — the left side of the conflict comparison. */
  capturedAt: number
  /** How many replay attempts have already failed. */
  attempts: number
  /** The whole-trip snapshot that will be written (structured-cloneable). */
  trip: unknown
}

export interface WriteQueueStore {
  list(): Promise<unknown[]>
  put(entry: QueuedWrite): Promise<void>
  remove(tripId: string): Promise<void>
}

/** IndexedDB-backed queue. Every path resolves; "no queue" is a valid answer. */
function idbWriteStore(): WriteQueueStore {
  const run = async <T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest, fallback: T): Promise<T> => {
    const db = await openOfflineDb()
    if (!db) return fallback
    return new Promise<T>(resolve => {
      try {
        const transaction = db.transaction(WRITE_STORE, mode)
        const request = fn(transaction.objectStore(WRITE_STORE))
        request.onsuccess = () => resolve((request.result as T) ?? fallback)
        request.onerror = () => resolve(fallback)
      } catch {
        resolve(fallback)
      }
    })
  }

  return {
    list: () => run<unknown[]>('readonly', store => store.getAll(), []),
    put: async entry => {
      // Keyed by tripId: a second edit to the same trip REPLACES the first.
      await run('readwrite', store => store.put(entry, entry.tripId), undefined as unknown)
    },
    remove: async tripId => {
      await run('readwrite', store => store.delete(tripId), undefined as unknown)
    },
  }
}

function isValidEntry(raw: unknown): raw is QueuedWrite {
  if (raw === null || typeof raw !== 'object') return false
  const entry = raw as Partial<QueuedWrite>
  if (typeof entry.tripId !== 'string' || !entry.tripId) return false
  if (typeof entry.ownerId !== 'string' || !entry.ownerId) return false
  if (typeof entry.capturedAt !== 'number' || !Number.isFinite(entry.capturedAt)) return false
  if (typeof entry.attempts !== 'number' || !Number.isFinite(entry.attempts) || entry.attempts < 0) return false
  if (entry.trip === null || entry.trip === undefined) return false
  // The snapshot must survive a structured clone — a non-cloneable payload
  // would fail INSIDE the store's put, i.e. silently drop the edit.
  try {
    structuredClone(entry.trip)
  } catch {
    return false
  }
  return true
}

/** Record (or replace) the pending snapshot for a trip. Returns whether the
 *  edit is now durable. */
export async function queueWrite(entry: QueuedWrite, store: WriteQueueStore = idbWriteStore()): Promise<boolean> {
  try {
    await store.put(entry)
    return true
  } catch {
    return false
  }
}

/** The pending writes, oldest first. Malformed entries are REMOVED rather than
 *  returned — an entry nothing can replay would otherwise sit there forever. */
export async function pendingWrites(store: WriteQueueStore = idbWriteStore()): Promise<QueuedWrite[]> {
  let raw: unknown[]
  try {
    raw = await store.list()
  } catch {
    return []
  }
  const valid: QueuedWrite[] = []
  for (const candidate of Array.isArray(raw) ? raw : []) {
    if (isValidEntry(candidate)) {
      valid.push(candidate)
    } else {
      const tripId = (candidate as { tripId?: unknown })?.tripId
      if (typeof tripId === 'string') void store.remove(tripId).catch(() => {})
    }
  }
  return valid.sort((a, b) => a.capturedAt - b.capturedAt)
}

/** Forget one trip's pending write — it reached the server. */
export async function dropWrite(tripId: string, store: WriteQueueStore = idbWriteStore()): Promise<void> {
  try {
    await store.remove(tripId)
  } catch {
    /* nothing to undo */
  }
}

/** How many edits this device is holding — the offline banner's count. */
export async function pendingWriteCount(ownerId?: string, store: WriteQueueStore = idbWriteStore()): Promise<number> {
  const writes = await pendingWrites(store)
  return ownerId ? writes.filter(write => write.ownerId === ownerId).length : writes.length
}

/** Whether an entry has retries left. A hopeless entry is dropped loudly by
 *  the caller, never retried forever. */
export function shouldRetry(entry: Pick<QueuedWrite, 'attempts'>): boolean {
  return entry.attempts < MAX_WRITE_ATTEMPTS
}

/**
 * What a replay should do about the server's current row.
 *
 * `apply` is the normal case. `overwrite` means a collaborator's change landed
 * after this edit was captured — the replay still wins (the app's whole-trip
 * write model is last-writer-wins, and the peer is told by the realtime
 * remote-edit banner), but the local user is told too rather than left to
 * discover it. Unknown or missing timestamps apply, mirroring the stale-row
 * guard in realtimeCore: the comparison is never a blocker, only a notice.
 */
export function replayVerdict(serverUpdatedAt: unknown, capturedAt: number): 'apply' | 'overwrite' {
  const server = Number(serverUpdatedAt)
  if (!Number.isFinite(server) || !Number.isFinite(capturedAt)) return 'apply'
  return server > capturedAt ? 'overwrite' : 'apply'
}

/** Forget every queued write belonging to one account (sign-out). Their
 *  unsynced edits are theirs alone: the next person on this device must never
 *  be the one whose session "syncs" them. */
export async function clearWritesFor(ownerId: string, store: WriteQueueStore = idbWriteStore()): Promise<void> {
  try {
    for (const write of await pendingWrites(store)) {
      if (write.ownerId === ownerId) await store.remove(write.tripId)
    }
  } catch {
    /* nothing to undo */
  }
}

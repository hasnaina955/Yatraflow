import type { QueuedWrite, WriteQueueStore } from '../../src/lib/writeQueue'

/** The write queue normally lives in IndexedDB, which Node does not have. This
 *  swaps only the storage backend for an in-memory store. The real queue logic
 *  still runs, so a test sees whether a refused edit stayed queued for replay.
 *  Use it as: vi.mock('../src/lib/writeQueue', async importOriginal =>
 *    (await import('./helpers/memoryWriteQueue')).memoryWriteQueue(importOriginal)) */
export async function memoryWriteQueue(
  importOriginal: () => Promise<typeof import('../../src/lib/writeQueue')>,
): Promise<typeof import('../../src/lib/writeQueue')> {
  const actual = await importOriginal()
  const map = new Map<string, QueuedWrite>()
  const mem: WriteQueueStore = {
    list: async () => [...map.values()],
    put: async entry => { map.set(actual.writeQueueKey(entry.ownerId, entry.tripId), entry) },
    remove: async tripId => { map.delete(tripId) },
    removeIf: async (key, capturedAt, revision) => {
      const current = map.get(key)
      if (!current || current.revision !== revision || (revision === undefined && current.capturedAt !== capturedAt)) return false
      map.delete(key)
      return true
    },
    putIf: async (entry, expectedCapturedAt, expectedRevision) => {
      const key = actual.writeQueueKey(entry.ownerId, entry.tripId)
      const current = map.get(key)
      if (!current || current.revision !== expectedRevision || (expectedRevision === undefined && current.capturedAt !== expectedCapturedAt)) return false
      map.set(key, entry)
      return true
    },
  }
  return {
    ...actual,
    queueWrite: (entry: QueuedWrite) => actual.queueWrite(entry, mem),
    dropWrite: (tripId: string) => actual.dropWrite(tripId, mem),
    dropQueuedWrite: (entry: QueuedWrite) => actual.dropQueuedWrite(entry, mem),
    dropWriteIfCurrent: (tripId: string, capturedAt: number) => actual.dropWriteIfCurrent(tripId, capturedAt, mem),
    requeueIfCurrent: (entry: QueuedWrite) => actual.requeueIfCurrent(entry, mem),
    pendingWrites: () => actual.pendingWrites(mem),
    pendingWriteCount: (ownerId?: string) => actual.pendingWriteCount(ownerId, mem),
    clearWritesFor: (ownerId: string) => actual.clearWritesFor(ownerId, mem),
  }
}

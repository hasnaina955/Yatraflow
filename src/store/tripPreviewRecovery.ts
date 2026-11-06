/** Exact operation facts for one admitted preview. The store owns these facts;
 *  a caller must not infer them from the current cache or from queue absence. */
import type { ID } from '../data/types'

export interface TripPreviewOperation {
  operationId: string
  tripId: ID
  userId: ID
  epoch: number
  accessEpoch: number
  revision: string
  capturedAt: number
  baseVersion: number | undefined
}

export type TripPreviewPendingState = 'pending' | 'settled' | 'discarded' | 'unknown' | 'foreign'

export interface TripPreviewPending {
  state: TripPreviewPendingState
  reason: string
  sources: string[]
}

export type TripPreviewObservation =
  | { kind: 'acknowledged'; receipt: { kind: 'acknowledged'; revision: string; writeVersion: number } }
  | { kind: 'refused' | 'discarded' | 'unknown' | 'foreign'; reason: string | null }

/** A validated server row for one exact generation. Kept so a late observer can
 *  replay the acknowledgement without inventing a second write. */
export interface PreviewAckRecord {
  operation: TripPreviewOperation
  writeVersion: number
}

export interface PreviewOperationState {
  operation: TripPreviewOperation
  admission: 'admitted' | 'superseded'
  outcome: 'pending' | 'acknowledged' | 'discarded' | 'unknown' | 'foreign'
  notified: Set<string>
  listeners: Set<(observation: TripPreviewObservation) => void>
  ack: PreviewAckRecord | null
}

export function samePreviewGeneration(
  operation: TripPreviewOperation,
  candidate: { ownerId?: string; tripId?: string; revision?: string; capturedAt?: number },
): boolean {
  return candidate.ownerId === operation.userId && candidate.tripId === operation.tripId
    && candidate.revision === operation.revision && candidate.capturedAt === operation.capturedAt
}

/** Check that a captured snapshot equals the outer admission draft. This is a
 *  content check on an already identity-bound generation, not a way to infer
 *  which generation the operation owns. `updatedAt` is a stamp each write adds
 *  at capture time; it is not part of the proposed fields. */
export function samePreviewContent(candidate: unknown, intended: unknown): boolean {
  if (candidate === intended) return true
  const withoutStamp = (value: unknown): unknown => {
    if (!value || typeof value !== 'object' || !('updatedAt' in value)) return value
    const copy = { ...(value as Record<string, unknown>) }
    delete copy.updatedAt
    return copy
  }
  try {
    return JSON.stringify(withoutStamp(candidate)) === JSON.stringify(withoutStamp(intended))
  } catch {
    return false
  }
}

/** The replayable observation for a settled record. A stored acknowledgement is
 *  rebuilt field by field; no other outcome can claim success. An unresolved
 *  state has no pushed observation; `observation()` still reports it. */
export function observationOf(state: PreviewOperationState): TripPreviewObservation | null {
  if (state.outcome === 'acknowledged' && state.ack) {
    return { kind: 'acknowledged', receipt: {
      kind: 'acknowledged', revision: state.operation.revision, writeVersion: state.ack.writeVersion } }
  }
  if (state.outcome === 'discarded') return { kind: 'discarded', reason: 'explicit-discard' }
  if (state.outcome === 'foreign') return { kind: 'foreign', reason: 'identity-or-access-changed' }
  return null
}

export function observationKey(observation: TripPreviewObservation): string {
  const reason = 'reason' in observation ? observation.reason ?? '' : ''
  return `${observation.kind}:${reason}`
}

/** Emit each distinct terminal observation once. Listener failures cannot stop
 *  a save. An unresolved state stays quiet so a later real receipt can still
 *  arrive through the same subscription. */
export function notifyPreviewObservation(state: PreviewOperationState): void {
  const observation = observationOf(state)
  if (!observation) return
  const key = observationKey(observation)
  if (state.notified.has(key)) return
  state.notified.add(key)
  for (const listener of [...state.listeners]) {
    try { listener(observation) } catch { /* A subscriber must not stop a save. */ }
  }
}

export function isPreviewOperation(value: unknown): value is TripPreviewOperation {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return typeof record.operationId === 'string' && record.operationId.length > 0
    && typeof record.tripId === 'string' && record.tripId.length > 0
    && typeof record.userId === 'string' && record.userId.length > 0
    && Number.isSafeInteger(record.epoch) && (record.epoch as number) >= 0
    && Number.isSafeInteger(record.accessEpoch) && (record.accessEpoch as number) >= 0
    && typeof record.revision === 'string' && record.revision.length > 0 && record.revision.length <= 128
    && Number.isFinite(record.capturedAt)
    && (record.baseVersion === undefined || (Number.isSafeInteger(record.baseVersion) && (record.baseVersion as number) >= 0))
}

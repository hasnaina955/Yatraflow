// ============ One synchronous operation gate for the map writers (#841) ============
//
// Every placement writer - one slot, the batch, the shortlist and the later arc
// entry - enters through this controller BEFORE it awaits anything. React state
// (`addingAny`, `fillingDay`) is published after a render, so two handlers can
// both read "not busy" in the same tick; the gate is the synchronous answer to
// "is this place already owned by an operation that has not settled yet?".
//
// The gate is deliberately React-free and store-free:
//  - an ENTRY reserves each place identity for one operation. A second writer
//    that asks for the same entity is refused before it can mint a stop.
//  - STOP IDs and the operation ID are minted once, inside the entry, and kept
//    for the life of the operation. A retry of an uncertain operation reuses
//    both, so the server can recognise the same logical write.
//  - per-item completion releases an item only when its outcome is known:
//    skipped items release at stage time, acknowledged items release on the
//    verified stop, and an uncertain save keeps its reservation so the same
//    place cannot silently enter twice while the write is unresolved.
//  - a discard before admission releases reservations only. The shortlist and
//    the candidates belong to the caller and stay where they are.
//
// Deliberate repeats are a product action, not a gate exception: a repeat is a
// NEW operation with `allowRepeat`, and the planner still refuses a duplicate
// inside one operation (two slots receiving one place).
import { isSameEntity, normalizePlaceName, placeKeysOf } from '../../../lib/placeIdentity'
import type { PlaceHit } from '../../../lib/providers/hits'
import { randomToken } from '../../../lib/randomId'
import {
  copyWriterBinding,
  sameWriterBinding,
  type WriterRoadBinding,
} from './writerRoadBinding'

/** Stable trip and day identity for one operation. `dayId` is null only for a
 *  shortlist operation that spans days; each item then carries its own day. */
export interface WriterOperationContext {
  tripId: string
  dayId: string | null
  /** Display index, -1 when the operation spans days. */
  dayIndex: number
}

export type WriterOperationIntent = 'single' | 'batch' | 'shortlist' | 'vote' | 'arc'

/** A place reserved by one operation. Stop ids stay stable for retries. */
export interface WriterOperationItem {
  itemId: string
  /** Slot key inside the operation; null for a free shortlist place. */
  slotKey: string | null
  hit: PlaceHit
  /** The exact resolved payload the FIRST operation pinned for this item.
   *  Null until the resolver answered once. A retry reuses it and never
   *  resolves again, so a second resolver result cannot restage new
   *  coordinates or provider keys under the old operation id and stop id. */
  resolvedHit: PlaceHit | null
  /** Minted once at entry. A retry reuses it. */
  stopId: string
  /** Day the item targets, for a multi-day operation. */
  dayId: string | null
  dayIndex: number
  /** The saved-stop note the first operation captured. It is part of the
   *  planned stop content, so a retry reuses it and a changed note is a
   *  payload mismatch, never a silent rewrite under the old operation id. */
  notes: string | null
}

/** The stage intents a caller may retry. A direct `vote` poll is not a
 *  placement write, so it never becomes a retry ticket. */
export type WriterRetryIntent = 'single' | 'batch' | 'shortlist' | 'arc'

/** One captured pick, as the FIRST operation accepted it. The hit is a deep
 *  snapshot, so mutating the caller's object cannot change what a retry writes. */
export interface WriterCapturedPick {
  hit: PlaceHit
  slotKey: string | null
  dayId: string | null
  dayIndex: number
  notes?: string
}

/** Proof that one known uncertain operation may be retried. It holds the exact
 *  operation id and the exact first-operation payload. A retry supplies THIS
 *  object and never reconstructs a request from a matching current pick. */
export interface WriterRetryTicket {
  operationId: string
  context: WriterOperationContext
  intent: WriterRetryIntent
  picks: readonly WriterCapturedPick[]
  /** Captured measured-road bytes; a retry replays or refuses these. */
  binding?: WriterRoadBinding
}

/** `abandoned`: the store positively proved this exact admitted write was
 *  discarded or is foreign (Saved edits or an identity/access switch). It is a
 *  terminal, truthful outcome, separate from `discarded` (a pre-admission
 *  refusal) and `applied` (a validated success). Its own reservations are
 *  released, but it never denies that a write was admitted. */
export type WriterOperationPhase = 'reserved' | 'staged' | 'applied' | 'uncertain' | 'discarded' | 'abandoned'

export interface WriterOperationRecord {
  id: string
  context: WriterOperationContext
  intent: WriterOperationIntent
  phase: WriterOperationPhase
  /** Stable request identity: one logical write keeps one key. */
  requestKey: string
  items: WriterOperationItem[]
  /** Items whose outcome was decided (skipped, placed or discarded). */
  settledItemIds: string[]
  /** Captured measured-road bytes for this operation, when strict. */
  binding?: WriterRoadBinding
}

export interface WriterBeginRequest {
  context: WriterOperationContext
  intent: WriterOperationIntent
  /** One request key per logical write. A retry passes the same key. */
  requestKey: string
  /** Explicit operation id: a retry of an uncertain write reuses it. */
  operationId?: string
  /** One entry per place. Two entries may share an entity only when the caller
   *  asked for an explicit repeat; the planner still reports the duplicate. */
  entries: ReadonlyArray<{
    slotKey: string | null
    hit: PlaceHit
    dayId?: string | null
    dayIndex?: number
    /** Saved-stop note, captured with the operation because it is content. */
    notes?: string
  }>
  /** Stable ids, minted once per operation. */
  mintStopId: () => string
  mintOperationId?: () => string
  /** Explicit product decision to place a repeat visit already on the plan. */
  allowRepeat?: boolean
  /** Strict measured-road bytes. Unbound callers stay compatible. */
  binding?: WriterRoadBinding
}

export type WriterBeginDecision =
  | { status: 'entered'; operation: WriterOperationRecord }
  | { status: 'resumed'; operation: WriterOperationRecord }
  | {
    status: 'busy'
    reason: 'item-reserved' | 'request-in-flight' | 'payload-mismatch' | 'resume-unverifiable' | 'operation-settled' | 'operation-unknown'
    /** The places another live operation already owns. */
    itemIds: string[]
    operationId?: string
  }

export interface WriterOperationGate {
  begin: (request: WriterBeginRequest) => WriterBeginDecision
  /** Pins the first operation's resolved payload per item. The first capture
   *  wins: a retry must never overwrite what the first write pinned. */
  captureResolved: (operationId: string, resolved: ReadonlyArray<{ itemId: string; hit: PlaceHit }>) => void
  /** The plan is staged. Skipped items are decided; planned items stay owned. */
  stage: (operationId: string, input: { plannedItemIds: readonly string[]; skippedItemIds: readonly string[] }) => void
  /** A RESUMED retry staged a new preview. Its skipped items are decided, but
   *  the operation stays uncertain: an open preview is not an acknowledgement,
   *  and the original write's outcome is still unknown. */
  retryStage: (operationId: string, input: { skippedItemIds: readonly string[] }) => void
  /** An acknowledgement named these items as real stops. Releases exactly them. */
  acknowledge: (operationId: string, placedItemIds: readonly string[]) => void
  /** The save failed or its outcome is unknown: keep every reservation. */
  uncertain: (operationId: string) => void
  /** A pre-admission discard: release reservations, keep no success. */
  discard: (operationId: string) => void
  /** The store proved this EXACT operation's admitted write discarded or
   *  foreign after a Keep. Release only this operation's own reservations and
   *  settle it to a terminal, truthful phase. It is NOT a pre-admission discard
   *  (onDiscard) and NOT an acknowledged success (acknowledge): it never denies
   *  that a write was admitted and never restages the operation. It acts
   *  only on a live record and is idempotent, so a late ack, a late discard, a
   *  newer preview or an identity switch cannot release another operation or
   *  settle twice. */
  settleProvenDiscarded: (operationId: string) => boolean
  operation: (operationId: string) => WriterOperationRecord | undefined
  /** The exact retry proof for a genuinely uncertain operation, or null when a
   *  retry must not be offered: settled, in flight, unknown, unprovable payload
   *  or a lost reservation. This is the only source of a retry ticket. */
  retryTicket: (operationId: string) => WriterRetryTicket | null
  /** The retry proof for the SAME logical request, when that exact request is
   *  the uncertain operation this gate still holds. A production caller that
   *  repeats the same choice after closing the preview reaches the explicit
   *  operation identity here instead of minting a second logical write. */
  retryTicketFor: (request: Omit<WriterBeginRequest, 'mintStopId' | 'mintOperationId' | 'allowRepeat'>) => WriterRetryTicket | null
  /** Live reservations, for tests and for a caller that must explain a refusal. */
  reservations: () => ReadonlyArray<{ operationId: string; itemId: string; hit: PlaceHit }>
  /** True while an entity is owned by a live operation. `tripId` narrows the
   *  answer to one trip: a reservation in another trip must not block. */
  isReserved: (hit: PlaceHit, tripId?: string) => boolean
  reset: () => void
}

/** One entity identity for the gate. `isSameEntity` is the app's rule, so two
 *  providers that number a place "1" stay two places and one provider key seen
 *  twice stays one. */
function entityMatches(a: PlaceHit, b: PlaceHit): boolean {
  return isSameEntity(a, b)
}

/** One entity's stable request identity. A provider key is decisive, exactly as
 *  `isSameEntity` says: two providers may give two places the same name at the
 *  same position, and they must not share an operation key. The raw hit id is
 *  never identity (two providers both number a place "1"). Keyless hits fall
 *  back to the normalized name plus position, the same fallback the shared
 *  predicate uses.
 *
 *  F1: the encoding is JSON, not delimiter concatenation. Provider values and
 *  slot keys are caller-supplied strings, so `:`, `,`, `|` and `+` inside one
 *  value must not fold two requests into one key. */
function requestEntityKey(hit: PlaceHit): string {
  const keys = placeKeysOf({
    name: hit.name,
    placeId: hit.placeId,
    eLoc: hit.eLoc,
    source: hit.source,
    lat: hit.latitude,
    lng: hit.longitude,
  }).map(key => ({ kind: key.kind, provider: key.provider ?? null, value: key.value }))
  if (keys.length > 0) {
    keys.sort((left, right) =>
      left.kind.localeCompare(right.kind)
      || (left.provider ?? '').localeCompare(right.provider ?? '')
      || left.value.localeCompare(right.value))
    return JSON.stringify({ keys })
  }
  return JSON.stringify({
    fallback: 'name',
    name: normalizePlaceName(hit.name),
    at: [hit.latitude.toFixed(5), hit.longitude.toFixed(5)],
  })
}

/** A stable request key: one canonical structured encoding of every identity
 *  input. Names and provider values are free text, so nothing is joined with
 *  delimiters a value could carry; JSON escapes them all. */
export function writerRequestKey(parts: {
  intent: WriterOperationIntent
  context: WriterOperationContext
  slotKeys: readonly (string | null)[]
  hits: readonly PlaceHit[]
}): string {
  return JSON.stringify({
    keyVersion: 1,
    intent: parts.intent,
    tripId: parts.context.tripId,
    dayId: parts.context.dayId ?? null,
    dayIndex: parts.context.dayIndex,
    slots: parts.slotKeys.map(key => key ?? null),
    entities: parts.hits.map(requestEntityKey),
  })
}

function newId(prefix: string): string {
  // The platform CSPRNG, through the app's one secure-token helper. There is no
  // time or weak-generator fallback: an insecure id is not an id.
  return `${prefix}_${randomToken(16)}`
}

/** Freeze the identity the gate owns. A caller keeps its own hit object and may
 *  mutate it later; the reservation, request key and retry payload must not
 *  change under the operation. */
function snapshotHit(hit: PlaceHit): PlaceHit {
  try {
    return structuredClone(hit)
  } catch {
    // A provider object with a non-cloneable field still gets a detached
    // top-level record; identity uses the fields that matter and are copied.
    return { ...hit }
  }
}

export function createWriterOperationGate(): WriterOperationGate {
  const operations = new Map<string, WriterOperationRecord>()
  const liveRequests = new Map<string, string>()
  const reservations: Array<{ operationId: string; itemId: string; hit: PlaceHit; tripId: string }> = []

  const isLive = (operation: WriterOperationRecord): boolean =>
    operation.phase === 'reserved' || operation.phase === 'staged' || operation.phase === 'uncertain'

  function releaseItems(operationId: string, itemIds: readonly string[]): void {
    const ids = new Set(itemIds)
    const removeAt: number[] = []
    for (const [index, reservation] of reservations.entries()) {
      if (reservation.operationId === operationId && ids.has(reservation.itemId)) removeAt.push(index)
    }
    for (const index of removeAt.reverse()) reservations.splice(index, 1)
  }

  function settle(operationId: string, itemIds: readonly string[]): void {
    const operation = operations.get(operationId)
    if (!operation) return
    const settled = new Set([...operation.settledItemIds, ...itemIds])
    operation.settledItemIds = [...settled]
    releaseItems(operationId, itemIds)
  }

  /** F1: a request key is a routing hint, never proof. A resume must compare
   *  the exact context, intent, slot keys, day assignments and entity
   *  identities against the record the key points at. */
  function requestMatchesOperation(operation: WriterOperationRecord, request: WriterBeginRequest): boolean {
    if (operation.requestKey !== request.requestKey) return false
    if (operation.intent !== request.intent) return false
    // A binding mismatch is a different measured write. Both sides must carry
    // one and agree; a legacy unbound operation stays compatible with unbound
    // requests only.
    if (operation.binding || request.binding) {
      if (!operation.binding || !request.binding) return false
      if (!sameWriterBinding(operation.binding, request.binding)) return false
    }
    if (operation.context.tripId !== request.context.tripId) return false
    if (operation.context.dayId !== request.context.dayId) return false
    if (operation.context.dayIndex !== request.context.dayIndex) return false
    if (operation.items.length !== request.entries.length) return false
    const entriesByIndex = new Map(request.entries.entries())
    return operation.items.every((item, index) => {
      const entry = entriesByIndex.get(index)
      if (!entry) return false
      if (item.slotKey !== entry.slotKey) return false
      if ((item.dayId ?? null) !== (entry.dayId ?? request.context.dayId ?? null)) return false
      if (item.dayIndex !== (entry.dayIndex ?? request.context.dayIndex)) return false
      // The saved-stop note is content. A retry that changes it must not pass
      // the payload comparison and then write different text under the old id.
      if (item.notes !== (entry.notes ?? null)) return false
      return entityMatches(item.hit, entry.hit)
    })
  }

  /** F2: a resume may only reuse payloads the first operation captured. An
   *  item still live without a captured resolved hit cannot prove what the
   *  retry would write, so the retry must never re-resolve it. */
  function resumePayloadIsProvable(operation: WriterOperationRecord): boolean {
    const settled = new Set(operation.settledItemIds)
    return operation.items.every(item => settled.has(item.itemId) || item.resolvedHit !== null)
  }

  function begin(request: WriterBeginRequest): WriterBeginDecision {
    const requestedId = request.operationId
    if (requestedId) {
      const existing = operations.get(requestedId)
      if (!existing) {
        // An explicit id is retry proof, never a way to mint a new operation.
        // A stale ticket (gate reset, another page, a forgotten record) is
        // refused instead of silently creating work under the old id.
        return { status: 'busy', reason: 'operation-unknown', itemIds: [], operationId: requestedId }
      }
      if (!isLive(existing)) {
        // A settled operation id is never reusable: its write already has a
        // known outcome.
        return { status: 'busy', reason: 'operation-settled', itemIds: [], operationId: existing.id }
      }
      if (!requestMatchesOperation(existing, request)) {
        // F2: changed request content cannot be restaged under the old id.
        return { status: 'busy', reason: 'payload-mismatch', itemIds: [], operationId: existing.id }
      }
      if (existing.phase !== 'uncertain') {
        return { status: 'busy', reason: 'request-in-flight', itemIds: [], operationId: existing.id }
      }
      if (!resumePayloadIsProvable(existing)) {
        return { status: 'busy', reason: 'resume-unverifiable', itemIds: [], operationId: existing.id }
      }
      return { status: 'resumed', operation: existing }
    }
    const requestInFlight = liveRequests.get(request.requestKey)
    if (requestInFlight) {
      const live = operations.get(requestInFlight)
      // A write whose save failed or whose outcome is unknown keeps its
      // identity. The SAME logical request resumes it: same operation id, same
      // proposed stop ids, so a retry cannot create a second visit. An
      // operation still in flight or already staged stays busy instead.
      if (live && live.phase === 'uncertain') {
        if (!requestMatchesOperation(live, request)) {
          return { status: 'busy', reason: 'payload-mismatch', itemIds: [], operationId: live.id }
        }
        if (!resumePayloadIsProvable(live)) {
          return { status: 'busy', reason: 'resume-unverifiable', itemIds: [], operationId: live.id }
        }
        return { status: 'resumed', operation: live }
      }
      return { status: 'busy', reason: 'request-in-flight', itemIds: [], operationId: requestInFlight }
    }

    const blocked: string[] = []
    for (const entry of request.entries) {
      const owned = reservations.find(reservation =>
        reservation.tripId === request.context.tripId && entityMatches(reservation.hit, entry.hit))
      if (owned) blocked.push(owned.itemId)
    }
    if (blocked.length > 0) {
      return { status: 'busy', reason: 'item-reserved', itemIds: blocked }
    }

    const operationId = requestedId ?? (request.mintOperationId ?? (() => newId('wop')))()
    const operation: WriterOperationRecord = {
      id: operationId,
      context: request.context,
      intent: request.intent,
      phase: 'reserved',
      requestKey: request.requestKey,
      items: request.entries.map((entry, index) => ({
        itemId: `item-${index + 1}`,
        slotKey: entry.slotKey,
        hit: snapshotHit(entry.hit),
        resolvedHit: null,
        stopId: request.mintStopId(),
        dayId: entry.dayId ?? request.context.dayId,
        dayIndex: entry.dayIndex ?? request.context.dayIndex,
        notes: entry.notes ?? null,
      })),
      settledItemIds: [],
      ...(request.binding ? { binding: copyWriterBinding(request.binding) } : {}),
    }
    operations.set(operationId, operation)
    liveRequests.set(request.requestKey, operationId)
    for (const item of operation.items) {
      reservations.push({ operationId, itemId: item.itemId, hit: item.hit, tripId: operation.context.tripId })
    }
    return { status: 'entered', operation }
  }

  function stage(operationId: string, input: { plannedItemIds: readonly string[]; skippedItemIds: readonly string[] }): void {
    const operation = operations.get(operationId)
    if (!operation) return
    operation.phase = 'staged'
    settle(operationId, input.skippedItemIds)
    if (input.plannedItemIds.length === 0) operation.phase = 'staged'
  }

  function retryStage(operationId: string, input: { skippedItemIds: readonly string[] }): void {
    const operation = operations.get(operationId)
    if (!operation) return
    if (operation.phase !== 'uncertain') return
    // Decided items release; the operation itself stays uncertain until a
    // validated acknowledgement proves the retry's stops arrived.
    settle(operationId, input.skippedItemIds)
  }

  function acknowledge(operationId: string, placedItemIds: readonly string[]): void {    const operation = operations.get(operationId)
    if (!operation) return
    settle(operationId, placedItemIds)
    operation.phase = operation.settledItemIds.length >= operation.items.length ? 'applied' : 'uncertain'
    if (operation.phase === 'applied') liveRequests.delete(operation.requestKey)
  }

  function uncertain(operationId: string): void {
    const operation = operations.get(operationId)
    // Only a live operation can become uncertain. A settled success, a proven
    // discard or an ordinary discard is terminal, so a late or duplicated
    // notification can never reopen completed work.
    if (!operation || !isLive(operation)) return
    operation.phase = 'uncertain'
  }

  function discard(operationId: string): void {
    const operation = operations.get(operationId)
    if (!operation) return
    operation.phase = 'discarded'
    liveRequests.delete(operation.requestKey)
    releaseItems(operationId, operation.items.map(item => item.itemId))
  }

  /** The store positively proved this EXACT admitted write was discarded or is
   *  foreign. Release only this operation's own reservations and settle it to a
   *  terminal, truthful phase. It is separate from `discard` (a pre-admission
   *  refusal) and `acknowledge` (a validated success): it never denies that a
   *  write was admitted and never recycles the operation into a new
   *  payload. The `isLive` guard makes it idempotent and preserves an
   *  acknowledged success: a late ack, a second discard, a newer preview or an
   *  identity switch cannot release another operation or settle twice. */
  function settleProvenDiscarded(operationId: string): boolean {
    const operation = operations.get(operationId)
    if (!operation || !isLive(operation)) return false
    operation.phase = 'abandoned'
    liveRequests.delete(operation.requestKey)
    releaseItems(operationId, operation.items.map(item => item.itemId))
    return true
  }

  /** Exact retry proof. A ticket exists only for a genuinely uncertain
   *  operation whose live items are still reserved in its own trip and whose
   *  first-operation payload is complete. Any other state returns null, so no
   *  caller can auto-retry settled, admitted, conflicting or unknown work. */
  function ticketOf(operation: WriterOperationRecord): WriterRetryTicket | null {
    if (operation.phase !== 'uncertain') return null
    if (operation.intent === 'vote') return null
    if (!resumePayloadIsProvable(operation)) return null
    const settled = new Set(operation.settledItemIds)
    const reserved = new Set(
      reservations
        .filter(entry => entry.operationId === operation.id && entry.tripId === operation.context.tripId)
        .map(entry => entry.itemId),
    )
    const reservationProof = operation.items.every(item =>
      settled.has(item.itemId) || reserved.has(item.itemId))
    if (!reservationProof) return null
    return {
      operationId: operation.id,
      context: { ...operation.context },
      intent: operation.intent,
      picks: operation.items.map(item => ({
        hit: snapshotHit(item.hit),
        slotKey: item.slotKey,
        dayId: item.dayId,
        dayIndex: item.dayIndex,
        ...(item.notes !== null ? { notes: item.notes } : {}),
      })),
      ...(operation.binding ? { binding: copyWriterBinding(operation.binding) } : {}),
    }
  }

  function retryTicket(operationId: string): WriterRetryTicket | null {
    const operation = operations.get(operationId)
    return operation ? ticketOf(operation) : null
  }

  /** The same logical request, resolved to its uncertain operation. It reuses
   *  the exact comparison a resume uses, so a matching request key alone is not
   *  enough: context, intent, slot, day, notes and entity must all agree. */
  function retryTicketFor(
    request: Omit<WriterBeginRequest, 'mintStopId' | 'mintOperationId' | 'allowRepeat'>,
  ): WriterRetryTicket | null {
    const operationId = liveRequests.get(request.requestKey)
    if (!operationId) return null
    const operation = operations.get(operationId)
    if (!operation || operation.phase !== 'uncertain') return null
    if (!requestMatchesOperation(operation, { ...request, mintStopId: () => '' })) return null
    return ticketOf(operation)
  }

  return {
    begin,
    captureResolved: (operationId, resolved) => {
      const operation = operations.get(operationId)
      if (!operation) return
      const byItemId = new Map(resolved.map(entry => [entry.itemId, entry.hit]))
      for (const item of operation.items) {
        const hit = byItemId.get(item.itemId)
        // First capture wins: a retry must never overwrite the payload the
        // first operation pinned. The stored hit is a snapshot, so the
        // resolver's object cannot change the captured payload later.
        if (hit && !item.resolvedHit) item.resolvedHit = snapshotHit(hit)
      }
    },
    stage,
    retryStage,
    acknowledge,
    uncertain,
    discard,
    settleProvenDiscarded,
    operation: operationId => operations.get(operationId),
    retryTicket,
    retryTicketFor,
    reservations: () => reservations.map(entry => ({ operationId: entry.operationId, itemId: entry.itemId, hit: entry.hit })),
    isReserved: (hit, tripId) => reservations.some(entry =>
      entityMatches(entry.hit, hit) && (tripId === undefined || entry.tripId === tripId)),
    reset: () => {
      operations.clear()
      liveRequests.clear()
      reservations.length = 0
    },
  }
}

/** The map workspace's gate: one instance for every writer hook on the page, so
 *  a slot fill, a batch and the shortlist cannot reserve one place twice even
 *  before React publishes a busy flag. */
export const mapWriterOperationGate: WriterOperationGate = createWriterOperationGate()

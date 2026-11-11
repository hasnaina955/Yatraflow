// ============ One preview at a time — chained, not forked (#334) ============
//
// The impact-preview sheet is NOT modal: the timeline, board and map stay live
// while it is open. Every mutation used to clone the COMMITTED trip, so a
// second edit made while a preview was open replaced the first one outright —
// the staged change vanished with no toast, no merge and no warning.
//
// The policy (Option A of the issue's fix guide) is to CHAIN: the base for a
// mutation is the staged proposal when one exists, so the second change builds
// on the first and the sheet reports the combined delta. The committed trip is
// still the measuring stick for the impact itself, which keeps the numbers
// honest about what Save will actually write.
//
// Kept pure and React-free so the composition is pinned in node tests
// (tests/preview-chain.test.ts); the workspace owns the state.
import type { Trip } from '../data/types'
import type { TripWriteReceipt } from '../store/store'
import type { TripPreviewObservation, TripPreviewOperation, TripPreviewPending } from '../store/tripPreviewRecovery'

/** The part of the store's subscription handle the workspace uses. */
export type PreviewSubscriptionHandle = { observation(): TripPreviewObservation; dispose(): void }

/** The shape a mutation must be applied to: the staged proposal when a preview
 *  is open, otherwise the committed row. */
export function previewBase(committed: Trip, staged: Trip | null): Trip {
  return staged ?? committed
}

/** Apply a mutation to the right base and hand back the proposed shape. The
 *  first staged change survives a second mutation because the second clones
 *  the first's proposal, never the committed row.
 *
 *  #563 — the belt under the mutators' own day guards: a mutator that throws
 *  anyway (a stale index no guard reached) must not crash the workspace, and
 *  must not stage a HALF-applied draft either. The throw discards the draft —
 *  a fresh clone of the base is proposed, so the impact sheet reads zero-delta
 *  — and the reason is logged, not swallowed. */
export function stagedChange(committed: Trip, staged: Trip | null, mutator: (draft: Trip) => void): Trip {
  const base = previewBase(committed, staged)
  const proposed = structuredClone(base) as Trip
  try {
    mutator(proposed)
  } catch (err) {
    console.error('[yatraflow] staged change refused — the mutator threw', err)
    return structuredClone(base) as Trip
  }
  return proposed
}

/** The one refusal a direct-cache writer speaks while a preview is open.
 *
 *  Resolved decisions and accepted suggestions are CREW signals written
 *  straight to the cache — they are deliberately NOT staged into the preview.
 *  Staging one would put a resolution the rest of the group cannot see inside a
 *  proposal its author might never keep; the group's own record (votes, tally,
 *  feed) would then disagree with the timeline. So they wait: the preview is a
 *  study-and-commit surface, not a second place for the crew to vote. */
export const PREVIEW_BUSY = 'Keep or remove your staged change first.'

// ---- Operation-owned lifecycle records (#841) ----
//
// A staged preview can carry several operations. Each ApplyChange caller may
// hand over a Keep callback and an operation with a stable id and a discard
// callback. Chaining used to keep only the newest callback, so an earlier
// operation's follow-up (a shortlist clear, an Undo toast) was lost. Each
// operation is now its own record. A record settles once: it is kept after an
// acknowledged write, or discarded before any admission. It never does both.
// Two further answers are separate from a settlement: an admitted but
// unconfirmed write notifies the record once and leaves it open, and a write
// the store proves discarded or foreign runs its own terminal settlement.

/** The receipt a Keep callback gets. It names the revision and write version
 *  the store acknowledged. It is never built from timing. */
export type AcknowledgedReceipt = Extract<TripWriteReceipt, { kind: 'acknowledged' }>

/** A Keep callback. Existing zero-argument callbacks still fit this type. A
 *  caller that reports placed items must check for the receipt. */
export type KeptCallback = (receipt?: AcknowledgedReceipt) => void

/** Client lifecycle metadata for one operation. It is not a server receipt.
 *  `onDiscard` runs only when the proposal is discarded before any admission.
 *  `onStoreDiscarded` runs once when the store POSITIVELY proves this exact
 *  operation's admitted write was discarded or is foreign after a Keep (Saved
 *  edits or an identity/access switch). It is a separate settlement: not a
 *  pre-admission discard and not an acknowledged success. It releases only this
 *  operation's own reservation and settles the record truthfully. It never
 *  denies that a write was admitted and never restages the operation.
 *  `onUncertain` runs at most once for this record when a Keep ADMITTED its
 *  write but no validated acknowledgement arrived and the exact generation is
 *  still pending or unknown. It is not an acknowledgement and not a discard: it
 *  only tells the operation that its own save is unconfirmed, so it can keep its
 *  reservation and offer its captured retry. It never writes. */
export type OperationMeta = {
  readonly id: string
  readonly onDiscard?: () => void
  readonly onStoreDiscarded?: () => void
  readonly onUncertain?: () => void
}

/** One operation's lifecycle record. `id` is unique per record and never
 *  collides. `operationId` is the caller's stable id, or null for a plain
 *  callback; only an explicit id deduplicates. */
export type PreviewOperation = {
  readonly id: number
  readonly operationId: string | null
  readonly onKept?: KeptCallback
  readonly onDiscard?: () => void
  /** Proven-abandoned settlement, distinct from onKept and onDiscard. */
  readonly onStoreDiscarded?: () => void
  /** Exact-operation uncertainty notification. It runs at most once for THIS
   *  record, and only after a Keep admitted the write and the store could not
   *  confirm it. It never replaces onKept or onDiscard. */
  readonly onUncertain?: () => void
  state: 'staged' | 'kept' | 'discarded' | 'abandoned'
  /** True once a Keep captured this record and called the store. Such a record
   *  may already be admitted, so no discard callback may run for it. A record
   *  chained after that Keep stays false: it was not in the saved patch. */
  attempted: boolean
  /** True once this record ran its exact-operation uncertainty notification.
   *  A repeated Keep, a second pending read or a late observer cannot run it
   *  again. An acknowledgement still settles the record afterwards. */
  uncertainNotified: boolean
}

let nextOperationId = 1

/** Append an operation to the chain. A callback or an operation id creates a
 *  record, so an operation with only `onDiscard` still exists. A repeated
 *  explicit id keeps the first record, so a re-staged operation cannot run
 *  twice. A missing or empty id never deduplicates. */
export function composeOperations(
  previous: readonly PreviewOperation[],
  onKept?: KeptCallback,
  operation?: OperationMeta,
): readonly PreviewOperation[] {
  const operationId = typeof operation?.id === 'string' && operation.id.length > 0 ? operation.id : null
  const onDiscard = typeof operation?.onDiscard === 'function' ? operation.onDiscard : undefined
  const onStoreDiscarded = typeof operation?.onStoreDiscarded === 'function' ? operation.onStoreDiscarded : undefined
  const onUncertain = typeof operation?.onUncertain === 'function' ? operation.onUncertain : undefined
  // An operation that carries only a settlement still owns a record: it is the
  // exact generation Saved edits must be able to release.
  if (!onKept && !onDiscard && !onStoreDiscarded && !onUncertain && operationId === null) return previous
  if (operationId !== null && previous.some(record => record.operationId === operationId)) return previous
  return [...previous, {
    id: nextOperationId++, operationId, onKept, onDiscard, onStoreDiscarded, onUncertain,
    state: 'staged', attempted: false, uncertainNotified: false,
  }]
}

/** Record that a Keep captured these records and is about to call the store.
 *  Call it before the admission call, so a record chained later stays apart. */
export function markAttempted(operations: readonly PreviewOperation[]): void {
  for (const operation of operations) if (operation.state === 'staged') operation.attempted = true
}

/** Record that the store proved these records were never written (a stale or
 *  refused result comes before any cache write). They may be discarded again. */
export function markUnadmitted(operations: readonly PreviewOperation[]): void {
  for (const operation of operations) if (operation.state === 'staged') operation.attempted = false
}

/** Run each staged record's Keep callback once, with the acknowledged receipt.
 *  One callback that throws cannot stop its peers or leave the caller's busy
 *  state stuck: the error is logged and the loop continues. Returns how many
 *  callbacks completed without throwing. */
export function runOperations(operations: readonly PreviewOperation[], receipt?: AcknowledgedReceipt): number {
  const handed = receipt ? Object.freeze({ ...receipt }) : undefined
  let completed = 0
  for (const operation of operations) {
    if (operation.state !== 'staged') continue
    operation.state = 'kept'
    if (!operation.onKept) continue
    try {
      operation.onKept(handed)
      completed += 1
    } catch (err) {
      console.error('[yatraflow] a completion callback threw', err)
    }
  }
  return completed
}

/** Tell the records one Keep captured that its admitted write is unconfirmed.
 *  It runs only for a record a Keep captured (`attempted`), that no answer has
 *  settled yet, and that has not notified before. It changes no record state and
 *  runs no Keep or discard callback, so a later acknowledgement still settles
 *  the record and a proven discard still reaches its own settlement. Records
 *  chained after that Keep were not in the saved patch and are never passed
 *  here. Each callback that throws is logged; its peers still run. */
export function notifyUncertain(operations: readonly PreviewOperation[]): number {
  let completed = 0
  for (const operation of operations) {
    if (operation.state !== 'staged' || !operation.attempted || operation.uncertainNotified) continue
    operation.uncertainNotified = true
    if (!operation.onUncertain) continue
    try {
      operation.onUncertain()
      completed += 1
    } catch (err) {
      console.error('[yatraflow] an uncertainty callback threw', err)
    }
  }
  return completed
}

/** Run the discard callback of each staged record that no Keep tried, once.
 *  A record a Keep captured may already be admitted, so it keeps its state and
 *  no callback runs for it. Records chained after that Keep were not in the
 *  saved patch, so closing or leaving the preview releases them. */
export function discardOperations(operations: readonly PreviewOperation[]): number {
  let completed = 0
  for (const operation of operations) {
    if (operation.state !== 'staged' || operation.attempted) continue
    operation.state = 'discarded'
    if (!operation.onDiscard) continue
    try {
      operation.onDiscard()
      completed += 1
    } catch (err) {
      console.error('[yatraflow] a discard callback threw', err)
    }
  }
  return completed
}

/** Drop the records that already ran, by id, from a newer preview's chain. */
export function withoutOperations(operations: readonly PreviewOperation[], done: readonly PreviewOperation[]): readonly PreviewOperation[] {
  const ids = new Set(done.map(operation => operation.id))
  return operations.filter(operation => !ids.has(operation.id))
}

/** A save that may already be on this device. The store writes its cache and
 *  queues the write before it sends, so a result that is not an acknowledgement
 *  does not prove the change is unwritten. `resolved` turns true once the
 *  durable queue no longer holds the trip: the Saved edits path then decided. */
export type UncertainWrite = { readonly tripId: string; readonly kind: string; resolved: boolean }

/** The exact admission one Keep made (#841). It holds the store's operation
 *  identity, the records that Keep captured, and the live subscription for that
 *  exact write generation. Only a validated acknowledgement for that
 *  generation settles it, and it runs only the captured records, once. A newer
 *  chained record never joins, and a newer or different preview is never
 *  cleared by it. */
export type PreviewWatch = {
  readonly operation: TripPreviewOperation
  /** The records the Keep captured, never the ones chained after it. */
  readonly records: readonly PreviewOperation[]
  /** The preview revision the Keep was made from. */
  readonly revision: number
  subscription: PreviewSubscriptionHandle | null
  /** True once this watch ran its records or was released. It settles once. */
  settled: boolean
  /** The receipt the records ran with, once an acknowledgement settled it. */
  receipt: AcknowledgedReceipt | null
}

/** Read the store's exact pending state as the two answers the UI can act on.
 *  `held`: the write may still be on this device (pending), or nothing proves
 *  otherwise (unknown). `resolved`: the exact generation was saved, discarded,
 *  or no longer belongs to this identity. An unknown state is never resolved. */
export function pendingVerdict(pending: Pick<TripPreviewPending, 'state'>): 'held' | 'resolved' {
  return pending.state === 'pending' || pending.state === 'unknown' ? 'held' : 'resolved'
}

/** Run a watch's captured records with the acknowledged receipt, once. Returns
 *  how many callbacks completed, or -1 when the watch had already settled. */
export function settleWatch(watch: PreviewWatch, receipt: AcknowledgedReceipt): number {
  if (watch.settled) return -1
  watch.settled = true
  watch.receipt = receipt
  watch.subscription?.dispose()
  watch.subscription = null
  return runOperations(watch.records, receipt)
}

/** Release a watch that will never acknowledge (explicitly discarded in Saved
 *  edits, or no longer owned by this identity). It runs no callback of either
 *  kind and does not mark the captured records unadmitted: a record that a Keep
 *  captured was admitted once, so it stays unclaimed and nothing says it was
 *  discarded. Only a refusal before any admission releases records. */
export function releaseWatch(watch: PreviewWatch): void {
  if (watch.settled) return
  watch.settled = true
  watch.subscription?.dispose()
  watch.subscription = null
}

/** Run the proven-abandoned settlement on the records one Keep captured, once.
 *  The store POSITIVELY proved that exact generation discarded or foreign. This
 *  is separate from runOperations (an acknowledged success) and from
 *  discardOperations (a discard before any admission): it never calls onKept or
 *  onDiscard, never denies that a write was admitted, and never recycles
 *  the operation into a new payload. Each captured, still-staged record runs
 *  its own onStoreDiscarded once and becomes terminal, so a late
 *  acknowledgement, a second discard or a newer preview cannot fire any
 *  callback twice or claim a discard of an admitted save. */
export function runStoreDiscarded(operations: readonly PreviewOperation[]): number {
  let completed = 0
  for (const operation of operations) {
    if (operation.state !== 'staged') continue
    operation.state = 'abandoned'
    if (!operation.onStoreDiscarded) continue
    try {
      operation.onStoreDiscarded()
      completed += 1
    } catch (err) {
      console.error('[yatraflow] a proven-discard settlement callback threw', err)
    }
  }
  return completed
}

/** Settle a watch whose exact generation the store proved discarded or foreign.
 *  It runs only the captured records' proven-abandoned settlement, once, and
 *  disposes the subscription. A late acknowledgement or a second discard finds
 *  the watch already settled and runs nothing. `releaseWatch` remains the
 *  no-callback release for a resolved save this code cannot name. */
export function settleStoreDiscardedWatch(watch: PreviewWatch): number {
  if (watch.settled) return -1
  watch.settled = true
  watch.subscription?.dispose()
  watch.subscription = null
  return runStoreDiscarded(watch.records)
}

/** The shared marker of one chain of staged edits. It is mutable on purpose: a
 *  newer staged edit replaces the pending object, but must still see that a Keep
 *  is in flight or uncertain, so a second Keep cannot start a second write and
 *  Remove cannot claim a discard. */
export type PreviewGate = { inFlight: Promise<KeepOutcome> | null; uncertain: UncertainWrite | null; watch: PreviewWatch | null }

export function createPreviewGate(): PreviewGate {
  return { inFlight: null, uncertain: null, watch: null }
}

/** The non-success Keep kinds. */
export type RefusedKind = 'stale' | 'refused' | 'superseded' | 'conflict' | 'forbidden' | 'unavailable'

/** What Keep reports. `acknowledged` is the only success and carries the actual
 *  receipt. Every other kind leaves the preview in place. `uncertain` is set
 *  only when the change may already be saved on this device. */
export type KeepOutcome =
  | AcknowledgedReceipt
  | { kind: RefusedKind | 'none'; uncertain?: true }

/** The receipt itself when `result` is a complete acknowledgement, else null.
 *  The revision must be a nonempty string and the write version a nonnegative
 *  integer. The receipt is rebuilt field by field, never passed through. */
export function acknowledgedReceiptOf(result: unknown): AcknowledgedReceipt | null {
  if (typeof result !== 'object' || result === null) return null
  if (!('kind' in result) || result.kind !== 'acknowledged') return null
  if (!('revision' in result) || typeof result.revision !== 'string' || result.revision.length === 0) return null
  if (!('writeVersion' in result) || typeof result.writeVersion !== 'number'
    || !Number.isInteger(result.writeVersion) || result.writeVersion < 0) return null
  return { kind: 'acknowledged', revision: result.revision, writeVersion: result.writeVersion }
}

/** True only for a receipt that names a revision and a write version. */
export function isAcknowledgement(result: unknown): boolean {
  return acknowledgedReceiptOf(result) !== null
}

/** Narrow an admission result to a Keep outcome. A result that is not a valid
 *  acknowledgement, including an unknown kind, reads as unavailable. */
export function keepOutcomeOf(result: unknown): KeepOutcome {
  const receipt = acknowledgedReceiptOf(result)
  if (receipt) return receipt
  const kind = typeof result === 'object' && result !== null && 'kind' in result ? result.kind : undefined
  if (kind === 'stale' || kind === 'refused' || kind === 'superseded' || kind === 'conflict' || kind === 'forbidden' || kind === 'unavailable') return { kind }
  return { kind: 'unavailable' }
}

/** Superseded in the workspace by the store's admission trace
 *  (`trackTripPreview`), which names the exact generation. A cache comparison
 *  guesses, because a superseding edit can change every proposed field. Kept
 *  for its own unit tests only.
 *
 *  True when the cache holds a field of the proposal that the captured base did
 *  not hold. That is the trace an admission leaves: the store writes the cache
 *  before it sends. `stale` and `refused` come before any cache write, so they
 *  never need this check. `updatedAt` and `writeVersion` are the store's own. */
export function cacheHoldsProposal(current: Trip | undefined, base: Trip, patch: Trip): boolean {
  if (!current) return false
  return Object.keys(patch).some(key => {
    if (key === 'updatedAt' || key === 'writeVersion') return false
    const proposed = JSON.stringify(Reflect.get(patch, key))
    return proposed !== JSON.stringify(Reflect.get(base, key)) && proposed === JSON.stringify(Reflect.get(current, key))
  })
}

/** Mark a non-acknowledged outcome uncertain when the change may be on this
 *  device. A stale or refused outcome comes before any cache write, so it stays
 *  as it is. */
export function withUncertainty(outcome: KeepOutcome, holds: boolean): KeepOutcome {
  if (outcome.kind === 'acknowledged' || outcome.kind === 'stale' || outcome.kind === 'refused' || outcome.kind === 'none') return outcome
  return holds ? { kind: outcome.kind, uncertain: true } : outcome
}

/** The one line the user reads when a Keep did not save. Each line says the
 *  preview is still there. */
export const KEEP_REFUSAL: Record<RefusedKind, string> = {
  stale: 'The plan changed while you were reviewing — remove this preview and redo the change.',
  refused: 'This change could not be saved. Your preview is kept.',
  superseded: 'A newer edit replaced this save. Your preview is kept.',
  conflict: 'Earlier changes are still saving or need attention. Your preview is kept.',
  forbidden: 'You can no longer edit this trip. Your preview is kept.',
  unavailable: 'The save was not confirmed. Your preview is kept — try Keep again.',
}

/** Shown while a Keep is in flight and the user tries Remove. The write may
 *  already be admitted, so "discarded" would be false. */
export const KEEP_IN_FLIGHT = 'Your change is being saved. Wait for it to finish.'

/** Shown after a save that was not confirmed but may be on this device. It names
 *  the existing recovery path and never asks for a blind retry. */
export const KEEP_UNCERTAIN = 'The save was not confirmed, and it may already be on this device. Open Saved edits to retry or discard it. Your preview is kept.'

/** Shown when Keep or Remove meets an unresolved uncertain save. */
export const KEEP_UNCERTAIN_HOLD = 'This change may already be saved on this device. Resolve it in Saved edits first.'

/** Shown when Saved edits no longer holds the change. Whether it was saved or
 *  dropped is not known here, so the line says to check the plan. */
export const KEEP_UNCERTAIN_RESOLVED = 'Saved edits no longer holds this change. Check your plan, then remove this preview.'

/** Shown when a preview closes after an uncertain save. It was not discarded. */
export const KEEP_CLOSED_UNCERTAIN = 'Preview closed. Check your plan to see whether the change was saved.'

/** Shown when Remove finished reading Saved edits, but the preview changed in
 *  the meantime. The newer preview stays open. */
export const REMOVE_PREVIEW_CHANGED = 'Your preview changed while Saved edits was checked. It is still open.'

/** Shown when a late non-acknowledged save belongs to a preview that is gone. */
export const KEEP_LEFT_BEHIND = 'Your last change was not confirmed. Open Saved edits to check it.'

/** Shown when a late refused save belongs to a preview that is gone, and the
 *  change is not on this device. */
export const KEEP_LEFT_UNSAVED = 'Your last change was not saved.'

/** Shown when the user leaves a trip while a save is in flight or uncertain. */
export const LEAVE_UNCERTAIN = 'Your last change may be saved on the trip you left. Open Saved edits to check it.'

/** True when the committed row is no longer the object the preview was built
 *  on — a direct write (a resolved decision, an accepted suggestion, a realtime
 *  edit) landed while the preview was open, so saving the proposal would
 *  silently overwrite it. Identity is a sufficient signal: the store clones the
 *  trip row on every write. */
export function keepIsStale(base: Trip | null, current: Trip): boolean {
  return base !== null && base !== current
}

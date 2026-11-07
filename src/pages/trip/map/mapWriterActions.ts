// ============ Map writer actions: plan, stage, verify, undo (#841) ============
//
// The React hooks beside this module keep their existing surface. Every
// decision they make about a placement lives here, so a node test can drive the
// SAME functions the page calls with a controlled workspace, store and provider
// transport.
//
// The rules this module keeps:
//  - One planner. Single fill, batch fill, shortlist placement and the later arc
//    entry all call `planSlotPlacements` (the reviewed draft planner) with the
//    real measured road facts the caller passes. There is no second ordering
//    policy and no fallback that appends at the end of a day.
//  - A stage is not an acknowledgement. A planned item stays `staged`; only a
//    validated receipt plus the intended stop on the SAVED trip makes it
//    `placed`. An absent receipt never reads as applied.
//  - Per-item outcomes keep their reasons. Skipped, unresolved and uncertain
//    items stay in the result so the caller retains the shortlist entry.
//  - Undo is a guarded inverse: the acknowledged stop ids, their expected
//    content and the stable day are checked against the CURRENT trip, then the
//    inverse is admitted. A changed target is refused, never deleted blindly.
//
// No routing call, no invented road evidence, no whole-trip rollback and no
// second acceptance writer.
import type { ItineraryDay, ItineraryStop, StopCategory, Trip } from '../../../data/types'
import { STOP_CATEGORIES } from '../../../data/types'
import type { ImpactResult } from '../../../lib/impact'
import type { PlaceHit } from '../../../lib/providers/hits'
import {
  planSlotPlacements,
  type SlotPlacementItem,
  type SlotPlacementPlan,
  type SlotPlacementReason,
  type SlotPlacementResult,
} from '../../../lib/slotPlacement'
import type { EffectiveDaySlot } from '../../../lib/dayPlan'
import { acknowledgedReceiptOf, type AcknowledgedReceipt } from '../../../lib/previewChain'
import type { WriterOperationContext, WriterOperationGate, WriterRetryTicket } from './writerOperationGate'
import { writerRequestKey } from './writerOperationGate'
import { roadChainSig } from '../../../lib/tripRoad'
import {
  bindingMatchesTrip,
  sameWriterBinding,
  type WriterRoadBinding,
} from './writerRoadBinding'

/** The exact retry proof is owned by the gate and re-exported here so every
 *  writer caller imports one contract. */
export type { WriterRetryTicket } from './writerOperationGate'

/** The only receipt that counts as applied. It IS the store's validated
 *  acknowledgement shape, so the negative, fractional and non-finite versions
 *  `acknowledgedReceiptOf` rejects can never read as placed here. */
export type WriterReceipt = AcknowledgedReceipt

export function isWriterReceipt(value: unknown): value is WriterReceipt {
  return acknowledgedReceiptOf(value) !== null
}

/** Sonnet's workspace owns the definition. These are the first four arguments
 *  unchanged, the optional kept callback that may now receive the receipt, and
 *  the optional operation metadata. Written structurally so both the current
 *  four-argument workspace and the extended one type-check. */
export type WriterKeptCallback = (receipt?: WriterReceipt) => void
export interface WriterOperationMeta {
  id: string
  /** Runs only for a discard BEFORE admission. A failed save keeps the record. */
  onDiscard?: () => void
  /** Runs once when the store proves this exact admitted write discarded or
   *  foreign after a Keep (Saved edits or an identity/access switch). Separate
   *  from onDiscard and onKept: it releases ONLY this operation's own
   *  reservation and settles it truthfully, never denying that a write was
   *  admitted and never restaging the operation. */
  onStoreDiscarded?: () => void
  /** Runs at most once for this record when a Keep ADMITTED its write but no
   *  validated acknowledgement arrived and the exact generation is still
   *  pending or unknown. It keeps every reservation, marks the operation
   *  uncertain and delivers the captured retry ticket. It is not success and
   *  not a discard, and it never writes. `onKept` never stands in for it. */
  onUncertain?: () => void
}
export type WriterApplyChange = (
  mutator: (draft: Trip) => void,
  kind: ImpactResult['kind'],
  dayIndex: number,
  onKept?: WriterKeptCallback,
  operation?: WriterOperationMeta,
) => void

/** Road facts the caller has actually measured. `routeKey` identifies the
 *  measured chain; it is never synthesised here. A caller without a measured
 *  route passes null, and every item stays unresolved with a reason. */
export interface WriterRoadFacts {
  routeKey: string
}

export interface WriterPick {
  hit: PlaceHit
  /** Slot the place was chosen from; null for a free shortlist place. */
  slotKey: string | null
  /** Target day resolved by the caller (shortlist spans days). */
  dayId?: string | null
  dayIndex?: number
  /** The candidate row the caller showed. Provenance only; never re-scored. */
  candidate?: EffectiveDaySlot['candidates'][number]
  /** Saved-stop note for this pick (the direct add's provenance line). */
  notes?: string
}

export type WriterRefusal =
  | 'missing-day'
  | 'gate-busy'
  | 'road-evidence-unavailable'
  | 'current-trip-unavailable'
  | 'nothing-pinned'
  | 'no-placements'

/** F1/F2: why a retry could not resume the uncertain operation it named.
 *  `payload-changed` — the request's context, slots, day assignments, notes or
 *  picks differ from the captured operation; `resume-unverifiable` — the
 *  operation cannot prove what it would write (no captured payload for a live
 *  item); `operation-settled` — the named operation already has a known
 *  outcome; `operation-unknown` — no live record holds that id any more, so a
 *  retry must not mint work under it. */
export type WriterResumeDisposition =
  | 'payload-changed'
  | 'resume-unverifiable'
  | 'operation-settled'
  | 'operation-unknown'
  | 'road-changed'
  | 'trip-changed'

/** F3: the truthful disposition for an acknowledged write whose operation's
 *  stops could not be verified on the saved trip. The receipt is a fact about
 *  the server write; it is not proof that THIS operation's stops landed. The
 *  hooks share this one line so no caller can re-invent a landed claim. */
export const ZERO_VERIFIED_SAVE_MESSAGE =
  'The write was received, but none of these stops could be verified in the saved day. Check Saved edits before you retry.'

/** Why the ACTUAL draft refused the planned inserts. These are placement
 *  mechanics, not slot reasons, so they stay out of `SlotPlacementReason`. */
export type WriterApplyRefusal =
  | 'missing-day'
  | 'missing-anchor'
  | 'duplicate-stop-id'
  | 'invalid-stop-id'

export interface WriterApplyRefusalDetail {
  reason: WriterApplyRefusal | 'apply-unavailable'
  itemIds: string[]
}

/** The truthful result of one planned insert pass. A refusal means the draft
 *  was NOT changed: the whole pass is validated before the first insert. */
export type WriterApplyResult =
  | {
    status: 'applied'
    /** Every planned item, including ones a retry already found in place. */
    appliedItemIds: string[]
    insertedStopIds: string[]
    alreadyPresentItemIds: string[]
  }
  | {
    status: 'refused'
    reason: WriterApplyRefusal
    refusedItemIds: string[]
  }

export interface WriterPlannedItem {
  itemId: string
  slotKey: string | null
  dayId: string
  dayIndex: number
  plan: SlotPlacementPlan
  hit: PlaceHit
}

export interface WriterSkippedItem {
  itemId: string
  slotKey: string | null
  dayId: string
  dayIndex: number
  reason: SlotPlacementReason
}

export type WriterStageResult =
  | {
    status: 'staged'
    operationId: string
    context: WriterOperationContext
    planned: WriterPlannedItem[]
    /** Unresolved or refused items, with reasons. Always retained. */
    unresolved: WriterSkippedItem[]
    /** Skipped inside the planner (duplicate, no road, already in plan...). */
    skipped: WriterSkippedItem[]
  }
  | {
    status: 'refused'
    reason: WriterRefusal
    operationId?: string
    unresolved: WriterSkippedItem[]
    skipped: WriterSkippedItem[]
    /** Present when the actual draft refused the inserts. */
    apply?: WriterApplyRefusalDetail
    /** Present when the caller tried to resume an uncertain operation and the
     *  gate refused: the payload, the captured state or the operation's phase
     *  does not allow the retry. */
    resume?: { disposition: WriterResumeDisposition; operationId: string }
  }

export interface WriterPlacedItem {
  itemId: string
  slotKey: string | null
  dayId: string
  dayIndex: number
  stopId: string
  stop: ItineraryStop
  hit: PlaceHit
}

export interface WriterUnresolvedItem {
  itemId: string
  slotKey: string | null
  dayId: string
  dayIndex: number
  reason: 'acknowledgement-missing' | 'stop-not-in-saved-trip' | 'stop-content-changed'
}

/** What a caller may act on after the write settles. `staged` never appears
 *  here: this record exists only after a kept callback ran. */
export interface WriterCompletion {
  operationId: string
  context: WriterOperationContext
  phase: 'applied' | 'partial' | 'uncertain' | 'abandoned'
  acknowledged: boolean
  receipt: WriterReceipt | null
  /** Verified against the actual stop in the saved trip. */
  placed: WriterPlacedItem[]
  skipped: WriterSkippedItem[]
  unresolved: WriterUnresolvedItem[]
  /** F2: the exact retry proof, present only when the operation is genuinely
   *  uncertain and its first-operation payload and reservations are intact.
   *  A caller retries THIS ticket; it never rebuilds the request from a
   *  matching current pick. */
  retry?: WriterRetryTicket
}

export interface WriterActionDeps {
  /** The trip the operation was planned against. */
  trip: Trip
  applyChange: WriterApplyChange
  resolvePick: (hit: PlaceHit) => Promise<PlaceHit | null>
  mintStopId: () => string
  gate: WriterOperationGate
  /** Measured along-route km, or null off the measured route. */
  routeKmOf: (lat: number, lng: number) => number | null
  /** null when no measured route backs this write. */
  road: WriterRoadFacts | null
  /** The CURRENT committed trip, read at acknowledgement time. */
  currentTrip: () => Trip | undefined
  /** Receives the verified completion once per operation. */
  onCompletion: (completion: WriterCompletion) => void
  poiVisitMinutes: (category?: string) => number
  /** Explicit product action: a repeat visit already on the plan is allowed. */
  allowRepeatVisit?: boolean
  /** Strict measured-road bytes. Present activates the revalidation contract. */
  roadBinding?: WriterRoadBinding
  /** The live measured-road binding. Needed when `roadBinding` is present. */
  currentRoad?: () => WriterRoadBinding | null
  /** Synchronous after gate admission, before any resolver await. */
  onOperationStart?: (operationId: string) => void
}

const HIT_CATEGORIES = new Set<string>([...STOP_CATEGORIES, 'cafe'])

/** A provider hit's category, kept when the stop grammar knows it. A cast only
 *  after the value is proven to be one of the accepted strings. */
export function stopCategoryOf(value: unknown): StopCategory {
  return typeof value === 'string' && HIT_CATEGORIES.has(value) ? (value as StopCategory) : 'sightseeing'
}

/** The stable day the caller is planning. Never the array position. */
export function writerContextFor(trip: Trip, dayIndex: number): WriterOperationContext | null {
  const day = trip.days.find(candidate => candidate.index === dayIndex)
  if (!day || typeof day.id !== 'string' || day.id.length === 0) return null
  return { tripId: trip.id, dayId: day.id, dayIndex }
}

/** Existing measured positions for one day's stops. A stop without a measured
 *  km is left out; the planner then reports the insertion point it cannot
 *  prove instead of guessing one. */
function existingRoadForDay(
  day: ItineraryDay,
  routeKey: string,
  routeKmOf: (lat: number, lng: number) => number | null,
): Array<{ stopId: string; km: number; routeKey: string; dayId: string }> {
  const out: Array<{ stopId: string; km: number; routeKey: string; dayId: string }> = []
  for (const stop of day.stops) {
    if (stop.status === 'rejected') continue
    const km = routeKmOf(stop.lat, stop.lng)
    if (km == null || !Number.isFinite(km) || km < 0) continue
    out.push({ stopId: stop.id, km, routeKey, dayId: day.id })
  }
  return out
}

/** The planner's place shape for one resolved hit. Provider keys come from the
 *  pinned hit, so the planner's conflict check compares like with like. */
function placeForHit(hit: PlaceHit): SlotPlacementItem['place'] {
  return {
    title: hit.name,
    name: hit.name,
    locationName: hit.description ?? hit.name,
    lat: hit.latitude,
    lng: hit.longitude,
    ...(hit.placeId ? { placeId: hit.placeId } : {}),
    ...(hit.eLoc ? { eLoc: hit.eLoc } : {}),
    ...(hit.source ? { source: hit.source } : {}),
  }
}

/** Plan one day's resolved picks with the reviewed planner. Exported because the
 *  batch, the shortlist and the later arc entry share it; this is the single
 *  entry point for "which stops would this operation insert, and in what order". */
export function planWriterDay(input: {
  trip: Trip
  context: WriterOperationContext
  dayId: string
  dayIndex: number
  operationId: string
  /** One per pick, with the stop id the gate minted. */
  entries: ReadonlyArray<{ itemId: string; slotKey: string | null; hit: PlaceHit; stopId: string; notes?: string }>
  routeKmOf: (lat: number, lng: number) => number | null
  road: WriterRoadFacts | null
  poiVisitMinutes: (category?: string) => number
  allowRepeatVisit?: boolean
}): { result: SlotPlacementResult | null; planned: WriterPlannedItem[]; skipped: WriterSkippedItem[]; refusal: WriterRefusal | null } {
  const day = input.trip.days.find(candidate => candidate.id === input.dayId)
  if (!day) {
    return {
      result: null,
      planned: [],
      skipped: input.entries.map(entry => ({
        itemId: entry.itemId, slotKey: entry.slotKey, dayId: input.dayId, dayIndex: input.dayIndex,
        reason: 'missing-day' as const,
      })),
      refusal: 'missing-day',
    }
  }
  if (!input.road) {
    return {
      result: null,
      planned: [],
      skipped: input.entries.map(entry => ({
        itemId: entry.itemId, slotKey: entry.slotKey, dayId: input.dayId, dayIndex: input.dayIndex,
        reason: 'unknown-road-position' as const,
      })),
      refusal: 'road-evidence-unavailable',
    }
  }
  const routeKey = input.road.routeKey
  const items: SlotPlacementItem[] = input.entries.map(entry => {
    const km = input.routeKmOf(entry.hit.latitude, entry.hit.longitude)
    return {
      itemId: entry.itemId,
      place: placeForHit(entry.hit),
      hit: entry.hit,
      road: km != null && Number.isFinite(km) && km >= 0
        ? { km, routeKey, dayId: input.dayId }
        : null,
    }
  })
  const result = planSlotPlacements({
    trip: input.trip,
    items,
    policy: {
      tripId: input.trip.id,
      dayId: input.dayId,
      operationId: input.operationId,
      acceptedRouteKeys: [routeKey],
      ...(input.allowRepeatVisit ? { allowRepeatVisit: true } : {}),
      buildStop: item => {
        const entry = input.entries.find(candidate => candidate.itemId === item.itemId)
        const stopId = entry?.stopId ?? ''
        const pinned = item.hit
        return {
          id: stopId,
          category: stopCategoryOf(pinned.category),
          title: pinned.name,
          locationName: pinned.description ?? pinned.name,
          visitMinutes: input.poiVisitMinutes(pinned.category),
          priority: 'nice-to-have',
          notes: entry?.notes ?? 'Filled from the day plan',
          ...(entry?.slotKey ? { slotKey: entry.slotKey } : {}),
          description: pinned.description ?? '',
          openTime: pinned.openTime ?? '',
          closeTime: pinned.closeTime ?? '',
          status: 'suggested',
        }
      },
    },
    existingRoadPositions: existingRoadForDay(day, routeKey, input.routeKmOf),
  })

  const planned: WriterPlannedItem[] = []
  const skipped: WriterSkippedItem[] = []
  for (const outcome of result.outcomes) {
    const entry = input.entries.find(candidate => candidate.itemId === outcome.itemId)
    if (!entry) continue
    if (outcome.phase === 'planned') {
      planned.push({
        itemId: outcome.itemId,
        slotKey: entry.slotKey,
        dayId: input.dayId,
        dayIndex: input.dayIndex,
        plan: outcome,
        hit: entry.hit,
      })
    } else {
      skipped.push({
        itemId: outcome.itemId,
        slotKey: entry.slotKey,
        dayId: input.dayId,
        dayIndex: input.dayIndex,
        reason: outcome.reason,
      })
    }
  }
  const plannedCount = planned.length
  return {
    result,
    planned,
    skipped,
    refusal: plannedCount === 0 && skipped.length > 0 ? 'no-placements' : null,
  }
}

/** A day's stops during a planned insert pass. The pass works on a copy so a
 *  refusal can leave the draft byte-identical. */
interface PlannedDayLayout {
  day: ItineraryDay
  stops: ItineraryStop[]
  changed: boolean
}

type PlannedInsertPass =
  | {
    ok: true
    layouts: Map<string, PlannedDayLayout>
    alreadyPresentItemIds: Set<string>
  }
  | {
    ok: false
    reason: WriterApplyRefusal
    refusedItemIds: string[]
  }

/**
 * Build the final day arrays for a planned insert pass WITHOUT touching `trip`.
 *
 * The planner reports the FINAL `beforeStopId` of each planned stop. That id can
 * name ANOTHER stop planned by the same operation, which is not in the draft
 * yet. Inserting in input order used to find no anchor and silently append the
 * stop at the end of the day (probe: start, late, stay, early). Here a stop is
 * inserted only when its anchor already exists in the pass, so a planned anchor
 * is placed first. A stop whose anchor is absent from its own day is refused,
 * never appended: `beforeStopId: null` is the planner's only "end of day". The
 * whole pass is validated before the caller commits any layout, so a refusal
 * leaves the draft untouched.
 */
function planPlannedInsertPass(trip: Trip, planned: readonly WriterPlannedItem[]): PlannedInsertPass {
  if (planned.length === 0) {
    return { ok: true, layouts: new Map(), alreadyPresentItemIds: new Set() }
  }
  const dayById = new Map<string, ItineraryDay>()
  const stopDay = new Map<string, string>()
  const duplicateGlobalIds = new Set<string>()
  for (const day of trip.days) {
    dayById.set(day.id, day)
    for (const stop of day.stops) {
      const id = String(stop.id)
      if (stopDay.has(id)) duplicateGlobalIds.add(id)
      else stopDay.set(id, day.id)
    }
  }

  const plannedStopDays = new Map<string, Set<string>>()
  for (const item of planned) {
    const stopId = item.plan.stop.id
    if (typeof stopId !== 'string' || stopId.trim().length === 0) continue
    const ids = plannedStopDays.get(item.dayId) ?? new Set<string>()
    ids.add(stopId)
    plannedStopDays.set(item.dayId, ids)
  }

  const refused: string[] = []
  const seenStopIds = new Set<string>()
  let reason: WriterApplyRefusal | null = null
  for (const item of planned) {
    if (!dayById.has(item.dayId)) {
      refused.push(item.itemId)
      reason = reason ?? 'missing-day'
      continue
    }
    const stopId = item.plan.stop.id
    if (typeof stopId !== 'string' || stopId.trim().length === 0) {
      refused.push(item.itemId)
      reason = reason ?? 'invalid-stop-id'
      continue
    }
    if (seenStopIds.has(stopId) || duplicateGlobalIds.has(stopId)) {
      refused.push(item.itemId)
      reason = reason ?? 'duplicate-stop-id'
      continue
    }
    seenStopIds.add(stopId)
    const existingDay = stopDay.get(stopId)
    if (existingDay && existingDay !== item.dayId) {
      refused.push(item.itemId)
      reason = reason ?? 'duplicate-stop-id'
      continue
    }
    const anchor = item.plan.beforeStopId
    if (anchor != null) {
      const anchorOnTargetDay = stopDay.get(anchor) === item.dayId
      const anchorPlannedHere = plannedStopDays.get(item.dayId)?.has(anchor) === true
      if (anchor === stopId || (!anchorOnTargetDay && !anchorPlannedHere)) {
        refused.push(item.itemId)
        reason = reason ?? 'missing-anchor'
      }
    }
  }
  if (reason) return { ok: false, reason, refusedItemIds: refused }

  const layouts = new Map<string, PlannedDayLayout>()
  const alreadyPresentItemIds = new Set<string>()
  const pending: WriterPlannedItem[] = []
  for (const item of planned) {
    let layout = layouts.get(item.dayId)
    if (!layout) {
      const day = dayById.get(item.dayId)
      if (!day) return { ok: false, reason: 'missing-day', refusedItemIds: [item.itemId] }
      layout = { day, stops: [...day.stops], changed: false }
      layouts.set(item.dayId, layout)
    }
    // A retry of an uncertain contract reuses its stop id. The retained preview
    // may already hold that stop; re-inserting it would duplicate the visit.
    if (layout.stops.some(stop => stop.id === item.plan.stop.id)) {
      alreadyPresentItemIds.add(item.itemId)
      continue
    }
    pending.push(item)
  }

  let remaining = pending
  while (remaining.length > 0) {
    const ready: WriterPlannedItem[] = []
    for (const item of remaining) {
      const layout = layouts.get(item.dayId)
      if (!layout) continue
      const anchor = item.plan.beforeStopId
      if (anchor == null || layout.stops.some(stop => stop.id === anchor)) ready.push(item)
    }
    if (ready.length === 0) {
      // A cycle or an anchor that no planned item can provide. Refuse without
      // any insertion: all work so far lives in the copied arrays.
      return { ok: false, reason: 'missing-anchor', refusedItemIds: remaining.map(item => item.itemId) }
    }
    // Equal anchors take the planner's final index, so the pass preserves the
    // plan's order instead of its input order.
    ready.sort((left, right) => left.plan.insertAt - right.plan.insertAt)
    for (const item of ready) {
      const layout = layouts.get(item.dayId)
      if (!layout) continue
      const anchor = item.plan.beforeStopId
      const at = anchor == null
        ? layout.stops.length
        : layout.stops.findIndex(stop => stop.id === anchor)
      layout.stops.splice(at, 0, { ...item.plan.stop })
      layout.changed = true
    }
    const readyIds = new Set(ready.map(item => item.itemId))
    remaining = remaining.filter(item => !readyIds.has(item.itemId))
  }
  return { ok: true, layouts, alreadyPresentItemIds }
}

/** Check a planned insert pass against a trip without changing it. The hooks
 *  use this against the page's staged base before they stage anything; the
 *  mutator then revalidates against the ACTUAL draft. */
export function validatePlannedStops(
  trip: Trip,
  planned: readonly WriterPlannedItem[],
): { ok: true } | { ok: false; reason: WriterApplyRefusal; itemIds: string[] } {
  const pass = planPlannedInsertPass(trip, planned)
  return pass.ok ? { ok: true } : { ok: false, reason: pass.reason, itemIds: pass.refusedItemIds }
}

/** Insert the planned stops into the draft in dependency order. Every layout is
 *  validated before the first commit, so a refused pass leaves the draft
 *  unchanged. Unrelated stops and days are untouched; a touched day is
 *  renumbered because `orderInDay` is the day's display invariant. */
export function applyPlannedStops(draft: Trip, planned: readonly WriterPlannedItem[]): WriterApplyResult {
  const pass = planPlannedInsertPass(draft, planned)
  if (!pass.ok) {
    return { status: 'refused', reason: pass.reason, refusedItemIds: pass.refusedItemIds }
  }
  const insertedStopIds: string[] = []
  for (const layout of pass.layouts.values()) {
    if (!layout.changed) continue
    layout.day.stops = layout.stops.map((stop, index) => ({ ...stop, orderInDay: index + 1 }))
    for (const item of planned) {
      if (item.dayId !== layout.day.id) continue
      if (pass.alreadyPresentItemIds.has(item.itemId)) continue
      insertedStopIds.push(item.plan.stop.id)
    }
  }
  return {
    status: 'applied',
    appliedItemIds: planned.map(item => item.itemId),
    insertedStopIds,
    alreadyPresentItemIds: [...pass.alreadyPresentItemIds],
  }
}

/** Stop fields that are BOOKKEEPING, not user content. An unrelated insert
 *  renumbers a day; that alone must never block Undo. Every other field is
 *  compared, including fields added to `ItineraryStop` later, so a user's edit
 *  cannot be deleted by a guard that only remembered four columns. */
const NON_CONTENT_STOP_FIELDS = new Set<string>(['orderInDay'])

// Own enumerable fields as a Map. A missing own key reads as undefined.
// No prototype value stands in for a key that one side does not carry.
function ownFieldMap(value: object): Map<string, unknown> {
  const fields = new Map<string, unknown>()
  for (const [key, fieldValue] of Object.entries(value)) fields.set(key, fieldValue)
  return fields
}

function sameContentValue(actual: unknown, expected: unknown): boolean {
  if (actual === expected) return true
  if (typeof actual === 'number' && typeof expected === 'number') {
    return Number.isNaN(actual) && Number.isNaN(expected)
  }
  if (actual == null || expected == null) return actual == null && expected == null
  if (Array.isArray(actual) || Array.isArray(expected)) {
    if (!Array.isArray(actual) || !Array.isArray(expected) || actual.length !== expected.length) return false
    const expectedByIndex = new Map(expected.entries())
    return actual.every((value, index) => sameContentValue(value, expectedByIndex.get(index)))
  }
  if (typeof actual === 'object' && typeof expected === 'object') {
    const left = ownFieldMap(actual)
    const right = ownFieldMap(expected)
    const keys = new Set([...left.keys(), ...right.keys()])
    for (const key of keys) if (!sameContentValue(left.get(key), right.get(key))) return false
    return true
  }
  return false
}

/**
 * Conservative content equality for one stop. It walks the union of both key
 * sets, so a changed `visitMinutes`, `notes`, `category`, `status`, opening
 * times, costs, provider metadata or any future user field is a change. Only
 * `orderInDay` is ignored, because an unrelated insert renumbers the day.
 */
export function sameStopContent(actual: ItineraryStop, expected: ItineraryStop): boolean {
  if (actual.id !== expected.id) return false
  const left = ownFieldMap(actual)
  const right = ownFieldMap(expected)
  const keys = new Set([...left.keys(), ...right.keys()])
  for (const key of keys) {
    if (NON_CONTENT_STOP_FIELDS.has(key)) continue
    if (!sameContentValue(left.get(key), right.get(key))) return false
  }
  return true
}

/** Verify planned items against the trip that the acknowledgement produced.
 *  Only an item whose intended stop id EXISTS on the intended stable day with
 *  the intended content counts as placed. */
export function verifyPlacedStops(input: {
  planned: readonly WriterPlannedItem[]
  savedTrip: Trip | undefined
}): { placed: WriterPlacedItem[]; unresolved: WriterUnresolvedItem[] } {
  const placed: WriterPlacedItem[] = []
  const unresolved: WriterUnresolvedItem[] = []
  for (const item of input.planned) {
    const day = input.savedTrip?.days.find(candidate => candidate.id === item.dayId)
    const stop = day?.stops.find(candidate => candidate.id === item.plan.stop.id)
    if (!stop) {
      unresolved.push({
        itemId: item.itemId, slotKey: item.slotKey, dayId: item.dayId, dayIndex: item.dayIndex,
        reason: 'stop-not-in-saved-trip',
      })
      continue
    }
    if (!sameStopContent(stop, item.plan.stop)) {
      unresolved.push({
        itemId: item.itemId, slotKey: item.slotKey, dayId: item.dayId, dayIndex: item.dayIndex,
        reason: 'stop-content-changed',
      })
      continue
    }
    placed.push({
      itemId: item.itemId,
      slotKey: item.slotKey,
      dayId: item.dayId,
      dayIndex: item.dayIndex,
      stopId: stop.id,
      stop,
      hit: item.hit,
    })
  }
  return { placed, unresolved }
}

/** Normalize the kept callback into one truth. A missing or invalid receipt is
 *  never success: every planned item becomes unresolved and the operation stays
 *  recoverable. */
export function completeWriterOperation(input: {
  operationId: string
  context: WriterOperationContext
  receipt: unknown
  planned: readonly WriterPlannedItem[]
  skipped: readonly WriterSkippedItem[]
  savedTrip: Trip | undefined
}): WriterCompletion {
  const receipt = isWriterReceipt(input.receipt) ? input.receipt : null
  if (!receipt) {
    return {
      operationId: input.operationId,
      context: input.context,
      phase: 'uncertain',
      acknowledged: false,
      receipt: null,
      placed: [],
      skipped: [...input.skipped],
      unresolved: input.planned.map(item => ({
        itemId: item.itemId, slotKey: item.slotKey, dayId: item.dayId, dayIndex: item.dayIndex,
        reason: 'acknowledgement-missing' as const,
      })),
    }
  }
  const { placed, unresolved } = verifyPlacedStops({ planned: input.planned, savedTrip: input.savedTrip })
  return {
    operationId: input.operationId,
    context: input.context,
    phase: unresolved.length === 0 ? 'applied' : 'partial',
    acknowledged: true,
    receipt,
    placed,
    skipped: [...input.skipped],
    unresolved,
  }
}

// ---- Staging one operation ----

/** Stage one day's picks. Shared by the single fill, the batch and the
 *  shortlist; the arc entry calls it too. Returns a staged result with every
 *  reason retained, or a refusal that staged nothing. */
export async function stageWriterPicks(deps: WriterActionDeps, request: {
  context: WriterOperationContext
  intent: 'single' | 'batch' | 'shortlist' | 'arc'
  picks: readonly WriterPick[]
  /** Explicit operation id when a caller retries an uncertain write. */
  operationId?: string
  /** Overrides the per-pick day (shortlist). */
  allowRepeatVisit?: boolean
}): Promise<WriterStageResult> {
  const pickNotes = request.picks.map(pick => pick.notes)
  const entries = request.picks.map(pick => ({
    slotKey: pick.slotKey,
    hit: pick.hit,
    dayId: pick.dayId ?? request.context.dayId,
    dayIndex: pick.dayIndex ?? request.context.dayIndex,
    ...(pick.notes != null ? { notes: pick.notes } : {}),
  }))
  const requestKey = writerRequestKey({
    intent: request.intent,
    context: request.context,
    slotKeys: entries.map(entry => entry.slotKey),
    hits: entries.map(entry => entry.hit),
  })
  const strictRequested = deps.roadBinding !== undefined || deps.currentRoad !== undefined
  const strictBinding = deps.roadBinding ?? null
  if (strictRequested) {
    const liveStart = deps.currentRoad?.() ?? null
    const tripStart = deps.currentTrip()
    const disposition: 'road-changed' | 'trip-changed' | null =
      !strictBinding || !liveStart || !deps.currentRoad
        ? 'road-changed'
        : !tripStart || !bindingMatchesTrip(strictBinding, tripStart, roadChainSig(tripStart))
          ? 'trip-changed'
          : !sameWriterBinding(liveStart, strictBinding)
            ? 'road-changed'
            : null
    if (disposition) {
      if (request.operationId) {
        return {
          status: 'refused',
          reason: 'road-evidence-unavailable',
          operationId: request.operationId,
          unresolved: [],
          skipped: [],
          resume: { disposition, operationId: request.operationId },
        }
      }
      return { status: 'refused', reason: 'road-evidence-unavailable', unresolved: [], skipped: [] }
    }
  }
  // F2 caller boundary: a production caller that repeats the SAME logical
  // choice after closing the preview still supplies the uncertain operation's
  // identity here. The gate's exact comparison decides; a request-key match
  // alone re-enters `begin` as a normal request, never silently as a resume.
  const implicitRetry = request.operationId
    ? null
    : deps.gate.retryTicketFor({
      context: request.context,
      intent: request.intent,
      requestKey,
      entries,
    })
  const retryOperationId = request.operationId ?? implicitRetry?.operationId
  const decision = deps.gate.begin({
    context: request.context,
    intent: request.intent,
    requestKey,
    ...(retryOperationId ? { operationId: retryOperationId } : {}),
    entries,
    mintStopId: deps.mintStopId,
    allowRepeat: request.allowRepeatVisit ?? deps.allowRepeatVisit,
    ...(strictBinding ? { binding: strictBinding } : {}),
  })
  if (decision.status === 'busy') {
    const resumeDisposition: WriterResumeDisposition | null =
      decision.reason === 'payload-mismatch' ? 'payload-changed'
      : decision.reason === 'resume-unverifiable' ? 'resume-unverifiable'
      : decision.reason === 'operation-settled' ? 'operation-settled'
      : decision.reason === 'operation-unknown' ? 'operation-unknown'
      : null
    return {
      status: 'refused',
      reason: 'gate-busy',
      unresolved: [],
      skipped: [],
      ...(resumeDisposition
        ? { resume: { disposition: resumeDisposition, operationId: decision.operationId ?? '' } }
        : {}),
    }
  }
  const operation = decision.operation
  const operationId = operation.id
  const resumed = decision.status === 'resumed'
  // A retry of an uncertain operation is never discarded by a planning or
  // apply refusal: the original save may still be pending or landed, so its
  // identity and reservations stay until acknowledgement or an explicit Saved
  // edits decision. Only a NEW operation's pre-admission refusal releases.
  const releaseNewOperation = () => { if (!resumed) deps.gate.discard(operationId) }
  deps.onOperationStart?.(operationId)

  /** Strict road/trip drift after an await. A new operation releases; a resumed
   *  uncertain operation keeps its record and reservations untouched. */
  const staleBinding = (): 'road-changed' | 'trip-changed' | null => {
    if (!strictRequested) return null
    if (!strictBinding) return 'road-changed'
    const live = deps.currentRoad?.() ?? null
    const trip = deps.currentTrip()
    if (!live) return 'road-changed'
    if (!trip || !bindingMatchesTrip(strictBinding, trip, roadChainSig(trip))) return 'trip-changed'
    if (!sameWriterBinding(live, strictBinding)) return 'road-changed'
    return null
  }
  const refuseStale = (disposition: 'road-changed' | 'trip-changed') => {
    if (!resumed) releaseNewOperation()
    return {
      status: 'refused' as const,
      reason: 'road-evidence-unavailable' as const,
      unresolved: [],
      skipped: [],
      ...(resumed ? { operationId, resume: { disposition, operationId } } : {}),
    }
  }

  const resolved: Array<{ itemId: string; slotKey: string | null; hit: PlaceHit; stopId: string; dayId: string; dayIndex: number; notes?: string }> = []
  const unpinned: WriterSkippedItem[] = []
  const notesByIndex = new Map(pickNotes.entries())
  try {
    if (resumed) {
      // F2: a true retry reuses the EXACT payload captured on the first
      // operation. The resolver is never called again: a second resolve could
      // mint new coordinates or provider keys under the old operation id and
      // stop id. Items without a captured payload stay out with a reason.
      for (const item of operation.items) {
        if (!item.resolvedHit) {
          unpinned.push({
            itemId: item.itemId, slotKey: item.slotKey, dayId: item.dayId ?? request.context.dayId ?? '',
            dayIndex: item.dayIndex, reason: 'unresolved-coordinates',
          })
          continue
        }
        const dayId = item.dayId ?? request.context.dayId
        if (!dayId) {
          unpinned.push({
            itemId: item.itemId, slotKey: item.slotKey, dayId: '', dayIndex: item.dayIndex, reason: 'missing-day',
          })
          continue
        }
        resolved.push({
          itemId: item.itemId, slotKey: item.slotKey, hit: item.resolvedHit, stopId: item.stopId,
          dayId, dayIndex: item.dayIndex,
          // The note is content. A true retry reuses the note the FIRST
          // operation captured, never the new request's text.
          ...(item.notes !== null ? { notes: item.notes } : {}),
        })
      }
    } else {
      for (const [index, item] of operation.items.entries()) {
        const pinned = await deps.resolvePick(item.hit)
        const stale = staleBinding()
        if (stale) return refuseStale(stale)
        if (!pinned) {
          unpinned.push({
            itemId: item.itemId, slotKey: item.slotKey, dayId: item.dayId ?? request.context.dayId ?? '',
            dayIndex: item.dayIndex, reason: 'unresolved-coordinates',
          })
          continue
        }
        // The pinned hit is the place the write lands; the gate reserved the pick
        // identity, so a provider alias must not be re-resolved into a second entry.
        // F2: the first operation captures this exact payload for its retries.
        deps.gate.captureResolved(operationId, [{ itemId: item.itemId, hit: pinned }])
        const dayId = item.dayId ?? request.context.dayId
        if (!dayId) {
          unpinned.push({
            itemId: item.itemId, slotKey: item.slotKey, dayId: '', dayIndex: item.dayIndex, reason: 'missing-day',
          })
          continue
        }
        const note = notesByIndex.get(index)
        resolved.push({
          itemId: item.itemId, slotKey: item.slotKey, hit: pinned, stopId: item.stopId, dayId, dayIndex: item.dayIndex,
          ...(note ? { notes: note } : {}),
        })
      }
    }
  } catch (err) {
    // A resolver failure must not leave the place reserved forever. A resumed
    // operation never reaches a resolver, so this only releases a new one.
    releaseNewOperation()
    throw err
  }

  const planned: WriterPlannedItem[] = []
  const skipped: WriterSkippedItem[] = [...unpinned]
  let refusal: WriterRefusal | null = null
  const afterResolve = staleBinding()
  if (afterResolve) return refuseStale(afterResolve)
  if (strictBinding && deps.road && deps.road.routeKey !== strictBinding.routeKey) {
    if (!resumed) releaseNewOperation()
    return { status: 'refused', reason: 'road-evidence-unavailable', unresolved: [], skipped: [] }
  }
  const byDay = new Map<string, typeof resolved>()
  for (const item of resolved) {
    const list = byDay.get(item.dayId) ?? []
    list.push(item)
    byDay.set(item.dayId, list)
  }
  for (const [dayId, items] of byDay) {
    const dayIndex = items[0]?.dayIndex ?? request.context.dayIndex
    const plannedDay = planWriterDay({
      // Check the policy against the CURRENT committed trip. A retry after
      // an uncertain save sees an already-saved stop as in-plan instead of
      // proposing it a second time.
      trip: deps.currentTrip() ?? deps.trip,
      context: { ...request.context, dayId, dayIndex },
      dayId,
      dayIndex,
      operationId,
      entries: items,
      routeKmOf: deps.routeKmOf,
      road: deps.road,
      poiVisitMinutes: deps.poiVisitMinutes,
      allowRepeatVisit: request.allowRepeatVisit ?? deps.allowRepeatVisit,
    })
    planned.push(...plannedDay.planned)
    skipped.push(...plannedDay.skipped)
    if (plannedDay.refusal && plannedDay.refusal !== 'no-placements') refusal = plannedDay.refusal
  }

  if (refusal && planned.length === 0) {
    releaseNewOperation()
    return { status: 'refused', reason: refusal, operationId, unresolved: skipped, skipped }
  }
  if (planned.length === 0) {
    releaseNewOperation()
    return {
      status: 'refused',
      reason: skipped.length > 0 ? 'no-placements' : 'nothing-pinned',
      operationId,
      unresolved: skipped,
      skipped,
    }
  }

  const dayIndexes = new Set(planned.map(item => item.dayIndex))
  const stageDayIndex = dayIndexes.size === 1 ? [...dayIndexes][0] : -1

  // Preflight against the page's staged base. This keeps the common refusal
  // (a day or anchor that no longer exists) from staging a no-op proposal.
  const preflight = validatePlannedStops(deps.trip, planned)
  if (!preflight.ok) {
    releaseNewOperation()
    return {
      status: 'refused',
      reason: 'no-placements',
      operationId,
      unresolved: skipped,
      skipped,
      apply: { reason: preflight.reason, itemIds: preflight.itemIds },
    }
  }

  // The actual mutator draft is the authority: a chained preview may have
  // changed a day or an anchor since the plan was built. Capture the result
  // instead of trusting a void return, because the workspace's mutator wrapper
  // swallows a throw and keeps the untouched base.
  const applyState: { ran: boolean; result: WriterApplyResult | null } = { ran: false, result: null }
  deps.applyChange(
    draft => {
      applyState.result = applyPlannedStops(draft, planned)
      applyState.ran = true
    },
    'add',
    stageDayIndex,
    receipt => {
      // `onKept` runs ONLY for a validated acknowledgement. A non-acknowledged
      // outcome is delivered by the separate uncertainty notification below, so
      // no caller can imitate one with an empty invocation.
      const phase = deps.gate.operation(operationId)?.phase
      if (phase === 'discarded' || phase === 'abandoned') return
      if (!isWriterReceipt(receipt)) return
      const completion = completeWriterOperation({
        operationId,
        context: request.context,
        receipt,
        planned,
        skipped,
        savedTrip: deps.currentTrip(),
      })
      deps.gate.acknowledge(operationId, completion.placed.map(item => item.itemId))
      if (completion.phase === 'partial') deps.gate.uncertain(operationId)
      // F2: hand the caller the exact retry proof only after the gate recorded
      // the uncertainty. A settled, in-flight or unprovable operation yields
      // none, so a caller cannot auto-retry work whose outcome is known.
      const retry = deps.gate.retryTicket(operationId)
      deps.onCompletion(retry ? { ...completion, retry } : completion)
    },
    {
      id: operationId,
      // A new operation releases its reservations when its preview is
      // discarded before admission. A resumed uncertain one returns to
      // uncertain: the user closed a retry, not the original unresolved write,
      // so its identity and reservations stay retryable.
      ...(resumed
        ? { onDiscard: () => { deps.gate.uncertain(operationId) } }
        : { onDiscard: () => { deps.gate.discard(operationId) } }),
      // A Keep was admitted but no validated receipt arrived. When Saved edits
      // later proves THIS exact generation discarded or foreign, the writer
      // gate must release only this operation's own reservation and settle it
      // truthfully — not a pre-admission discard, not an acknowledged success.
      // Resumed (retried) operations get the same exact-operation settlement.
      onStoreDiscarded: () => {
        if (!deps.gate.settleProvenDiscarded(operationId)) return
        const completion = completeWriterOperation({
          operationId,
          context: request.context,
          receipt: undefined,
          planned,
          skipped,
          savedTrip: deps.currentTrip(),
        })
        deps.onCompletion({ ...completion, phase: 'abandoned', acknowledged: false })
      },
      // The admitted generation is still pending or unknown. This is the ONE
      // uncertainty notification: it keeps every reservation (so the same place
      // cannot enter twice), marks the operation uncertain and delivers the
      // captured retry ticket. A settled or abandoned operation is terminal, so
      // a late notification cannot reopen it; a late acknowledgement is handled
      // by the kept callback above and wins.
      onUncertain: () => {
        const phase = deps.gate.operation(operationId)?.phase
        if (phase === 'discarded' || phase === 'abandoned' || phase === 'applied') return
        deps.gate.uncertain(operationId)
        const completion = completeWriterOperation({
          operationId,
          context: request.context,
          receipt: undefined,
          planned,
          skipped,
          savedTrip: deps.currentTrip(),
        })
        const retry = deps.gate.retryTicket(operationId)
        deps.onCompletion(retry ? { ...completion, retry } : completion)
      },
    },
  )

  const applied = applyState.result
  if (!applyState.ran || !applied) {
    releaseNewOperation()
    return {
      status: 'refused',
      reason: 'no-placements',
      operationId,
      unresolved: skipped,
      skipped,
      apply: { reason: 'apply-unavailable', itemIds: planned.map(item => item.itemId) },
    }
  }
  if (applied.status === 'refused') {
    releaseNewOperation()
    return {
      status: 'refused',
      reason: 'no-placements',
      operationId,
      unresolved: skipped,
      skipped,
      apply: { reason: applied.reason, itemIds: applied.refusedItemIds },
    }
  }

  if (resumed) {
    // A retry preview is not an acknowledgement. Decided (skipped) items
    // release, but the operation stays uncertain so a closed or unconfirmed
    // retry is still recoverable and never becomes unreachable.
    deps.gate.retryStage(operationId, { skippedItemIds: skipped.map(item => item.itemId) })
  } else {
    deps.gate.stage(operationId, {
      plannedItemIds: planned.map(item => item.itemId),
      skippedItemIds: skipped.map(item => item.itemId),
    })
  }
  return {
    status: 'staged',
    operationId,
    context: request.context,
    planned,
    unresolved: skipped,
    skipped,
  }
}

// ---- Retrying one uncertain operation ----

/**
 * The ONE production retry admission. It replays the ticket's captured
 * operation id, context, intent and picks, so the gate proves the original
 * payload and reservations instead of trusting whatever the current UI shows.
 *
 * The gate decides every refusal: `payload-changed`, `resume-unverifiable`,
 * `operation-settled` or `operation-unknown`. A retry never mints a new
 * operation, a new stop id or a second resolver result, and it never clears an
 * uncertain reservation.
 */
export function retryWriterStage(
  deps: WriterActionDeps,
  ticket: WriterRetryTicket,
): Promise<WriterStageResult> {
  return stageWriterPicks(
    { ...deps, ...(ticket.binding ? { roadBinding: ticket.binding } : {}) },
    {
      context: ticket.context,
      intent: ticket.intent,
      picks: ticket.picks,
      operationId: ticket.operationId,
    },
  )
}

// ---- Guarded Undo ----

export interface AcknowledgedStop {
  itemId: string
  dayId: string
  /** The stop id the operation proposed and the acknowledgement accepted. */
  stopId: string
  /** The content saved under that id, as the completion recorded it. */
  expected: ItineraryStop
}

export interface GuardedUndoRequest {
  tripId: string
  operationId: string
  stops: readonly AcknowledgedStop[]
}

export type GuardedUndoOutcome =
  | { status: 'undone'; receipt: WriterReceipt; removedStopIds: string[] }
  | {
    status: 'refused'
    reason: 'missing-trip' | 'missing-day' | 'changed-target' | 'empty'
    changedStopIds: string[]
  }
  | { status: 'not-admitted'; reason: string }

export interface GuardedUndoDeps {
  currentTrip: () => Trip | undefined
  /** The store's real admission. A caller without it reports unavailable
   *  instead of pretending the inverse applied. */
  admit?: (input: { tripId: string; expectedBase: Trip; patch: Trip }) => Promise<WriterReceipt | { kind: string }>
}

/** Remove exactly the acknowledged stops from their stable days, against the
 *  CURRENT trip. Every other day and every unrelated stop is preserved. */
export function inverseWithoutStops(trip: Trip, stops: readonly AcknowledgedStop[]): Trip {
  const byDay = new Map<string, Set<string>>()
  for (const stop of stops) {
    const ids = byDay.get(stop.dayId) ?? new Set<string>()
    ids.add(stop.stopId)
    byDay.set(stop.dayId, ids)
  }
  return {
    ...trip,
    days: trip.days.map(day => {
      const ids = byDay.get(day.id)
      if (!ids) return day
      const kept = day.stops.filter(stop => !ids.has(stop.id))
      return { ...day, stops: kept.map((stop, index) => ({ ...stop, orderInDay: index + 1 })) }
    }),
  }
}

/** Check the acknowledged targets against the current trip. Any target whose
 *  day or content changed is refused; the caller never deletes it blindly. */
export function checkUndoTargets(trip: Trip, stops: readonly AcknowledgedStop[]): {
  changedStopIds: string[]
  reason: 'missing-day' | 'changed-target' | null
} {
  const changed: string[] = []
  let reason: 'missing-day' | 'changed-target' | null = null
  for (const target of stops) {
    const day = trip.days.find(candidate => candidate.id === target.dayId)
    if (!day) { changed.push(target.stopId); reason = reason ?? 'missing-day'; continue }
    const actual = day.stops.find(stop => stop.id === target.stopId)
    if (!actual || !sameStopContent(actual, target.expected)) {
      changed.push(target.stopId)
      reason = reason ?? 'changed-target'
    }
  }
  return { changedStopIds: changed, reason }
}

/** A guarded inverse. It validates the operation's acknowledged stop ids, their
 *  expected content and their stable day against the current trip, then awaits
 *  the real admission. Only a validated acknowledgement reports `undone`. */
export async function guardedUndo(
  deps: GuardedUndoDeps,
  request: GuardedUndoRequest,
): Promise<GuardedUndoOutcome> {
  if (request.stops.length === 0) return { status: 'refused', reason: 'empty', changedStopIds: [] }
  const current = deps.currentTrip()
  if (!current || current.id !== request.tripId) {
    return { status: 'refused', reason: 'missing-trip', changedStopIds: [] }
  }
  const check = checkUndoTargets(current, request.stops)
  if (check.reason) {
    return { status: 'refused', reason: check.reason, changedStopIds: check.changedStopIds }
  }
  if (!deps.admit) return { status: 'not-admitted', reason: 'admission-unavailable' }
  const expectedBase = structuredClone(current) as Trip
  const patch = inverseWithoutStops(expectedBase, request.stops)
  try {
    const result = await deps.admit({ tripId: request.tripId, expectedBase, patch })
    if (isWriterReceipt(result)) {
      return { status: 'undone', receipt: result, removedStopIds: request.stops.map(stop => stop.stopId) }
    }
    return { status: 'not-admitted', reason: typeof result.kind === 'string' ? result.kind : 'unavailable' }
  } catch (err) {
    console.error('[yatraflow] guarded undo admission threw', err)
    return { status: 'not-admitted', reason: 'unavailable' }
  }
}

/** The stop record an Undo later expects to find unchanged. */
export function acknowledgedStopsFrom(completion: WriterCompletion): AcknowledgedStop[] {
  return completion.placed.map(item => ({
    itemId: item.itemId,
    dayId: item.dayId,
    stopId: item.stopId,
    expected: structuredClone(item.stop) as ItineraryStop,
  }))
}

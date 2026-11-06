// ============ The shared journey projection (#08 L1) ============
// ONE pure, synchronous, read-only projection over facts the engine already
// derived: the #841 effective day plan and the ticket-03 drive rows.
//
// L1 scope: the shared model only. No consumer is wired here, no provider is
// called, no writer is reachable, and no ranking or cost formula lives here.
// Every fact is copied. A fact the inputs do not carry stays null.
//
// Identity rules (copied from the existing helpers, never re-invented):
//  - a slot row carries the #841 SlotRef, the slot key and the filled stop id;
//  - place identity is `placeKeysOf` and `isSameEntity`, so two providers that
//    both number a hit "1" stay two places;
//  - a slot row replaces the same drive entity in the engine's own position,
//    so replacing a fact never re-ranks the journey.
import type { DayPlan, EffectiveCandidate, EffectiveDaySlot } from './dayPlan'
import { voteSelection } from './dayPlan'
import type { DaySlot, SlotKey, SlotRef, SlotVote } from './daySlots'
import type { PlaceHit } from './providers/hits'
import {
  isAlreadyAdded,
  isSameEntity,
  placeKeysOf,
  type PlaceIdentity,
  type PlaceKey,
} from './placeIdentity'
import type { DriveSuggestionRow } from '../pages/trip/map/driveSuggestionView'
import type { ItineraryStop } from '../data/types'

/** The four approved lenses. L1 produces only `drive` rows. */
export type JourneyLens = 'drive' | 'stay' | 'gap' | 'fix'

/** Copied evidence state. `unknown` is the default, never an upgrade to live. */
export type JourneyFreshness = 'live' | 'retained' | 'stale' | 'unknown'

/** What the row permits. These are passed facts, not a new permission policy. */
export interface JourneyActions {
  preview: boolean
  add: boolean
  shortlist: boolean
  vote: boolean
  navigate: boolean
}

/** One journey row. Facts are copied from the effective plan or the drive row. */
export interface JourneyRow {
  /** Render key only. It is not place identity. */
  key: string
  tripId: string | null
  dayId: string | null
  dayIndex: number
  lens: JourneyLens
  purpose: string
  slotRef: SlotRef | null
  slotKey: SlotKey | null
  stopId: string | null
  hit: PlaceHit
  placeKeys: readonly PlaceKey[]
  origin: 'manual' | 'engine' | 'drive'
  detourMin: number | null
  /** Road detour km when the slot engine measured or estimated one; null else. */
  detourKm: number | null
  budgetSharePct: number | null
  visitMin: number | null
  bufferMin: number | null
  netAddedMin: number | null
  arriveMin: number | null
  /** The engine's arrival label, copied unchanged when it produced one. */
  arriveLabel: string | null
  windowMin: DaySlot['windowMin']
  inWindow: boolean | null
  reason: string | null
  source: PlaceHit['source'] | null
  freshness: JourneyFreshness
  /** Existing vote reference, carried unchanged; null when no poll binds. */
  vote: SlotVote | null
  actions: JourneyActions
}

/** The trip/day context and rows one projection owns. */
export interface JourneyProjection {
  tripId: string | null
  dayId: string | null
  dayIndex: number
  contextKey: string
  budgetMin: number
  rows: readonly JourneyRow[]
  byKey: ReadonlyMap<string, JourneyRow>
}

/** The facts the projection reads. It fetches nothing. */
export interface JourneyProjectionInput {
  /** The #841 effective day plan for ONE day. */
  dayPlan: DayPlan
  /** The ticket-03 drive rows for that day, already in engine order. */
  driveRows: readonly DriveSuggestionRow[]
  budgetMin: number
  editable: boolean
  presence: PlaceIdentity | null
  /** Opaque identity of the query/day context that produced these rows. */
  contextKey: string
  freshness?: Readonly<Record<string, JourneyFreshness>>
  allowed?: Readonly<Record<string, Partial<JourneyActions>>>
}

function hasUsablePosition(hit: PlaceHit): boolean {
  const { latitude, longitude } = hit
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return false
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false
  return !(latitude === 0 && longitude === 0)
}

/** The provider-aware identity string used for map keys and lookups. */
function placeKeyId(hit: PlaceHit): string {
  return `${hit.source ?? 'unknown'}:${String(hit.id)}`
}

function ownValue<T>(map: Readonly<Record<string, T>> | undefined, key: string): T | undefined {
  if (!map || !Object.prototype.hasOwnProperty.call(map, key)) return undefined
  return map[key]
}

/** Freshness precedence: the row key, then the provider key, then the raw id. */
function freshnessFor(
  map: Readonly<Record<string, JourneyFreshness>> | undefined,
  rowKey: string,
  hit: PlaceHit,
): JourneyFreshness {
  return ownValue(map, rowKey)
    ?? ownValue(map, placeKeyId(hit))
    ?? ownValue(map, String(hit.id))
    ?? 'unknown'
}

function allowedFor(
  map: Readonly<Record<string, Partial<JourneyActions>>> | undefined,
  rowKey: string,
  hit: PlaceHit,
): Partial<JourneyActions> | undefined {
  return ownValue(map, rowKey)
    ?? ownValue(map, placeKeyId(hit))
    ?? ownValue(map, String(hit.id))
}

/** The purpose a slot stands for, copied from the existing slot grammar. */
function purposeForSlot(slot: Pick<EffectiveDaySlot, 'segment' | 'kind'>): string {
  if (slot.segment) return slot.segment.purpose
  switch (slot.kind) {
    case 'fuel': return 'fuel'
    case 'stretch': return 'stretch'
    case 'overnight': return 'overnight'
    default: return 'meal'
  }
}

/** A planned stop as a hit-shaped place, using only the stop's own facts. */
function hitForStop(stop: ItineraryStop): PlaceHit {
  return {
    id: stop.id,
    name: stop.locationName || stop.title,
    latitude: stop.lat,
    longitude: stop.lng,
    kind: 'place',
    ...(stop.placeId ? { placeId: stop.placeId } : {}),
    ...(stop.eLoc ? { eLoc: stop.eLoc } : {}),
    ...(stop.placeSource ? { source: stop.placeSource } : {}),
    ...(stop.category ? { category: stop.category } : {}),
    ...(stop.description ? { description: stop.description } : {}),
  }
}

/** Base actions from the passed facts. `allowed` can only take an action away. */
function actionsFor(
  hit: PlaceHit,
  editable: boolean,
  presence: PlaceIdentity | null,
  slot: EffectiveDaySlot | null,
  alreadyAdded: boolean,
  allowed: Partial<JourneyActions> | undefined,
): JourneyActions {
  const onPlan = alreadyAdded || isAlreadyAdded(hit, presence)
  const base: JourneyActions = {
    preview: editable && !onPlan,
    add: editable && !onPlan,
    shortlist: editable && !onPlan,
    vote: editable && slot != null && voteSelection(slot).canRaise,
    navigate: hasUsablePosition(hit),
  }
  if (!allowed) return base
  return {
    preview: base.preview && allowed.preview !== false,
    add: base.add && allowed.add !== false,
    shortlist: base.shortlist && allowed.shortlist !== false,
    vote: base.vote && allowed.vote !== false,
    navigate: base.navigate && allowed.navigate !== false,
  }
}

function windowOf(slot: EffectiveDaySlot): DaySlot['windowMin'] {
  return slot.windowMin ? [slot.windowMin[0], slot.windowMin[1]] : null
}

function rowFromCandidate(
  plan: DayPlan,
  slot: EffectiveDaySlot,
  candidate: EffectiveCandidate,
  key: string,
  input: JourneyProjectionInput,
): JourneyRow {
  const hit = candidate.hit
  return {
    key,
    tripId: plan.tripId,
    dayId: plan.dayId,
    dayIndex: plan.dayIndex,
    lens: 'drive',
    purpose: purposeForSlot(slot),
    slotRef: slot.ref,
    slotKey: slot.key,
    stopId: null,
    hit,
    placeKeys: placeKeysOf(hit),
    origin: candidate.origin,
    detourMin: candidate.detourMin,
    detourKm: candidate.detourKm,
    budgetSharePct: candidate.budgetSharePct,
    visitMin: null,
    bufferMin: null,
    netAddedMin: null,
    arriveMin: candidate.arriveMin,
    arriveLabel: candidate.arriveLabel,
    windowMin: windowOf(slot),
    inWindow: candidate.inWindow,
    reason: candidate.reason,
    source: hit.source ?? null,
    freshness: freshnessFor(input.freshness, key, hit),
    vote: slot.vote ?? null,
    actions: actionsFor(hit, input.editable, input.presence, slot, false, allowedFor(input.allowed, key, hit)),
  }
}

function rowFromFilledSlot(
  plan: DayPlan,
  slot: EffectiveDaySlot,
  stop: ItineraryStop,
  hit: PlaceHit,
  key: string,
  input: JourneyProjectionInput,
): JourneyRow {
  return {
    key,
    tripId: plan.tripId,
    dayId: plan.dayId,
    dayIndex: plan.dayIndex,
    lens: 'drive',
    purpose: purposeForSlot(slot),
    slotRef: slot.ref,
    slotKey: slot.key,
    stopId: String(stop.id),
    hit,
    placeKeys: placeKeysOf(hit),
    origin: stop.auto ? 'engine' : 'manual',
    detourMin: null,
    detourKm: null,
    budgetSharePct: null,
    visitMin: typeof stop.visitMinutes === 'number' ? stop.visitMinutes : null,
    bufferMin: null,
    netAddedMin: null,
    arriveMin: null,
    arriveLabel: stop.arrivalTime ?? null,
    windowMin: windowOf(slot),
    inWindow: null,
    reason: slot.reason,
    source: hit.source ?? null,
    freshness: freshnessFor(input.freshness, key, hit),
    vote: slot.vote ?? null,
    actions: actionsFor(hit, input.editable, input.presence, slot, true, allowedFor(input.allowed, key, hit)),
  }
}

function rowFromDrive(
  plan: DayPlan,
  drive: DriveSuggestionRow,
  key: string,
  input: JourneyProjectionInput,
): JourneyRow {
  const hit = drive.hit
  const sameDay = drive.dayIndex == null || drive.dayIndex === plan.dayIndex
  return {
    key,
    tripId: plan.tripId,
    dayId: sameDay ? plan.dayId : null,
    dayIndex: drive.dayIndex ?? plan.dayIndex,
    lens: 'drive',
    purpose: drive.purpose,
    slotRef: null,
    slotKey: null,
    stopId: null,
    hit,
    placeKeys: placeKeysOf(hit),
    origin: 'drive',
    detourMin: drive.detourMin,
    detourKm: null,
    budgetSharePct: null,
    visitMin: null,
    bufferMin: null,
    netAddedMin: null,
    arriveMin: null,
    arriveLabel: drive.arriveLabel,
    windowMin: null,
    inWindow: drive.inWindow,
    reason: drive.reason,
    source: hit.source ?? null,
    freshness: freshnessFor(input.freshness, key, hit),
    vote: null,
    actions: actionsFor(hit, input.editable, input.presence, null, false, allowedFor(input.allowed, key, hit)),
  }
}

function slotRowKey(plan: DayPlan, slot: EffectiveDaySlot, hit: PlaceHit): string {
  return `slot:${plan.tripId ?? '-'}:${plan.dayId ?? '-'}:${slot.key}:${placeKeyId(hit)}`
}

function uniqueKey(base: string, used: Set<string>): string {
  let key = base
  let n = 2
  while (used.has(key)) {
    key = `${base}#${n}`
    n += 1
  }
  used.add(key)
  return key
}

/**
 * Build one day's shared projection. Pure: no fetch, store, router, React or
 * DOM, and no input is mutated. Slot facts replace the same drive entity where
 * it already sits, so the engine's order survives the replacement.
 */
export function projectJourney(input: JourneyProjectionInput): JourneyProjection {
  const plan = input.dayPlan
  const used = new Set<string>()
  const entries: { row: JourneyRow; slot: EffectiveDaySlot; stop: ItineraryStop | null }[] = []

  for (const slot of plan.slots) {
    if (slot.filledStop) {
      const hit = hitForStop(slot.filledStop)
      const key = uniqueKey(slotRowKey(plan, slot, hit), used)
      entries.push({
        row: rowFromFilledSlot(plan, slot, slot.filledStop, hit, key, input),
        slot,
        stop: slot.filledStop,
      })
      continue
    }
    if (slot.state !== 'empty') continue
    for (const candidate of slot.candidates) {
      const key = uniqueKey(slotRowKey(plan, slot, candidate.hit), used)
      entries.push({ row: rowFromCandidate(plan, slot, candidate, key, input), slot, stop: null })
    }
  }

  const rows: JourneyRow[] = []
  const taken = new Set<number>()
  for (const drive of input.driveRows) {
    const at = entries.findIndex((entry, i) => !taken.has(i) && isSameEntity(entry.row.hit, drive.hit))
    if (at >= 0) {
      taken.add(at)
      const entry = entries[at]
      // A filled slot keeps its stop facts and takes the engine's richer hit.
      rows.push(entry.stop
        ? rowFromFilledSlot(plan, entry.slot, entry.stop, drive.hit, entry.row.key, input)
        : entry.row)
      continue
    }
    const key = uniqueKey(
      `drive:${drive.dayIndex ?? plan.dayIndex}:${drive.segmentIndex}:${placeKeyId(drive.hit)}`,
      used,
    )
    rows.push(rowFromDrive(plan, drive, key, input))
  }
  for (let i = 0; i < entries.length; i += 1) {
    if (!taken.has(i)) rows.push(entries[i].row)
  }

  const byKey = new Map<string, JourneyRow>()
  for (const row of rows) byKey.set(row.key, row)

  return {
    tripId: plan.tripId,
    dayId: plan.dayId,
    dayIndex: plan.dayIndex,
    contextKey: input.contextKey,
    budgetMin: input.budgetMin,
    rows,
    byKey,
  }
}

/**
 * The rows for one lens as a new array. L1 produces `drive` rows only; the
 * other lenses return an empty list rather than invented facts.
 */
export function journeyRowsFor(projection: JourneyProjection, lens: JourneyLens): JourneyRow[] {
  return projection.rows.filter(row => row.lens === lens)
}

/** Exact, data-only context check. No cache or generation is implied. */
export function projectionIsCurrent(projection: JourneyProjection, contextKey: string): boolean {
  return projection.contextKey === contextKey
}

/**
 * Accept an incoming projection only when it belongs to the current context.
 * Otherwise the current one is retained unchanged (or null when none exists).
 */
export function acceptProjection(
  current: JourneyProjection | null,
  incoming: JourneyProjection,
  contextKey: string,
): JourneyProjection | null {
  if (!projectionIsCurrent(incoming, contextKey)) return current
  return incoming
}

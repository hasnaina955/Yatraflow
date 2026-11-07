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
//
// Day rules:
//  - the projection is ONE day. Only a drive row whose real day equals the
//    plan's day may replace a slot row or join `rows`.
//  - a drive row with no day, or with another day, keeps its data in the
//    explicit `unassigned` bucket. It never borrows the active day.
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
import { hmToMinutes, type DaySchedule } from './engine'
import { clockHM } from './clockOverlay'

/** The four approved lenses. L1 produces only `drive` rows. */
export type JourneyLens = 'drive' | 'stay' | 'gap' | 'fix'

/** Copied evidence state. `unknown` is the default, never an upgrade to live. */
export type JourneyFreshness = 'live' | 'retained' | 'stale' | 'unknown'

/** Where a row's arrival fact came from. `none` means no clock fact. */
export type JourneyArrivalSource = 'schedule' | 'stored' | 'candidate' | 'none'

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
  /** null = the input named no real day. Never inferred. */
  dayIndex: number | null
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
  /** The authoritative arrival label when one exists; stored label otherwise. */
  arriveLabel: string | null
  /** Discloses whether the arrival came from the schedule or a stored label. */
  arriveSource: JourneyArrivalSource
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
  /** Rows that belong to this day: slot rows and same-day drive rows. */
  rows: readonly JourneyRow[]
  /** Drive rows with no day or another day; data retained, never re-bound. */
  unassigned: readonly JourneyRow[]
  byKey: ReadonlyMap<string, JourneyRow>
}

/** The facts the projection reads. It fetches nothing. */
export interface JourneyProjectionInput {
  /** The #841 effective day plan for ONE day. */
  dayPlan: DayPlan
  /** The ticket-03 drive rows, in engine order. Maybe whole-trip. */
  driveRows: readonly DriveSuggestionRow[]
  budgetMin: number
  editable: boolean
  presence: PlaceIdentity | null
  /** Opaque identity of the query/day context that produced these rows. */
  contextKey: string
  freshness?: Readonly<Record<string, JourneyFreshness>>
  allowed?: Readonly<Record<string, Partial<JourneyActions>>>
  /**
   * Already-derived arrival minutes per stop id, from the caller's
   * `DayCardFacts.sim` (`activeStops`/`arrivalTimes`). Preferred when present;
   * it wins over `daySchedule` for the same stop. L1 only copies it.
   */
  arriveMinByStopId?: Readonly<Record<string, number>>
  /** Already-derived day schedule. L1 copies it; it never calls simulateDay. */
  daySchedule?: Pick<DaySchedule, 'activeStops' | 'arrivalTimes'> | null
}

function hasUsablePosition(hit: PlaceHit): boolean {
  const { latitude, longitude } = hit
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return false
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false
  return !(latitude === 0 && longitude === 0)
}

/** The provider-aware identity string used for map keys. */
function placeKeyId(hit: PlaceHit): string {
  return `${hit.source ?? 'unknown'}:${String(hit.id)}`
}

function ownValue<T>(map: Readonly<Record<string, T>> | undefined, key: string): T | undefined {
  if (!map || !Object.prototype.hasOwnProperty.call(map, key)) return undefined
  return map[key]
}

/**
 * Lookup keys in explicit precedence: the row key, each real provider key
 * (`provider:value`), `source:id`, the raw id, then the stop id as a last
 * fallback. A filled stop's synthetic id never outranks its provider key.
 */
function lookupKeys(
  rowKey: string,
  placeKeys: readonly PlaceKey[],
  hit: PlaceHit,
  stopId: string | null,
): string[] {
  const keys = [rowKey]
  for (const key of placeKeys) keys.push(`${key.provider ?? 'unknown'}:${key.value}`)
  keys.push(`${hit.source ?? 'unknown'}:${String(hit.id)}`)
  keys.push(String(hit.id))
  if (stopId) keys.push(stopId)
  return keys
}

/** Freshness by the explicit lookup precedence; an absent key is unknown. */
function freshnessFor(
  map: Readonly<Record<string, JourneyFreshness>> | undefined,
  rowKey: string,
  placeKeys: readonly PlaceKey[],
  hit: PlaceHit,
  stopId: string | null,
): JourneyFreshness {
  for (const key of lookupKeys(rowKey, placeKeys, hit, stopId)) {
    const value = ownValue(map, key)
    if (value !== undefined) return value
  }
  return 'unknown'
}

/** Allowed overrides by the same precedence. They can only remove. */
function allowedFor(
  map: Readonly<Record<string, Partial<JourneyActions>>> | undefined,
  rowKey: string,
  placeKeys: readonly PlaceKey[],
  hit: PlaceHit,
  stopId: string | null,
): Partial<JourneyActions> | undefined {
  for (const key of lookupKeys(rowKey, placeKeys, hit, stopId)) {
    const value = ownValue(map, key)
    if (value !== undefined) return value
  }
  return undefined
}

/** Union of provider keys, preserving order and dropping exact duplicates. */
function mergePlaceKeys(a: readonly PlaceKey[], b: readonly PlaceKey[]): PlaceKey[] {
  const out: PlaceKey[] = []
  const seen = new Set<string>()
  for (const key of [...a, ...b]) {
    const id = `${key.provider ?? 'unknown'}|${key.kind}|${key.value}`
    if (seen.has(id)) continue
    seen.add(id)
    out.push(key)
  }
  return out
}

/** The current schedule's arrival for a stop, or null when it has none. */
function arrivalFromSchedule(
  schedule: Pick<DaySchedule, 'activeStops' | 'arrivalTimes'> | null | undefined,
  stopId: string,
): { label: string; min: number } | null {
  if (!schedule) return null
  const at = schedule.activeStops.findIndex(stop => String(stop.id) === String(stopId))
  if (at < 0) return null
  const label = schedule.arrivalTimes[at]
  if (typeof label !== 'string' || !/^\d{1,2}:\d{2}/.test(label)) return null
  return { label, min: hmToMinutes(label) }
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
  const placeKeys = placeKeysOf(hit)
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
    placeKeys,
    origin: candidate.origin,
    detourMin: candidate.detourMin,
    detourKm: candidate.detourKm,
    budgetSharePct: candidate.budgetSharePct,
    visitMin: null,
    bufferMin: null,
    netAddedMin: null,
    arriveMin: candidate.arriveMin,
    arriveLabel: candidate.arriveLabel,
    arriveSource: 'candidate',
    windowMin: windowOf(slot),
    inWindow: candidate.inWindow,
    reason: candidate.reason,
    source: hit.source ?? null,
    freshness: freshnessFor(input.freshness, key, placeKeys, hit, null),
    vote: slot.vote ?? null,
    actions: actionsFor(hit, input.editable, input.presence, slot, false, allowedFor(input.allowed, key, placeKeys, hit, null)),
  }
}

/**
 * A filled slot. The stop owns the identity and visit fact. Absent cost and
 * reason facts are filled from the same-day drive row; a known zero survives.
 * Provider keys from both the stop and the drive hit are kept.
 */
function rowFromFilledSlot(
  plan: DayPlan,
  slot: EffectiveDaySlot,
  stop: ItineraryStop,
  hit: PlaceHit,
  key: string,
  input: JourneyProjectionInput,
  drive?: DriveSuggestionRow,
): JourneyRow {
  const stopHit = hitForStop(stop)
  const placeKeys = mergePlaceKeys(placeKeysOf(stopHit), placeKeysOf(hit))
  const stopId = String(stop.id)
  const scheduled = arrivalFromSchedule(input.daySchedule, stopId)
  // Precedence: the producer's already-derived minutes, then the schedule
  // slice, then the stored label. The row discloses which path ran.
  const mapped = input.arriveMinByStopId?.[stopId]
  const mappedMin = typeof mapped === 'number' && Number.isFinite(mapped) ? mapped : null
  const authoritativeMin = mappedMin ?? (scheduled ? scheduled.min : null)
  const authoritativeLabel = mappedMin != null ? clockHM(mappedMin) : scheduled ? scheduled.label : null
  const storedLabel = stop.arrivalTime ?? null
  const arriveLabel = authoritativeLabel ?? storedLabel
  const arriveSource: JourneyArrivalSource = authoritativeMin != null ? 'schedule' : storedLabel ? 'stored' : 'none'
  return {
    key,
    tripId: plan.tripId,
    dayId: plan.dayId,
    dayIndex: plan.dayIndex,
    lens: 'drive',
    purpose: purposeForSlot(slot),
    slotRef: slot.ref,
    slotKey: slot.key,
    stopId,
    hit,
    placeKeys,
    origin: stop.auto ? 'engine' : 'manual',
    detourMin: drive?.detourMin ?? null,
    detourKm: null,
    budgetSharePct: null,
    visitMin: typeof stop.visitMinutes === 'number' ? stop.visitMinutes : null,
    bufferMin: null,
    netAddedMin: null,
    arriveMin: authoritativeMin,
    arriveLabel,
    arriveSource,
    windowMin: windowOf(slot),
    inWindow: drive?.inWindow ?? null,
    reason: slot.reason ?? drive?.reason ?? null,
    source: hit.source ?? stop.placeSource ?? null,
    freshness: freshnessFor(input.freshness, key, placeKeys, hit, stopId),
    vote: slot.vote ?? null,
    actions: actionsFor(hit, input.editable, input.presence, slot, true, allowedFor(input.allowed, key, placeKeys, hit, stopId)),
  }
}

/**
 * A drive row. When `assigned`, its real day equals the plan's day. Otherwise
 * it keeps its own day (or null) and never borrows the active day.
 */
function rowFromDrive(
  plan: DayPlan,
  drive: DriveSuggestionRow,
  key: string,
  input: JourneyProjectionInput,
  assigned: boolean,
): JourneyRow {
  const hit = drive.hit
  const placeKeys = placeKeysOf(hit)
  const driveDay = typeof drive.dayIndex === 'number' ? drive.dayIndex : null
  return {
    key,
    tripId: plan.tripId,
    dayId: assigned ? plan.dayId : null,
    dayIndex: assigned ? plan.dayIndex : driveDay,
    lens: 'drive',
    purpose: drive.purpose,
    slotRef: null,
    slotKey: null,
    stopId: null,
    hit,
    placeKeys,
    origin: 'drive',
    detourMin: drive.detourMin,
    detourKm: null,
    budgetSharePct: null,
    visitMin: null,
    bufferMin: null,
    netAddedMin: null,
    arriveMin: null,
    arriveLabel: drive.arriveLabel,
    arriveSource: 'none',
    windowMin: null,
    inWindow: drive.inWindow,
    reason: drive.reason,
    source: hit.source ?? null,
    freshness: freshnessFor(input.freshness, key, placeKeys, hit, null),
    vote: null,
    actions: actionsFor(hit, input.editable, input.presence, null, false, allowedFor(input.allowed, key, placeKeys, hit, null)),
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
 * DOM, and no input is mutated. Only same-day drive rows replace slot facts in
 * place; null-day and foreign-day rows stay in `unassigned`.
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
  const unassigned: JourneyRow[] = []
  const taken = new Set<number>()
  for (const drive of input.driveRows) {
    const driveDay = typeof drive.dayIndex === 'number' ? drive.dayIndex : null
    if (driveDay !== plan.dayIndex) {
      const key = uniqueKey(
        `unassigned:${driveDay ?? 'null'}:${drive.segmentIndex}:${placeKeyId(drive.hit)}`,
        used,
      )
      unassigned.push(rowFromDrive(plan, drive, key, input, false))
      continue
    }
    const at = entries.findIndex((entry, i) => !taken.has(i) && isSameEntity(entry.row.hit, drive.hit))
    if (at >= 0) {
      taken.add(at)
      const entry = entries[at]
      rows.push(entry.stop
        ? rowFromFilledSlot(plan, entry.slot, entry.stop, drive.hit, entry.row.key, input, drive)
        : entry.row)
      continue
    }
    const key = uniqueKey(`drive:${driveDay}:${drive.segmentIndex}:${placeKeyId(drive.hit)}`, used)
    rows.push(rowFromDrive(plan, drive, key, input, true))
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
    unassigned,
    byKey,
  }
}

/**
 * The day rows for one lens as a new array. L1 produces `drive` rows only; the
 * other lenses return an empty list rather than invented facts.
 */
export function journeyRowsFor(projection: JourneyProjection, lens: JourneyLens): JourneyRow[] {
  return projection.rows.filter(row => row.lens === lens)
}

/** The explicit unassigned bucket for one lens, as a new array. */
export function journeyUnassignedRows(projection: JourneyProjection, lens: JourneyLens): JourneyRow[] {
  return projection.unassigned.filter(row => row.lens === lens)
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

// ============ Shared per-day journey model (#08 S3) ============
// ONE pure derivation above the tabs. The Map publishes its corridor snapshot;
// this module turns that snapshot plus the trip into every day's slots, effective
// plan, drive rows and shared projection. The Timeline and the Map read the same
// byDay entries. It is not active-day-only.
//
// Rules kept here:
//  - one `driveRowsFromSegments` assembly, then ONE grouping by actual day;
//  - unknown-day and out-of-range rows stay once in explicit top-level buckets;
//  - each day's projection receives only that day's rows;
//  - one `buildDayCards` call supplies the canonical schedule slice, reusing
//    unchanged day facts from the previous call;
//  - an unchanged day keeps its exact `JourneyDay` object;
//  - the net-added memo travels with the model, so a repeat build reuses it;
//  - day ids, refs and the context come from the committed trip, never a preview;
//  - `contextKey` is query/day provenance only, never a plan revision;
//  - no provider, store, router, React or writer import.
import type { Trip, ItineraryDay, ItineraryStop, TripDecision } from '../../../data/types'
import { buildDayCards, type DayCards } from '../../../lib/dayCards'
import type { DayPlan } from '../../../lib/dayPlan'
import type { DayReadiness, DaySlot } from '../../../lib/daySlots'
import { dayDetourBudgetMin } from '../../../lib/detourBudget'
import type { DaySchedule, LegEstimate } from '../../../lib/engine'
import type { DiscoveryCoverage, PlaceHit } from '../../../lib/providers/hits'
import { isAlreadyAdded, type PlaceIdentity } from '../../../lib/placeIdentity'
import type { DnaVector } from '../../../lib/tripDna'
import {
  projectJourney,
  type JourneyProjection,
  type JourneyRow,
} from '../../../lib/journeyProjection'
import type { CorridorSnapshot } from '../map/corridorSnapshot'
import { driveRowsFromSegments, type DriveSuggestionRow } from '../map/driveSuggestionView'
import { buildDayPlanForDay, type ManualPicksForDay } from '../map/manualPicks'
import { intendedVisitMinutes } from '../../../lib/hoursContext'
import { planSlotPlacements, type SlotPlacementItem } from '../../../lib/slotPlacement'
import { STOP_CATEGORIES } from '../../../data/types'
import type { JourneyFreshness, NetAddedInput } from '../../../lib/journeyProjection'
import { createNetAddedProducer, rememberBounded, type NetAddedProducer } from '../../../lib/netAddedMin'
import {
  deriveDaySlotFacts,
  type DaySlotFacts,
  type DnaSlotHints,
} from '../map/useDaySlots'

export type JourneyStatus =
  | { kind: 'unscanned' }
  | { kind: 'scanning' }
  | { kind: 'ready'; source: 'scan' | 'cache' | 'retained' }
  | { kind: 'failed' }
  | { kind: 'quota' }

/**
 * The exact status mapping. Rows never decide this; the scan state does. A
 * quota before the first successful scan has no retained rows, so the panel says
 * the search is paused and no places were returned. It never claims the route was
 * empty or failed.
 */
export function snapshotStatusOf(snapshot: CorridorSnapshot | null, tripId: string): JourneyStatus {
  if (!snapshot || snapshot.tripId !== tripId) return { kind: 'unscanned' }
  if (snapshot.status === 'scanning') return { kind: 'scanning' }
  if (snapshot.status === 'failed') return { kind: 'failed' }
  if (snapshot.status === 'quota') return { kind: 'quota' }
  return { kind: 'ready', source: snapshot.source }
}

/**
 * The evidence state of the rows a snapshot published. Only a finished fresh
 * scan is live. Older rows are retained. A running scan, or a failure with no
 * kept rows, is unknown. The snapshot holds no age, so none is invented.
 */
export function corridorFreshnessOf(snapshot: CorridorSnapshot | null): JourneyFreshness {
  if (!snapshot) return 'unknown'
  if (snapshot.source === 'retained') return 'retained'
  if (snapshot.status !== 'ready') return 'unknown'
  return snapshot.source === 'scan' ? 'live' : 'retained'
}

/** The age and reach of the scan behind one day's corridor rows. */
export interface JourneyDayEvidence {
  readonly dayIndex: number
  /** When the scan finished (ms). Null = unknown. */
  readonly fetchedAt: number | null
  /** How far the scan reached. Null = not measured. */
  readonly coverage: DiscoveryCoverage | null
}

/**
 * Scan evidence for one day. A day scan gives evidence to its own day only.
 * A trip-wide scan gives it to every day. No age is invented: a snapshot
 * with no age or coverage gives null.
 */
export function dayEvidenceOf(snapshot: CorridorSnapshot, dayIndex: number): JourneyDayEvidence | null {
  const scanDay = snapshot.discoveryDayIndex ?? null
  if (scanDay != null && scanDay !== dayIndex) return null
  const fetchedAt = snapshot.fetchedAt ?? null
  const coverage = snapshot.coverage ?? null
  if (fetchedAt == null && coverage == null) return null
  return { dayIndex, fetchedAt, coverage }
}

export interface JourneyDay {
  readonly dayIndex: number
  /** Content identity. Same revision means the exact object may be reused. */
  readonly revision: string
  /** Persisted day id from the COMMITTED trip. Null when legacy or proposed. */
  readonly dayId: string | null
  /** The effective day's stops (display content; the slot grammar ignores rejected). */
  readonly dayStops: ItineraryStop[]
  readonly slots: DaySlot[]
  readonly dayPlan: DayPlan
  /** Same-day drive rows only, in the engine's order. */
  readonly driveRows: readonly DriveSuggestionRow[]
  readonly budgetMin: number
  /** Query/day provenance only. A plan change must not move it. */
  readonly contextKey: string
  readonly projection: JourneyProjection
  /** Age and reach of the scan behind this day's corridor rows. Null = none known. */
  readonly evidence: JourneyDayEvidence | null
  /** The canonical schedule slice passed to L1. Never rebuilt here. */
  readonly daySchedule: Pick<DaySchedule, 'activeStops' | 'arrivalTimes'> | null
}

export interface JourneyDays {
  readonly status: JourneyStatus
  readonly byDay: ReadonlyMap<number, JourneyDay>
  /** Rows whose input day is not an integer. Grouped once. */
  readonly unknownDayRows: readonly DriveSuggestionRow[]
  /** Rows whose integer day is not a current trip day. Grouped once. */
  readonly outOfRangeRows: readonly DriveSuggestionRow[]
  /** The one whole-trip assembly. Presentation adapters may read it. */
  readonly allDriveRows: readonly DriveSuggestionRow[]
  readonly presence: PlaceIdentity
  readonly cards: DayCards
  readonly daySlotDeps: DaySlotFacts['daySlotDeps'] | null
  readonly readinessByDay: ReadonlyMap<number, DayReadiness>
  readonly readinessRows: readonly DayReadiness[]
  readonly slotPinsByDay: DaySlotFacts['slotPinsByDay']
  /** The net-added memo this build used. The next build may reuse it. */
  readonly netAddedMemo?: NetAddedMemo | null
}

/** One build's net-added memo. A reuse needs the same fingerprint. */
export interface NetAddedMemo {
  /** The whole trip, the measured route and the corrections. Every number reads them. */
  readonly fingerprint: string
  /** One producer per day index. Each producer memoises its candidates. */
  readonly producers: Map<number, NetAddedProducer>
  /** The planner's stop and position per day, row and hit. Null when unplaceable.
   *  At most NET_ADDED_MEMO_MAX entries; the oldest leaves first. */
  readonly planned: Map<string, { stop: ItineraryStop; insertAt: number } | null>
}

export interface WorkspaceJourneyDays extends JourneyDays {
  readonly dnaSlotHints: DnaSlotHints
}

export interface JourneyDaysInput {
  /** Effective content (preview included). */
  readonly trip: Trip | null
  /** The committed trip. Day ids, refs and context never come from a preview. */
  readonly committedTrip?: Trip | null
  readonly snapshot: CorridorSnapshot | null
  readonly presence: PlaceIdentity | null
  readonly editable: boolean
  readonly decisions?: readonly TripDecision[]
  readonly dnaVector: DnaVector | null
  readonly legCorrections?: Record<string, LegEstimate>
  /** Captured read-adapter output, one entry per day. No store read here. */
  readonly manualPicksByDay: ReadonlyMap<number, ManualPicksForDay>
  /**
   * The measured road the writer and the preview already use, or null when no
   * measurement backs this trip. Absent or null keeps every `netAddedMin` null.
   */
  readonly netAddedRoad?: JourneyNetAddedRoad | null
  /** Previous model. Unchanged days reuse their exact JourneyDay object. */
  readonly prev?: JourneyDays | null
}

/** Measured road facts one day's net added minutes are computed against. */
export interface JourneyNetAddedRoad {
  /** The measured chain's stable identity. */
  routeKey: string
  /** Along-route km for a point, or null off the measured line. */
  routeKmOf: (lat: number, lng: number) => number | null
}

const EMPTY_IDENTITY: PlaceIdentity = {
  names: new Set<string>(),
  keys: [],
  places: [],
  added: new Set<string>(),
  dismissed: new Set<string>(),
  staged: new Map(),
}

const EMPTY_MANUAL: ManualPicksForDay = { stable: {}, legacy: {} }
const EMPTY_DNA: DnaVector = {
  accepts: 0,
  declines: 0,
  categoryAffinity: {},
  avgDetourMin: null,
  avgVisitMin: null,
}

/** The stop category a hit would be saved as, from the stop grammar's own list. */
const HIT_CATEGORIES = new Set<string>([...STOP_CATEGORIES, 'cafe'])

function stopCategoryOfHit(hit: PlaceHit): ItineraryStop['category'] {
  return typeof hit.category === 'string' && HIT_CATEGORIES.has(hit.category)
    ? (hit.category as ItineraryStop['category'])
    : 'sightseeing'
}

/** The planner's place shape for one hit; provider keys come from the hit. */
function placeForNetAddedHit(hit: PlaceHit): SlotPlacementItem['place'] {
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

/**
 * One day's net-added seam (#08 AC2). The stop and its position come from the
 * SAME reviewed planner the writer calls, with the day's real measured road, so
 * the rail card and the impact preview cannot disagree about one place. A
 * candidate the planner cannot place keeps no stop and no position, so its
 * number stays null instead of inventing a duration or a slot.
 *
 * `insertAt` is proven only when this candidate alone is planned against the
 * day, so the reported index is that row's own position and not a batch's.
 */
function netAddedSeamFor(input: {
  trip: Trip
  dayId: string
  dayIndex: number
  road: JourneyNetAddedRoad
  legCorrections?: NetAddedInput['legCorrections']
  memo: NetAddedMemo
}): NetAddedInput {
  const day = input.trip.days.find(entry => entry.index === input.dayIndex)
  const existingRoadPositions = day
    ? day.stops
      .map(stop => {
        const km = input.road.routeKmOf(stop.lat, stop.lng)
        return km == null || !Number.isFinite(km) || km < 0
          ? null
          : { stopId: stop.id, km, routeKey: input.road.routeKey, dayId: input.dayId }
      })
      .filter((entry): entry is { stopId: string; km: number; routeKey: string; dayId: string } => entry !== null)
    : []
  const planned = input.memo.planned

  const planFor = (row: { key: string; hit: PlaceHit }): { stop: ItineraryStop; insertAt: number } | null => {
    // The memo key takes the day and the whole hit, so a reused entry is the same plan.
    const memoKey = `${input.dayIndex}|${input.dayId}|${row.key}|${JSON.stringify(row.hit)}`
    if (planned.has(memoKey)) return planned.get(memoKey) ?? null
    const km = input.road.routeKmOf(row.hit.latitude, row.hit.longitude)
    const item: SlotPlacementItem = {
      itemId: row.key,
      place: placeForNetAddedHit(row.hit),
      hit: row.hit,
      road: km != null && Number.isFinite(km) && km >= 0
        ? { km, routeKey: input.road.routeKey, dayId: input.dayId }
        : null,
    }
    const result = planSlotPlacements({
      trip: input.trip,
      items: [item],
      policy: {
        tripId: input.trip.id,
        dayId: input.dayId,
        operationId: `net-added:${row.key}`,
        acceptedRouteKeys: [input.road.routeKey],
        buildStop: () => ({
          id: `net-added:${row.key}`,
          category: stopCategoryOfHit(row.hit),
          title: row.hit.name,
          locationName: row.hit.description ?? row.hit.name,
          visitMinutes: intendedVisitMinutes(row.hit),
          priority: 'nice-to-have',
          notes: 'Net added minutes',
          description: row.hit.description ?? '',
          openTime: row.hit.openTime ?? '',
          closeTime: row.hit.closeTime ?? '',
          status: 'suggested',
        }),
      },
      existingRoadPositions,
    })
    const outcome = result.outcomes[0]
    const value = outcome && outcome.phase === 'planned'
      ? { stop: outcome.stop, insertAt: outcome.insertAt }
      : null
    rememberBounded(planned, memoKey, value)
    return value
  }

  let producer = input.memo.producers.get(input.dayIndex)
  if (!producer) {
    producer = createNetAddedProducer({
      trip: input.trip,
      dayIndex: input.dayIndex,
      ...(input.legCorrections ? { legCorrections: input.legCorrections } : {}),
    })
    input.memo.producers.set(input.dayIndex, producer)
  }

  return {
    trip: input.trip,
    ...(input.legCorrections ? { legCorrections: input.legCorrections } : {}),
    stopFor: row => planFor(row)?.stop ?? null,
    insertAtFor: row => planFor(row)?.insertAt ?? null,
    producer,
  }
}

/**
 * The net-added memo a build may reuse. Every net-added number reads the whole
 * trip, the measured route and the corrections, so a change to any of them makes
 * a new memo. The same fingerprint means the same numbers.
 */
function netAddedMemoFor(
  prev: NetAddedMemo | null | undefined,
  facts: { trip: Trip; routeKey: string; legCorrections: NetAddedInput['legCorrections'] },
): NetAddedMemo {
  const fingerprint = JSON.stringify([facts.trip, facts.routeKey, facts.legCorrections ?? null])
  if (prev && prev.fingerprint === fingerprint) return prev
  return { fingerprint, producers: new Map(), planned: new Map() }
}

/** The net-added values one day shows. A new number is a new revision. */
function netAddedRevision(projection: JourneyProjection): string {
  return JSON.stringify(projection.rows.map(row => [row.key, row.netAddedMin]))
}

function emptyCards(): DayCards {
  return { tripId: '', legCorrections: undefined, byDay: new Map() }
}

function emptyJourneyDays(presence: PlaceIdentity, status: JourneyStatus, cards: DayCards): JourneyDays {
  return {
    status,
    byDay: new Map(),
    unknownDayRows: [],
    outOfRangeRows: [],
    allDriveRows: [],
    presence,
    cards,
    daySlotDeps: null,
    readinessByDay: new Map(),
    readinessRows: [],
    slotPinsByDay: new Map(),
  }
}

function sameDayRowsByDay(
  trip: Trip,
  allDriveRows: readonly DriveSuggestionRow[],
): Pick<JourneyDays, 'unknownDayRows' | 'outOfRangeRows'> & { byDay: Map<number, DriveSuggestionRow[]> } {
  const byDay = new Map<number, DriveSuggestionRow[]>()
  const unknownDayRows: DriveSuggestionRow[] = []
  const outOfRangeRows: DriveSuggestionRow[] = []
  const dayIndexes = new Set(trip.days.map(day => day.index))
  for (const row of allDriveRows) {
    const dayIndex = row.dayIndex
    // L5 defence: a null/NaN/Infinity day cannot mint "Day NaN".
    if (dayIndex == null || !Number.isInteger(dayIndex)) {
      unknownDayRows.push(row)
      continue
    }
    if (!dayIndexes.has(dayIndex)) {
      outOfRangeRows.push(row)
      continue
    }
    const list = byDay.get(dayIndex)
    if (list) list.push(row)
    else byDay.set(dayIndex, [row])
  }
  return { byDay, unknownDayRows, outOfRangeRows }
}

function budgetForDay(trip: Trip, day: ItineraryDay): number {
  return dayDetourBudgetMin({
    travelStyle: trip.travelStyle,
    plannedStops: day.stops.filter(stop => stop.status !== 'rejected').length,
  })
}

function slotsRevision(slots: readonly DaySlot[]): string {
  return JSON.stringify(slots.map(slot => [
    slot.key,
    slot.kind,
    slot.state,
    slot.filledStop?.id ?? null,
    slot.windowMin,
    slot.windowLabel,
    slot.auto,
    slot.candidates.map(candidate => [
      String(candidate.hit.id),
      candidate.hit.name,
      candidate.detourMin,
      candidate.arriveLabel,
      candidate.budgetSharePct,
    ]),
  ]))
}

function dayPlanRevision(plan: DayPlan): string {
  return JSON.stringify(plan.slots.map(slot => [
    slot.key,
    slot.state,
    slot.count,
    slot.filledStopId,
    slot.ref?.dayId ?? null,
    slot.candidates.map(candidate => [
      candidate.origin,
      String(candidate.hit.id),
      candidate.hit.name,
      candidate.detourMin,
      candidate.arriveMin,
      candidate.budgetSharePct,
    ]),
  ]))
}

function driveRowsRevision(rows: readonly DriveSuggestionRow[]): string {
  return JSON.stringify(rows.map(row => [
    row.id,
    String(row.hit.id),
    row.hit.name,
    row.dayIndex,
    row.detourMin,
    row.arriveMin,
    row.arriveLabel,
    row.budgetSharePct,
    row.inWindow,
    row.reason,
    row.state,
    row.chips.map(chip => chip.key),
  ]))
}

/** The projection fields that can move without the plan or the drive row. */
function actionsRevision(projection: JourneyProjection): string {
  return JSON.stringify(projection.rows.map(row => [row.key, row.actions]))
}

function journeyDayRevision(input: {
  contextKey: string
  dayId: string | null
  dayIndex: number
  budgetMin: number
  editable: boolean
  cardsKey: string | null
  slots: string
  plan: string
  drive: string
  actions: string
  netAddedRoute: string | null
  netAdded: string
  /** The scan's evidence state: a live to retained change must rebuild the day. */
  freshness: JourneyFreshness
  /** Age and reach of the scan: a new scan time must rebuild the day. */
  evidence: JourneyDayEvidence | null
}): string {
  return JSON.stringify(input)
}

/**
 * Build every day's shared model. Pure: no fetch, store, React or writer. When
 * the snapshot is absent or from another trip, the result is an explicit
 * `unscanned` model; cards are still built so the Timeline can render its days.
 */
export function buildJourneyDays(input: JourneyDaysInput): JourneyDays {
  const presence = input.presence ?? EMPTY_IDENTITY
  const trip = input.trip
  if (!trip) return emptyJourneyDays(presence, { kind: 'unscanned' }, emptyCards())

  const committed = input.committedTrip ?? trip
  const cards = buildDayCards(trip, trip.days, input.legCorrections, input.prev?.cards ?? null)
  const status = snapshotStatusOf(input.snapshot, trip.id)
  if (status.kind === 'unscanned' || !input.snapshot) {
    return emptyJourneyDays(presence, status, cards)
  }

  const snapshot = input.snapshot
  // A day scan was made for one day: its km are not trip km, so the trip's
  // attribution must not move its rows to another day.
  const scanDay = snapshot.discoveryDayIndex ?? null
  const dayAttribution = scanDay == null
    ? snapshot.dayAttribution
    : { dayForKm: () => scanDay, dayOfSegment: () => scanDay, daySpanKm: snapshot.dayAttribution.daySpanKm }
  const dnaVector = input.dnaVector ?? EMPTY_DNA
  const slotFacts = deriveDaySlotFacts({
    scheduleOf: dayIndex => cards.byDay.get(dayIndex)?.sim,
    tripId: committed.id,
    days: trip.days,
    pois: snapshot.pois,
    anchors: snapshot.anchors,
    routePolyline: snapshot.routePolyline,
    transportMode: trip.transportMode,
    travelStyle: trip.travelStyle,
    existingNames: presence.names,
    identity: presence,
    altPool: snapshot.altPool,
    dayAttribution,
    decisions: input.decisions,
    members: trip.members,
    startLocationCoords: trip.startLocationCoords,
    startDate: trip.startDate,
    dnaVector,
    addedIds: presence.added,
    dismissedIds: presence.dismissed,
  })

  const driveFacts = {
    detourMinFor: snapshot.detourMinFor,
    days: trip.days,
    dayForKm: dayAttribution.dayForKm,
    travelStyle: trip.travelStyle,
    added: (hit: PlaceHit) => isAlreadyAdded(hit, presence),
    dismissed: (hit: PlaceHit) => presence.dismissed.has(String(hit.id)),
    heldBack: snapshot.heldBackIds,
  }
  const corridorFreshness = corridorFreshnessOf(snapshot)
  const allDriveRows = driveRowsFromSegments([...snapshot.pois], driveFacts)
  const grouped = sameDayRowsByDay(trip, allDriveRows)

  const netAddedRoad = input.netAddedRoad ?? null
  const netAddedMemo = netAddedRoad
    ? netAddedMemoFor(input.prev?.netAddedMemo, {
      trip,
      routeKey: netAddedRoad.routeKey,
      legCorrections: input.legCorrections,
    })
    : null
  const byDay = new Map<number, JourneyDay>()
  for (const day of trip.days) {
    const sameDayRows = grouped.byDay.get(day.index) ?? []
    const slots = slotFacts.slotsByDay.get(day.index) ?? []
    const committedDay = committed.days.find(item => item.index === day.index)
    // P4: a proposed new day has no committed id, so its refs stay null.
    const dayId = committedDay?.id ? String(committedDay.id) : null
    const budgetMin = budgetForDay(trip, day)
    const dayPlan = buildDayPlanForDay({
      tripId: committed.id,
      dayIndex: day.index,
      dayId,
      slots,
      manual: input.manualPicksByDay.get(day.index) ?? EMPTY_MANUAL,
      identity: presence,
    })
    const contextKey = `${committed.id}:${snapshot.inputsHash}:${snapshot.scopeKm}:${dayId ?? '-'}:${day.index}`
    const sim = cards.byDay.get(day.index)?.sim ?? null
    const evidence = dayEvidenceOf(snapshot, day.index)
    const projection = projectJourney({
      dayPlan,
      driveRows: sameDayRows,
      budgetMin,
      editable: input.editable,
      presence,
      contextKey,
      corridorFreshness,
      corridorEvidence: evidence ? { fetchedAt: evidence.fetchedAt, coverage: evidence.coverage } : null,
      ...(sim ? { daySchedule: sim } : {}),
      ...(netAddedRoad && netAddedMemo && dayId
        ? {
          netAdded: netAddedSeamFor({
            trip,
            dayId,
            dayIndex: day.index,
            road: netAddedRoad,
            legCorrections: input.legCorrections,
            memo: netAddedMemo,
          }),
        }
        : {}),
    })
    const revision = journeyDayRevision({
      contextKey,
      dayId,
      dayIndex: day.index,
      budgetMin,
      editable: input.editable,
      cardsKey: cards.byDay.get(day.index)?.key ?? null,
      slots: slotsRevision(slots),
      plan: dayPlanRevision(dayPlan),
      drive: driveRowsRevision(sameDayRows),
      actions: actionsRevision(projection),
      netAddedRoute: netAddedRoad?.routeKey ?? null,
      netAdded: netAddedRevision(projection),
      freshness: corridorFreshness,
      evidence,
    })
    const previous = input.prev?.byDay.get(day.index)
    byDay.set(day.index, previous && previous.revision === revision
      ? previous
      : {
        dayIndex: day.index,
        revision,
        dayId,
        dayStops: day.stops,
        slots,
        dayPlan,
        driveRows: sameDayRows,
        budgetMin,
        contextKey,
        projection,
        evidence,
        daySchedule: sim,
      })
  }

  return {
    status,
    byDay,
    unknownDayRows: grouped.unknownDayRows,
    outOfRangeRows: grouped.outOfRangeRows,
    allDriveRows,
    presence,
    cards,
    daySlotDeps: slotFacts.daySlotDeps,
    readinessByDay: slotFacts.readinessByDay,
    readinessRows: slotFacts.readinessRows,
    slotPinsByDay: slotFacts.slotPinsByDay,
    netAddedMemo,
  }
}

/** The projection rows the Timeline may show: suggestions, not planned stops. */
export function journeySuggestionRows(day: JourneyDay): readonly JourneyRow[] {
  return day.projection.rows.filter(row => row.stopId == null)
}

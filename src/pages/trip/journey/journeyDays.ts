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
//  - day ids, refs and the context come from the committed trip, never a preview;
//  - `contextKey` is query/day provenance only, never a plan revision;
//  - no provider, store, router, React or writer import.
import type { Trip, ItineraryDay, ItineraryStop, TripDecision } from '../../../data/types'
import { buildDayCards, type DayCards } from '../../../lib/dayCards'
import type { DayPlan } from '../../../lib/dayPlan'
import type { DayReadiness, DaySlot } from '../../../lib/daySlots'
import { dayDetourBudgetMin } from '../../../lib/detourBudget'
import type { DaySchedule, LegEstimate } from '../../../lib/engine'
import type { PlaceHit } from '../../../lib/providers/hits'
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
  /** Previous model. Unchanged days reuse their exact JourneyDay object. */
  readonly prev?: JourneyDays | null
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
  const dnaVector = input.dnaVector ?? EMPTY_DNA
  const slotFacts = deriveDaySlotFacts({
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
    dayAttribution: snapshot.dayAttribution,
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
    dayForKm: snapshot.dayAttribution.dayForKm,
    travelStyle: trip.travelStyle,
    added: (hit: PlaceHit) => isAlreadyAdded(hit, presence),
    dismissed: (hit: PlaceHit) => presence.dismissed.has(String(hit.id)),
    heldBack: snapshot.heldBackIds,
  }
  const allDriveRows = driveRowsFromSegments([...snapshot.pois], driveFacts)
  const grouped = sameDayRowsByDay(trip, allDriveRows)

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
    const projection = projectJourney({
      dayPlan,
      driveRows: sameDayRows,
      budgetMin,
      editable: input.editable,
      presence,
      contextKey,
      ...(sim ? { daySchedule: sim } : {}),
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
  }
}

/** The projection rows the Timeline may show: suggestions, not planned stops. */
export function journeySuggestionRows(day: JourneyDay): readonly JourneyRow[] {
  return day.projection.rows.filter(row => row.stopId == null)
}

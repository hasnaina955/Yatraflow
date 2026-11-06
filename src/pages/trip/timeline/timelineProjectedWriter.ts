// ============ Timeline covered-row writer (#08 S4 repair) ============
// The covered Add reuses the production #841 writer service, not the km-halt
// path. It carries the row's exact slot key, stable day id and provider hit into
// `stageWriterPicks`; `planSlotPlacements` then keeps the provider identity and
// the measured road anchor. No second writer, queue, resolver or route estimate
// lives here.
import type { Trip } from '../../../data/types'
import type { JourneyRow } from '../../../lib/journeyProjection'
import { hasCoords, type PlaceHit } from '../../../lib/providers/hits'
import {
  retryWriterStage,
  stageWriterPicks,
  type WriterActionDeps,
  type WriterCompletion,
  type WriterRetryTicket,
  type WriterRoadFacts,
  type WriterStageResult,
} from '../map/mapWriterActions'
import {
  mapWriterOperationGate,
  type WriterOperationGate,
} from '../map/writerOperationGate'
import { newStopId, poiVisitMinutes } from '../map/pageHelpers'

/** The exact road facts the writer may use. `routeKey` must be measured. */
export interface TimelineProjectedWriterRoad {
  routeKmOf: (lat: number, lng: number) => number | null
  road: WriterRoadFacts | null
}

/**
 * The prop the Workspace supplies. It is the smallest contract the Timeline
 * cannot derive: measured road facts, the current committed trip, and the real
 * acknowledged-save presentation owner. Uncertain retry stays in the hook.
 */
export interface TimelineProjectedWriterHop {
  road: TimelineProjectedWriterRoad
  /** The CURRENT committed trip, read before staging and at acknowledgement. No
   *  fallback to the displayed/effective trip is allowed. */
  currentTrip: () => Trip | undefined
  /** Acknowledged, verified saves only. Never called for an uncertain write. */
  onAcknowledged: (completion: WriterCompletion) => void
  /** Optional honest copy for an unconfirmed write. No success claim. */
  onUncertain?: (completion: WriterCompletion) => void
  poiVisitMinutes?: (category?: string) => number
  gate?: WriterOperationGate
  allowRepeatVisit?: boolean
}

export interface TimelineProjectedWriterConfig extends TimelineProjectedWriterHop {
  /** Display trip only; the writer always reads `currentTrip` for its base. */
  trip: Trip
  applyChange: WriterActionDeps['applyChange']
  resolvePick: WriterActionDeps['resolvePick']
}

export type TimelineProjectedRefusal =
  | 'invalid-row'
  | 'current-trip-unavailable'
  | 'foreign-trip'
  | 'mismatched-day'

/** The exact writer pick for one covered row, or null when it cannot be bound. */
export interface TimelineProjectedPick {
  hit: PlaceHit
  slotKey: string | null
  dayId: string
  dayIndex: number
  notes: string
}

/**
 * Bind a covered row to the exact writer payload. Canonical `hasCoords` rejects
 * the documented mixed-axis (0, 76) sentinel. A foreign trip, wrong day, or a
 * slot ref disagreeing with the row is refused rather than guessed.
 */
export function projectedPickFor(
  row: JourneyRow,
  dayIndex: number,
  expectedTripId?: string,
): TimelineProjectedPick | null {
  if (!hasCoords(row.hit)) return null
  if (row.dayIndex != null && row.dayIndex !== dayIndex) return null
  if (row.tripId != null && expectedTripId != null && row.tripId !== expectedTripId) return null
  const dayId = row.slotRef?.dayId ?? row.dayId
  if (!dayId) return null
  if (row.slotRef) {
    if (row.slotRef.tripId !== (row.tripId ?? expectedTripId)) return null
    if (row.dayId != null && row.slotRef.dayId !== row.dayId) return null
    if (row.slotKey != null && row.slotRef.key !== row.slotKey) return null
  }
  return {
    hit: row.hit,
    slotKey: row.slotKey,
    dayId,
    dayIndex,
    notes: 'Added from the shared journey projection',
  }
}

/** The exact same dependency object a retry must reuse. */
export function projectedWriterDeps(
  config: TimelineProjectedWriterConfig,
  onCompletion: (completion: WriterCompletion) => void,
): WriterActionDeps {
  return {
    trip: config.trip,
    applyChange: config.applyChange,
    resolvePick: config.resolvePick,
    mintStopId: newStopId,
    gate: config.gate ?? mapWriterOperationGate,
    routeKmOf: config.road.routeKmOf,
    road: config.road.road,
    currentTrip: config.currentTrip,
    onCompletion,
    poiVisitMinutes: config.poiVisitMinutes ?? poiVisitMinutes,
    ...(config.allowRepeatVisit ? { allowRepeatVisit: true } : {}),
  }
}

/**
 * Stage one covered row through the real #841 service. A current-trip or row
 * identity mismatch refuses before anything is staged. The shared operation gate
 * makes a same-tick second activation busy.
 */
export async function stageProjectedRow(
  config: TimelineProjectedWriterConfig,
  row: JourneyRow,
  dayIndex: number,
  onCompletion: (completion: WriterCompletion) => void,
): Promise<WriterStageResult | { status: 'refused'; reason: TimelineProjectedRefusal }> {
  const current = config.currentTrip()
  if (!current) return { status: 'refused', reason: 'current-trip-unavailable' }
  if (row.tripId != null && row.tripId !== current.id) return { status: 'refused', reason: 'foreign-trip' }
  const pick = projectedPickFor(row, dayIndex, current.id)
  if (!pick) {
    return { status: 'refused', reason: hasCoords(row.hit) ? 'mismatched-day' : 'invalid-row' }
  }
  const deps = projectedWriterDeps({ ...config, trip: current }, onCompletion)
  return stageWriterPicks(deps, {
    context: { tripId: current.id, dayId: pick.dayId, dayIndex: pick.dayIndex },
    intent: 'single',
    picks: [{
      slotKey: pick.slotKey,
      hit: pick.hit,
      dayId: pick.dayId,
      dayIndex: pick.dayIndex,
      notes: pick.notes,
    }],
  })
}

/** A retry reuses the exact ticket and dependency object, never a new payload. */
export async function retryProjectedRow(
  config: TimelineProjectedWriterConfig,
  ticket: WriterRetryTicket,
  onCompletion: (completion: WriterCompletion) => void,
): Promise<WriterStageResult> {
  return retryWriterStage(projectedWriterDeps(config, onCompletion), ticket)
}

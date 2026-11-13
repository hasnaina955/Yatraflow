// ============ Real Timeline/workspace/store harness (#08 R8) ============
// This helper builds the production objects the Timeline hook wires together:
// the exported workspace actions (the real applyChange/keepPending), the real
// measured-road binding, a live current-trip reader and the production
// controller. It contains no transport, queue, gate or writer fake. The test
// file controls only the provider resolver, the Supabase transport, the queue
// backend and the toast, exactly like the existing #841 workspace harnesses.
import type { Trip } from '../../src/data/types'
import type { JourneyRow } from '../../src/lib/journeyProjection'
import type { PlaceHit } from '../../src/lib/providers/hits'
import { placeKeysOf } from '../../src/lib/placeIdentity'
import { roadChainSig } from '../../src/lib/tripRoad'
import { workspacePreviewActions, type PendingChange } from '../../src/pages/TripWorkspace'
import type {
  WriterApplyChange,
  WriterCompletion,
} from '../../src/pages/trip/map/mapWriterActions'
import type { WriterOperationGate } from '../../src/pages/trip/map/writerOperationGate'
import type { WriterRoadBinding } from '../../src/pages/trip/map/writerRoadBinding'
import { captureWriterRoadBinding } from '../../src/pages/trip/map/writerRoadBinding'
import type { TimelineProjectedWriterConfig } from '../../src/pages/trip/timeline/timelineProjectedWriter'
import {
  createTimelineWriterController,
  type TimelineWriterController,
} from '../../src/pages/trip/timeline/timelineWriterController'
import { tripById } from '../../src/store/store'

/** Two macrotasks let the store's debounced write and its settlement run. */
export async function settleTicks(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0))
  await new Promise(resolve => setTimeout(resolve, 0))
}

/** A deterministic measured km for every finite coordinate. The real planner
 *  orders the fixture stops and the pick from this alone. */
export const ROUTE_KM = (lat: number, lng: number): number =>
  Math.round(((lat - 8) * 1000 + (lng - 75) * 100) * 1000) / 1000

/** Canonical measured-road bytes for one fixture trip, with an optional
 *  geometry variant so a test can change the live generation without changing
 *  the trip or its route key. */
export function bindingFor(
  trip: Trip,
  variant: { distanceKm?: number; latShift?: number } = {},
): WriterRoadBinding {
  const first = trip.days[0]?.stops[0]
  const second = trip.days[0]?.stops[1] ?? first
  if (!first || !second) throw new Error('the fixture trip needs two stops')
  const shift = variant.latShift ?? 0
  const chainPoints = [
    { lat: first.lat, lng: first.lng },
    { lat: second.lat + shift, lng: second.lng },
  ]
  const captured = captureWriterRoadBinding({
    tripId: trip.id,
    routeKey: roadChainSig(trip),
    chainPoints,
    legs: [{
      distanceKm: variant.distanceKm ?? 12,
      durationMinutes: 20,
      source: 'osrm',
      geometry: chainPoints,
    }],
  })
  if (!captured) throw new Error('the fixture road binding is invalid')
  return captured
}

/** One covered JourneyRow for the real fixture trip and a provider hit. */
export function rowFor(trip: Trip, hit: PlaceHit, dayIndex = 0): JourneyRow {
  const day = trip.days.find(candidate => candidate.index === dayIndex) ?? trip.days[0]
  if (!day) throw new Error('the fixture trip has no day')
  return {
    key: `row-${String(hit.id)}`,
    tripId: trip.id,
    dayId: day.id,
    dayIndex: day.index,
    lens: 'drive',
    purpose: 'meal',
    slotRef: { tripId: trip.id, dayId: day.id, key: 'lunch' },
    slotKey: 'lunch',
    stopId: null,
    hit,
    placeKeys: placeKeysOf(hit),
    origin: 'engine',
    detourMin: 4,
    detourKm: 2,
    budgetSharePct: 10,
    visitMin: null,
    bufferMin: null,
    netAddedMin: null,
    arriveMin: null,
    arriveLabel: null,
    arriveSource: 'candidate',
    windowMin: [720, 900],
    inWindow: true,
    reason: null,
    source: hit.source ?? null,
    freshness: 'unknown',
    vote: null,
    actions: { preview: true, add: true, shortlist: true, vote: false, navigate: true },
  }
}

export interface WorkspaceHarness {
  pendingRef: { current: PendingChange | null }
  baseRef: { current: Trip | null }
  published: Array<PendingChange | null>
  actions: () => ReturnType<typeof workspacePreviewActions>
  /** The exact production `applyChange` contract the writer calls. */
  applyChange: WriterApplyChange
}

/** Build the exported workspace actions over the same mutable refs the real
 *  component owns. The trip is read at call time, as the component does. */
export function createWorkspace(tripId: string): WorkspaceHarness {
  const pendingRef: { current: PendingChange | null } = { current: null }
  const baseRef: { current: Trip | null } = { current: null }
  const published: Array<PendingChange | null> = []
  const setPending = (next: PendingChange | null) => { published.push(next) }
  const actions = () => workspacePreviewActions({
    trip: tripById(tripId),
    pendingRef,
    baseRef,
    legCorrRef: { current: undefined },
    setPending,
  })
  const applyChange: WriterApplyChange = (mutator, kind, dayIndex, onKept, operation) => {
    actions().applyChange(mutator, kind, dayIndex, onKept, operation)
  }
  return { pendingRef, baseRef, published, actions, applyChange }
}

/** The exact production hop the Timeline receives. The binding is captured at
 *  stage time; `currentRoad` is the live accessor the Workspace supplies. */
export function timelineConfig(input: {
  tripId: string
  applyChange: WriterApplyChange
  resolvePick: (hit: PlaceHit) => Promise<PlaceHit | null>
  onAcknowledged: (completion: WriterCompletion) => void
  onUncertain?: (completion: WriterCompletion) => void
  gate: WriterOperationGate
  binding: WriterRoadBinding | null
  currentRoad?: () => WriterRoadBinding | null
}): TimelineProjectedWriterConfig {
  const trip = tripById(input.tripId)
  if (!trip) throw new Error('the fixture trip is not in the store')
  return {
    trip,
    applyChange: input.applyChange,
    resolvePick: input.resolvePick,
    road: {
      routeKmOf: ROUTE_KM,
      road: input.binding ? { routeKey: input.binding.routeKey } : null,
      ...(input.binding ? { binding: input.binding } : {}),
      ...(input.currentRoad ? { currentRoad: input.currentRoad } : {}),
    },
    currentTrip: () => tripById(input.tripId),
    onAcknowledged: input.onAcknowledged,
    ...(input.onUncertain ? { onUncertain: input.onUncertain } : {}),
    gate: input.gate,
  }
}

/** The same production controller the hook creates, with the live owner set as
 *  the hook effect sets it. */
export function controllerFor(tripId: string, identityGeneration = 1): TimelineWriterController {
  const controller = createTimelineWriterController()
  controller.setCurrentIdentity({ tripId, identityGeneration })
  return controller
}

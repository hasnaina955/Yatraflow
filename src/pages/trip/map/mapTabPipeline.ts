// ============ MapTab to the shared #841 pipeline: pure adapters ============
//
// MapTab owns React state and markup. The decisions it used to make inline
// live here, React-free, so a node test drives the same functions the page
// calls:
//  - `measuredRoadFacts`: the workspace's road measurement graded for the
//    writers. A line on the map is NOT evidence. Only a finished measurement
//    whose chain still matches the trip counts, and the grade carries the
//    chain signature the planner binds its km to.
//  - `stableDayIdFor`: day index to persisted day id by the day's own index,
//    never by array position.
//  - `slotRowsOf` / `slotVoteReady`: the rows and the vote button read the
//    effective plan, so a rendered pair is exactly what the vote and the
//    batch select from.
//  - `runSlotSearchFlow`: the slot search with a captured trip/day/slot
//    context. A late answer from another context is dropped, never filed.
//
// Nothing here starts a routing call or a provider call of its own. The search
// transport is injected.
import type { Trip } from '../../../data/types'
import { isAirMode } from '../../../lib/engine'
import {
  buildRoadChain,
  resolvedLegs,
  roadChainSig,
  type TripRoadView,
} from '../../../lib/tripRoad'
import type { DaySlot, SlotKey } from '../../../lib/daySlots'
import type { PlaceHit } from '../../../lib/providers/hits'
import {
  voteSelection,
  effectiveDaySlotOf,
  type DayPlan,
  type EffectiveCandidate,
} from '../../../lib/dayPlan'
import { candidatesAnnouncement } from '../../../lib/railA11y'
import {
  searchContextForSlot,
  type SlotSearchGuard,
} from './manualSlotContexts'

// ---- Measured road grade ----

export type RoadUnmeasuredReason =
  | 'air-journey'
  | 'pending'
  | 'failed'
  | 'no-measurement'
  | 'estimate-only'
  | 'stale-chain'
  | 'no-line'

export type MapRoadGrade =
  | { measured: true; routeKey: string }
  | { measured: false; routeKey: null; reason: RoadUnmeasuredReason }

const COORD_EPSILON = 0.000005

function samePoint(a: { lat: number; lng: number }, b: { lat: number; lng: number }): boolean {
  return Math.abs(a.lat - b.lat) < COORD_EPSILON && Math.abs(a.lng - b.lng) < COORD_EPSILON
}

/**
 * Grade the workspace's road measurement for a write. It reads the finished
 * measurement only; it never starts one.
 *
 * Measured needs ALL of: a driving trip, a finished `ok` measurement, at least
 * one real (non-estimate) leg, a chain that still matches the trip's stops and
 * endpoints, and a drawn line the planner can project onto. A pending, failed,
 * estimate-only or stale chain returns a reason and the writers refuse.
 */
export function measuredRoadFacts(input: {
  trip: Trip
  road: Pick<TripRoadView, 'status' | 'chain' | 'legs'> | null | undefined
  hasLine: boolean
}): MapRoadGrade {
  const { trip, road } = input
  if (isAirMode(trip.transportMode)) return { measured: false, routeKey: null, reason: 'air-journey' }
  if (!road) return { measured: false, routeKey: null, reason: 'no-measurement' }
  if (road.status === 'pending') return { measured: false, routeKey: null, reason: 'pending' }
  if (road.status === 'failed') return { measured: false, routeKey: null, reason: 'failed' }
  if (!road.chain || !road.legs || road.legs.length === 0) {
    return { measured: false, routeKey: null, reason: 'no-measurement' }
  }
  if (!resolvedLegs(road.legs)) return { measured: false, routeKey: null, reason: 'estimate-only' }
  const current = buildRoadChain(trip)
  const measured = road.chain
  const sameChain = current.points.length === measured.points.length
    && current.points.every((point, index) => samePoint(point, measured.points[index]))
    && (!measured.ptStopId || measured.ptStopId.every((id, index) => id === current.ptStopId[index]))
  if (!sameChain) return { measured: false, routeKey: null, reason: 'stale-chain' }
  if (!input.hasLine) return { measured: false, routeKey: null, reason: 'no-line' }
  const routeKey = roadChainSig(trip)
  return routeKey ? { measured: true, routeKey } : { measured: false, routeKey: null, reason: 'no-measurement' }
}

// ---- Stable day id ----

/** The persisted id of the day whose own `index` is `dayIndex`, or undefined.
 *  Day indexes can be non-contiguous after a deletion, so the array position
 *  is never used. */
export function stableDayIdFor(trip: Pick<Trip, 'days'>, dayIndex: number | null | undefined): string | undefined {
  if (dayIndex == null) return undefined
  const id = trip.days.find(day => day.index === dayIndex)?.id
  return typeof id === 'string' && id.length > 0 ? id : undefined
}

// ---- Rows and vote parity ----

/** The ONLY candidate rows for a slot: the effective plan's. */
export function slotRowsOf(plan: DayPlan, key: SlotKey): readonly EffectiveCandidate[] {
  return effectiveDaySlotOf(plan, key)?.candidates ?? []
}

/** True when the writer would raise a vote for this slot. The button is shown
 *  from the same selection the action reads, so the two cannot disagree. */
export function slotVoteReady(plan: DayPlan, key: SlotKey): boolean {
  const slot = effectiveDaySlotOf(plan, key)
  return slot ? voteSelection(slot).canRaise : false
}

/** The live-region line for the open part. It counts the same effective rows
 *  the cards render, and says nothing when no part is open. */
export function openSlotAnnouncement(plan: DayPlan, openKey: string | null): string {
  if (!openKey) return ''
  const slot = effectiveDaySlotOf(plan, openKey as SlotKey)
  return slot ? candidatesAnnouncement(slot.label, slot.candidates.length) : ''
}

// ---- Slot search scope ----

/** The scope a slot search state belongs to. A query typed on one day is not
 *  rendered on another, even when both days have a lunch slot. */
export function slotSearchScopeKey(tripId: string, dayId: string | undefined): string {
  return `${tripId}\u0000${dayId ?? ''}`
}

export const SLOT_SEARCH_QUOTA_COPY =
  'Google Places monthly cap reached - text search stays paused until the counter rolls over.'
export const SLOT_SEARCH_FAILED_COPY = 'Search failed - try again.'

export interface SlotSearchPatch {
  busy: boolean
  hits?: PlaceHit[]
  err?: string | null
}

export type SlotSearchFlowOutcome = 'no-context' | 'stale' | 'found' | 'empty' | 'failed'

/**
 * One slot search with a captured context. The trip, the stable day, the slot
 * and a sequence number are fixed when the query starts. Every outcome (rows,
 * error, the busy reset) commits only while that exact context is still the
 * current one, so a late answer cannot fill, fail or unlock another day's slot.
 * An aborted request is stale, never an error.
 */
export async function runSlotSearchFlow(input: {
  guard: SlotSearchGuard
  slot: Pick<DaySlot, 'key' | 'ref'>
  query: string
  controller: AbortController
  search: (query: string, signal: AbortSignal) => Promise<PlaceHit[]>
  rank: (hits: PlaceHit[]) => PlaceHit[]
  isQuotaError: (err: unknown) => boolean
  commit: (patch: SlotSearchPatch) => void
  onEmpty?: (query: string) => void
}): Promise<SlotSearchFlowOutcome> {
  const context = searchContextForSlot(input.slot)
  if (!context) return 'no-context'
  const sequence = input.guard.begin(context)
  const current = () => !input.controller.signal.aborted && input.guard.isCurrent(context, sequence)
  try {
    const hits = await input.search(input.query, input.controller.signal)
    if (!current()) return 'stale'
    input.commit({ busy: false, hits: input.rank(hits) })
    if (hits.length === 0) {
      input.onEmpty?.(input.query)
      return 'empty'
    }
    return 'found'
  } catch (err) {
    if (!current()) return 'stale'
    input.commit({
      busy: false,
      err: input.isQuotaError(err) ? SLOT_SEARCH_QUOTA_COPY : SLOT_SEARCH_FAILED_COPY,
    })
    return 'failed'
  }
}

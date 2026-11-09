// Pure pieces under the Map tab edit wiring (#905, #906, #907).
// The edit session itself is the reducer in ./editing/editSession. These helpers
// build the stop a pick would become, find its road position, write it, and time
// the 8-second Undo window. None of them calls a writer.
import type { ItineraryDay, ItineraryStop, Trip } from '../../../data/types'
import { scheduleRowsById, simulateDay, originOf, type DaySchedule } from '../../../lib/engine'
import type { PlaceHit } from '../../../lib/geocode'
import { intendedVisitMinutes } from '../../../lib/hoursContext'
import { activeStopsInOrder } from '../../../lib/stopOrder'
import { formatHM, type TimeFormat } from '../../../lib/timefmt'
import type { EditOutcome } from './editing/outcomes'
import { stopCategoryOf } from './mapWriterActions'

/** How long the Undo button stays, as on the board. */
export const UNDO_WINDOW_MS = 8000

/** Text shown when a stop has no planned arrival in the day schedule. */
export const TIME_NOT_PLANNED_YET = 'Time not planned yet'

const CLOCK = /^\d{1,2}:\d{2}$/

/** Format one stop's planned arrival from a simulated day. */
export function plannedArrivalFromSchedule(sim: DaySchedule, stopId: string, fmt: TimeFormat): string {
  const arrive = scheduleRowsById(sim).get(stopId)?.arrive
  if (!arrive || !CLOCK.test(arrive)) return TIME_NOT_PLANNED_YET
  return formatHM(arrive, fmt)
}

/** Look up one stop's planned arrival in the day schedule. */
export function plannedArrivalLabel(trip: Trip, dayIndex: number, stopId: string, fmt: TimeFormat): string {
  const day = trip.days.find(d => d.index === dayIndex)
  if (!day) return TIME_NOT_PLANNED_YET
  return plannedArrivalFromSchedule(simulateDay(day, trip, originOf(trip, dayIndex), dayIndex), stopId, fmt)
}

/** One entry in the swap list. The label reads "N · name". */
export interface SwapOption {
  id: string
  label: string
}

/** Other non-rejected stops of a day, in day order, numbered from one. */
export function swapOptionsFor(day: ItineraryDay, stopId: string): SwapOption[] {
  // Number each stop by its place in the day before the selected stop leaves the list.
  return activeStopsInOrder(day)
    .map((s, index) => ({ id: s.id, label: `${index + 1} · ${s.title}` }))
    .filter(option => option.id !== stopId)
}

/** Whole seconds left in the Undo window, rounded up. Never below zero. */
export function undoSecondsLeft(startedAt: number, now: number): number {
  return Math.max(0, Math.ceil((UNDO_WINDOW_MS - (now - startedAt)) / 1000))
}

/**
 * The stop a pick would become. It copies what the hit says and nothing more.
 * A fee the hit does not carry stays at the zero the type needs, and the
 * preview names admission price as unknown on its own.
 */
export function pickStopFor(hit: PlaceHit, id: string): ItineraryStop {
  return {
    id,
    title: hit.name,
    category: stopCategoryOf(hit.category),
    locationName: hit.description ?? hit.name,
    ...(hit.placeId ? { placeId: hit.placeId } : {}),
    ...(hit.eLoc ? { eLoc: hit.eLoc } : {}),
    lat: hit.latitude,
    lng: hit.longitude,
    ...(hit.description ? { description: hit.description } : {}),
    visitMinutes: intendedVisitMinutes(hit),
    ...(hit.openTime ? { openTime: hit.openTime } : {}),
    ...(hit.closeTime ? { closeTime: hit.closeTime } : {}),
    entryFeeInrPerPerson: 0,
    transportCostInrTotal: 0,
    priority: 'nice-to-have',
    status: 'suggested',
  } as ItineraryStop
}

/**
 * Where a pick lands in a day's stop array, by road order. Null when the pick has
 * no road position or any counted stop has none: the order is then not proven, and
 * the preview says so instead of guessing. A rejected stop is skipped.
 */
export function roadInsertIndex(
  stops: readonly ItineraryStop[],
  pickKm: number | null | undefined,
  kmOf: (stop: ItineraryStop) => number | null | undefined,
): number | null {
  if (pickKm == null || !Number.isFinite(pickKm)) return null
  let at = stops.length
  let found = false
  for (let i = 0; i < stops.length; i += 1) {
    if (stops[i].status === 'rejected') continue
    const km = kmOf(stops[i])
    if (km == null || !Number.isFinite(km)) return null
    if (!found && km > pickKm) { at = i; found = true }
  }
  return at
}

/** The write for a kept add. It inserts into the newest copy of the day, so a later edit stays. */
export function addMutator(dayIndex: number, insertAt: number, stop: ItineraryStop): (draft: Trip) => void {
  return draft => {
    const day = draft.days.find(d => d.index === dayIndex)
    if (!day) return
    day.stops.splice(Math.min(Math.max(0, insertAt), day.stops.length), 0, structuredClone(stop))
  }
}

/**
 * The writer settles a Keep through callbacks, and only an acknowledgement is a
 * success. The three other answers each get their own outcome, and the preview
 * stays open for all of them.
 */
export function settleFromOperation(answer: 'discard' | 'store-discarded' | 'uncertain'): EditOutcome {
  if (answer === 'discard') return { kind: 'failed', reason: 'none' }
  if (answer === 'store-discarded') return { kind: 'conflict', reason: 'superseded' }
  return { kind: 'failed', reason: 'unavailable', uncertain: true }
}

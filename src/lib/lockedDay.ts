// The locked day, as the server sends it (#774, #917).
//
// `get_public_trip` builds a locked day itself: its index, the `locked` flag,
// an empty stop list and two counts. This module is the only reader of that
// shape. It reads counts and nothing else, because a locked day carries no
// title, no place name and no coordinate.
//
// Three answers stay apart here. A day the server sent in full gives `null`.
// A locked day with a count gives that count. A locked day whose count did not
// arrive gives `stopCount: null`: an unknown count is never shown as zero.
import { STOP_CATEGORIES, type ItineraryDay } from '../data/types'
import { countKinds, type DaySummary } from './publicStorefront'

/** A larger number is not a stop count. It reads as unknown. */
const MAX_COUNT = 500

export interface LockedDayCounts {
  /** Stops on the day, without the rejected ones. Null means unknown. */
  stopCount: number | null
  /** One entry for each counted place, by category only. */
  categories: Array<{ category: string }>
}

/** True only for a day the server withheld from this viewer. */
export function isWireLocked(day: Pick<ItineraryDay, 'locked'> | null | undefined): boolean {
  return day?.locked === true
}

export function hasWireLockedDay(days: ReadonlyArray<ItineraryDay>): boolean {
  return days.some(isWireLocked)
}

/** The neutral name of a locked day. It never uses the creator's title. */
export function lockedDayTitle(index: number): string {
  return `Day ${index + 1}`
}

function wholeCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_COUNT
    ? value
    : null
}

/** The counts of a day the server locked, or null for a day it sent in full.
 *  Every unexpected shape reads as unknown or as nothing. It never throws. */
export function lockedDayCounts(day: ItineraryDay): LockedDayCounts | null {
  if (!isWireLocked(day)) return null
  const preview: unknown = day.lockedPreview
  if (preview == null || typeof preview !== 'object' || Array.isArray(preview)) {
    return { stopCount: null, categories: [] }
  }
  const fields = preview as Record<string, unknown>
  const categories: Array<{ category: string }> = []
  const tally: unknown = fields.categories
  if (tally != null && typeof tally === 'object' && !Array.isArray(tally)) {
    for (const [name, value] of Object.entries(tally as Record<string, unknown>)) {
      const count = wholeCount(value)
      if (count === null) continue
      // Only a known category may name a kind. Any other text is a plain place.
      const category = (STOP_CATEGORIES as readonly string[]).includes(name) ? name : 'other'
      for (let n = 0; n < count && categories.length < MAX_COUNT; n++) categories.push({ category })
    }
  }
  return { stopCount: wholeCount(fields.stopCount), categories }
}

/** The storefront card of a day the server locked. It shows the day number and
 *  the kind counts. It shows no pace word and no road time: both need the
 *  coordinates, and the server did not send them. */
export function wireLockedSummary(day: ItineraryDay, counts: LockedDayCounts): DaySummary {
  const kinds = countKinds(counts.categories)
  return {
    index: day.index,
    title: lockedDayTitle(day.index),
    placeCount: kinds.reduce((sum, kind) => sum + kind.count, 0),
    kinds,
    pace: null,
    travelMinutes: 0,
    hasFlight: false,
  }
}

/** A card summary with the day number in place of the creator's title. Used
 *  for a day that is locked for this viewer and that the server sent in full,
 *  which an older database still does. */
export function numberedSummary(summary: DaySummary): DaySummary {
  return { ...summary, title: lockedDayTitle(summary.index) }
}

/** The stops in the whole plan, or null when a locked day sent no count.
 *  A readable day counts the stops that are not rejected, as the server does. */
export function planStopCount(days: ReadonlyArray<ItineraryDay>): number | null {
  let total = 0
  for (const day of days) {
    const counts = lockedDayCounts(day)
    if (counts === null) {
      total += day.stops.filter(stop => stop.status !== 'rejected').length
      continue
    }
    if (counts.stopCount === null) return null
    total += counts.stopCount
  }
  return total
}

/** What the page does when the viewer may read the plan and it still holds
 *  locked days. `none`: nothing to do. `wait`: another read is in flight and
 *  it will answer. `ask`: no read is in flight, so the page must start one.
 *  `failed`: the read ran and the full plan did not arrive.
 *
 *  A loading line is true only for `wait` and `ask`. `ask` always starts a
 *  read, and that read ends in the full plan or in `failed`. */
export type FullPlanRead = 'none' | 'wait' | 'ask' | 'failed'

export function fullPlanRead(state: {
  /** The page believes this viewer may read the locked days. */
  mayRead: boolean
  /** The trip the page holds has a day the server locked. */
  holdsLockedCopy: boolean
  /** The first read of the trip ended, with a row or with a failure. */
  firstReadSettled: boolean
  /** A purchase is open. It reads the trip again when it ends. */
  purchaseInFlight: boolean
  /** The read for the full plan ran, and locked days came back or nothing did. */
  failed: boolean
}): FullPlanRead {
  if (!state.mayRead || !state.holdsLockedCopy) return 'none'
  if (state.failed) return 'failed'
  if (state.purchaseInFlight || !state.firstReadSettled) return 'wait'
  return 'ask'
}

/** Where a readable day starts when the day before it is locked.
 *
 *  The real start is the last stop of the locked day, and the server withholds
 *  it. The engine would then measure from the last readable day, which can be
 *  hundreds of kilometres away. The day's own first stop is the honest start:
 *  the hidden first leg is left out, and no invented leg is added. Returns null
 *  when the engine's own origin is correct. */
export function readableDayStart(
  days: ReadonlyArray<ItineraryDay>,
  day: ItineraryDay,
): { lat: number; lng: number } | null {
  const previous = days.find(candidate => candidate.index === day.index - 1)
  if (!previous || !isWireLocked(previous)) return null
  const first = day.stops
    .filter(stop => stop.status !== 'rejected' && Number.isFinite(stop.lat) && Number.isFinite(stop.lng))
    .sort((a, b) => a.orderInDay - b.orderInDay)[0]
  return first ? { lat: first.lat, lng: first.lng } : null
}

/** The day without the server's lock fields. A copied trip must not carry
 *  them: they describe one viewer's read, and they are not trip contents. */
export function withoutLockMarker(day: ItineraryDay): ItineraryDay {
  const plain = { ...day }
  delete plain.locked
  delete plain.lockedPreview
  return plain
}

/** The empty day a fork gets in place of a locked day. It keeps the day's
 *  position and nothing else: no title, no time, no image and no stop. */
export function emptyLockedDay(day: ItineraryDay): ItineraryDay {
  return { id: day.id, index: day.index, stops: [] }
}

/**
 * The one thing worth doing next on a trip card.
 *
 * The derivation behind the trip card's next-step line (MR1) and its planning
 * bar (MR2). Pure on purpose: no React, no store, no DOM, so the order is
 * testable on its own and the card only reads it.
 *
 * The order below is the finding, not a taste call. An unfilled day blocks
 * every later day, because the engine plans days in sequence. A booking blocks
 * the day that carries it. A suggestion blocks nothing, so it waits. A cover
 * photo blocks nothing at all, so it waits for last.
 */

import type { ItineraryDay, ItineraryStop, Trip } from '../data/types'

/** What the card should offer. `done` means the trip needs nothing from you. */
export type NextStepKind =
  | 'add-dates'
  | 'plan-day'
  | 'book-stop'
  | 'confirm-stop'
  | 'add-cover'
  | 'done'

export interface NextStep {
  kind: NextStepKind
  /** Short label for the card, already worded as an instruction. */
  label: string
  /** 0-based day index. Absent for trip-level steps. */
  dayIndex?: number
  /** The stop that needs attention. Absent for trip-level steps. */
  stopId?: string
}

/**
 * The cover emoji a trip gets before anyone chooses one.
 *
 * `trips.cover_emoji` is `not null default '🧭'`, and `CoverThumb` falls back to
 * the same glyph when it is handed no emoji at all. A stored 🧭 is therefore
 * indistinguishable from "no cover chosen" on screen and in the data — which is
 * why a live read of every publication (2026-10-05) found `coverEmoji` set on
 * all of them while `coverImageUrl` was set on one. Counting 🧭 as a cover made
 * the `add-cover` step unreachable, so MR5 could never render.
 */
const DEFAULT_COVER_EMOJI = '🧭'

/** A rejected stop is a decision already made, so it never blocks anything. */
function isUsable(stop: ItineraryStop): boolean {
  return stop.status !== 'rejected'
}

function usableStops(day: ItineraryDay): ItineraryStop[] {
  return day.stops.filter(isUsable).sort((a, b) => a.orderInDay - b.orderInDay)
}

/** Days sorted by index, because array order is not a contract. */
function byIndex(days: ItineraryDay[]): ItineraryDay[] {
  return [...days].sort((a, b) => a.index - b.index)
}

/**
 * True when the trip carries a cover somebody chose. A photo counts. So does an
 * emoji the user picked from the cover picker — but not the 🧭 every trip is
 * born with, which renders as the same generic placeholder an empty cover does.
 */
function hasCover(trip: Trip): boolean {
  if (trip.coverImageUrl) return true
  return Boolean(trip.coverEmoji) && trip.coverEmoji !== DEFAULT_COVER_EMOJI
}

export function nextTripStep(trip: Trip): NextStep {
  // A draft has no dates, so the engine has no days to plan against.
  if (!trip.startDate || !trip.endDate) {
    return { kind: 'add-dates', label: 'Set your travel dates' }
  }

  const days = byIndex(trip.days ?? [])

  if (days.length === 0) {
    return { kind: 'plan-day', label: 'Plan your first day' }
  }

  // The earliest empty day blocks every day after it.
  for (const day of days) {
    if (usableStops(day).length === 0) {
      return {
        kind: 'plan-day',
        label: `Plan day ${day.index + 1}`,
        dayIndex: day.index,
      }
    }
  }

  // The earliest unbooked stop is the one that bites first.
  for (const day of days) {
    const stop = usableStops(day).find(s => s.status === 'needs-booking')
    if (stop) {
      return {
        kind: 'book-stop',
        label: `Book ${stop.title}`,
        dayIndex: day.index,
        stopId: stop.id,
      }
    }
  }

  // A suggestion is advice, not a blocker, so it comes after the real blockers.
  for (const day of days) {
    const stop = usableStops(day).find(s => s.status === 'suggested' || s.status === 'maybe')
    if (stop) {
      return {
        kind: 'confirm-stop',
        label: `Confirm ${stop.title}`,
        dayIndex: day.index,
        stopId: stop.id,
      }
    }
  }

  if (!hasCover(trip)) {
    return { kind: 'add-cover', label: 'Add a cover photo' }
  }

  return { kind: 'done', label: 'Ready to travel' }
}

/**
 * The status filters on My Trips, in the order they are drawn.
 *
 * `nextTripStep` returns exactly ONE step per trip, so these buckets are
 * disjoint and every trip lands in exactly one of them. That is what makes the
 * tab counts add up to the page total instead of drifting apart.
 */
export type StatusBucket = 'all' | 'dates' | 'planning' | 'booking' | 'ready'

export const STATUS_FILTERS: { id: StatusBucket; label: string }[] = [
  { id: 'all', label: 'All trips' },
  { id: 'dates', label: 'Needs dates' },
  { id: 'planning', label: 'Needs planning' },
  { id: 'booking', label: 'Needs booking' },
  { id: 'ready', label: 'Ready' },
]

/**
 * Which filter a step belongs to. A booking outranks planning in the order, but
 * a trip that needs planning can still owe a booking, so `book-stop` gets its
 * own tab instead of hiding inside "needs planning" where nobody would look.
 */
const BUCKET_BY_KIND: Record<NextStepKind, Exclude<StatusBucket, 'all'>> = {
  'add-dates': 'dates',
  'plan-day': 'planning',
  'confirm-stop': 'planning',
  'add-cover': 'planning',
  'book-stop': 'booking',
  'done': 'ready',
}

/** The filter this trip belongs to. Never 'all' — that is the no-filter case. */
export function statusBucket(trip: Trip): Exclude<StatusBucket, 'all'> {
  return BUCKET_BY_KIND[nextTripStep(trip).kind]
}

/** True for a stored pref that names a real filter. Junk degrades to 'all'. */
export function isStatusBucket(raw: string | null | undefined): raw is StatusBucket {
  return !!raw && STATUS_FILTERS.some(f => f.id === raw)
}

/** Planned days over total days, for the progress bar in MR2. */
export function plannedDayRatio(trip: Trip): { planned: number; total: number; pct: number } {
  const days = trip.days ?? []
  const total = days.length
  const planned = days.filter(d => usableStops(d).length > 0).length
  // A trip with no days is 0% planned, never NaN from an empty denominator.
  const pct = total === 0 ? 0 : Math.round((planned / total) * 100)
  return { planned, total, pct }
}
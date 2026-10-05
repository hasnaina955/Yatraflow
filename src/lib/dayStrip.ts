// ============ day strip (MR7) ============
// The Timeline's day rail already exists as a row of chips that jump to a day.
// This is the data behind the richer card form: one item per day, carrying the
// place that day sits in and whether the route moves on at that boundary.
//
// WHY A MODULE AND NOT A LOOP IN THE RAIL: "which day do you wake up in" and
// "does the city change here" are the two facts the strip shows, and both are
// easy to get subtly wrong — an off-by-one on the boundary makes the marker
// land on the wrong day, which reads as the plan being wrong rather than the
// strip being wrong. Pure and tested, so that failure has to argue with a case.
//
// THE PLACE A DAY SITS IN: the day's own title when it has one, else its first
// stop's location. Days are not required to carry a title (most do not), and a
// day with no stops has no place to name, so the strip prints none rather than
// reaching into the previous day and implying a stop that is not there.
//
// THE COMPARISON IS DELIBERATELY EXACT: two strings, trimmed and lowercased.
// "Fort Kochi" and "Kochi, India" are the same city and this will call them a
// change. That is a cosmetic false positive — a marker appears where none is
// strictly needed — and the alternative, fuzzy place matching, guesses wrong in
// ways nobody can audit. A missed marker is invisible; a wrong one is legible.

import type { ItineraryDay } from '../data/types'

export interface DayStripItem {
  /** The day's own index. Days are keyed by this, never by array position. */
  dayIndex: number
  /** "Day 3" — always present, so a card is never blank. */
  label: string
  /** Where the day sits, or null when the day names nowhere. */
  place: string | null
  /** Stops on the day, rejected ones included: the strip counts what is written. */
  stopCount: number
  /** True when this day's place differs from the previous day's. Day 1 never is. */
  changesCity: boolean
}

/** The place a day sits in: its title, else its first stop's location. */
function placeOf(day: ItineraryDay): string | null {
  const title = day.title?.trim()
  if (title) return title
  const first = day.stops[0]
  const loc = first?.locationName?.trim()
  return loc ? loc : null
}

export function dayStripItems(days: ItineraryDay[]): DayStripItem[] {
  // Sorted by index, because array order is not a contract and a strip that
  // marks a city change against the wrong neighbour is worse than no marker.
  const ordered = [...days].sort((a, b) => a.index - b.index)
  let prevPlace: string | null = null
  return ordered.map(day => {
    const place = placeOf(day)
    const key = place ? place.toLowerCase() : null
    const changesCity = key !== null && prevPlace !== null && key !== prevPlace
    // Only a day that NAMES a place advances the neighbour. An unnamed day
    // between two named ones must not make the second look like a change.
    if (key !== null) prevPlace = key
    return {
      dayIndex: day.index,
      label: `Day ${day.index + 1}`,
      place,
      stopCount: day.stops.length,
      changesCity,
    }
  })
}

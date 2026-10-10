// ============ My trips page — pure logic ============
// Status, "Up next" pick, countdown, planning progress, next step, date range
// text and the destination-to-region lookup. No clock reads: every function
// takes `today`. Dates compare as calendar days (yyyy-mm-dd), never as
// timestamps, so a time zone cannot move a trip to another day.
import type { Trip } from '../data/types'

export type WhenKey = 'all' | 'upcoming' | 'past' | 'draft'
export type TripStatus = 'live' | 'upcoming' | 'past' | 'draft'

/** The parts of a Trip these functions read. A full Trip fits. */
export type TripDates = Pick<Trip, 'startDate' | 'endDate'>
export type TripPlan = TripDates & Pick<Trip, 'days'>

interface CalendarDay { year: number; month: number; day: number }

/** Parse a strict ISO "yyyy-mm-dd" string. Returns null for anything else,
 *  including impossible dates such as 2026-02-31. */
function parseYmd(value: string | undefined | null): CalendarDay | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '')
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const probe = new Date(Date.UTC(year, month - 1, day))
  const isRealDate = probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day
  return isRealDate ? { year, month, day } : null
}

/** The local calendar day of a Date. */
function localDay(date: Date): CalendarDay {
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() }
}

/** Whole days from `from` to `to`. DST-safe: it counts UTC midnights. */
function diffDays(from: CalendarDay, to: CalendarDay): number {
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.round((Date.UTC(to.year, to.month - 1, to.day) - Date.UTC(from.year, from.month - 1, from.day)) / msPerDay)
}

/** Order two calendar days: negative when a is before b. */
function compareDays(a: CalendarDay, b: CalendarDay): number {
  return diffDays(b, a)
}

/**
 * Date-bucket rule used by the My trips filter. "upcoming" ends today or later,
 * "past" ended before today, "draft" has a missing or invalid date. The END date
 * decides, so a trip in progress counts as upcoming. Same behaviour as the
 * original helper in TripsList.tsx.
 */
export function whenBucket(t: TripDates, today: Date): WhenKey {
  const end = new Date(`${t.endDate}T23:59:59`)
  const start = new Date(`${t.startDate}T00:00:00`)
  if (Number.isNaN(end.getTime()) || Number.isNaN(start.getTime())) return 'draft'
  return end.getTime() < today.getTime() ? 'past' : 'upcoming'
}

/**
 * Card status. Draft and past follow the end-date rule. A trip that is not past
 * and has started (start day on or before today) is "live". Otherwise it is
 * "upcoming".
 */
export function statusOf(t: TripDates, today: Date): TripStatus {
  const start = parseYmd(t.startDate)
  const end = parseYmd(t.endDate)
  if (!start || !end) return 'draft'
  const todayDay = localDay(today)
  if (compareDays(end, todayDay) < 0) return 'past'
  return compareDays(start, todayDay) <= 0 ? 'live' : 'upcoming'
}

/**
 * The trip to feature as "Up next". Candidates have valid dates, a start that
 * is not after the end, and an end on or after today. The earliest start wins.
 * A tie goes to the trip updated most recently. A tie after that keeps the
 * input order. Returns null when no trip qualifies.
 */
export function pickUpNext<T extends TripDates & Pick<Trip, 'updatedAt'>>(trips: readonly T[], today: Date): T | null {
  const todayDay = localDay(today)
  let best: T | null = null
  let bestStart: CalendarDay | null = null
  for (const trip of trips) {
    const start = parseYmd(trip.startDate)
    const end = parseYmd(trip.endDate)
    const isCandidate = start !== null && end !== null && compareDays(start, end) <= 0 && compareDays(end, todayDay) >= 0
    if (!isCandidate || !start) continue
    if (best === null || bestStart === null) {
      best = trip
      bestStart = start
      continue
    }
    const startOrder = compareDays(start, bestStart)
    const isEarlier = startOrder < 0
    const isTieAndNewer = startOrder === 0 && (trip.updatedAt ?? 0) > (best.updatedAt ?? 0)
    if (isEarlier || isTieAndNewer) {
      best = trip
      bestStart = start
    }
  }
  return best
}

/**
 * Countdown text for a live or upcoming trip: "Day N of M", "Day N",
 * "Starts tomorrow" or "Starts in N days". Returns null for past and draft
 * trips. " of M" shows only when M (days.length) is at least 1 and N <= M.
 */
export function countdownText(t: TripPlan, today: Date): string | null {
  const status = statusOf(t, today)
  const start = parseYmd(t.startDate)
  if (!start || (status !== 'live' && status !== 'upcoming')) return null
  const todayDay = localDay(today)
  if (status === 'live') {
    const dayNumber = diffDays(start, todayDay) + 1
    const totalDays = t.days.length
    const totalIsSensible = totalDays >= 1 && dayNumber <= totalDays
    return totalIsSensible ? `Day ${dayNumber} of ${totalDays}` : `Day ${dayNumber}`
  }
  const daysAway = diffDays(todayDay, start)
  return daysAway === 1 ? 'Starts tomorrow' : `Starts in ${daysAway} days`
}

/** Days with at least one stop that is not rejected, against the day count. */
export function planning(t: Pick<Trip, 'days'>): { planned: number; total: number } {
  const planned = t.days.filter(day => day.stops.some(stop => stop.status !== 'rejected')).length
  return { planned, total: t.days.length }
}

/**
 * The first stop marked "needs-booking" on a day that is today or later.
 * Days already gone are skipped. A trip that has not started, or has no valid
 * start date, scans from day 1. Returns the 1-based day number and the title.
 */
export function nextStep(t: TripPlan, today: Date): { day: number; title: string } | null {
  const start = parseYmd(t.startDate)
  const firstDayIndex = start ? Math.max(0, diffDays(start, localDay(today))) : 0
  for (let dayIndex = firstDayIndex; dayIndex < t.days.length; dayIndex++) {
    const stop = t.days[dayIndex].stops.find(candidate => candidate.status === 'needs-booking')
    if (stop) return { day: dayIndex + 1, title: stop.title }
  }
  return null
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Short date range, for example "12–15 Mar" or "28 Feb – 2 Mar". The year shows
 * only when a date is outside the year of `today`. Returns "No dates yet" for
 * a missing or invalid date. A reversed range shows in date order.
 */
export function rangeText(t: TripDates, today: Date): string {
  const first = parseYmd(t.startDate)
  const second = parseYmd(t.endDate)
  if (!first || !second) return 'No dates yet'
  const [start, end] = compareDays(first, second) <= 0 ? [first, second] : [second, first]
  const thisYear = today.getFullYear()
  const yearSuffix = start.year !== thisYear || end.year !== thisYear ? ` ${end.year}` : ''
  if (compareDays(start, end) === 0) return `${start.day} ${MONTH_NAMES[start.month - 1]}${yearSuffix}`
  if (start.month === end.month && start.year === end.year) return `${start.day}–${end.day} ${MONTH_NAMES[end.month - 1]}${yearSuffix}`
  return `${start.day} ${MONTH_NAMES[start.month - 1]} – ${end.day} ${MONTH_NAMES[end.month - 1]}${yearSuffix}`
}

export type TripRegion = 'kerala' | 'goa' | 'rajasthan' | 'coorg' | 'meghalaya' | 'kashmir' | 'generic'

const REGION_KEYWORDS: ReadonlyArray<readonly [Exclude<TripRegion, 'generic'>, readonly string[]]> = [
  ['kerala', ['kochi', 'munnar', 'thekkady', 'alleppey', 'kerala']],
  ['goa', ['goa']],
  ['rajasthan', ['jaipur', 'jodhpur', 'udaipur', 'jaisalmer', 'rajasthan']],
  ['coorg', ['coorg', 'madikeri', 'kushalnagar']],
  ['meghalaya', ['shillong', 'cherrapunji', 'dawki', 'meghalaya']],
  ['kashmir', ['srinagar', 'gulmarg', 'pahalgam', 'kashmir']],
]

/** Pick the papercut art region from the destination names. The first region
 *  with a keyword match wins. No match returns the neutral "generic" art. */
export function regionFor(t: Pick<Trip, 'destinations'>): TripRegion {
  const names = (t.destinations ?? []).map(name => name.toLowerCase())
  for (const [region, keywords] of REGION_KEYWORDS) {
    const hasMatch = names.some(name => keywords.some(keyword => name.includes(keyword)))
    if (hasMatch) return region
  }
  return 'generic'
}

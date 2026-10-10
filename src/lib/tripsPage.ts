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
 * Date-bucket rule used by the My trips filter. It reads statusOf, so the filter
 * and the card tag never disagree. "upcoming" covers live and upcoming trips,
 * "past" ended before today, and "draft" has a missing or impossible date. The
 * END date decides, so a trip in progress counts as upcoming.
 */
export function whenBucket(t: TripDates, today: Date): WhenKey {
  const status = statusOf(t, today)
  if (status === 'draft') return 'draft'
  return status === 'past' ? 'past' : 'upcoming'
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
 *  with a keyword match wins. A keyword matches a whole word only, so "Goalpara"
 *  does not take Goa art. No match returns the neutral "generic" art. */
export function regionFor(t: Pick<Trip, 'destinations'>): TripRegion {
  const words = (t.destinations ?? []).flatMap(name => name.toLowerCase().split(/[^\p{L}]+/u))
  for (const [region, keywords] of REGION_KEYWORDS) {
    const hasMatch = words.some(word => keywords.includes(word))
    if (hasMatch) return region
  }
  return 'generic'
}

export type OtherTripsEmptyKind = 'none' | 'none-other' | 'no-match' | 'no-trips'

/**
 * Which empty state the list under the pinned Up next card shows.
 * `matchCount` counts every trip that passes the filters, the pinned card
 * included. `otherCount` counts the rows under the pinned card.
 *  - 'none': rows exist, so the grid shows.
 *  - 'none-other': only the pinned card matches. No filter hides other trips,
 *    so the copy says there are no other trips yet and offers no Clear button.
 *  - 'no-match': filters hide every trip. Offer Clear filters.
 *  - 'no-trips': no trip matches and no filter is set. The page shows its
 *    first-run copy before this list is reached.
 */
export function otherTripsEmptyKind({ matchCount, otherCount, hasFilters }: {
  matchCount: number
  otherCount: number
  hasFilters: boolean
}): OtherTripsEmptyKind {
  if (otherCount > 0) return 'none'
  if (matchCount > 0) return 'none-other'
  return hasFilters ? 'no-match' : 'no-trips'
}

// ============ The My trips hero ============
// The headline, the stat row, the postcards and the handwritten note all read
// the user's own trips. Each helper takes `today` and the trip list, so none of
// them reads the clock. Trips in the trash never reach these helpers.

/** The parts of a Trip the hero reads. A full Trip fits. */
export type HeroTrip = TripPlan
  & Pick<Trip, 'id' | 'name' | 'startLocation' | 'destinations' | 'updatedAt'>
  & Partial<Pick<Trip, 'members' | 'coverImageUrl'>>

/** The first destination with a name, or null when the trip has none. */
function firstDestination(t: Pick<Trip, 'destinations'>): string | null {
  for (const destination of t.destinations ?? []) {
    const name = destination.trim()
    if (name) return name
  }
  return null
}

export interface HeroHeadline {
  /** The plain part of the headline, before the accent. */
  lead: string
  /** The accent: set in italic, with its end stop. */
  accent: string
}

/**
 * The hero headline.
 *  - A trip is up next (see pickUpNext): "Next stop, <its first destination>."
 *  - Trips exist and none is up next: "Plan your next journey."
 *  - Every trip is a draft: "Pick up where you left off."
 *  - No trips: "Your first trip starts here."
 * While the trips read is not settled (`ready` is false) the list may be
 * empty only because it has not arrived, so the headline stays neutral.
 */
export function heroHeadline({ trips, today, ready }: {
  trips: readonly HeroTrip[]
  today: Date
  ready: boolean
}): HeroHeadline {
  if (!ready) return { lead: 'Plan your', accent: 'next journey.' }
  if (trips.length === 0) return { lead: 'Your first trip', accent: 'starts here.' }
  const upNext = pickUpNext(trips, today)
  if (upNext) return { lead: 'Next stop,', accent: `${firstDestination(upNext) ?? upNext.name.trim()}.` }
  const allAreDrafts = trips.every(t => statusOf(t, today) === 'draft')
  if (allAreDrafts) return { lead: 'Pick up', accent: 'where you left off.' }
  return { lead: 'Plan your', accent: 'next journey.' }
}

export interface HeroStat { label: string; value: number }

/**
 * The stat row under the hero text: trips, upcoming, places and co-planners.
 * Every figure counts real data. A stat that is zero is left out. The list is
 * empty until the trips read has settled, so a loading or failed read never
 * shows a row of zeros. "Upcoming" counts live and upcoming trips.
 * "Places" counts unique destination names. "Co-planners" counts the other
 * people on those trips.
 */
export function heroStats({ trips, today, meId, ready }: {
  trips: readonly HeroTrip[]
  today: Date
  meId: string | null
  ready: boolean
}): HeroStat[] {
  if (!ready) return []
  const places = new Set<string>()
  const coPlanners = new Set<string>()
  let upcoming = 0
  for (const t of trips) {
    if (whenBucket(t, today) === 'upcoming') upcoming += 1
    for (const destination of t.destinations ?? []) {
      const key = destination.trim().toLowerCase()
      if (key) places.add(key)
    }
    for (const member of t.members ?? []) {
      if (member.userId !== meId) coPlanners.add(member.userId)
    }
  }
  const plural = (count: number, one: string, many: string) => (count === 1 ? one : many)
  const stats: HeroStat[] = [
    { label: plural(trips.length, 'Trip', 'Trips'), value: trips.length },
    { label: 'Upcoming', value: upcoming },
    { label: plural(places.size, 'Place', 'Places'), value: places.size },
    { label: plural(coPlanners.size, 'Co-planner', 'Co-planners'), value: coPlanners.size },
  ]
  return stats.filter(stat => stat.value > 0)
}

export interface HeroPostcard {
  key: string
  /** The caption: the trip's first destination, or its name. */
  place: string
  region: TripRegion
  /** The trip's own cover image, when it has one. */
  coverImageUrl?: string
  /** True for the empty "your next trip" postcard. */
  blank?: boolean
}

export const HERO_POSTCARD_LIMIT = 3

const STATUS_RANK: Record<TripStatus, number> = { live: 0, upcoming: 1, draft: 2, past: 3 }

/**
 * The postcards on the hero, up to three, from the trips that matter most:
 * live trips first, then upcoming ones by start day, then drafts, then past
 * trips, newest edit first. Two trips with the same first destination give one
 * postcard. With no trips the hero shows one blank "Your next trip" postcard.
 */
export function heroPostcards({ trips, today }: {
  trips: readonly HeroTrip[]
  today: Date
}): HeroPostcard[] {
  if (trips.length === 0) return [{ key: 'blank', place: 'Your next trip', region: 'generic', blank: true }]
  const ranked = trips
    .map((t, order) => ({ t, order, status: statusOf(t, today) }))
    .sort((a, b) => {
      if (STATUS_RANK[a.status] !== STATUS_RANK[b.status]) return STATUS_RANK[a.status] - STATUS_RANK[b.status]
      const isDated = a.status === 'live' || a.status === 'upcoming'
      const startOrder = isDated ? a.t.startDate.localeCompare(b.t.startDate) : 0
      if (startOrder !== 0) return startOrder
      return (b.t.updatedAt ?? 0) - (a.t.updatedAt ?? 0) || a.order - b.order
    })
  const cards: HeroPostcard[] = []
  const seenPlaces = new Set<string>()
  for (const { t } of ranked) {
    const place = firstDestination(t) ?? t.name.trim()
    const placeKey = place.toLowerCase()
    if (!place || seenPlaces.has(placeKey)) continue
    seenPlaces.add(placeKey)
    cards.push({ key: t.id, place, region: regionFor(t), coverImageUrl: t.coverImageUrl || undefined })
    if (cards.length === HERO_POSTCARD_LIMIT) break
  }
  return cards
}

/**
 * The handwritten note by the postcards, or null when there is nothing true to
 * say. A trip up next gives its countdown ("12 days to go!" or "Day 2 of 5!").
 * When only drafts exist, the draft you edited last gives "3 of 5 days planned".
 */
export function heroNote({ trips, today }: {
  trips: readonly HeroTrip[]
  today: Date
}): string | null {
  const upNext = pickUpNext(trips, today)
  if (upNext) {
    const start = parseYmd(upNext.startDate)
    if (statusOf(upNext, today) === 'live') {
      const countdown = countdownText(upNext, today)
      return countdown ? `${countdown}!` : null
    }
    if (!start) return null
    const daysAway = diffDays(localDay(today), start)
    return `${daysAway} ${daysAway === 1 ? 'day' : 'days'} to go!`
  }
  const drafts = trips
    .filter(t => statusOf(t, today) === 'draft')
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
  if (drafts.length === 0 || drafts.length !== trips.length) return null
  const { planned, total } = planning(drafts[0])
  return planned > 0 && total > 0 ? `${planned} of ${total} days planned` : null
}

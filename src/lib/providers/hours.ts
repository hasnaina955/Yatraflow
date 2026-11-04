// ============ Opening-hours facts (ticket 02 / #887) ============
// Pure weekday-attributed interval model replacing the "first period only"
// reading of Google hours. No network and no provider imports live here —
// google.ts adapts its raw periods into PlaceHours, and consumers (ridePlan
// scoring, the later shared projection) read verdicts from this module.
//
// Semantics the ticket pins down:
//  - The whole visit must fit inside one interval occurrence, not just arrival.
//  - Split hours (temple 05:00–12:00 and 16:00–20:00) stay two intervals.
//  - Overnight intervals (22:00–02:00) cover the correct local weekdays
//    across midnight.
//  - "Known closed" (weekly pattern or a dated observation) is distinct from
//    "missing/unknown hours" — unknown is never scored as open or closed.
//  - A fetch timestamp describes freshness only; observed (date-scoped) hours
//    never verify a visit date they do not cover, and exceptional future
//    closures are never invented from a weekly pattern.

/** Local weekday, 0 = Sunday (Google Places convention). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

/** One opening interval anchored to the local weekday it starts on. */
export interface OpeningInterval {
  /** weekday the interval starts on (0 = Sunday, local clock) */
  startDay: Weekday
  /** minutes after local midnight on startDay */
  startMin: number
  /**
   * minutes after startDay's midnight when the interval ends — may exceed 1440
   * for overnight spans (Sat 22:00 → Sun 02:00 = startMin 1320, endMin 1560).
   * null = open-ended (Google period with no close, e.g. 24/7).
   */
  endMin: number | null
}

export interface PlaceHours {
  /** regular weekly pattern from regularOpeningHours; undefined when absent */
  pattern?: OpeningInterval[]
  /** date-scoped observations from currentOpeningHours; undefined when absent */
  observed?: { intervals: OpeningInterval[]; dates?: string[] }
  /** which sources produced usable intervals */
  basis: 'none' | 'pattern' | 'observed' | 'both'
  /** local 'YYYY-MM-DD' the provider data was fetched — freshness only */
  fetchedOn?: string
}

export interface HoursVerdict {
  state: 'open' | 'closed' | 'unknown'
  reason: string
  /**
   * minutes the visit misses the ideal edge by (early arrival, late overrun);
   * undefined for all-day/weekday closures where no edge applies.
   */
  missMin?: number
}

/** Provider-neutral raw period shape (structurally Google's OpeningHours.periods). */
export interface RawHoursPeriod {
  open?: {
    day?: number
    hour?: number
    minute?: number
    date?: { year?: number; month?: number; day?: number }
  }
  close?: { day?: number; hour?: number; minute?: number }
}

const MINUTES_PER_DAY = 1440

/** Local 'YYYY-MM-DD' — local calendar components, not UTC (toISOString shifts near midnight). */
export function localISODate(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Local weekday of a 'YYYY-MM-DD' string, or null when the shape is invalid. */
export function weekdayOfISO(iso: string): Weekday | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (Number.isNaN(d.getTime())) return null
  // round-trip guard: reject overflowed dates like 2026-02-31
  if (d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) return null
  return d.getDay() as Weekday
}

interface DateYMD { year: number; month: number; day: number }

function isoOfYMD(d: { year?: number; month?: number; day?: number }): string | null {
  const { year, month, day } = d
  if (year == null || month == null || day == null) return null
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function resolveVisitDay(visitDate: string | DateYMD | Date | null | undefined): { weekday: Weekday; iso: string } | null {
  if (visitDate == null) return null
  if (visitDate instanceof Date) {
    if (Number.isNaN(visitDate.getTime())) return null
    return { weekday: visitDate.getDay() as Weekday, iso: localISODate(visitDate) }
  }
  if (typeof visitDate === 'string') {
    const weekday = weekdayOfISO(visitDate)
    return weekday == null ? null : { weekday, iso: visitDate }
  }
  const iso = isoOfYMD(visitDate)
  if (!iso) return null
  const weekday = weekdayOfISO(iso)
  return weekday == null ? null : { weekday, iso }
}

/**
 * Adapt raw provider periods into intervals. Periods that cannot be attributed
 * to a weekday (missing/invalid open.day or hour) are DROPPED, never guessed
 * into a fabricated interval. Returns undefined when no period survives.
 */
function intervalsFromPeriods(periods: RawHoursPeriod[] | undefined): OpeningInterval[] | undefined {
  if (!periods || periods.length === 0) return undefined
  const out: OpeningInterval[] = []
  for (const p of periods) {
    const open = p.open
    if (!open) continue
    const startDay = open.day
    if (startDay == null || !Number.isInteger(startDay) || startDay < 0 || startDay > 6) continue
    if (open.hour == null || !Number.isInteger(open.hour) || open.hour < 0 || open.hour > 23) continue
    const openMinute = open.minute ?? 0
    if (!Number.isInteger(openMinute) || openMinute < 0 || openMinute > 59) continue
    const startMin = open.hour * 60 + openMinute
    if (p.close == null) {
      // open-ended period (24/7 style) — no close time is stated, none invented
      out.push({ startDay: startDay as Weekday, startMin, endMin: null })
      continue
    }
    const close = p.close
    if (close.hour == null || !Number.isInteger(close.hour) || close.hour < 0 || close.hour > 23) continue
    const closeMinute = close.minute ?? 0
    if (!Number.isInteger(closeMinute) || closeMinute < 0 || closeMinute > 59) continue
    const dayOffset = close.day == null ? 0 : (((close.day - startDay) % 7) + 7) % 7
    if (!Number.isInteger(dayOffset) || dayOffset < 0 || dayOffset > 6) continue
    const endMin = dayOffset * MINUTES_PER_DAY + close.hour * 60 + closeMinute
    if (endMin <= startMin) continue // zero-length or malformed — skip, never normalize into an invention
    out.push({ startDay: startDay as Weekday, startMin, endMin })
  }
  return out.length > 0 ? out : undefined
}

/**
 * Build PlaceHours from Google's two opening-hours sources. Preference for
 * verdicts is resolved inside openingVerdict: a dated observation wins for the
 * dates it covers, the weekly pattern answers everything else.
 */
export function placeHoursFromPeriods(
  regular: RawHoursPeriod[] | undefined,
  current: RawHoursPeriod[] | undefined,
  fetchedOn: string,
): PlaceHours | undefined {
  const pattern = intervalsFromPeriods(regular)
  const observedIntervals = intervalsFromPeriods(current)
  let observedDates: string[] | undefined
  if (observedIntervals && current) {
    const dates = new Set<string>()
    for (const p of current) {
      const d = p.open?.date
      if (!d) continue
      const iso = isoOfYMD(d)
      if (iso) dates.add(iso)
    }
    if (dates.size > 0) observedDates = [...dates].sort()
  }
  if (!pattern && !observedIntervals) return undefined
  const basis: PlaceHours['basis'] = pattern && observedIntervals ? 'both' : pattern ? 'pattern' : 'observed'
  return {
    ...(pattern ? { pattern } : {}),
    ...(observedIntervals ? { observed: { intervals: observedIntervals, ...(observedDates ? { dates: observedDates } : {}) } } : {}),
    basis,
    fetchedOn,
  }
}

/** Occurrences of one interval placed on week lines around the visit (±7 days covers every wrap). */
function occurrencesAroundVisit(iv: OpeningInterval): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = []
  for (const offsetDays of [-7, 0, 7]) {
    const start = (iv.startDay + offsetDays) * MINUTES_PER_DAY + iv.startMin
    const end = iv.endMin == null ? Number.POSITIVE_INFINITY : (iv.startDay + offsetDays) * MINUTES_PER_DAY + iv.endMin
    out.push({ start, end })
  }
  return out
}

/**
 * True when the interval set gives the same shape on every weekday, so a
 * verdict is valid without knowing the visit's weekday (no date available).
 * A set that skips a weekday is NOT uniform — a weekday-free "open" would
 * wrongly cover the closed day.
 */
function isUniformDaily(intervals: OpeningInterval[]): boolean {
  if (intervals.length !== 7) return false
  const days = new Set(intervals.map(i => i.startDay))
  if (days.size !== 7) return false
  const first = intervals[0]
  return intervals.every(i => i.startMin === first.startMin && i.endMin === first.endMin)
}

/** Weekday-free containment: the visit fits the (uniform) daily shape, same day or spilled from the previous one. */
function fitsUniformDaily(intervals: OpeningInterval[], arrivalMin: number, visitMin: number): boolean {
  const visitEnd = arrivalMin + Math.max(0, visitMin)
  for (const iv of intervals) {
    if (iv.endMin == null) {
      if (arrivalMin >= iv.startMin) return true
      continue
    }
    if (arrivalMin >= iv.startMin && visitEnd <= iv.endMin) return true
    // spilled: the visit started the previous local day inside an overnight span
    if (visitEnd <= iv.endMin - MINUTES_PER_DAY && arrivalMin + MINUTES_PER_DAY >= iv.startMin) return true
  }
  return false
}

/**
 * Opening verdict for a visit. `visitDate` may be an ISO 'YYYY-MM-DD', a
 * {year,month,day} object, a Date, or null/undefined when the caller cannot
 * know the visit's weekday — dated verdicts then stay honest instead of
 * guessing (unknown, unless the interval set is uniform across all weekdays).
 *
 * Resolution order: a dated observation covering the visit date wins
 * (including observed closures the weekly pattern would not show); otherwise
 * the weekly pattern answers; otherwise unknown.
 */
export function openingVerdict(
  hours: PlaceHours | undefined,
  visitDate: string | DateYMD | Date | null | undefined,
  arrivalMin: number,
  visitMin: number,
): HoursVerdict {
  if (!hours || hours.basis === 'none') return { state: 'unknown', reason: 'no opening hours on record' }
  if (arrivalMin == null || !Number.isFinite(arrivalMin)) return { state: 'unknown', reason: 'arrival time unknown' }
  const visitLen = visitMin != null && Number.isFinite(visitMin) && visitMin > 0 ? visitMin : 0

  const visit = resolveVisitDay(visitDate)
  const observed = hours.observed
  // currentOpeningHours is a contiguous ~7-day window: a date between the
  // first and last observed period date is COVERED by the observation, so a
  // date with no period inside the window is a real closure (holiday), not an
  // absence of data. Outside the span the observation verifies nothing.
  const observedCoversVisit =
    observed != null &&
    observed.dates != null &&
    observed.dates.length > 0 &&
    visit != null &&
    visit.iso >= observed.dates[0] &&
    visit.iso <= observed.dates[observed.dates.length - 1]

  const intervals = observedCoversVisit
    ? observed!.intervals
    : (hours.pattern ?? (observed != null && observed.dates == null ? observed.intervals : undefined))

  if (!intervals || intervals.length === 0) {
    if (observedCoversVisit) return { state: 'closed', reason: 'no opening hours on the visit date (observed)' }
    return { state: 'unknown', reason: 'no opening hours on record' }
  }

  // Weekday unknown: only the uniform-daily shape can answer honestly.
  if (!visit) {
    if (isUniformDaily(intervals)) {
      if (fitsUniformDaily(intervals, arrivalMin, visitLen)) {
        return { state: 'open', reason: 'fits the daily opening hours' }
      }
      // the shape is identical every day, so "doesn't fit" needs no weekday
      return { state: 'closed', reason: 'outside the daily opening hours' }
    }
    return { state: 'unknown', reason: 'visit weekday unknown' }
  }

  const visitStartAbs = visit.weekday * MINUTES_PER_DAY + arrivalMin
  const visitEndAbs = visitStartAbs + visitLen

  let fitsAny = false
  let intersectsAny = false
  let earliestSameDayStart: number | null = null
  let latestIntersectEnd: number | null = null
  let latestSameDayEndBeforeArrival: number | null = null
  const dayStartAbs = visit.weekday * MINUTES_PER_DAY

  for (const iv of intervals) {
    for (const occ of occurrencesAroundVisit(iv)) {
      const fits = visitStartAbs >= occ.start && visitEndAbs <= occ.end
      if (fits) { fitsAny = true; break }
      const overlaps = visitStartAbs < occ.end && visitEndAbs > occ.start
      if (overlaps) {
        intersectsAny = true
        if (occ.end !== Number.POSITIVE_INFINITY) {
          latestIntersectEnd = latestIntersectEnd == null ? occ.end : Math.max(latestIntersectEnd, occ.end)
        }
      }
      if (occ.start > visitStartAbs && occ.start - dayStartAbs < MINUTES_PER_DAY) {
        earliestSameDayStart = earliestSameDayStart == null ? occ.start : Math.min(earliestSameDayStart, occ.start)
      }
      if (occ.end !== Number.POSITIVE_INFINITY && occ.end <= visitStartAbs && occ.end - dayStartAbs > 0) {
        latestSameDayEndBeforeArrival = latestSameDayEndBeforeArrival == null ? occ.end : Math.max(latestSameDayEndBeforeArrival, occ.end)
      }
    }
    if (fitsAny) break
  }

  if (fitsAny) {
    return { state: 'open', reason: observedCoversVisit ? 'fits observed hours on the visit date' : 'fits the weekly opening pattern' }
  }

  // Visit ends past a closing edge it overlapped — the measurable miss.
  if (latestIntersectEnd != null && visitEndAbs > latestIntersectEnd) {
    return {
      state: 'closed',
      reason: 'visit ends after closing',
      missMin: Math.round(visitEndAbs - latestIntersectEnd),
    }
  }
  // Nearest measurable edge wins: arrival before the day's next opening edge,
  // or past the day's last closing edge — whichever the trip is closer to
  // ("minutes a trip would walk a shut door away from the ideal").
  const earlyMiss = earliestSameDayStart != null ? earliestSameDayStart - visitStartAbs : null
  const lateMiss = latestSameDayEndBeforeArrival != null ? visitStartAbs - latestSameDayEndBeforeArrival : null
  if (earlyMiss != null && (lateMiss == null || earlyMiss <= lateMiss)) {
    return {
      state: 'closed',
      reason: 'arrival is before opening',
      missMin: Math.round(earlyMiss),
    }
  }
  if (lateMiss != null) {
    return {
      state: 'closed',
      reason: 'arrival is after closing',
      missMin: Math.round(lateMiss),
    }
  }
  // Overlapped an interval but never fit and no edge applied — arrival inside a
  // same-day gap between intervals with no measurable edge (defensive fallback).
  if (intersectsAny) {
    return { state: 'closed', reason: 'arrival falls in a gap between opening intervals' }
  }
  // Nothing touches the visit at all.
  if (observedCoversVisit) {
    return { state: 'closed', reason: 'no opening hours on the visit date (observed)' }
  }
  if (hours.basis === 'pattern' || (hours.pattern != null && !observedCoversVisit)) {
    return { state: 'closed', reason: 'closed on this weekday (weekly pattern)' }
  }
  return { state: 'unknown', reason: 'opening hours do not cover the visit date' }
}

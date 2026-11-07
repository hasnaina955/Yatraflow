// Runtime opening-hours use (repair of the #887 gap): the visit date and the
// intended visit length come from the trip's own day facts. Nothing here
// invents today's date, and a missing duration never becomes a zero-length
// visit. The display helper names the intervals that apply to one date, so a
// split or overnight place renders the relevant span instead of the first
// legacy period.
import { isoAddDays } from './weather'
import { visitMinutesForCategory } from './slackPrompts'
import { openingVerdict, weekdayOfISO, type HoursVerdict, type OpeningInterval, type PlaceHours } from './providers/hours'
import type { PlaceHit } from './providers/hits'
import type { RideSegment } from './ridePlan'

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/

/** True when the string is a real local calendar date. */
export function isISODate(value: string | null | undefined): value is string {
  if (!value) return false
  const m = ISO_DAY.exec(value)
  if (!m) return false
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  const d = new Date(year, month - 1, day)
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day
}

/**
 * Local ISO date of a trip day. Null when the start date is unreadable or the
 * day index is invalid. The date is the trip's own calendar day, never today.
 */
export function visitDateForDay(startDate: string | null | undefined, dayIndex: number): string | null {
  if (!isISODate(startDate)) return null
  if (!Number.isInteger(dayIndex) || dayIndex < 0) return null
  return isoAddDays(startDate, dayIndex)
}

/** The visit length the add path already intends for this place kind. */
export function intendedVisitMinutes(hit: Pick<PlaceHit, 'category'>): number {
  return visitMinutesForCategory(hit.category)
}

/**
 * One visit date per journey segment, by segment index. A day closes on the
 * segment that carries `dayEnd`; that segment still belongs to the day it
 * closes. Null dates stay null, so a path without a trip date stays unknown.
 */
export function visitDatesForPlan(
  segments: readonly RideSegment[],
  startDate: string | null | undefined,
): (string | null)[] {
  const dates: (string | null)[] = []
  let day = 0
  for (const seg of segments) {
    dates[seg.index] = visitDateForDay(startDate, day)
    if (seg.dayEnd) day += 1
  }
  return dates
}

function clockOf(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/**
 * The intervals that apply to one local date: that weekday's intervals plus an
 * overnight spill from the previous day. A dated observation wins inside its
 * own span. Without a date only a uniform daily shape can name a span; any
 * other shape returns null (unknown), never a guessed weekday.
 */
export function intervalsForDate(hours: PlaceHours | undefined, date: string | null): OpeningInterval[] | null {
  if (!hours || hours.basis === 'none') return null
  const observed = hours.observed
  const covered = observed?.dates != null && observed.dates.length > 0 && date != null
    && date >= observed.dates[0] && date <= observed.dates[observed.dates.length - 1]
  const set = covered
    ? observed!.intervals
    : (hours.pattern ?? (observed != null && observed.dates == null ? observed.intervals : undefined))
  if (!set || set.length === 0) return null
  const weekday = date ? weekdayOfISO(date) : null
  if (weekday == null) {
    // No date: only a full seven-day identical shape names a span honestly.
    const first = set[0]
    const days = new Set(set.map(i => i.startDay))
    const uniform = days.size === 7
      && set.every(i => i.startMin === first.startMin && i.endMin === first.endMin)
    return uniform ? [first] : null
  }
  const previousDay = ((weekday + 6) % 7)
  const spill = set.filter(i => i.startDay === previousDay && i.endMin != null && i.endMin > 1440)
  const today = set.filter(i => i.startDay === weekday)
  const out = [...spill, ...today]
  return out.length > 0 ? out : null
}

export interface HoursDisplay {
  /** The intervals that apply to the visit date, as clock pairs. Null = not provable. */
  ranges: Array<{ open: string; close: string }> | null
  /** The verdict for this arrival and visit length. */
  verdict: 'open' | 'closed' | 'unknown'
  /** Short honest note for a closed or unknown verdict; null when open. */
  note: string | null
}

function closedNote(verdict: HoursVerdict): string {
  const reason = verdict.reason ?? ''
  if (reason.includes('weekday')) return 'closed this weekday'
  if (reason.includes('observed')) return 'closed on this date'
  if (reason.includes('ends after closing')) return 'visit ends after closing'
  if (reason.includes('before opening')) return 'opens later'
  if (reason.includes('after closing')) return 'closed by your arrival'
  return 'closed for this visit'
}

/**
 * Card-facing hours: the relevant intervals for the date and the verdict for
 * this arrival and visit length. A structured-hours hit with no provable span
 * returns null ranges; the caller must not fall back to the legacy first
 * period for it.
 */
export function hoursDisplayFor(
  hit: Pick<PlaceHit, 'category' | 'hours'>,
  args: { date: string | null; arrivalMin: number | null; visitMin?: number | null },
): HoursDisplay {
  if (!hit.hours) return { ranges: null, verdict: 'unknown', note: null }
  const date = isISODate(args.date) ? args.date : null
  const intervals = intervalsForDate(hit.hours, date)
  const ranges = intervals?.map(i => ({
    open: clockOf(i.startMin),
    close: i.endMin == null ? 'open' : clockOf(i.endMin),
  })) ?? null
  if (args.arrivalMin == null || !Number.isFinite(args.arrivalMin)) {
    return { ranges, verdict: 'unknown', note: null }
  }
  const visitMin = args.visitMin != null && Number.isFinite(args.visitMin) && args.visitMin >= 0
    ? args.visitMin
    : intendedVisitMinutes(hit)
  const verdict = openingVerdict(hit.hours, date, args.arrivalMin, visitMin)
  return {
    ranges,
    verdict: verdict.state,
    note: verdict.state === 'closed' ? closedNote(verdict) : null,
  }
}

/**
 * The card text for an hours display. The verdict note renders even when no
 * interval is provable: a known closure on a closed weekday is a fact, and
 * discarding it because `ranges` is null hid a shut door. Repair of the
 * recheck P2.
 */
export function hoursCardText(
  shown: HoursDisplay,
  formatRange: (open: string, close: string) => string,
): string {
  const span = shown.ranges?.map(r => formatRange(r.open, r.close)).join(' · ') ?? ''
  const note = shown.note ? `(${shown.note})` : ''
  return [span, note].filter(Boolean).join(' · ')
}

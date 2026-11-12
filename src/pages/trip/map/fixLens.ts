// ============ Fix lens: propose, apply and verify one warning's fixes ============
// This module is pure. It builds change sets for one engine warning, applies
// each set to a copy of the trip, and runs the real engine on the result.
// Rules it keeps:
//  - The input trip is never mutated. Every apply returns a new trip.
//  - A set that cannot apply, or an engine throw, is a `failed` check.
//  - A fix that does not clear its target is never offered.
//  - A change names stops by id. It never carries a place.
// It has no UI, no writer call, no store read and no cross-day change.
import {
  collectWarnings, getAssumptions, groupWarnings, hmToMinutes, originOf, simulateDay,
} from '../../../lib/engine'
import type { DaySchedule, LegEstimate } from '../../../lib/engine'
import { fixIsOffered, isPlaceFree } from '../../../lib/mapLensContracts'
import type {
  FixChange, FixChangeSet, FixTarget, FixVerification, FixWarningRef,
} from '../../../lib/mapLensContracts'
import type { ItineraryDay, ItineraryStop, Trip } from '../../../data/types'
import { warningSubjectStop } from './warningSubject'

/** One row of copy for the Fix panel. The panel renders these strings. */
export interface FixSummary {
  title: string
  change: string
  result: string
}

/** Render each stored "HH:MM" clock in one Fix text through the reader's clock. */
export function formatFixEvidence(text: string, clock: (hm: string) => string): string {
  return text.replace(/\b\d{1,2}:\d{2}\b/g, hm => clock(hm))
}

/** The place word for a stop title. "Check in · Spice Village" reads "check in". */
function placeWord(title: string, fallback: string): string {
  if (/check\s*in/i.test(title)) return 'check in'
  const clean = title.replace(/^Check in\s*·\s*/i, '').trim()
  const first = clean.split(/\s*·\s*/)[0].trim()
  return first === '' ? fallback : first.toLowerCase()
}

/** The reader-facing name of a stop. A boat keeps its place name in full. */
function displayName(title: string): string {
  const clean = title.replace(/^Check in\s*·\s*/i, '').trim()
  return clean.split(/\s*·\s*/)[0].trim()
}

/**
 * A Fix title in place words, built from the stops on either side of the new
 * position. An engine position number says nothing to a traveller.
 */
export function fixPlaceTitle(
  change: FixChange,
  stops: readonly ItineraryStop[],
  nameOf: (stopId: string) => string,
): string | null {
  if (change.kind !== 'move' && change.kind !== 'swap') return null
  const at = stops.findIndex(stop => String(stop.id) === String(change.stopId))
  if (at < 0) return null
  const moving = placeWord(nameOf(String(change.stopId)), 'this stop')
  const boat = /boat|jetty/i.test(moving)
  const neighbourAt = change.kind === 'swap'
    ? (() => {
      const other = stops.findIndex(stop => String(stop.id) === String(change.withStopId))
      return other < 0 ? null : other
    })()
    : Number.isInteger(change.toIndex) && change.toIndex >= 0 && change.toIndex < stops.length
      ? change.toIndex
      : null
  const neighbour = neighbourAt == null ? null : stops[neighbourAt]
  if (neighbour == null) return null
  const before = change.kind === 'swap' ? (neighbourAt ?? at) > at : change.toIndex < at
  const neighbourTitle = nameOf(String(neighbour.id))
  if (boat && /check\s*in/i.test(neighbourTitle)) {
    return before ? 'Go to the jetty first, check in after' : 'Go to the boat after check-in'
  }
  const isJettyMove = boat && change.kind === 'move' && change.toIndex === 0
  const lead = isJettyMove ? 'Go to the jetty' : boat ? 'Go to the boat' : `Go to ${moving}`
  const otherName = /check\s*in/i.test(neighbourTitle) ? 'check-in' : displayName(neighbourTitle)
  return before ? `${lead} before the ${otherName}` : `${lead} after the ${otherName}`
}

/** A warning ref plus the day it belongs to. The day is needed to match a stop. */
interface DayRef {
  dayIndex: number
  key: string
  ref: FixWarningRef
}

/** Minutes of a clock string, or null when the string is not a real clock. */
function clockMin(value: string | undefined | null): number | null {
  if (!value) return null
  const min = hmToMinutes(value)
  return Number.isFinite(min) ? min : null
}

/** The "HH:MM" clock for a minute count. The caller checks the range first. */
function clockOf(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** applyFixChangeSet applies one change to a copy of the day. */
function applyChange(day: ItineraryDay, change: FixChange): ItineraryDay | null {
  const stops = day.stops
  switch (change.kind) {
    case 'move': {
      const from = stops.findIndex(stop => stop.id === change.stopId)
      if (from < 0) return null
      if (!Number.isInteger(change.toIndex) || change.toIndex < 0 || change.toIndex >= stops.length) return null
      const next = stops.filter((_, i) => i !== from)
      next.splice(change.toIndex, 0, stops[from])
      return { ...day, stops: next }
    }
    case 'swap': {
      const a = stops.findIndex(stop => stop.id === change.stopId)
      const b = stops.findIndex(stop => stop.id === change.withStopId)
      if (a < 0 || b < 0) return null
      const next = [...stops]
      next[a] = stops[b]
      next[b] = stops[a]
      return { ...day, stops: next }
    }
    case 'remove': {
      const at = stops.findIndex(stop => stop.id === change.stopId)
      if (at < 0) return null
      return { ...day, stops: stops.filter((_, i) => i !== at) }
    }
    case 'set-visit': {
      const at = stops.findIndex(stop => stop.id === change.stopId)
      if (at < 0) return null
      if (!Number.isFinite(change.visitMin) || change.visitMin < 0) return null
      // ItineraryStop.visitMinutes is the visit-length field (src/data/types.ts:233).
      if (typeof stops[at].visitMinutes !== 'number') return null
      const next = [...stops]
      next[at] = { ...stops[at], visitMinutes: change.visitMin }
      return { ...day, stops: next }
    }
    case 'move-commitment': {
      const needs = stops.filter(stop => String(stop.id) !== String(change.stopId))
      if (needs.length === stops.length) return null
      return { ...day, stops: needs.map((stop, i) => ({ ...stop, orderInDay: i + 1 })) }
    }
    case 'shift-start': {
      // ItineraryDay.startTime is the day-start field, "HH:MM" (src/data/types.ts:268).
      if (!Number.isInteger(change.startMin) || change.startMin < 0 || change.startMin >= 1440) return null
      return { ...day, startTime: clockOf(change.startMin) }
    }
    default:
      // A change that crossed a JSON boundary with an unknown kind never applies.
      return null
  }
}

/**
 * Apply a change set to a copy of the trip. The input trip is never touched.
 * Returns null when the day is missing, a named stop is missing, an index is
 * out of range or a field the change needs does not exist. It never guesses.
 */
export function applyFixChangeSet(trip: Trip, set: FixChangeSet): Trip | null {
  const at = trip.days.findIndex(day => day.index === set.dayIndex)
  if (at < 0) return null
  const source = trip.days[at]
  // Clone the target day and each of its stops, so no edit can reach the input.
  let day: ItineraryDay = { ...source, stops: source.stops.map(stop => ({ ...stop })) }
  let days = trip.days.map((entry, i) => (i === at ? day : entry))
  let commitments = trip.fixedCommitments.map(entry => ({ ...entry }))
  for (const change of set.changes) {
    if (change.kind === 'move-commitment') {
      if (change.fromDayIndex !== set.dayIndex || change.fromDayIndex === change.toDayIndex) return null
      const to = days.findIndex(entry => entry.index === change.toDayIndex)
      const from = days.findIndex(entry => entry.index === change.fromDayIndex)
      const linked = commitments.find(entry => String(entry.id) === String(change.commitmentId))
      if (to < 0 || from < 0 || !linked || linked.dayIndex !== change.fromDayIndex) return null
      if (String(linked.stopId ?? '') !== String(change.stopId)) return null
      if (!/^\d{1,2}:\d{2}$/.test(change.time)) return null
      const moving = day.stops.find(stop => String(stop.id) === String(change.stopId))
      if (!moving) return null
      const shortened = applyChange(day, change)
      if (!shortened) return null
      day = shortened
      const destination = days[to]
      const moved = { ...moving }
      moved.orderInDay = destination.stops.length + 1
      days = days.map((entry, i) => (i === to ? { ...entry, stops: [...entry.stops.map(stop => ({ ...stop })), moved] } : entry))
      commitments = commitments.map(entry => String(entry.id) === String(change.commitmentId)
        ? { ...entry, dayIndex: change.toDayIndex, time: change.time }
        : entry)
      continue
    }
    const next = applyChange(day, change)
    if (!next) return null
    day = next
  }
  // The engine schedules stops by orderInDay, not by array position. A
  // reorder must rewrite it, or the engine still sees the old order.
  const reorders = set.changes.some(change =>
    change.kind === 'move' || change.kind === 'swap' || change.kind === 'remove' || change.kind === 'move-commitment')
  if (reorders) {
    day = {
      ...day,
      stops: day.stops.map((stop, i) =>
        stop.orderInDay === i + 1 ? stop : { ...stop, orderInDay: i + 1 }),
    }
  }
  days = days.map((entry, i) => (i === at ? day : entry))
  return { ...trip, days, fixedCommitments: commitments }
}

/**
 * The stop a warning names. ScheduleWarning carries no stop id, so the title's
 * own words decide: "Periyar boat: closes too soon", "Conflicts with Periyar
 * boat" and "Thin buffer before Periyar boat" all name the same stop (the one
 * shared subject rule the add preview uses). It returns null when no stop or
 * more than one stop matches.
 */
function warningStopId(warning: { title: string; detail?: string | null }, day: ItineraryDay | undefined): string | null {
  if (!day) return null
  const subject = warningSubjectStop(warning, day)
  if (subject == null || subject === '') return null
  const hits = day.stops.filter(stop => stop.title === subject)
  return hits.length === 1 ? hits[0].id : null
}

/** The contract ref of one warning. `severity` is the warning's severity field. */
function toRef(warning: { code: string; severity: string; title: string; detail?: string }, day: ItineraryDay | undefined): FixWarningRef {
  return {
    code: warning.code,
    stopId: warningStopId(warning, day),
    // ScheduleWarning.severity is 'high' | 'medium' | 'low'. Only 'high' is severe.
    severe: warning.severity === 'high',
  }
}

/** Every warning of the trip, with its day. Trip-wide warnings use day -1. */
function warningRefsWithDay(trip: Trip, legCorrections?: Record<string, LegEstimate>): DayRef[] {
  const dayOf = (index: number) => trip.days.find(day => day.index === index)
  const { byDay, tripWide } = groupWarnings(collectWarnings(trip, legCorrections))
  const out: DayRef[] = []
  const push = (dayIndex: number, warning: { code: string; severity: string; title: string; detail?: string }) => {
    const ref = toRef(warning, dayOf(dayIndex))
    // The key names the day too: the same code on two days is two warnings.
    out.push({ dayIndex, key: `${dayIndex}|${ref.code}|${ref.stopId ?? ''}`, ref })
  }
  for (const [dayIndex, list] of byDay) for (const warning of list) push(dayIndex, warning)
  for (const warning of tripWide) push(-1, warning)
  return out
}

/** The warnings the engine reports for one day, as contract refs, in engine order. */
export function warningRefs(
  trip: Trip,
  dayIndex: number,
  legCorrections?: Record<string, LegEstimate>,
): FixWarningRef[] {
  return warningRefsWithDay(trip, legCorrections).filter(row => row.dayIndex === dayIndex).map(row => row.ref)
}

/** The day's length in minutes, or null when either clock is unknown. */
function dayLengthMin(sim: DaySchedule): number | null {
  const start = clockMin(sim.startsAt)
  const end = clockMin(sim.endsAt)
  if (start == null || end == null) return null
  const span = end - start
  return span >= 0 ? span : span + 1440
}

/** A failed check. It never throws, and it is never offered. */
function failedSet(set: FixChangeSet, reason: string): FixChangeSet {
  const verification: FixVerification = { kind: 'failed', reason }
  return { ...set, verification }
}

function reasonOf(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return text.length > 0 ? text : 'The engine failed without a message.'
}

/**
 * Run one change set through the real engine and fill `verification`.
 * A set that cannot apply, or an engine throw, becomes `failed` with a reason.
 * The error is caught and never rethrown.
 */
export function verifyFixSet(
  trip: Trip,
  set: FixChangeSet,
  legCorrections?: Record<string, LegEstimate>,
): FixChangeSet {
  try {
    const next = applyFixChangeSet(trip, set)
    if (!next) return failedSet(set, 'The change set does not apply to this trip.')
    const before = warningRefsWithDay(trip, legCorrections)
    const after = warningRefsWithDay(next, legCorrections)
    const beforeKeys = new Set(before.map(row => row.key))
    const introduced = after.filter(row => !beforeKeys.has(row.key)).map(row => row.ref)
    const targetRows = (rows: DayRef[]) => rows.filter(row =>
      row.ref.code === set.target.code
      && (set.target.stopId == null || String(row.ref.stopId ?? '') === String(set.target.stopId))
      && (set.target.stopId != null || row.dayIndex === set.dayIndex))
    const clearsTarget = targetRows(after).length === 0
    // W15's rule, one subject: a stop is clear only when it carries no
    // warning after the change. A fix that trades the target for a worse
    // conflict on the same stop never earns a "Clears it" line.
    const stopClear = set.target.stopId == null
      || !after.some(row => String(row.ref.stopId ?? '') === String(set.target.stopId))
    const beforeDay = trip.days.find(day => day.index === set.dayIndex)
    const afterDay = next.days.find(day => day.index === set.dayIndex)
    let deltaMin: number | null = null
    if (beforeDay && afterDay) {
      // DaySchedule.endsAt is the end-of-day clock. A day length uses both clocks.
      const beforeSim = simulateDay(beforeDay, trip, originOf(trip, set.dayIndex), set.dayIndex, legCorrections)
      const afterSim = simulateDay(afterDay, next, originOf(next, set.dayIndex), set.dayIndex, legCorrections)
      const beforeLen = dayLengthMin(beforeSim)
      const afterLen = dayLengthMin(afterSim)
      deltaMin = beforeLen == null || afterLen == null ? null : afterLen - beforeLen
    }
    const verification: FixVerification = { kind: 'verified', clearsTarget, stopClear, introduced, deltaMin }
    return { ...set, verification }
  } catch (error) {
    return failedSet(set, reasonOf(error))
  }
}

/**
 * Unverified change sets for one target, in the order the Fix panel ranks them.
 * A null stop id makes only the shift-start sets: the target names the day.
 * There is no move-to-next-day set, because the contract has no cross-day change.
 */
export function fixCandidates(trip: Trip, dayIndex: number, target: FixTarget): FixChangeSet[] {
  const day = trip.days.find(entry => entry.index === dayIndex)
  if (!day) return []
  const out: FixChangeSet[] = []
  const key = target.stopId ?? 'day'
  const add = (suffix: string, changes: FixChange[]) => {
    out.push({
      id: `${target.code}:${key}:${suffix}`,
      dayIndex,
      target,
      changes,
      verification: { kind: 'unverified' },
    })
  }
  const stopId = target.stopId
  const at = stopId == null ? -1 : day.stops.findIndex(stop => stop.id === stopId)
  const commitment = stopId == null
    ? null
    : trip.fixedCommitments.find(entry => entry.dayIndex === dayIndex && String(entry.stopId ?? '') === String(stopId)) ?? null
  // Move the booking to the next morning. The engine can prove the new day
  // only when that day exists and has its own start clock; never invent one.
  const nextDay = trip.days.find(entry => entry.index === dayIndex + 1)
  if (commitment != null && stopId != null && nextDay != null && nextDay.startTime != null && /^\d{1,2}:\d{2}$/.test(nextDay.startTime)) {
    const atMin = clockMin(nextDay.startTime)
    if (atMin != null) {
      const time = clockOf(Math.min(23 * 60 + 59, atMin + 30))
      add('move-commitment-next-day', [{
        kind: 'move-commitment',
        commitmentId: String(commitment.id),
        stopId,
        fromDayIndex: dayIndex,
        toDayIndex: nextDay.index,
        time,
      }])
    }
  }
  if (stopId != null && at >= 0) {
    // Move earlier: one set per earlier position. The engine can compute any of
    // them, so all are offered; the panel's own cap ranks them. The board's
    // "go to the jetty first" is the far end of this list.
    for (let j = at - 1; j >= 0; j--) {
      add(`move-earlier-${j}`, [{ kind: 'move', stopId, toIndex: j }])
    }
    if (at > 0) {
      add('swap-previous', [{ kind: 'swap', stopId, withStopId: day.stops[at - 1].id }])
      const previous = day.stops[at - 1]
      if (typeof previous.visitMinutes === 'number') {
        for (const cut of [15, 30]) {
          const visitMin = previous.visitMinutes - cut
          // A visit under 15 min is not a real stop. Do not invent one.
          if (visitMin < 15) continue
          add(`shorten-previous-${cut}`, [{ kind: 'set-visit', stopId: previous.id, visitMin }])
        }
      }
    }
  }
  // The day start is the stored startTime, else the engine's planning default.
  const stored = clockMin(day.startTime)
  const startMin = stored ?? clockMin(getAssumptions(trip).dayStart)
  if (startMin != null) {
    for (const shift of [30, 60]) {
      const earlier = startMin - shift
      // Never start before 05:00.
      if (earlier < 5 * 60) continue
      add(`shift-start-${shift}`, [{ kind: 'shift-start', startMin: earlier }])
    }
  }
  return out
}

/** Absolute day change for ranking. An unknown change sorts last. */
function rankDelta(set: FixChangeSet): number {
  const check = set.verification
  if (check.kind !== 'verified' || check.deltaMin == null) return Number.POSITIVE_INFINITY
  return Math.abs(check.deltaMin)
}

/** Introduced warning count for ranking. */
function rankIntroduced(set: FixChangeSet): number {
  const check = set.verification
  return check.kind === 'verified' ? check.introduced.length : Number.POSITIVE_INFINITY
}

/**
 * Every candidate, run through the real engine. Keeps only offered sets.
 * Order: fewest introduced warnings, then smallest absolute day change
 * (unknown last), then candidate order. Returns the first `cap`.
 */
export function fixesForWarning(
  trip: Trip,
  dayIndex: number,
  target: FixTarget,
  cap = 3,
  legCorrections?: Record<string, LegEstimate>,
): FixChangeSet[] {
  const verified = fixCandidates(trip, dayIndex, target).map(set => verifyFixSet(trip, set, legCorrections))
  const order = new Map(verified.map((set, i) => [set.id, i]))
  const offered = verified.filter(set => fixIsOffered(set) && isPlaceFree(set))
  offered.sort((a, b) => {
    const introduced = rankIntroduced(a) - rankIntroduced(b)
    if (introduced !== 0) return introduced
    const delta = rankDelta(a) - rankDelta(b)
    if (delta !== 0) return delta
    return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
  })
  return offered.slice(0, Math.max(0, cap))
}

/**
 * The copy for one fix row. Names come only from `nameOf` and the stop ids.
 * `clock` renders a minute count as the app's clock string.
 */
export function fixSummary(
  set: FixChangeSet,
  nameOf: (stopId: string) => string,
  clock: (min: number) => string,
  stops: readonly ItineraryStop[] = [],
): FixSummary {
  const day = `Day ${set.dayIndex + 1}`
  const titles: string[] = []
  const changes: string[] = []
  for (const change of set.changes) {
    switch (change.kind) {
      case 'move': {
        const name = nameOf(change.stopId)
        titles.push(fixPlaceTitle(change, stops, nameOf) ?? `Move ${name} to position ${change.toIndex + 1}`)
        changes.push(`${name} moves to position ${change.toIndex + 1}`)
        break
      }
      case 'swap': {
        const name = nameOf(change.stopId)
        const other = nameOf(change.withStopId)
        titles.push(fixPlaceTitle(change, stops, nameOf) ?? `Swap ${name} with ${other}`)
        changes.push(`${name} and ${other} trade places`)
        break
      }
      case 'remove': {
        const name = nameOf(change.stopId)
        titles.push(`Remove ${name}`)
        changes.push(`${name} comes off the day`)
        break
      }
      case 'set-visit': {
        const name = nameOf(change.stopId)
        titles.push(`Shorten ${name} to ${change.visitMin} min`)
        changes.push(`${name} stays ${change.visitMin} min`)
        break
      }
      case 'move-commitment': {
        const name = nameOf(change.stopId)
        const word = /boat|jetty/i.test(name) ? 'boat' : name
        titles.push(`Move the ${word} to Day ${change.toDayIndex + 1}, ${clock(clockMin(change.time) ?? 0)} sailing`)
        changes.push(`${name} moves to Day ${change.toDayIndex + 1} at ${clock(clockMin(change.time) ?? 0)}`)
        break
      }
      case 'shift-start': {
        const at = clock(change.startMin)
        titles.push(`Start the day at ${at}`)
        changes.push(`the day starts at ${at}`)
        break
      }
    }
  }
  const title = titles.length > 0 ? titles.join(' + ') : 'No change'
  const change = changes.length > 0 ? `${day}: ${changes.join(' · ')}` : `${day}: no change`
  const check = set.verification
  let result: string
  if (check.kind === 'failed') {
    result = `Could not run the check: ${check.reason}`
  } else if (check.kind === 'unverified') {
    result = 'Not checked'
  } else if (!check.clearsTarget || check.stopClear === false) {
    // The target left, but the stop still carries a new warning: it is not a
    // clear (W15's rule, shared through warningSubject).
    result = 'Does not clear it'
  } else {
    result = 'Clears it'
    if (check.deltaMin != null) {
      if (check.deltaMin === 0) result += ' · same day length'
      else result += ` · ${Math.abs(check.deltaMin)} min ${check.deltaMin < 0 ? 'shorter' : 'longer'} day`
    }
    if (check.introduced.some(warning => warning.severe)) result += ' · adds a severe warning'
  }
  return { title, change, result }
}

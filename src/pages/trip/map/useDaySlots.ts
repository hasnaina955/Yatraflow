// #420 slice 14 / #08 S3: the day's plan derivations, now a pure module.
//
// S3 moved the per-day derivation above the tabs. The old hook was active-day
// only, and `tripReadiness` re-ran `daySlots` for every day a second time. This
// module derives every day's slots exactly once, then readiness, pins and the
// shared deps from that one result. The workspace producer calls it; the Map
// reads the producer's maps. No React, no store, no provider call.
import type { Trip, ItineraryDay, TripDecision } from '../../../data/types'
import type { PlaceHit, SegmentHit } from '../../../lib/geocode'
import {
  daySlots, tripDayAttribution,
  type DayReadiness, type DaySlot, type DaySlotsDeps,
} from '../../../lib/daySlots'
import type { PlaceIdentity } from '../../../lib/placeIdentity'
import { loadDnaLog, slotPatternHint, type DnaVector } from '../../../lib/tripDna'
import { visitDateForDay } from '../../../lib/hoursContext'
import { slotPinsFor } from './railLabels'

export type DnaSlotHints = {
  meal: string | null
  fuel: string | null
  overnight: string | null
  stretch: string | null
}

export type DaySlotDepsArgs = {
  tripId: string
  pois: readonly SegmentHit[]
  anchors: readonly { lat: number; lng: number }[]
  routePolyline: readonly { lat: number; lng: number }[] | null
  transportMode: Trip['transportMode']
  travelStyle: Trip['travelStyle']
  existingNames: ReadonlySet<string>
  identity: PlaceIdentity
  altPool: readonly PlaceHit[]
  dayAttribution: Pick<ReturnType<typeof tripDayAttribution>, 'dayOfSegment' | 'daySpanKm'>
  decisions?: readonly TripDecision[]
  members: Trip['members']
  startLocationCoords: Trip['startLocationCoords']
  startDate: Trip['startDate']
  dnaVector: DnaVector
  addedIds: ReadonlySet<string>
  dismissedIds: ReadonlySet<string>
}

/**
 * The shared per-trip deps, built exactly as the old hook built them. `dayStops`
 * and the day id stay per-day, so no day inherits another day's density, id or
 * stop list.
 */
export function buildDaySlotDeps(args: DaySlotDepsArgs): Omit<DaySlotsDeps, 'dayStops'> {
  return {
    haltSegments: [...args.pois],
    anchors: [...args.anchors],
    routePolyline: args.routePolyline ? [...args.routePolyline] : null,
    transportMode: args.transportMode,
    travelStyle: args.travelStyle,
    existingNames: args.existingNames,
    identity: args.identity,
    altPool: [...args.altPool],
    decisions: args.decisions ? [...args.decisions] : undefined,
    // #841: the trip identity every slot's stable ref needs. The DAY id is
    // resolved per day below, never from the active day's array position.
    tripId: args.tripId,
    memberCount: (args.members ?? []).length,
    // #344: the slot re-scores its pool with the same extras the corridor
    // ranked by — DNA (per-trip learning + crew seeds) and the home point.
    dnaVector: args.dnaVector,
    homeCenter: args.startLocationCoords ?? null,
    addedIds: args.addedIds,
    dismissedIds: args.dismissedIds,
    dayOfSegment: args.dayAttribution.dayOfSegment,
    // P2: the rail always renders the day's grammar. The skeleton supplies the
    // parts the corridor plan did not halt for, on the day's own road-km span.
    fillSkeleton: true,
    daySpanKm: args.dayAttribution.daySpanKm,
    // Runtime hours (#887): score against the day's own calendar date.
    dayDateOf: (dayIndex: number) => visitDateForDay(args.startDate, dayIndex),
  }
}

export type DaySlotFacts = {
  daySlotDeps: Omit<DaySlotsDeps, 'dayStops'>
  slotsByDay: ReadonlyMap<number, DaySlot[]>
  readinessByDay: ReadonlyMap<number, DayReadiness>
  readinessRows: readonly DayReadiness[]
  slotPinsByDay: ReadonlyMap<number, ReturnType<typeof slotPinsFor>>
}

/**
 * Derive every day once. `daySlots` is the only slot derivation; readiness and
 * pins are counted off its result, not re-derived.
 */
export function deriveDaySlotFacts(args: DaySlotDepsArgs & { days: readonly ItineraryDay[] }): DaySlotFacts {
  const daySlotDeps = buildDaySlotDeps(args)
  const slotsByDay = new Map<number, DaySlot[]>()
  const readinessByDay = new Map<number, DayReadiness>()
  const slotPinsByDay = new Map<number, ReturnType<typeof slotPinsFor>>()
  for (const day of args.days) {
    const slots = daySlots(day.index, {
      ...daySlotDeps,
      dayStops: day.stops,
      ...(day.id ? { dayId: day.id } : {}),
    })
    const auto = slots.filter(slot => slot.auto).length
    const filled = slots.filter(slot => slot.state === 'filled').length
    slotsByDay.set(day.index, slots)
    readinessByDay.set(day.index, {
      dayIndex: day.index,
      filled,
      total: slots.length,
      auto,
      required: slots.length - auto,
    })
    slotPinsByDay.set(day.index, slotPinsFor(slots))
  }
  const readinessRows = [...readinessByDay.values()].sort((a, b) => a.dayIndex - b.dayIndex)
  return { daySlotDeps, slotsByDay, readinessByDay, readinessRows, slotPinsByDay }
}

/**
 * The log-derived hints the open part shows. `dnaTick` is a memo token; reading
 * the log is the only side effect, and it is a local read, not a provider call.
 */
export function readDnaSlotHints(dnaTick: number): DnaSlotHints {
  void dnaTick
  const log = loadDnaLog()
  return {
    meal: slotPatternHint(log, 'meal'),
    fuel: slotPatternHint(log, 'fuel'),
    overnight: slotPatternHint(log, 'overnight'),
    stretch: slotPatternHint(log, 'stretch'),
  }
}

// ============ Map v2 edit boundaries: preview before add (#905) ============
// One pure function turns "add this pick here" into the proposed journey.
// It reads the existing engine and the existing impact function. It makes no
// provider call and it has no second formula. A fact the plan cannot prove
// stays unknown. Nothing here writes to the trip.
import type { ItineraryStop, Trip } from '../../../../data/types'
import { hmToMinutes, legKey, originOf, simulateDay, type DaySchedule, type ScheduledLeg } from '../../../../lib/engine'
import { computeImpact, type ImpactResult, type LegCorrections } from '../../../../lib/impact'
import { withCandidateInserted } from '../../../../lib/netAddedMin'
import { validHM } from '../../../../lib/timefmt'

/** One leg of the road, with its direction and where its numbers came from. */
export interface PreviewLeg {
  fromTitle: string
  toTitle: string
  distanceKm: number
  durationMin: number
  /** True only when a road measurement names this exact direction. */
  measured: boolean
}

/** A later stop: its clock now and its clock after the add. */
export interface PreviewClock {
  stopId: string
  title: string
  from: string
  to: string
  /** Null when either clock is not a valid HH:MM. Zero means it does not move. */
  deltaMin: number | null
}

export interface PreviewWarning {
  code: string
  title: string
  severe: boolean
  dayIndex: number | null
}

export type PreviewUnknownReason =
  | 'day-missing'
  | 'position-unknown'
  | 'coordinates-unknown'
  | 'visit-unknown'
  | 'not-active'

export type UnknownFact = 'opening-hours' | 'admission-price'

export interface ReadyAddPreview {
  kind: 'ready'
  dayIndex: number
  stopId: string
  insertion: {
    /** Index in the day's stop array. */
    index: number
    /** Stop number the reader sees, counted from 1. */
    order: number
    total: number
    afterTitle: string | null
    beforeTitle: string | null
  }
  road: {
    legIn: PreviewLeg | null
    legOut: PreviewLeg | null
    /** The leg the new road replaces. Null when the pick lands last. */
    replaced: PreviewLeg | null
  }
  newStop: { arrive: string; depart: string }
  clocks: PreviewClock[]
  dayEnd: { from: string; to: string; deltaMin: number | null }
  warnings: { added: PreviewWarning[]; cleared: PreviewWarning[] }
  netAddedMin: number
  unknownFacts: UnknownFact[]
  impact: ImpactResult
  proposedTrip: Trip
}

export interface UnknownAddPreview {
  kind: 'unknown'
  reason: PreviewUnknownReason
}

export type AddPreview = ReadyAddPreview | UnknownAddPreview

export interface AddPreviewInput {
  trip: Trip
  dayIndex: number
  stop: ItineraryStop
  /** Index in the day's stop array. Null when the road order is not proven. */
  insertAt: number | null
  legCorrections?: LegCorrections
  /** True only when the caller holds evidence of the admission price. */
  priceEvidence?: boolean
}

type Point = { lat: number; lng: number }

function isUsablePoint(p: Point): boolean {
  return Number.isFinite(p.lat) && Number.isFinite(p.lng) && !(p.lat === 0 && p.lng === 0)
}

/** Build one leg view. A correction counts as measured only if it is not an estimate. */
function legView(
  leg: ScheduledLeg | undefined,
  from: (Point & { title?: string }) | null,
  to: (Point & { title?: string }) | null,
  corrections: LegCorrections,
): PreviewLeg | null {
  if (!leg) return null
  const fact = from && to ? corrections?.[legKey(from, to)] : undefined
  // The engine names a leg by place. The reader sees stop titles, so use those.
  return {
    fromTitle: from?.title ?? leg.fromTitle,
    toTitle: to?.title ?? leg.toTitle,
    distanceKm: leg.distanceKm,
    durationMin: leg.durationMinutes,
    measured: Boolean(fact) && fact?.estimated !== true,
  }
}

function clockDelta(from: string, to: string): number | null {
  const a = validHM(from)
  const b = validHM(to)
  return a && b ? hmToMinutes(b) - hmToMinutes(a) : null
}

function warningRef(w: ImpactResult['newWarnings'][number]): PreviewWarning {
  return { code: w.code, title: w.title, severe: w.severity === 'high', dayIndex: w.dayIndex ?? null }
}

function pointBefore(sim: DaySchedule, index: number, origin: Point): Point {
  return index > 0 ? sim.activeStops[index - 1] : origin
}

/** The proposed journey for one pick at one position, or the reason it is unknown. */
export function previewAdd(input: AddPreviewInput): AddPreview {
  const { trip, dayIndex, stop, insertAt, legCorrections } = input
  const day = trip.days.find(entry => entry.index === dayIndex)
  if (!day) return { kind: 'unknown', reason: 'day-missing' }
  if (typeof insertAt !== 'number' || !Number.isInteger(insertAt) || insertAt < 0 || insertAt > day.stops.length) {
    return { kind: 'unknown', reason: 'position-unknown' }
  }
  if (!isUsablePoint(stop)) return { kind: 'unknown', reason: 'coordinates-unknown' }
  if (typeof stop.visitMinutes !== 'number' || !Number.isFinite(stop.visitMinutes) || stop.visitMinutes < 0) {
    return { kind: 'unknown', reason: 'visit-unknown' }
  }
  const proposedDay = withCandidateInserted(day, { key: `preview:${stop.id}`, stop, insertAt })
  if (!proposedDay) return { kind: 'unknown', reason: 'position-unknown' }
  const proposedTrip: Trip = {
    ...trip,
    days: trip.days.map(entry => (entry.index === dayIndex ? proposedDay : entry)),
  }

  const baseOrigin = originOf(trip, dayIndex)
  const nextOrigin = originOf(proposedTrip, dayIndex)
  const baseSim = simulateDay(day, trip, baseOrigin, dayIndex, legCorrections)
  const nextSim = simulateDay(proposedDay, proposedTrip, nextOrigin, dayIndex, legCorrections)
  const at = nextSim.activeStops.findIndex(s => s.id === stop.id)
  if (at < 0) return { kind: 'unknown', reason: 'not-active' }

  const prev = at > 0 ? nextSim.activeStops[at - 1] : null
  const next = nextSim.activeStops[at + 1] ?? null
  const replacedTo = baseSim.activeStops[at] ?? null
  const road: ReadyAddPreview['road'] = {
    legIn: legView(nextSim.legs[at], pointBefore(nextSim, at, nextOrigin), stop, legCorrections),
    legOut: legView(nextSim.legs[at + 1], stop, next, legCorrections),
    replaced: replacedTo ? legView(baseSim.legs[at], pointBefore(baseSim, at, baseOrigin), replacedTo, legCorrections) : null,
  }

  const baseRows = new Map(baseSim.activeStops.map((s, i) => [s.id, baseSim.arrivalTimes[i]]))
  const clocks: PreviewClock[] = []
  nextSim.activeStops.forEach((s, i) => {
    if (i <= at) return
    const was = baseRows.get(s.id)
    if (was === undefined) return
    clocks.push({ stopId: s.id, title: s.title, from: was, to: nextSim.arrivalTimes[i], deltaMin: clockDelta(was, nextSim.arrivalTimes[i]) })
  })

  const impact = computeImpact(trip, proposedTrip, 'add', dayIndex, legCorrections)
  const unknownFacts: UnknownFact[] = []
  if (!stop.openTime || !stop.closeTime) unknownFacts.push('opening-hours')
  if (!input.priceEvidence) unknownFacts.push('admission-price')

  return {
    kind: 'ready',
    dayIndex,
    stopId: stop.id,
    insertion: {
      index: insertAt,
      order: at + 1,
      total: nextSim.activeStops.length,
      afterTitle: prev ? prev.title : null,
      beforeTitle: next ? next.title : null,
    },
    road,
    newStop: { arrive: nextSim.arrivalTimes[at], depart: nextSim.departures[at] },
    clocks,
    dayEnd: { from: baseSim.endsAt, to: nextSim.endsAt, deltaMin: clockDelta(baseSim.endsAt, nextSim.endsAt) },
    warnings: { added: impact.newWarnings.map(warningRef), cleared: impact.clearedWarnings.map(warningRef) },
    netAddedMin: impact.timeDeltaMin,
    unknownFacts,
    impact,
    proposedTrip,
  }
}

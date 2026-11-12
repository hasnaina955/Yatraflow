// ============ Measured-road binding (#08 R2/R3 foundation) ============
// Data only: no routing, provider, cache or React. The generation is a canonical
// serialization of every placement-relevant measured fact, so equal geometry
// gives an equal string and any changed point/leg gives a different string. It
// is not a length/first-last summary and has no delimiter or hash collision.
import type { Trip } from '../../../data/types'

export interface WriterRoadPoint {
  lat: number
  lng: number
}

export interface WriterRoadLeg {
  distanceKm: number
  durationMinutes: number
  source?: string
  geometry: readonly WriterRoadPoint[]
}

export interface WriterRoadGeometryInput {
  tripId: string
  routeKey: string
  chainPoints: readonly WriterRoadPoint[]
  legs: readonly WriterRoadLeg[]
}

export interface WriterRoadBinding {
  readonly tripId: string
  readonly routeKey: string
  readonly generation: string
}

function finitePoint(point: WriterRoadPoint): boolean {
  return Number.isFinite(point.lat) && Number.isFinite(point.lng)
}

function finiteLeg(leg: WriterRoadLeg): boolean {
  return Number.isFinite(leg.distanceKm)
    && Number.isFinite(leg.durationMinutes)
    && (leg.source === undefined || typeof leg.source === 'string')
}

/** Capture immutable bytes from caller data. Any missing/invalid fact refuses. */
export function captureWriterRoadBinding(input: WriterRoadGeometryInput): WriterRoadBinding | null {
  if (!input.tripId || !input.routeKey) return null
  if (input.chainPoints.length < 2 || input.legs.length === 0) return null
  if (!input.chainPoints.every(finitePoint)) return null
  if (!input.legs.every(finiteLeg)) return null
  if (!input.legs.every(leg => leg.geometry.length > 0 && leg.geometry.every(finitePoint))) return null
  const canonical = JSON.stringify([
    input.tripId,
    input.routeKey,
    input.chainPoints.map(point => [point.lat, point.lng]),
    input.legs.map(leg => [
      leg.distanceKm,
      leg.durationMinutes,
      leg.source ?? null,
      leg.geometry.map(point => [point.lat, point.lng]),
    ]),
  ])
  return Object.freeze({ tripId: input.tripId, routeKey: input.routeKey, generation: canonical })
}

/** Compare only the immutable captured bytes. */
export function sameWriterBinding(a: WriterRoadBinding, b: WriterRoadBinding): boolean {
  return a.tripId === b.tripId
    && a.routeKey === b.routeKey
    && a.generation === b.generation
}

/** A frozen copy for a gate record/ticket: callers cannot mutate captured bytes. */
export function copyWriterBinding(binding: WriterRoadBinding): WriterRoadBinding {
  return Object.freeze({
    tripId: binding.tripId,
    routeKey: binding.routeKey,
    generation: binding.generation,
  })
}

/** The committed trip's stop chain must still be the one the binding measured. */
export function bindingMatchesTrip(binding: WriterRoadBinding, trip: Trip | undefined, routeKey: string): boolean {
  return !!trip && trip.id === binding.tripId && routeKey === binding.routeKey
}

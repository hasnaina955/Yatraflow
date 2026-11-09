// Around the stay lens. Pure functions for base, rings, reach, windows and fit.
// This module has no UI and no schedule logic.
import type { Trip, ItineraryStop } from '../../../data/types'
import type { StayBase, StayLensRow, StayLensOutput, LensPhase } from '../../../lib/mapLensContracts'
import { DEFAULT_SPEED_KMH } from '../../../lib/providers/hits'
import { lensFit, fitCopy, type FitWindow, type LensFit } from './lensFit'

// The two reach rings: 15 min walk and 30 min drive.
export const STAY_RINGS = [{ id: 'walk-15', mode: 'walk', minutes: 15 }, { id: 'drive-30', mode: 'drive', minutes: 30 }] as const

// Assumption for an estimate, not a measured walking speed.
export const WALK_KMH_ASSUMED = 4.8
// Assumption for an estimate, not a measured road factor.
export const ROAD_FACTOR_ASSUMED = 1.3
// The same drive speed as the minute scope in minuteScope.ts.
const DRIVE_KMH = DEFAULT_SPEED_KMH

// 21:00 in minutes since midnight.
export const STAY_DAY_END_MIN = 21 * 60
// 07:00 in minutes since midnight.
export const STAY_DAY_START_MIN = 7 * 60

const EARTH_RADIUS_KM = 6371
const toRad = (deg: number): number => (deg * Math.PI) / 180

export interface StayReach {
  walkMin: number
  driveMin: number
  estimate: true
}

export interface StayWindow extends FitWindow {
  id: 'evening' | 'morning'
  label: string
}

export interface StayPick {
  letter: 'A' | 'B' | 'C'
  row: StayLensRow
  reach: StayReach
  fit: LensFit | null
  fitText: string | null
}

export type StayPicksResult =
  | { kind: 'needs-base' }
  | { kind: 'phase'; phase: LensPhase }
  | { kind: 'ready'; picks: StayPick[]; alsoCount: number }

// Great-circle distance between two lat,lng points in kilometres.
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

// ItineraryStop has no night-halt field. A missing hotel means no base.
export function resolveStayBase(trip: Pick<Trip, 'days'>, dayIndex: number): StayBase {
  const day = trip.days.find(d => d.index === dayIndex)
  if (!day) return { kind: 'missing' }
  let base: ItineraryStop | undefined
  for (const stop of day.stops) {
    if (stop.category === 'hotel'
      && stop.status !== 'rejected'
      && Number.isFinite(stop.lat)
      && Number.isFinite(stop.lng)) {
      base = stop
    }
  }
  return base
    ? { kind: 'stop', stopId: base.id, dayIndex }
    : { kind: 'missing' }
}

// Straight-line kilometres for one mode and its minute ring.
export function ringRadiusKm(mode: 'walk' | 'drive', minutes: number): number {
  const speed = mode === 'walk' ? WALK_KMH_ASSUMED : DRIVE_KMH
  return (speed * minutes) / 60 / ROAD_FACTOR_ASSUMED
}

// A closed ring of lng,lat points at one radius from the centre.
export function ringPolygon(center: { lat: number; lng: number }, radiusKm: number, steps = 64): [number, number][] {
  const angular = radiusKm / EARTH_RADIUS_KM
  const lat0 = toRad(center.lat)
  const lng0 = toRad(center.lng)
  const points: [number, number][] = []
  for (let i = 0; i < steps; i += 1) {
    const bearing = (i / steps) * 2 * Math.PI
    const sinLat = Math.sin(lat0) * Math.cos(angular)
      + Math.cos(lat0) * Math.sin(angular) * Math.cos(bearing)
    const lat = Math.asin(Math.min(1, Math.max(-1, sinLat)))
    const lng = lng0 + Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(lat0),
      Math.cos(angular) - Math.sin(lat0) * Math.sin(lat),
    )
    points.push([(lng * 180) / Math.PI, (lat * 180) / Math.PI])
  }
  points.push(points[0])
  return points
}

// Walk and drive minutes from the road distance estimate, rounded up.
export function stayReach(base: { lat: number; lng: number }, place: { lat: number; lng: number }): StayReach {
  const roadKm = haversineKm(base, place) * ROAD_FACTOR_ASSUMED
  const walkMin = Math.ceil((roadKm / WALK_KMH_ASSUMED) * 60)
  const driveMin = Math.ceil((roadKm / DRIVE_KMH) * 60)
  return { walkMin, driveMin, estimate: true }
}

// Free evening and morning windows from the caller times.
export function stayWindows(input: {
  arriveAtBaseMin: number | null
  leaveBaseMin: number | null
}): StayWindow[] {
  const windows: StayWindow[] = []
  const { arriveAtBaseMin, leaveBaseMin } = input
  if (arriveAtBaseMin !== null
    && Number.isFinite(arriveAtBaseMin)
    && STAY_DAY_END_MIN - arriveAtBaseMin >= 30) {
    windows.push({ id: 'evening', label: 'Free evening', startMin: arriveAtBaseMin, endMin: STAY_DAY_END_MIN })
  }
  if (leaveBaseMin !== null
    && Number.isFinite(leaveBaseMin)
    && leaveBaseMin - STAY_DAY_START_MIN >= 30) {
    windows.push({ id: 'morning', label: 'Before you leave', startMin: STAY_DAY_START_MIN, endMin: leaveBaseMin })
  }
  return windows
}

// Lettered picks in input order. A null visit gives a null fit.
export function stayPicks(
  output: StayLensOutput,
  base: { lat: number; lng: number },
  window: FitWindow,
  clock: (min: number) => string,
  cap = 3,
): StayPicksResult {
  if (output.kind === 'needs-base') return { kind: 'needs-base' }
  const view = output.view
  if (view.phase !== 'ready') return { kind: 'phase', phase: view.phase }
  const letters = ['A', 'B', 'C'] as const
  const usable: StayPick[] = []
  for (const row of view.rows) {
    const hit = row.row?.hit
    // Skip a row with no finite place position.
    if (!hit || !Number.isFinite(hit.latitude) || !Number.isFinite(hit.longitude)) continue
    const reach = stayReach(base, { lat: hit.latitude, lng: hit.longitude })
    // A walk of 15 min or less uses walk minutes. Longer walks use drive minutes.
    const travel = reach.walkMin <= 15 ? reach.walkMin : reach.driveMin
    const visit = row.row.visitMin
    const fit = lensFit(window, null, travel, visit)
    const fitText = fit !== null && visit !== null
      ? fitCopy(window, fit, travel, visit, clock)
      : null
    usable.push({ letter: letters[usable.length] ?? 'C', row, reach, fit, fitText })
  }
  const picks = usable.slice(0, cap)
  return { kind: 'ready', picks, alsoCount: Math.max(0, usable.length - picks.length) }
}

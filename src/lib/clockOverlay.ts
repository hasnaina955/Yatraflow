// ============ Clock zones on the map (PLAN-DAY-PLANNER follow-up) ============
// Projects the travel clock onto the route line: the biological windows
// (breakfast / lunch / dinner) become soft circles whose RADIUS is the honest
// number — half the road the car covers while that meal's window is open —
// and the night halt becomes a marker ON the route with the evening band
// painted behind it. Pure + node-testable: geometry in, geometry out, no
// React, no MapLibre, no formatting (the view composes the copy).
//
// The mockup that sold this design lives in the session log
// (docs/PLAN-DAY-PLANNER.md §17). Rules agreed there:
//   • circles for meals ONLY — tea/stretch breaks stay panel-only;
//   • a circle means "anywhere on this road I could eat this meal and keep
//     the schedule", so radius = windowMinutes / 2 × kmPerMin;
//   • the night is a position, not an area — a marker on the line;
//   • round trips run the clock over the whole loop; km past the turnaround
//     maps onto the REVERSED outbound polyline (the return re-traces it).
import { pointAtKm } from './geo'
import {
  BREAKFAST_WINDOW, DINNER_WINDOW, LUNCH_WINDOW,
  planTravelClock, type TravelClockVerdict,
} from './ridePlan'

/** Minutes-since-midnight → "HH:MM" (clock, not a duration). */
export function clockHM(mins: number): string {
  const m = ((Math.round(mins) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** Meal windows, in minutes — DERIVED from ridePlan's anchor windows (#130
 *  made the lunch window a single 11:30–14:30 source; a hand-copied number
 *  here would be the next drift). */
export const MEAL_WINDOW_MIN = {
  breakfast: BREAKFAST_WINDOW[1] - BREAKFAST_WINDOW[0],
  lunch: LUNCH_WINDOW[1] - LUNCH_WINDOW[0],
  dinner: DINNER_WINDOW[1] - DINNER_WINDOW[0],
} as const
/** Circle radius = half the window's reach at the journey's own pace. */
export const mealRadiusKm = (kind: keyof typeof MEAL_WINDOW_MIN, kmPerMin: number): number =>
  (MEAL_WINDOW_MIN[kind] / 2) * kmPerMin

export interface ClockMealZone {
  kind: 'breakfast' | 'lunch' | 'dinner'
  lat: number
  lng: number
  /** honest radius in km (window/2 × journey speed) */
  radiusKm: number
  /** wall clock the anchor fires (minutes since midnight; dinner = the halt) */
  etaMin: number
  /** 1-based driving day this zone belongs to */
  dayNo: number
  /** km into the loop where the meal lands */
  kmIn: number
}
export interface ClockNightMark {
  lat: number
  lng: number
  etaMin: number
  dayNo: number
  kmIn: number
}
export interface ClockEveningBand {
  /** [lng, lat] samples along the route from the day's last stop to its halt */
  coords: [number, number][]
}
export interface ClockOverlay {
  zones: ClockMealZone[]
  nights: ClockNightMark[]
  bands: ClockEveningBand[]
}

/**
 * The circle radius in pixels AT ZOOM 0 for a km radius at this latitude —
 * MapLibre's meters-per-pixel is 156543.03392·cos(lat)/2^z, so px = r0·2^z.
 * Exported for the renderer and for the test that pins the math down.
 */
export function radiusPxAtZoom0(km: number, lat: number): number {
  return (km * 1000) / (156543.03392 * Math.cos((lat * Math.PI) / 180))
}

/**
 * The map overlay of the travel clock. Feed it the resolved outbound road
 * geometry and the LOOP facts (km + wheel minutes for the whole there-and-
 * back, so a round trip's later days paint on the return re-trace). null =
 * nothing to draw: no geometry, no drive, or an honest defer verdict.
 */
export function deriveClockOverlay(input: {
  /** outbound route geometry in {lat,lng}; null while OSRM hasn't resolved */
  polyline: { lat: number; lng: number }[] | null
  /** one-way road km the geometry measures */
  outboundKm: number
  /** whole-loop wheel minutes (outbound [+ return] at the journey's pace) */
  loopMin: number
  roundTrip: boolean
  dayStart?: string
  travelStyle?: string
  rainFactor?: number
}): ClockOverlay | null {
  const { polyline, outboundKm, roundTrip } = input
  if (!polyline || polyline.length < 2 || !(outboundKm > 0) || !(input.loopMin > 0)) return null
  const loopKm = roundTrip ? outboundKm * 2 : outboundKm
  const verdict: TravelClockVerdict = planTravelClock({
    totalKm: loopKm,
    driveMinutes: input.loopMin,
    dayStart: input.dayStart,
    travelStyle: input.travelStyle,
    rainFactor: input.rainFactor,
  })
  if (verdict.verdict === 'defer') return null

  const fwd = polyline
  const rev = [...polyline].reverse()
  /** loop-km → {lat,lng}: outbound maps forward, the return maps back. */
  const pointAt = (km: number): { lat: number; lng: number } | null =>
    !roundTrip || km <= outboundKm
      ? pointAtKm(fwd, km)
      : pointAtKm(rev, Math.min(km - outboundKm, outboundKm))
  /** km → screen-agnostic [lng,lat] samples along the loop. */
  const slice = (fromKm: number, toKm: number, stepKm = 12): [number, number][] => {
    const out: [number, number][] = []
    for (let k = fromKm; k <= toKm; k += stepKm) {
      const p = pointAt(k)
      if (p) out.push([p.lng, p.lat])
    }
    const e = pointAt(toKm)
    if (e) out.push([e.lng, e.lat])
    return out
  }

  const zones: ClockMealZone[] = []
  const nights: ClockNightMark[] = []
  const bands: ClockEveningBand[] = []

  if (verdict.verdict === 'hop') {
    // A late start: one short hop to a night halt, nothing else is honest.
    const p = pointAt(verdict.hopKm)
    if (p) nights.push({ ...p, etaMin: verdict.nightHaltEtaMin, dayNo: 1, kmIn: verdict.hopKm })
    return { zones, nights, bands: [] }
  }

  for (const d of verdict.days) {
    const kmDriven = d.kmCovered - d.startKm
    if (d.wheelMin <= 0 || kmDriven <= 0) continue
    const kmPerMin = kmDriven / d.wheelMin
    const dayNo = d.dayIndex + 1
    for (const a of d.anchors) {
      if (a.name === 'tea') continue // agreed with the user: no tea circles
      const p = pointAt(a.km)
      if (!p) continue
      zones.push({
        kind: a.name, lat: p.lat, lng: p.lng,
        radiusKm: mealRadiusKm(a.name, kmPerMin),
        etaMin: a.etaMin, dayNo, kmIn: Math.round(a.km),
      })
    }
    if (d.nightHaltKm != null && d.nightHaltEtaMin != null) {
      const p = pointAt(d.nightHaltKm)
      if (p) {
        nights.push({ ...p, etaMin: d.nightHaltEtaMin, dayNo, kmIn: Math.round(d.nightHaltKm) })
        // dinner is the halt's meal — a zone centred on the stop
        zones.push({
          kind: 'dinner', lat: p.lat, lng: p.lng,
          radiusKm: mealRadiusKm('dinner', kmPerMin),
          etaMin: d.nightHaltEtaMin, dayNo, kmIn: Math.round(d.nightHaltKm),
        })
        // the evening band: the last ~100 km of road into the halt (mockup-approved)
        const from = Math.max(d.startKm, d.nightHaltKm - 100)
        const coords = slice(from, d.nightHaltKm)
        if (coords.length >= 2) bands.push({ coords })
      }
    }
  }
  return { zones, nights, bands }
}

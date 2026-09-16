// ============ Clock milestone markers on the trip road (requested redesign) ============
// Replaces soft circles / evening band / moon glyphs with plain road pins that
// show time on the side ("08:00 PM") plus distance ("Km 500"), so travellers see
// time and distance together, not a fuzzy area. Pure + node-testable: geometry
// in, pins out, no React, no MapLibre, no formatting (the view composes copy).
//
// The clock walk's planned anchors become milestone pins on the road:
//   · breakfast / lunch  → mealtime milestone
//   · dinner / overnight → overnight milestone
//   · final destination   → destination milestone
// The toggle keeps working: when off, no markers. The suggestion engine's placed
// places also become distance-only milestones on the same road, so the map shows
// the planned schedule (clock anchors) and the placed stops (distance markers)
// together.
//
// Geometry rule: a milestone lands at the road position for its road-km (on the
// outbound; on a round trip the return re-traces the same polyline). The time is
// the clock's planned wall-time for that anchor; the km is the road-km from the
// trip origin to that point.
import { pointAtKm } from './geo'
import { planTravelClock } from './ridePlan'

/** Minutes-since-midnight → "HH:MM" (wall clock, not a duration). */
export function clockHM(mins: number): string {
  const m = ((Math.round(mins) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** A planned-clock milestone pin on the road. */
export interface ClockMilestone {
  /** road km from trip origin (loop-km for round trips) */
  kmIn: number
  /** {lat,lng} on the road at that kmIn */
  lat: number
  lng: number
  /** 1-based driving day */
  dayNo: number
  /** wall clock the milestone fires (minutes since midnight) */
  etaMin: number
  /** map-side label: "HH:MM" */
  timeLabel: string
  /** map-side label: "Km N" */
  kmLabel: string
  /** semantic kind (for pin styling / tooltip detail) */
  kind: 'mealtime' | 'overnight' | 'destination'
}


/**
 * A milestone's position on the road: km → {lat,lng}. Outbound maps forward;
 * on a round trip the return re-traces the same polyline backwards.
 */
function pointAtKmOnRoad(
  geo: { lat: number; lng: number }[],
  km: number,
  outboundKm: number,
  roundTrip: boolean,
): { lat: number; lng: number } | null {
  if (geo.length < 2 || !(outboundKm > 0)) return null
  if (!roundTrip || km <= outboundKm) return pointAtKm(geo, km)
  return pointAtKm([...geo].reverse(), Math.min(km - outboundKm, outboundKm))
}

/**
 * The clock walk turned into road milestones. Feed it the resolved outbound
 * road geometry and the loop facts (km + wheel minutes for the whole there-and-
 * back, so a round trip's later days pin on the return re-trace). Empty means
 * nothing to pin: no geometry, no drive, or an honest defer verdict.
 */
export function deriveClockMilestones(input: {
  /** outbound road geometry in {lat,lng}; null while OSRM hasn't resolved */
  polyline: { lat: number; lng: number }[] | null
  /** one-way road km the geometry measures */
  outboundKm: number
  /** whole-loop wheel minutes (outbound [+ return] at the journey's pace) */
  loopMin: number
  roundTrip: boolean
  dayStart?: string
  travelStyle?: string
  rainFactor?: number
}): ClockMilestone[] {
  const { polyline, outboundKm, roundTrip } = input
  if (!polyline || polyline.length < 2 || !(outboundKm > 0) || !(input.loopMin > 0)) return []
  const loopKm = roundTrip ? outboundKm * 2 : outboundKm
  const verdict = planTravelClock({
    totalKm: loopKm,
    driveMinutes: input.loopMin,
    dayStart: input.dayStart,
    travelStyle: input.travelStyle,
    rainFactor: input.rainFactor,
  })
  if (verdict.verdict === 'defer') return []

  const pointAt = (km: number) => pointAtKmOnRoad(polyline, km, outboundKm, roundTrip)
  const milestones: ClockMilestone[] = []

  if (verdict.verdict === 'hop') {
    // A late start: one short hop to a night halt, nothing else is honest.
    const p = pointAt(verdict.hopKm)
    if (p) milestones.push({
      kmIn: Math.round(verdict.hopKm),
      lat: p.lat, lng: p.lng,
      etaMin: verdict.nightHaltEtaMin,
      dayNo: 1,
      timeLabel: clockHM(verdict.nightHaltEtaMin),
      kmLabel: `Km ${Math.round(verdict.hopKm)}`,
      kind: 'overnight',
    })
    return milestones
  }

  for (const d of verdict.days) {
    const dayNo = d.dayIndex + 1
    for (const a of d.anchors) {
      if (a.name === 'tea') continue // no tea markers, per the agreed design
      const p = pointAt(a.km)
      if (!p) continue
      milestones.push({
        kmIn: Math.round(a.km),
        lat: p.lat, lng: p.lng,
        etaMin: a.etaMin,
        dayNo,
        timeLabel: clockHM(a.etaMin),
        kmLabel: `Km ${Math.round(a.km)}`,
        kind: 'mealtime',
      })
    }
    if (d.nightHaltKm != null && d.nightHaltEtaMin != null) {
      const p = pointAt(d.nightHaltKm)
      if (p) milestones.push({
        kmIn: Math.round(d.nightHaltKm),
        lat: p.lat, lng: p.lng,
        etaMin: d.nightHaltEtaMin,
        dayNo,
        timeLabel: clockHM(d.nightHaltEtaMin),
        kmLabel: `Km ${Math.round(d.nightHaltKm)}`,
        kind: 'overnight',
      })
    }
    // arrivalEtaMin is set only on the final day (see TravelClockDay), so a
    // non-null value IS the destination pin.
    if (d.arrivalEtaMin != null) {
      const p = pointAt(d.kmCovered)
      if (p) milestones.push({
        kmIn: Math.round(d.kmCovered),
        lat: p.lat, lng: p.lng,
        etaMin: d.arrivalEtaMin,
        dayNo,
        timeLabel: clockHM(d.arrivalEtaMin),
        kmLabel: `Km ${Math.round(d.kmCovered)}`,
        kind: 'destination',
      })
    }
  }
  return milestones
}

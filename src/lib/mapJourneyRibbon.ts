import { legKey, type Journey, type JourneyPoint, type LegEstimate } from './engine'
import { haversineKm, pointAtKm } from './geo'

export interface RibbonStop {
  point: JourneyPoint
  arrive: number
  depart: number
}

function clockMinutes(clock: string): number {
  const [hours, minutes] = clock.split(':').map(Number)
  return hours * 60 + minutes
}

/** Keep midnight crossings on one continuous clock, using the engine's times. */
export function ribbonStops(journey: Journey): RibbonStop[] {
  let previous = clockMinutes(journey.startTime)
  return journey.points.map(point => {
    let arrive = clockMinutes(point.arrive)
    while (arrive < previous) arrive += 1440
    let depart = clockMinutes(point.depart)
    while (depart < arrive) depart += 1440
    previous = depart
    return { point, arrive, depart }
  })
}

export type RibbonPosition = {
  coordinate: { lat: number; lng: number }
  label: string
  grade: 'stop' | 'road' | 'estimated'
}

/** Only a corrected road geometry can place the clock between stops. */
export function ribbonPosition(
  stops: RibbonStop[], minute: number, corrections?: Record<string, LegEstimate>,
): RibbonPosition | null {
  if (!stops.length || !Number.isFinite(minute)) return null
  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i]
    const next = stops[i + 1]
    if (minute <= stop.depart || !next) {
      return { coordinate: { lat: stop.point.lat, lng: stop.point.lng }, label: stop.point.title, grade: 'stop' }
    }
    if (minute < next.arrive) {
      const leg = corrections?.[legKey(stop.point, next.point)]
      const geometry = leg?.kind !== 'air' && !leg?.estimated ? leg?.geometry : undefined
      if (geometry && geometry.length > 1) {
        const line = geometry.map(([lng, lat]) => ({ lat, lng }))
        let km = 0
        for (let p = 1; p < line.length; p++) km += haversineKm(line[p - 1].lat, line[p - 1].lng, line[p].lat, line[p].lng)
        const fraction = (minute - stop.depart) / (next.arrive - stop.depart)
        const point = pointAtKm(line, km * fraction)
        if (point) return { coordinate: point, label: `To ${next.point.title}`, grade: 'road' }
      }
      return {
        coordinate: { lat: stop.point.lat, lng: stop.point.lng },
        label: `To ${next.point.title}`, grade: 'estimated',
      }
    }
  }
  return null
}

// ---- Interaction helpers (ticket 06) ---------------------------------------
// These are called by MapJourneyRibbon. They stay pure so the ribbon's scrub,
// keyboard and reset behavior can be proven in the node-only test seam.

/** Absolute journey-minute bounds. ribbonStops already carries midnight-crossed,
 *  continuous minutes, so these bounds stay absolute past 1440. */
export interface RibbonRange { start: number; end: number }

export function ribbonRange(stops: RibbonStop[]): RibbonRange {
  const start = stops[0]?.arrive ?? 0
  const end = Math.max(start + 1, stops[stops.length - 1]?.depart ?? start + 1)
  return { start, end }
}

/** Clamp a raw range value to the absolute journey-minute bounds. An invalid
 *  clock falls back to the start, never to a fabricated minute. */
export function clampRibbonMinute(range: RibbonRange, minute: number): number {
  if (!Number.isFinite(minute)) return range.start
  return Math.max(range.start, Math.min(range.end, minute))
}

/** Identity of one day's clock. Include the day index and the engine start
 *  clock, not only the stop times, so a new trip or a new day cannot reuse a
 *  stored minute from an earlier journey. */
export function ribbonSignature(stops: RibbonStop[], dayIndex: number, startTime: string): string {
  return `d${dayIndex}:${startTime}:` + stops.map(stop => `${stop.point.stop.id}:${stop.arrive}:${stop.depart}`).join('|')
}

/** Effective minute for the current journey. A different signature resets to
 *  the start and discards a stored minute from a previous trip/day. */
export function ribbonResetMinute(
  range: RibbonRange, signature: string, stored: { signature: string; minute: number },
): number {
  return stored.signature === signature ? clampRibbonMinute(range, stored.minute) : range.start
}

/** Keyboard scrub step, in journey minutes. */
export const RIBBON_KEY_STEP_MINUTES = 5

/** Next absolute minute for a keyboard key, or null when the key is not a
 *  scrub key. Arrow keys move by a fixed five minutes; Home and End jump to
 *  the bounds. The result is always clamped to the absolute journey range. */
export function ribbonKeyMinute(range: RibbonRange, minute: number, key: string): number | null {
  const current = clampRibbonMinute(range, minute)
  switch (key) {
    case 'ArrowRight':
    case 'ArrowUp': return clampRibbonMinute(range, current + RIBBON_KEY_STEP_MINUTES)
    case 'ArrowLeft':
    case 'ArrowDown': return clampRibbonMinute(range, current - RIBBON_KEY_STEP_MINUTES)
    case 'Home': return range.start
    case 'End': return range.end
    default: return null
  }
}

export interface RibbonScrubOutcome {
  /** Clamped absolute journey minute. */
  minute: number
  /** Honest position for that minute. An unmeasured leg stays at the real stop
   *  anchor with grade 'estimated' - never a fabricated on-road point. */
  position: RibbonPosition | null
  /** Only measured geometry (a real stop or a corrected road) may reveal the
   *  camera. An estimated leg keeps the map cursor honest: no fake camera. */
  cameraReveal: boolean
}

/** One scrub step shared by the range input and the keyboard handler. */
export function ribbonScrub(
  stops: RibbonStop[], minute: number,
  corrections?: Record<string, LegEstimate>, range?: RibbonRange,
): RibbonScrubOutcome {
  const r = range ?? ribbonRange(stops)
  const clamped = clampRibbonMinute(r, minute)
  const position = ribbonPosition(stops, clamped, corrections)
  return { minute: clamped, position, cameraReveal: position != null && position.grade !== 'estimated' }
}

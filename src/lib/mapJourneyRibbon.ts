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

// ---- Preview re-timing (W7-E) ----------------------------------------------

/** The add preview facts the ribbon shows. It reads nothing it cannot prove. */
export interface RibbonPreview {
  newStop: { arrive: string; depart: string }
  clocks: Array<{ stopId: string; to: string }>
}

/** A HH:MM clock as minutes, or null when the text is not a clock. */
export function ribbonClockMinutes(text: string): number | null {
  const [hours, minutes] = text.split(':').map(Number)
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : null
}

/** Move the stops the preview re-times. A moved stop keeps its dwell time. */
export function retimedStops(stops: RibbonStop[], preview: RibbonPreview): RibbonStop[] {
  const byStop = new Map<string, string>(preview.clocks.map(clock => [clock.stopId, clock.to] as [string, string]))
  let previous = stops[0]?.arrive ?? 0
  return stops.map(stop => {
    const text = byStop.get(stop.point.stop.id)
    const arrival = text == null ? null : ribbonClockMinutes(text)
    if (arrival == null) {
      previous = stop.depart
      return stop
    }
    let arrive = arrival
    while (arrive < previous) arrive += 1440
    const moved = { point: stop.point, arrive, depart: arrive + Math.max(0, stop.depart - stop.arrive) }
    previous = moved.depart
    return moved
  })
}

// ---- Hour axis (W14) -------------------------------------------------------

/** The hour axis behind the journey strip. Minutes are absolute, as the stops are. */
export interface RibbonAxis {
  start: number
  end: number
  /** One tick for each odd hour inside the axis. */
  ticks: number[]
}

/** The least span the axis shows, so a short day still reads as a day. */
const RIBBON_AXIS_MIN_SPAN = 240
/** The room kept after the last known moment. */
const RIBBON_AXIS_TAIL = 30

/**
 * The axis starts on the hour before the first moment and ends half an hour
 * after the last one. Open windows count as moments, so a dinner window after
 * the last stop still has a place on the strip.
 */
export function ribbonAxis(range: RibbonRange, windows: ReadonlyArray<{ startMin: number; endMin: number }> = []): RibbonAxis {
  const starts = [range.start, ...windows.map(window => window.startMin)].filter(Number.isFinite)
  const ends = [range.end, ...windows.map(window => window.endMin)].filter(Number.isFinite)
  const start = Math.floor(Math.min(...starts) / 60) * 60
  const end = Math.max(Math.max(...ends) + RIBBON_AXIS_TAIL, start + RIBBON_AXIS_MIN_SPAN)
  const ticks: number[] = []
  for (let hour = Math.floor(start / 60) + 1; hour * 60 < end; hour += 1) {
    if (hour % 2 === 1) ticks.push(hour * 60)
  }
  return { start, end, ticks }
}

/** A tick caption: "09" on a 24 h clock, "9 AM" on a 12 h clock. */
export function ribbonTickText(minute: number, format: '12h' | '24h'): string {
  const hour = Math.floor(minute / 60) % 24
  if (format === '24h') return String(hour).padStart(2, '0')
  const twelve = hour % 12 === 0 ? 12 : hour % 12
  return `${twelve} ${hour < 12 ? 'AM' : 'PM'}`
}

/** Where a minute sits on the axis, as a share from 0 to 100. */
export function ribbonPercent(axis: Pick<RibbonAxis, 'start' | 'end'>, minute: number): number {
  const span = axis.end - axis.start
  if (!(span > 0) || !Number.isFinite(minute)) return 0
  return Math.max(0, Math.min(100, ((minute - axis.start) / span) * 100))
}

/** One label's room. The input is in strip pixels and in left-to-right order. */
export interface RibbonLabelBox { key: string; center: number; width: number }

/**
 * Keep every label inside the track and drop a label that would sit on the one
 * before it. A shift moves a label back inside an edge. A dropped label is
 * hidden, never moved over a neighbour.
 */
export function ribbonLabelLayout(boxes: readonly RibbonLabelBox[], trackWidth: number, gap = 6): { hidden: string[]; shift: Record<string, number> } {
  const hidden: string[] = []
  const shift: Record<string, number> = {}
  let reach = -Infinity
  for (const box of [...boxes].sort((a, b) => a.center - b.center)) {
    const wanted = box.center - box.width / 2
    const left = Math.max(0, Math.min(wanted, trackWidth - box.width))
    if (left < reach + gap) { hidden.push(box.key); continue }
    reach = left + box.width
    if (left !== wanted) shift[box.key] = Math.round(left - wanted)
  }
  return { hidden, shift }
}

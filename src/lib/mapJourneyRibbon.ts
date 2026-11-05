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

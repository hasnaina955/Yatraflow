import { coLocates, type Journey, type JourneyPoint } from './engine'

type Position = { lat: number; lng: number }
export interface JourneyEndpointMarker {
  kind: 'start' | 'destination'
  label: string
  position: Position
}

/** Extra pins for a single day's drawn journey, never stored/editable stops.
 * Direction is needed because a destination point alone cannot identify home.
 */
export function extraJourneyMarkers(
  points: readonly JourneyPoint[],
  plottedPoints: readonly Position[],
  direction: Journey['direction'] = 'local',
): JourneyEndpointMarker[] {
  return points.flatMap((p, index) => {
    if (!p.synthesized || !((index === 0 && p.kind === 'start') ||
      (index === points.length - 1 && p.kind === 'destination'))) return []
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng) || p.lat === 0 ||
      Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180) return []
    // Reuse the engine's same-place rule: haversine distance strictly < 1 km.
    if (plottedPoints.some(stop => coLocates(p, stop))) return []
    const prefix = p.kind === 'start' ? 'Day start'
      : direction === 'return' ? 'Ride home' : 'Day destination'
    return [{
      kind: p.kind as JourneyEndpointMarker['kind'],
      label: `${prefix} — ${p.title}`,
      position: { lat: p.lat, lng: p.lng },
    }]
  })
}

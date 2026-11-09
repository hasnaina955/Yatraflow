// Lens marks for the trip map: stay reach rings, empty-part rings and pick bands.
// These functions are pure, so the map and the tests read the same rules.

/** One stay reach ring. Points are [lng, lat] pairs, as the map wants them. */
export interface StayRing {
  id: string
  label: string
  ring: [number, number][]
}

/** One ring as a GeoJSON line feature. */
export interface StayRingFeature {
  type: 'Feature'
  properties: { id: string; label: string }
  geometry: { type: 'LineString'; coordinates: [number, number][] }
}

/** The rings as one FeatureCollection, ready for a line layer. */
export interface StayRingCollection {
  type: 'FeatureCollection'
  features: StayRingFeature[]
}

/** The band a pick carries. An absent band means the pick is in scope and in budget. */
export type PickBand = 'just-past' | 'over-budget'

/** The class a pick takes for its band. An absent band adds no class. */
export function pickBandClass(band: PickBand | null | undefined): string {
  if (band === 'just-past') return 'is-just-past'
  if (band === 'over-budget') return 'is-over-budget'
  return ''
}

/** The point with the highest latitude, which is the top of the ring on screen. */
export function ringLabelPoint(ring: readonly [number, number][]): [number, number] | null {
  let top: [number, number] | null = null
  for (const point of ring) {
    if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) continue
    if (!top || point[1] > top[1]) top = point
  }
  return top
}

/** Copy a ring and repeat its first point at the end, so the line closes. */
export function closeRing(ring: readonly [number, number][]): [number, number][] {
  const points = ring.filter(point => Number.isFinite(point[0]) && Number.isFinite(point[1])).map(point => [point[0], point[1]] as [number, number])
  if (points.length === 0) return points
  const first = points[0]
  const last = points[points.length - 1]
  if (first[0] !== last[0] || first[1] !== last[1]) points.push([first[0], first[1]])
  return points
}

/** One closed LineString feature per ring, with the label kept in the properties. */
export function stayRingsGeoJson(rings: readonly StayRing[]): StayRingCollection {
  return {
    type: 'FeatureCollection',
    features: rings.map(ring => ({
      type: 'Feature' as const,
      properties: { id: ring.id, label: ring.label },
      geometry: { type: 'LineString' as const, coordinates: closeRing(ring.ring) },
    })),
  }
}

/** One closed Polygon feature per ring. A fill layer draws the lagoon tint. */
export function stayRingsFillGeoJson(rings: readonly StayRing[]) {
  return {
    type: 'FeatureCollection' as const,
    features: rings.map(ring => ({
      type: 'Feature' as const,
      properties: { id: ring.id },
      geometry: {
        type: 'Polygon' as const,
        coordinates: [closeRing(ring.ring)],
      },
    })),
  }
}

/** Bounds of one ring as [[minLng, minLat], [maxLng, maxLat]]. Null when empty. */
export function ringBounds(ring: readonly [number, number][]): [[number, number], [number, number]] | null {
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity
  for (const point of ring) {
    if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) continue
    if (point[0] < minLng) minLng = point[0]
    if (point[1] < minLat) minLat = point[1]
    if (point[0] > maxLng) maxLng = point[0]
    if (point[1] > maxLat) maxLat = point[1]
  }
  if (!Number.isFinite(minLng)) return null
  return [[minLng, minLat], [maxLng, maxLat]]
}

/** A [[west, south], [east, north]] extent, as MapLibre wants it. */
export type LngLatBounds = [[number, number], [number, number]]

/** Keep a camera fit inside a known route extent. An unknown extent stays as it is.
 *  A fit outside the route falls back to the route, so no lens change zooms out. */
export function clampBoundsWithin(
  candidate: LngLatBounds | null,
  route: LngLatBounds | null,
): LngLatBounds | null {
  if (candidate == null || route == null) return candidate
  const [[west, south], [east, north]] = candidate
  const [[routeWest, routeSouth], [routeEast, routeNorth]] = route
  const clamped: LngLatBounds = [
    [Math.max(west, routeWest), Math.max(south, routeSouth)],
    [Math.min(east, routeEast), Math.min(north, routeNorth)],
  ]
  const [[cw, cs], [ce, cn]] = clamped
  if (!Number.isFinite(cw) || !Number.isFinite(cs) || !Number.isFinite(ce) || !Number.isFinite(cn)) return route
  return cw >= ce || cs >= cn ? route : clamped
}

/** The label of the fix mark. Unknown parts stay out. */
export function fixMarkLabel(
  stopName: string | null,
  arriveTime: string | null,
  jettyTime: string | null,
): string | null {
  if (stopName == null) return null
  const head = arriveTime == null ? stopName : `${stopName} ${arriveTime}`
  return jettyTime == null ? head : `${head} · jetty ${jettyTime}`
}

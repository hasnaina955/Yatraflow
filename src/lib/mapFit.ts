// ============ Map fit bounds (pure) ============
// The viewport must frame what the map DRAWS, not just where the stop pins
// stand. A day's journey carries a synthesized origin (where yesterday ended)
// that is drawn as an endpoint flag AND as the road line's far end, and a
// round trip's home pin sits beyond the last stop — none of those are stops.
// Fitting stop bounds alone glued the camera to a stop cluster at maxZoom
// while the route ran off-screen: the reported case is Day 2 of the sample
// Rajasthan trip, two pins inside Jodhpur framed at zoom 12 while 280 km of
// drawn road to Jaipur sat16,000 px outside the canvas.
//
// Pure and node-testable: no maplibre, no DOM.

export interface LatLng {
  lat: number
  lng: number
}

/** `fitBounds` accepts `[[minLng, minLat], [maxLng, maxLat]]`. */
export type BoundsTuple = [[number, number], [number, number]]

/** Bounds of every point the current view draws (stops ∪ journey chain ∪ any
 *  extras the caller passes), or null when there is nothing to frame.
 *  Non-finite coordinates are skipped (a NaN would poison every comparison),
 *  and a near-zero span is padded by ~0.08° — MapLibre computes maxZoom from
 *  the box, and a zero-size box fits one pixel at maxZoom instead of the
 *  place. */
export function boundsOf(points: readonly LatLng[]): BoundsTuple | null {
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity
  for (const p of points) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue
    if (p.lng < minLng) minLng = p.lng
    if (p.lng > maxLng) maxLng = p.lng
    if (p.lat < minLat) minLat = p.lat
    if (p.lat > maxLat) maxLat = p.lat
  }
  if (!Number.isFinite(minLng)) return null
  if (maxLng - minLng < 1e-4) { minLng -= 0.08; maxLng += 0.08 }
  if (maxLat - minLat < 1e-4) { minLat -= 0.08; maxLat += 0.08 }
  return [[minLng, minLat], [maxLng, maxLat]]
}

// ============ Panel to map detour spur ============
// The active suggestion gets a dashed spur. It starts at the nearest point on
// the route and ends at the suggestion's pin. So the card's detour number is
// also answered on the map.
//
// This is a child overlay, not a TripMap effect. It reads the mapcn provider's
// `isLoaded`. That flag means the map loaded and its style loaded. It closes
// for a theme swap and reopens on `style.load`. TripMap's own `mapLoaded` is a
// camera latch. Its 4 s watchdog opens it on a stalled style. A style write
// behind that latch throws "Style is not done loading", and the throw unmounts
// the whole workspace.
import { useEffect } from 'react'
import { useMap } from '../mapcn/map'
import type { PlaceHit } from '../../lib/geocode'
import { hasCoords, projectOntoPolyline } from '../../lib/providers/hits'

/**
 * The slice of the MapLibre map the spur touches. Structural typing, so node
 * tests can drive it with a strict fake. The fake throws on any write while the
 * style is not loaded, the same way MapLibre does.
 */
export interface SpurMap {
  getSource(id: string): unknown
  addSource(id: string, source: unknown): void
  getLayer(id: string): unknown
  addLayer(layer: unknown): void
  removeLayer(id: string): void
  removeSource(id: string): void
}

const SPUR_SOURCE = 'yf-spur-src'
const SPUR_LAYER = 'yf-spur'

type SpurFeature = {
  type: 'Feature'
  properties: Record<string, never>
  geometry: { type: 'LineString'; coordinates: [number, number][] }
}

/**
 * Add the spur and write the active suggestion's geometry. It writes only when
 * `ready` is true. A change that arrives mid-load is dropped. The next ready
 * render applies the latest props, so nothing is lost and nothing throws.
 */
export function applyDetourSpur(
  map: SpurMap | null,
  options: {
    ready: boolean
    activeHitId: string | number | null
    nearbyPois: PlaceHit[]
    route: [number, number][]
    ink: string
  },
): void {
  if (!map || !options.ready) return
  if (!map.getSource(SPUR_SOURCE)) {
    map.addSource(SPUR_SOURCE, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })
    map.addLayer({
      id: SPUR_LAYER,
      type: 'line',
      source: SPUR_SOURCE,
      // #153: paint from the --warn token (resolved by the caller) instead of a
      // hardcoded hex that silently drifts.
      paint: { 'line-color': options.ink, 'line-width': 2, 'line-dasharray': [2, 2] },
      layout: { 'line-cap': 'round' },
    })
  }
  const hit = options.activeHitId == null ? null : options.nearbyPois.find(h => h.id === options.activeHitId)
  const route = options.route
  const features: SpurFeature[] = []
  if (hit && hasCoords(hit) && route.length > 1) {
    const pin: [number, number] = [hit.longitude, hit.latitude]
    // #158: snap with the SAME segment projection the card's detour minutes
    // use (projectOntoPolyline), not a raw nearest-vertex walk in degree space.
    const poly = route.map(([lng, lat]) => ({ lat, lng }))
    const snap = projectOntoPolyline({ latitude: pin[1], longitude: pin[0] }, poly)
    const anchor: [number, number] = snap ? snap.lngLat : route[0]
    features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [anchor, pin] } })
  }
  const src = map.getSource(SPUR_SOURCE) as { setData?: (d: unknown) => void } | undefined
  src?.setData?.({ type: 'FeatureCollection', features })
}

/**
 * Remove only the layer and source this overlay owns. A replaced style is not
 * an error: the lookups are guarded, and a throw from a swap is swallowed.
 */
export function removeDetourSpur(map: SpurMap | null): void {
  if (!map) return
  try {
    if (map.getLayer(SPUR_LAYER)) map.removeLayer(SPUR_LAYER)
    if (map.getSource(SPUR_SOURCE)) map.removeSource(SPUR_SOURCE)
  } catch { /* style swapped mid-flight */ }
}

/**
 * The spur as a map child. `isLoaded` is the only readiness input it takes, and
 * a prop change during a style swap is written on the next ready render.
 */
export function DetourSpurOverlay({ activeHitId, nearbyPois, route, ink }: {
  activeHitId: string | number | null
  nearbyPois: PlaceHit[]
  route: [number, number][]
  ink: string
}) {
  const { map, isLoaded } = useMap()
  useEffect(() => {
    applyDetourSpur(map, { ready: isLoaded, activeHitId, nearbyPois, route, ink })
  }, [map, isLoaded, activeHitId, nearbyPois, route, ink])
  useEffect(() => {
    const instance = map
    return () => removeDetourSpur(instance)
  }, [map])
  return null
}

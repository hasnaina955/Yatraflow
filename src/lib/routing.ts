// ============ Real road routing ============
// Primary source: Google Routes API (computeRoutes) for India-tuned road
// distance/time + geometry (issue #6). Free fallback: the OSRM demo server
// (no key). The app never blocks on routing — any Google failure (no key,
// quota, network) transparently drops to OSRM, and OSRM failure drops to the
// engine's haversine estimate. Provider-parity with geocode.ts facade.
import { legBetween } from './engine'
import type { EngineAssumptions, LegEstimate } from './engine'
import { googleRoute, routesEnabled, type RouteResult } from './providers/routes'
import { haversineKm } from './geo'
import type { RoadProfilePoint } from './ridePlan'

const OSRM = 'https://router.project-osrm.org/route/v1/driving'

interface OsrmRoute {
  distance: number      // metres
  duration: number      // seconds
  geometry?: { coordinates: [number, number][] } // [lng, lat]
  /** Per-coordinate segment annotations (asked for with annotations=…): entry i
   *  describes the hop from coordinate i to i+1. This is the only intra-leg
   *  terrain signal any provider here gives us (#204). */
  legs?: { annotation?: { distance?: number[]; duration?: number[] } }[]
}

/** Fetch a road route between two points. Returns null on any failure. */
async function osrmRoute(a: LatLng, b: LatLng): Promise<{ km: number; min: number; coords: [number, number][]; segments?: RoadProfilePoint[] } | null> {
  try {
    // `overview=full` + `annotations` so the leg carries per-coordinate times:
    // the Day Planner's terrain profile needs to see a ghat INSIDE a leg, which
    // a per-stop measurement cannot (#204). Same request count — wider payload.
    const url = `${OSRM}/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson&annotations=distance,duration`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const data = await res.json()
    const r: OsrmRoute | undefined = data.routes?.[0]
    if (data.code !== 'Ok' || !r) return null
    return {
      km: r.distance / 1000,
      min: r.duration / 60,
      coords: r.geometry?.coordinates ?? [],
      segments: annotationsToProfile(r.legs?.[0]?.annotation),
    }
  } catch {
    return null
  }
}

/**
 * OSRM's per-coordinate distance/duration arrays → a cumulative (km, min)
 * profile for one leg. Null when the arrays are missing, mismatched or carry
 * no usable hop, so callers fall back to the leg's own endpoints.
 */
function annotationsToProfile(ann?: { distance?: number[]; duration?: number[] }): RoadProfilePoint[] | undefined {
  const dist = ann?.distance
  const dur = ann?.duration
  if (!dist || !dur || dist.length === 0 || dist.length !== dur.length) return undefined
  const pts: RoadProfilePoint[] = [{ km: 0, min: 0 }]
  let km = 0
  let min = 0
  for (let i = 0; i < dist.length; i++) {
    const d = dist[i]
    const t = dur[i]
    if (!Number.isFinite(d) || !Number.isFinite(t) || d < 0 || t < 0) continue
    km += d / 1000
    min += t / 60
    pts.push({ km, min })
  }
  return pts.length >= 2 ? pts : undefined
}

export interface LatLng { lat: number; lng: number }

export interface RoadLeg extends LegEstimate {
  /** which provider produced this leg */
  source: 'google' | 'osrm' | 'estimate'
  /** road geometry [lng, lat][] for map drawing (empty if estimate fallback) */
  geometry: [number, number][]
  /** Per-coordinate (km, min) profile of THIS leg (#204), when the provider
   *  returned annotations — the terrain inside the leg, not just its endpoints.
   *  Absent from the Google and estimate paths, where the profile builder falls
   *  back to the leg's totals. */
  segments?: RoadProfilePoint[]
}

/**
 * Try Google Routes first when a key is configured, then OSRM, then the local
 * haversine estimate. `assumptions` only matters in the final fallback mode.
 */
async function bestRoute(a: LatLng, b: LatLng, mode: string): Promise<RoadLeg> {
  if (routesEnabled()) {
    try {
      const r: RouteResult = await googleRoute(a, b, mode)
      return {
        distanceKm: r.km,
        durationMinutes: Math.round(r.min),
        source: 'google',
        geometry: r.coords.length ? r.coords : [[a.lng, a.lat], [b.lng, b.lat]],
      }
    } catch {
      /* Google failed (quota/network/key) — fall through to OSRM */
    }
  }
  const r = await osrmRoute(a, b)
  if (r) {
    return {
      distanceKm: r.km,
      durationMinutes: Math.round(r.min),
      source: 'osrm',
      geometry: r.coords.length ? r.coords : [[a.lng, a.lat], [b.lng, b.lat]],
      ...(r.segments ? { segments: r.segments } : {}),
    }
  }
  const est = legBetween(a, b, assumptionsFromMode(mode))
  return {
    ...est,
    source: 'estimate',
    geometry: [[a.lng, a.lat], [b.lng, b.lat]],
  }
}

/**
 * Minimal EngineAssumptions for the haversine fallback. The real trip
 * assumptions are passed through roadLegBetween; this only backs the final
 * estimate fallback when no assumptions object reaches us.
 */
function assumptionsFromMode(mode: string): EngineAssumptions {
  return {
    mode,
    avgSpeedKmph: 40,
    bufferMinutesPerStop: 15,
    mealBreakMinutes: 60,
    dayStart: '08:30',
    dayEnd: '20:00',
    inrPerKm: 8,
  }
}

/**
 * Road leg between two points: Google-first, OSRM fallback, then haversine.
 * `assumptions` only matters in the haversine fallback mode.
 */
export async function roadLegBetween(
  a: LatLng,
  b: LatLng,
  assumptions: EngineAssumptions,
): Promise<RoadLeg> {
  const leg = await bestRoute(a, b, assumptions.mode)
  if (leg.source === 'estimate') {
    // re-run against the real assumptions for an accurate haversine number
    const est = legBetween(a, b, assumptions)
    return { ...est, source: 'estimate', geometry: leg.geometry }
  }
  return leg
}

/**
 * Route every consecutive pair of points. Sequential by design — provider
 * rate-limits bursts and results are cached per session anyway.
 */
export async function routePath(
  points: LatLng[],
  assumptions: EngineAssumptions,
): Promise<RoadLeg[]> {
  const legs: RoadLeg[] = []
  for (let i = 0; i < points.length - 1; i++) {
    legs.push(await roadLegBetween(points[i], points[i + 1], assumptions))
  }
  return legs
}

/**
 * Sample a road geometry ([lng, lat][]) into anchor points at ~spacingKm
 * intervals. Used to bias search queries along the actual road rather than
 * straight-line corridor anchors.
 */
export function routeGeometryToAnchors(
  geometry: [number, number][],
  spacingKm = 25,
  maxAnchors = 12,
): { lat: number; lng: number }[] {
  if (geometry.length === 0) return []
  const out: { lat: number; lng: number }[] = [{ lat: geometry[0][1], lng: geometry[0][0] }]
  let last = out[0]
  let cum = 0
  for (let i = 1; i < geometry.length; i++) {
    const pt = geometry[i]
    const d = haversineKm(last.lat, last.lng, pt[1], pt[0])
    cum += d
    if (cum >= spacingKm) {
      out.push({ lat: pt[1], lng: pt[0] })
      last = out[out.length - 1]
      cum = 0
      if (out.length >= maxAnchors) break
    }
  }
  // always include the final point if not already present
  const fin = geometry[geometry.length - 1]
  const lastPt = out[out.length - 1]
  if (lastPt.lat !== fin[1] || lastPt.lng !== fin[0]) {
    out.push({ lat: fin[1], lng: fin[0] })
  }
  return out
}

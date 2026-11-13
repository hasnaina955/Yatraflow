import type { VehicleProfile } from '../../data/types'
// ============ Provider-agnostic hit model & pure ranking logic ============
// The shared contract between the free engines (providers/free.ts) and the
// Google provider (providers/google.ts), plus the pure part of the tourist
// engine (corridor sampling, home zone, detour measure, ranking). No network
// and no env access live here — the corridor tests (tests/nearby.test.ts)
// exercise this module directly.
import { haversineKm } from '../geo'
import type { DnaVector } from '../tripDna'
import type { PlaceHours } from './hours'
import type { PlaceFamily } from './families'
import type { PlaceExposure } from '../../data/types'

/**
 * One road measurement, bound to the hit and the route context it was taken
 * under. A fact for another hit, another route or another generation must not
 * be applied; stale fields are removed by the bridge, not left to age.
 */
export interface MeasuredRoadFact {
  /** the hit this fact belongs to */
  hitId: string
  /** stable identity of the measurement origin (the pair's shared start) */
  originKey: string
  /** route fingerprint and generation of the active route when measured */
  routeFingerprint: string
  generation: number
  /** departure clock (minutes since local midnight) both legs were measured at */
  departAtMin: number
  /** measured extra driving for the complete pair — charged once */
  detourMin: number
  /** measured directed arrival leg (origin -> place) */
  arriveMin: number
}

/**
 * One Google photo reference. It holds no image bytes and no key.
 * Google rules say the author text must show with the photo.
 */
export interface PlacePhotoRef {
  /** Google resource name, for example "places/ID/photos/REF" */
  name: string
  widthPx: number | null
  heightPx: number | null
  attribution: { text: string; authorUri: string | null }
}

/** Short card facts for one place. See `PlaceHit.facts`. */
export interface PlaceFacts {
  why?: string
  kind?: string
  diet?: string
}

export interface PlaceHit {
  id: number | string
  name: string
  latitude: number
  longitude: number
  admin1?: string          // state/region (populated places)
  country?: string
  country_code?: string
  kind: 'place' | 'poi'
  description?: string     // e.g. "Waterfall in Athirapilly, India"
  thumb?: string           // small image URL (Wikipedia only)
  /** Mappls place id — present when the hit came from Mappls (coords pending) */
  eLoc?: string
  /** Google place id — present when the hit came from Google Places */
  placeId?: string
  /** which provider produced this hit (drives pick-time coord resolution + attribution) */
  source?: 'google' | 'mappls' | 'open-meteo' | 'wikipedia' | 'osm'
  /** Explicit exposure evidence supplied by an upstream user-owned payload. */
  exposure?: PlaceExposure
  /** stop category hint (e.g. from a nearby category) — used by the add flows */
  category?: string
  /** reported opening hours "HH:MM" — Google hits only, rendered as "reported" */
  openTime?: string
  closeTime?: string
  /** An explicit start inside a lens's free window, in minutes since local
   *  midnight. Only a lens writer sets it; the stop it creates keeps the clock. */
  plannedStartMin?: number
  /**
   * structured opening-hours facts (ticket 02): weekday-attributed intervals
   * (split + overnight), source basis and fetch date. The legacy open/closeTime
   * pair above stays for undated display and pre-existing consumers; verdicts
   * (open / closed / unknown for a visit) come from here when present.
   */
  hours?: PlaceHours
  /**
   * source family + subtype when classification refined the category
   * (ticket 09) — 'water' | 'nature' | 'views' | 'faith' | 'heritage' |
   * 'culture'. Undefined = generic (no evidence or a non-family category);
   * confirmed subtype facts come only from complete source rows.
   */
  family?: PlaceFamily
  subtype?: string
  /**
   * Short card facts a provider or a sample supplies. Each part is optional and
   * shows only when present: a free-stack hit carries none, and the card then
   * shows nothing. Never filled by a guess.
   *  why     — one short line on why the place fits ("breaks a 2 h ghat stretch")
   *  kind    — the kind line ("Kerala meals", "South Indian", "Kalaripayattu show")
   *  diet    — the food type ("veg and non-veg")
   */
  facts?: PlaceFacts
  /** Google rating 1–5 — present on Google hits when the mask returns it */
  rating?: number
  /** Google review count — gates the rating boost against thin samples */
  ratingCount?: number
  /**
   * Up to three Google photo references. Each has its own attribution.
   * Set only when a Google key is on. A scan never fetches the image.
   */
  photos?: PlacePhotoRef[]
  /** real road detour in km (Google routingSummaries); undefined when unknown */
  offRouteKm?: number
  /**
   * ROAD-MEASURED facts for this hit, bound to the route context they were
   * measured under (ticket 11, repaired). One record, so cost, arrival and
   * context can never drift apart: the measured extra driving is charged ONCE
   * (24 for a 60-baseline/84-via pair, never 48), the directed arrival leg is
   * the via route's origin-to-place leg, and the departure clock plus route
   * identity say when the evidence applies. A consumer must check the record
   * before use; see candidateArrival.ts. Invalid values are ignored, never
   * read as free.
   */
  measuredRoadFact?: MeasuredRoadFact
  // ---- ride-plan annotations (filled by src/lib/ridePlan.ts + providers) ----
  /** road km along the route from the journey origin (Google leg0/1000; free = coarse anchor position) */
  alongRouteKm?: number
  /** which fatigue segment this suggestion is for (stretch / meal / fuel / rest / overnight / sight) */
  haltPurpose?: HaltPurpose
  /** km from the previous planned stop/suggestion (ridePlan fills) */
  legKm?: number
  /** est. drive minutes for that leg (ridePlan fills) */
  legMinutes?: number
  /** cumulative km from journey origin (ridePlan fills) */
  cumKm?: number
  /** nearest key city to this hit (city overlay fills) */
  nearestCity?: string
  /** true for populated-place/city hits from the city overlay */
  isPopulatedPlace?: boolean
  /** OSM `population` tag when present (city ordering) */
  population?: number
  /** true for Google Search-Along-Route hits — their straight-line-to-anchor distance is
   *  meaningless (they already hug the polyline), so when offRouteKm is unknown we report
   *  "on route" rather than a bogus small number */
  fromGoogleAlongRoute?: boolean
}

/** What kind of journey break a suggestion serves. */
export type HaltPurpose = 'stretch' | 'meal' | 'fuel' | 'rest' | 'overnight' | 'sight'

/**
 * true when a hit already carries usable coordinates. BOTH coordinates must
 * be non-zero: the (0,0) placeholder is the obvious sentinel, but the live
 * incident (2026-09-14) shipped a MIXED placeholder — latitude 0 with a real
 * longitude — that the old `a !== 0 || b !== 0` logic accepted. Latitude 0
 * (680 km south of Indira Point, mid-ocean) is never a valid pick for an
 * India trip-planner, so treating it as unusable costs nothing real.
 */
/** Along-route km for any point on the current route (null off-polyline). */
export function alongRouteKmOf(
  lat: number,
  lng: number,
  routePolyline: { lat: number; lng: number }[] | null,
): { km: number; totalKm: number } | null {
  if (!routePolyline || routePolyline.length < 2) return null
  const snap = projectOntoPolyline({ latitude: lat, longitude: lng }, routePolyline)
  if (!snap) return null
  // total loop km = the polyline's own span (end-to-end of what was drawn)
  let total = 0
  for (let i = 1; i < routePolyline.length; i++) {
    total += haversineKm(routePolyline[i - 1].lat, routePolyline[i - 1].lng, routePolyline[i].lat, routePolyline[i].lng)
  }
  return { km: snap.km, totalKm: total }
}

/**
 * Directional along-route km: when the return leg is HIDDEN, a place on the
 * way back reads its distance from HOME (totalKm − km) instead of its distance
 * from the start going out — a place 30 km before the far end reads ~30 km
 * from home on the way back, not a meaningless 95% of the loop (#polylines).
 * When the return leg is shown (default), km passes through unchanged: the
 * labels read the loop exactly like the plan's loop math.
 */
export function directionalKm(km: number, totalKm: number, showReturn: boolean): number {
  if (showReturn) return km
  return Math.min(km, totalKm - km)
}

export function hasCoords(h: PlaceHit): boolean {
  return Number.isFinite(h.latitude) && Number.isFinite(h.longitude) && h.latitude !== 0 && h.longitude !== 0
}

/** Only hits the map can actually pin (Mappls pending (0,0) hits excluded). */
export function mappablePois<T extends PlaceHit>(hits: T[]): T[] {
  return hits.filter(hasCoords)
}

/** Distance in meters between a hit and the nearest route anchor. */
export function distToNearest(h: Pick<PlaceHit, 'latitude' | 'longitude'>, anchors: { lat: number; lng: number }[]): number {
  return Math.min(...anchors.map(a => haversineKm(h.latitude, h.longitude, a.lat, a.lng) * 1000))
}

/**
 * A supplied detour distance is usable only when it is a finite, non-negative
 * number of km. Missing, negative or non-finite evidence stays unknown — it is
 * never read as free.
 */
function usableDetourKm(v: number | undefined | null): number | null {
  return v != null && Number.isFinite(v) && v >= 0 ? v : null
}

/** How far a hit sits off the route corridor, in km (real road detour when known).
 *  Returns null when the detour is genuinely unknown (Google along-route hits with no
 *  computed detour) so the UI can say "on route" instead of a misleading straight-line estimate. */
export function detourKm(
  h: Pick<PlaceHit, 'latitude' | 'longitude' | 'offRouteKm' | 'fromGoogleAlongRoute'>,
  anchors: { lat: number; lng: number }[],
): number | null {
  const known = usableDetourKm(h.offRouteKm)
  if (known != null) return known
  // Supplied but invalid evidence (negative or non-finite) stays unknown.
  if (h.offRouteKm != null) return null
  // Google Search-Along-Route hits already hug the polyline, so a straight-line fallback
  // would report a misleadingly tiny "off route" distance. When the real detour is unknown,
  // return null and let the UI say "on route".
  if (h.fromGoogleAlongRoute) return null
  if (anchors.length === 0) return null
  return distToNearest(h, anchors) / 1000
}

/** Fallback door-to-door speed when the trip mode is unknown. Matches the engine default. */
export const DEFAULT_SPEED_KMH = 40

/** On the route within this perpendicular distance is treated as "on the way" (no detour). */
export const ON_ROUTE_SPUR_KM = 0.15

/**
 * Perpendicular (spur) distance from a hit to the route polyline, in km.
 * A point on or beside the road reads ~0; a point off it reads the shortest
 * distance to the road (out-and-back is handled by callers doubling it).
 * Returns null when the hit or polyline can't be used.
 */
export function spurKm(
  h: Pick<PlaceHit, 'latitude' | 'longitude'>,
  routePolyline: { lat: number; lng: number }[],
): number | null {
  if (!Number.isFinite(h.latitude) || !Number.isFinite(h.longitude)) return null
  const raw = routePolyline.filter(q => Number.isFinite(q.lat) && Number.isFinite(q.lng))
  if (raw.length < 2) return null
  const latRef = (h.latitude * Math.PI) / 180
  const kx = 111.32 * Math.cos(latRef)
  const ky = 111.32
  const px = h.longitude * kx
  const py = h.latitude * ky
  let best = Infinity
  for (let i = 0; i < raw.length - 1; i++) {
    const ax = raw[i].lng * kx
    const ay = raw[i].lat * ky
    const bx = raw[i + 1].lng * kx
    const by = raw[i + 1].lat * ky
    const dx = bx - ax
    const dy = by - ay
    const len2 = dx * dx + dy * dy
    let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0
    t = Math.min(1, Math.max(0, t))
    const cx = ax + t * dx
    const cy = ay + t * dy
    const d = Math.hypot(px - cx, py - cy)
    if (d < best) best = d
  }
  return best === Infinity ? null : best
}

/**
 * Asymmetric one-way detour: a destination ON the road is on-the-way (~0 km —
 * you pass it), a destination off the road pays a one-way spur. When no
 * polyline is available it falls back to the straight-line-to-anchor measure.
 * Supplied road evidence always wins. Returns null when the detour is unknown
 * or the supplied evidence is invalid; never returns a negative distance.
 */
export function asymmetricDetourKm(
  h: Pick<PlaceHit, 'latitude' | 'longitude' | 'offRouteKm' | 'fromGoogleAlongRoute'>,
  anchors: { lat: number; lng: number }[],
  routePolyline?: { lat: number; lng: number }[] | null,
): number | null {
  const known = usableDetourKm(h.offRouteKm)
  if (known != null) return known
  // Supplied but invalid evidence stays unknown instead of falling through to
  // a geometric guess that could read as free.
  if (h.offRouteKm != null) return null
  if (h.fromGoogleAlongRoute) return null // on the polyline, no real detour known
  if (routePolyline && routePolyline.length >= 2) {
    const spur = spurKm(h, routePolyline)
    return spur == null ? null : spur
  }
  return detourKm(h, anchors)
}

/**
 * Return-driving time in minutes at the trip's speed: the one-way detour out
 * to the place plus the drive back. An on-the-way hit costs 0; an 8 km spur at
 * 40 km/h costs 24 minutes. Unknown or invalid detours return null — never 0,
 * so a broken measurement cannot ride for free.
 */
export function asymmetricDetourMinutes(
  h: Pick<PlaceHit, 'latitude' | 'longitude' | 'offRouteKm' | 'fromGoogleAlongRoute' | 'measuredRoadFact'>,
  anchors: { lat: number; lng: number }[],
  routePolyline?: { lat: number; lng: number }[] | null,
  speedKmph?: number,
): number | null {
  const speed = speedKmph != null && Number.isFinite(speedKmph) && speedKmph > 0 ? speedKmph : DEFAULT_SPEED_KMH
  // Ticket 11 (repaired): a road-measured fact wins over every estimate. The
  // stored value is the COMPLETE extra driving (via − baseline, out-and-back
  // inherent) — charged ONCE, returned VERBATIM. Doubling it (the old
  // `×2`) manufactured 48 minutes out of a real 24 (progress review P1).
  // Invalid values are ignored — never read as free — and the estimate paths
  // apply as before. The directed arrival leg lives in the same record and is
  // consumed by candidateArrival.ts, never derived as detour/2.
  const measured = h.measuredRoadFact?.detourMin
  if (measured != null && Number.isFinite(measured) && measured >= 0) return measured
  const km = asymmetricDetourKm(h, anchors, routePolyline ?? undefined)
  if (km == null) return null
  return ((km / speed) * 60) * 2
}

/**
 * Detour in minutes at the trip's door-to-door speed. Unknown detours
 * (on-route hits) cost zero — never a straight-line guess.
 */
export function detourMinutes(
  h: Pick<PlaceHit, 'latitude' | 'longitude' | 'offRouteKm' | 'fromGoogleAlongRoute'>,
  anchors: { lat: number; lng: number }[],
  speedKmph?: number,
): number {
  const speed = speedKmph != null && Number.isFinite(speedKmph) && speedKmph > 0 ? speedKmph : DEFAULT_SPEED_KMH
  const km = detourKm(h, anchors) ?? 0
  return (km / speed) * 60
}

/** Nothing within this radius of the trip's start is ever suggested. */
export const HOME_ZONE_KM = 15

export interface RoutePolylineOpts {
  /** Full OSRM route geometry. When present, hits snap to the polyline for road-true km. */
  routePolyline?: { lat: number; lng: number }[] | null
}

/**
 * Snap a point onto a route polyline (nearest-segment projection).
 * Returns cumulative road km from the polyline origin, or null when unusable.
 * Polyline is stride-sampled to 500 points max to bound CPU on dense OSRM geometry.
 */
export function projectOntoPolyline(
  p: Pick<PlaceHit, 'latitude' | 'longitude'>,
  polyline: { lat: number; lng: number }[],
): { km: number; segIndex: number; lngLat: [number, number] } | null {
  if (!Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)) return null
  const raw = polyline.filter(q => Number.isFinite(q.lat) && Number.isFinite(q.lng))
  if (raw.length < 2) return null
  const stride = Math.max(1, Math.ceil(raw.length / 500))
  const pts: { lat: number; lng: number }[] = []
  for (let i = 0; i < raw.length; i += stride) pts.push(raw[i])
  if (pts[pts.length - 1] !== raw[raw.length - 1]) pts.push(raw[raw.length - 1])
  // cumulative road km at each polyline point
  const cum: number[] = [0]
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + haversineKm(pts[i - 1].lat, pts[i - 1].lng, pts[i].lat, pts[i].lng))
  }
  // equirectangular km projection per segment (fine at segment scale)
  const latRef = (p.latitude * Math.PI) / 180
  const kx = 111.32 * Math.cos(latRef)
  const ky = 111.32
  const px = p.longitude * kx
  const py = p.latitude * ky
  let bestKm = 0
  let bestD2 = Infinity
  let bestSeg = 0
  let bestLngLat: [number, number] = [raw[0].lng, raw[0].lat]
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i].lng * kx
    const ay = pts[i].lat * ky
    const bx = pts[i + 1].lng * kx
    const by = pts[i + 1].lat * ky
    const dx = bx - ax
    const dy = by - ay
    const len2 = dx * dx + dy * dy
    let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0
    t = Math.min(1, Math.max(0, t))
    const cx = ax + t * dx
    const cy = ay + t * dy
    const d2 = (px - cx) * (px - cx) + (py - cy) * (py - cy)
    if (d2 < bestD2) {
      bestD2 = d2
      bestSeg = i
      const segLen = Math.max(0, cum[i + 1] - cum[i])
      bestKm = cum[i] + t * segLen
      bestLngLat = [cx / kx, cy / ky]
    }
  }
  return { km: Math.max(0, bestKm), segIndex: bestSeg, lngLat: bestLngLat }
}

/**
 * Coarse along-route position of a hit (km from the journey origin).
 * Prefers the real road distance when the provider gave one (`alongRouteKm`,
 * e.g. Google's routingSummaries leg0); otherwise maps the hit onto the
 * nearest ordered corridor anchor and returns that anchor's cumulative route
 * distance (interpolated between consecutive anchors' straight-line spans).
 * Returns null when there are no usable anchors.
 */
export function kmFromStartForHit(
  h: Pick<PlaceHit, 'latitude' | 'longitude' | 'alongRouteKm'>,
  anchors: { lat: number; lng: number }[],
  opts: RoutePolylineOpts = {},
): number | null {
  if (h.alongRouteKm != null && Number.isFinite(h.alongRouteKm)) return Math.max(0, h.alongRouteKm)
  if (opts.routePolyline && opts.routePolyline.length >= 2) {
    const snap = projectOntoPolyline(h, opts.routePolyline)
    if (snap) return snap.km
  }
  const pts = anchors.filter(a => Number.isFinite(a.lat) && Number.isFinite(a.lng))
  if (pts.length === 0 || !Number.isFinite(h.latitude) || !Number.isFinite(h.longitude)) return null
  // cumulative km at each anchor (anchors sit ON the route line, so the
  // straight-line sum between consecutive ones approximates along-route travel)
  const cum: number[] = [0]
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + haversineKm(pts[i - 1].lat, pts[i - 1].lng, pts[i].lat, pts[i].lng))
  }
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < pts.length; i++) {
    const d = haversineKm(h.latitude, h.longitude, pts[i].lat, pts[i].lng)
    if (d < bestD) { bestD = d; best = i }
  }
  return cum[best]
}

/** Stable hash string for a list of anchors — used as a cache key so that
 * adding, removing, or reordering stops invalidates the suggestion cache. */
export function anchorHash(anchors: { lat: number; lng: number }[]): string {
  const pts = anchors
    .filter(a => Number.isFinite(a.lat) && Number.isFinite(a.lng))
    .map(a => `${a.lat.toFixed(5)},${a.lng.toFixed(5)}`)
  return pts.join('|')
}

/** Stable hash string for route geometry — used as a cache key so that OSRM
 * route resolution invalidates the suggestion cache when the road changes. */
export function routeHash(geometry: [number, number][] | null): string {
  if (!geometry || geometry.length === 0) return ''
  // Use a sample of the geometry (first, middle, last points) to keep the hash
  // short while still capturing significant route changes
  const samples = [0, Math.floor(geometry.length / 2), geometry.length - 1]
  const pts = samples
    .filter(i => {
      const pt = geometry[i]
      return pt && pt.length >= 2 && Number.isFinite(pt[0]) && Number.isFinite(pt[1])
    })
    .map(i => {
      const pt = geometry[i]!
      return `${pt[1].toFixed(5)},${pt[0].toFixed(5)}`
    })
  return pts.join('|')
}

export interface NearbyOpts {
  /** Reports search reach after a successful provider read. */
  onCoverage?: (coverage: DiscoveryCoverage) => void
  /** include petrol pumps as pit stops (self-drive trips only, capped) */
  includeFuel?: boolean
  /** EV drive (#144B): replace fuel cadence with charge cadence — mutually
   *  exclusive with includeFuel; segments label the stops "Charge". */
  includeCharge?: boolean
  /** Accepted night-halt pins (#143): route-km keyed by day index. The
   *  planner snaps the matching overnight segment to its pin and surfaces
   *  drift as a proposal, never a silent move. */
  haltPins?: Record<number, number> | null
  /** the trip's starting point — hits inside HOME_ZONE_KM of it are dropped */
  homeCenter?: { lat: number; lng: number } | null
  /** additive per-category score bias from itinerary gaps (computeCategoryBias) */
  categoryBias?: Record<string, number>
  /**
   * Simplified road geometry of the whole route ([lng, lat][] — OSRM format).
   * When present and a Google key is configured, the nearby search runs as one
   * Search-Along-Route request per category instead of per-anchor free calls.
   */
  routeCoords?: [number, number][] | null
  /**
   * Vehicle tank range in km — sets the fuel-stop cadence (default 450).
   * 0/undefined keep the default; only meaningful when includeFuel is true.
   */
  vehicleRangeKm?: number
  /** When set, nearby searches use purpose-specific queries instead of generic tourist queries. */
  purposes?: HaltPurpose[]
  /** Vehicle profile for accurate fuel/charging cadence. */
  vehicleProfile?: VehicleProfile
  /**
   * Spread the kept places along the road: take the best place of each
   * stretch this many km long in turn. One famous town can then not fill
   * every slot. Hits with no road position share one stretch.
   */
  spreadKm?: number
  /** Crew size — tunes the fatigue cadence (see cadenceForCrew). */
  travellers?: number
  /** Trip travel style — tunes the fatigue cadence (see cadenceForCrew). */
  travelStyle?: string
  /** Door-to-door speed for time-based detour scoring (see detourMinutes). */
  speedKmph?: number
  /** Already-planned stops — candidates near them are dropped (see filterPlannedNearby). */
  plannedStops?: PlannedStop[]
  /**
   * #704: reject when a Google search fails, instead of answering []. Only the
   * Map tab sets it, so its note can say the search failed rather than blame the route.
   */
  rejectOnFailure?: boolean
  /** "HH:MM" drive-start per day index for the journey clock (unset falls back to 08:30). */
  dayStartTimes?: string[]
  /** rain chance percent per day index for the weather join (null = no forecast). */
  dayRainPct?: (number | null)[]
  /** WMO weather code per day index — separates drizzle from cloudburst in
   *  the cap multiplier (#141). Index-aligned with dayRainPct. */
  dayWeatherCode?: (number | null)[]
  /** trip transport mode — motorcycle caps ride lower; conducted modes refuse
   *  the drive-day split entirely (#126). */
  transportMode?: string
  /** Mixed only (2026-10-19): does the traveller drive any part of the trip?
   *  Carried beside the mode because the segment planner gates the drive-day
   *  split on the wheel, and a Mixed-No trip has none. */
  drivesPart?: boolean
  /** trip preference vector — favoured categories win scoring ties. */
  dnaVector?: DnaVector
  /** Cancels an in-flight provider scan when a newer Map action supersedes it. */
  signal?: AbortSignal
}

export interface DiscoveryCoverage {
  method: 'circles' | 'route-bias'
  totalKm: number | null
  /** A lower bound for circle searches. Null means reach is not measured. */
  coveredKm: number | null
  anchorCount: number
  radiusM: number
  complete: boolean
}

/** Measures a conservative lower bound. Each counted road piece fits inside one query circle. */
export function circleCoverage(
  road: readonly { lat: number; lng: number }[] | null,
  anchors: readonly { lat: number; lng: number }[],
  radiusM: number,
): DiscoveryCoverage {
  let totalKm = 0
  let coveredKm = 0
  for (let i = 1; road && i < road.length; i++) {
    const a = road[i - 1]
    const b = road[i]
    const length = haversineKm(a.lat, a.lng, b.lat, b.lng)
    totalKm += length
    const pieces = Math.max(1, Math.ceil(length / 0.5))
    const pieceKm = length / pieces
    for (let j = 0; j < pieces; j++) {
      const f = (j + 0.5) / pieces
      const lat = a.lat + (b.lat - a.lat) * f
      const lng = a.lng + (b.lng - a.lng) * f
      if (anchors.some(p => haversineKm(lat, lng, p.lat, p.lng) + pieceKm / 2 <= radiusM / 1000)) {
        coveredKm += pieceKm
      }
    }
  }
  const hasRoad = road != null && road.length >= 2
  return {
    method: 'circles', totalKm: hasRoad ? totalKm : null,
    coveredKm: hasRoad ? Math.min(totalKm, coveredKm) : null,
    anchorCount: anchors.length, radiusM,
    complete: hasRoad && totalKm > 0 && totalKm - coveredKm < 0.001,
  }
}

/**
 * Sample anchors along the WHOLE route line (consecutive stop points) so the
 * search corridor covers every part of the drive, spaced ~`radiusM` apart and
 * capped at `maxAnchors` points. Samples inside the home zone around `start`
 * are skipped — no suggestions around where the trip begins.
 */
export function corridorAnchors(
  routePts: { lat: number; lng: number }[],
  start: { lat: number; lng: number } | null | undefined,
  radiusM: number,
  maxAnchors = 12,
): { lat: number; lng: number }[] {
  const raw = routePts.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng))
  if (raw.length === 0) return []
  // drop consecutive duplicates (< 500 m) so legs are real
  const pts = raw.filter((p, i) => i === 0 || haversineKm(p.lat, p.lng, raw[i - 1].lat, raw[i - 1].lng) > 0.5)
  // Guard C3: if all stops are within 500 m, dedupe leaves one point -> cum[1] undefined
  if (pts.length < 2) return pts
  const cum = [0]
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + haversineKm(pts[i - 1].lat, pts[i - 1].lng, pts[i].lat, pts[i].lng) * 1000)
  }
  const total = cum[cum.length - 1]
  const homeZoneM = HOME_ZONE_KM * 1000
  const radius = Math.min(Math.max(radiusM, 1000), 120000)
  const n = Math.max(2, Math.min(maxAnchors, Math.ceil(total / radius) + 1))
  const out: { lat: number; lng: number }[] = []
  const add = (p: { lat: number; lng: number }): boolean => {
    if (start && haversineKm(p.lat, p.lng, start.lat, start.lng) * 1000 < homeZoneM) return false
    if (out.some(q => haversineKm(q.lat, q.lng, p.lat, p.lng) < 1)) return false
    out.push(p)
    return true
  }
  for (let i = 0; i < n; i++) {
    const target = (total * i) / (n - 1)
    let j = 1
    while (j < cum.length - 1 && cum[j] < target) j++
    const segLen = Math.max(1e-9, cum[j] - cum[j - 1])
    const f = Math.min(1, Math.max(0, (target - cum[j - 1]) / segLen))
    add({ lat: pts[j - 1].lat + (pts[j].lat - pts[j - 1].lat) * f, lng: pts[j - 1].lng + (pts[j].lng - pts[j - 1].lng) * f })
  }
  // the destination always gets coverage — unless it sits in the home zone
  const last = pts[pts.length - 1]
  if (!out.some(q => haversineKm(q.lat, q.lng, last.lat, last.lng) < 1)) add(last)
  return out
}

/**
 * Tourist-value score. Category priority (see & do > meals > stays > pit
 * stops), notability signals (Wikipedia thumb / rich description, strong OSM
 * categories), and a distance decay across the scope — a far POI must be more
 * notable to survive, but proximity is never the whole answer.
 */
export const CATEGORY_PRIORITY: Record<string, number> = {
  sightseeing: 0, nature: 0, beach: 1, temple: 1, museum: 1, adventure: 1,
  food: 2, event: 2, travel: 2, rest: 3, hotel: 3, 'transport-hub': 4, shopping: 5,
}

/**
 * Prior for the quality average. A place with no reviews reads as 4.0.
 * Twenty reviews weigh as much as the prior.
 */
const QUALITY_PRIOR_MEAN = 4.0
const QUALITY_PRIOR_WEIGHT = 20
/** Below this many reviews a rating earns no ranking bonus. */
const MIN_REVIEWS_FOR_BONUS = 10

/**
 * Bayesian average of a Google rating. Few reviews pull the result towards the
 * prior, so five stars from three people cannot beat 4.6 from hundreds.
 * Returns null when the rating or the review count is missing or invalid.
 */
export function calibratedQuality(h: Pick<PlaceHit, 'rating' | 'ratingCount'>): number | null {
  const { rating, ratingCount } = h
  if (rating == null || !Number.isFinite(rating) || rating < 1 || rating > 5) return null
  if (ratingCount == null || !Number.isFinite(ratingCount) || ratingCount < 1) return null
  return (QUALITY_PRIOR_WEIGHT * QUALITY_PRIOR_MEAN + ratingCount * rating) / (QUALITY_PRIOR_WEIGHT + ratingCount)
}

export function poiTouristScore(
  h: PlaceHit,
  anchors: { lat: number; lng: number }[],
  radiusM: number,
  categoryBias?: Record<string, number>,
): number {
  const cat = h.category ?? 'sightseeing'
  let s = -(CATEGORY_PRIORITY[cat] ?? 2) * 8
  if (h.thumb) s += 5 // Wikipedia imagery ⇒ notable place
  if ((h.description ?? '').length > 40) s += 3
  if (cat === 'sightseeing' || cat === 'nature' || cat === 'beach' || cat === 'temple' || cat === 'museum') s += 3
  if (categoryBias && categoryBias[cat]) s += categoryBias[cat] // itinerary gaps
  // Google ratings count only from ten reviews. Above that, the bonus follows
  // the calibrated quality, grows above the prior and stops at 4, below one
  // category tier (8). Hits without a usable rating score as before.
  const quality = (h.ratingCount ?? 0) >= MIN_REVIEWS_FOR_BONUS ? calibratedQuality(h) : null
  if (quality != null) s += Math.min(4, Math.max(0, (quality - QUALITY_PRIOR_MEAN) * 8))
  const frac = Math.min(1, distToNearest(h, anchors) / Math.max(1, radiusM))
  s -= frac * 6
  return s
}

export function normWords(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(Boolean)
}

const STOP_WORDS = new Set(['the', 'and', 'of', 'at', 'near', 'point'])

function meaningfulWords(s: string): Set<string> {
  return new Set(normWords(s).filter(w => w.length >= 4 && !STOP_WORDS.has(w)))
}

/** True when two hits are the same place: close together with overlapping names. */
export function samePlace(
  a: Pick<PlaceHit, 'latitude' | 'longitude' | 'name'>,
  b: Pick<PlaceHit, 'latitude' | 'longitude' | 'name'>,
): boolean {
  if (!a.name || !b.name) return false
  if (!Number.isFinite(a.latitude) || !Number.isFinite(a.longitude)) return false
  if (!Number.isFinite(b.latitude) || !Number.isFinite(b.longitude)) return false
  if (haversineKm(a.latitude, a.longitude, b.latitude, b.longitude) > 0.5) return false
  const aw = meaningfulWords(a.name)
  const bw = meaningfulWords(b.name)
  if (aw.size === 0 || bw.size === 0) {
    return a.name.toLowerCase().includes(b.name.toLowerCase()) || b.name.toLowerCase().includes(a.name.toLowerCase())
  }
  for (const w of aw) if (bw.has(w)) return true
  return false
}

/** Collapse near-duplicate candidates, keeping the first of each group. */
export function dedupeCandidates<T extends Pick<PlaceHit, 'latitude' | 'longitude' | 'name'>>(list: T[]): T[] {
  const out: T[] = []
  for (const h of list) {
    if (out.some(k => samePlace(k, h))) continue
    out.push(h)
  }
  return out
}

interface PlannedStop {
  lat: number
  lng: number
  name?: string
}

/** Drop candidates already covered by the itinerary: within 2 km of a planned stop, or a fuzzy name match. */
export function filterPlannedNearby<T extends Pick<PlaceHit, 'latitude' | 'longitude' | 'name'>>(
  candidates: T[],
  planned: PlannedStop[],
  radiusKm = 2,
): T[] {
  const pts = planned.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng))
  if (pts.length === 0) return candidates
  return candidates.filter(h => {
    if (!Number.isFinite(h.latitude) || !Number.isFinite(h.longitude)) return true
    for (const p of pts) {
      if (haversineKm(h.latitude, h.longitude, p.lat, p.lng) <= radiusKm) return false
      if (p.name && h.name) {
        const hn = h.name.toLowerCase()
        const pn = p.name.toLowerCase()
        if (hn.length >= 5 && pn.length >= 5 && (hn.includes(pn) || pn.includes(hn))) return false
      }
    }
    return true
  })
}

/** Stable React key for a nearby hit: the coordinates the quick-stop builder
 *  consumes, plus the name. Same-named POIs (fuel stations especially) are the
 *  normal case, so name alone gives two chips one identity and React can swap
 *  which hit a tap adds (#564). */
export function nearbyHitKey(h: Pick<PlaceHit, 'latitude' | 'longitude' | 'name'>): string {
  return `${h.latitude},${h.longitude},${h.name}`
}

/** The length of one road stretch when picks spread along a drive. */
export const ROUTE_STRETCH_KM = 60

/** How many corridor picks a drive keeps: 16 up to 200 km, then 16 for each
 *  200 km, up to 32. An unknown length keeps 16. */
export function corridorPickCount(routeKm: number | null | undefined): number {
  if (routeKm == null || !Number.isFinite(routeKm) || routeKm <= 0) return 16
  return Math.min(32, Math.max(16, Math.round((routeKm / 200) * 16)))
}

/** The length of a [lng, lat] line in km. */
export function polylineKm(coords: readonly [number, number][] | null | undefined): number | null {
  if (!coords || coords.length < 2) return null
  let km = 0
  for (let i = 1; i < coords.length; i++) km += haversineKm(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0])
  return Number.isFinite(km) ? km : null
}

/** Interleave hits by road stretch: the best of each stretch, then the
 *  second best of each, and so on. The input is in score order. */
export function spreadByStretch<T extends Pick<PlaceHit, 'alongRouteKm'>>(hits: readonly T[], stretchKm: number): T[] {
  const buckets = new Map<number, T[]>()
  for (const h of hits) {
    const km = h.alongRouteKm
    const key = km != null && Number.isFinite(km) ? Math.floor(Math.max(0, km) / stretchKm) : -1
    const list = buckets.get(key)
    if (list) list.push(h)
    else buckets.set(key, [h])
  }
  const lists = [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(entry => entry[1])
  const out: T[] = []
  for (let round = 0; out.length < hits.length; round++) {
    for (const list of lists) if (round < list.length) out.push(list[round])
  }
  return out
}

/**
 * Shared tail of every nearby search: drop hits in the home zone around the
 * trip's start, rank by tourist value (+ itinerary-gap bias), then greedy-pick
 * with a per-category cap so the list stays varied (fuel capped harder).
 */
export function rankAndCap(
  hits: PlaceHit[],
  anchors: { lat: number; lng: number }[],
  radiusM: number,
  count: number,
  opts: NearbyOpts = {},
): PlaceHit[] {
  // never suggest anything in the home zone around the trip's start
  const home = opts.homeCenter
  const homeFiltered = home
    ? hits.filter(h => haversineKm(h.latitude, h.longitude, home.lat, home.lng) * 1000 >= HOME_ZONE_KM * 1000)
    : hits
  homeFiltered.sort((a, b) =>
    poiTouristScore(b, anchors, radiusM, opts.categoryBias) - poiTouristScore(a, anchors, radiusM, opts.categoryBias))
  const deduped = dedupeCandidates(homeFiltered)
  const spread = opts.spreadKm != null && opts.spreadKm > 0
  const order = spread ? spreadByStretch(deduped, opts.spreadKm!) : deduped
  const catCap = Math.max(3, Math.ceil(count / 3))
  // 'a couple of pit stops' — the documented cap, and harder than every other
  // category's: fuel exists to break a drive, not to become the list (#565).
  const fuelCap = opts.includeFuel ? Math.min(2, catCap) : 0
  const used = new Map<string, number>()
  const out: PlaceHit[] = []
  let fuelUsed = 0
  for (const h of order) {
    if (out.length >= count) break
    const k = h.category ?? 'sightseeing'
    if (k === 'transport-hub') {
      if (fuelUsed >= fuelCap) continue
      fuelUsed++
    } else {
      const n = used.get(k) ?? 0
      if (n >= catCap) continue
      used.set(k, n + 1)
    }
    out.push(h)
  }
  // The spread only chooses which places stay. They keep their score order.
  if (spread) out.sort((a, b) => deduped.indexOf(a) - deduped.indexOf(b))
  return out
}

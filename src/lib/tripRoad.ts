// ============ The trip's road measurement: one chain, one retry (#188) ============
// Every trip surface needs the SAME road chain. The workspace's leg corrections
// (budget, fatigue, warnings — every tab) and the Map tab's line, totals and
// suggestion corridor all describe one drive. Measuring it per surface doubled
// the load on the shared, rate-limited OSRM demo server (the very thing that
// caused #185's transient failures) and let the map draw a road the detour math
// could not see ("blue line present + 0 km off-route", #184).
//
// So the workspace owns exactly ONE measurement — `buildRoadChain` once, one
// `routePath` chain, one retry — and every surface derives from it:
//   · correctionsFromLegs   → the engine's leg corrections
//   · mapRoadViewFromLegs   → the Map tab's geometry / totals / per-day road km
//
// The chain is a SUPERSET of the Map tab's points (start + every stop, then the
// optional return-to-start and trailing destination), so the Map tab's legs are
// a strict prefix — `outboundCount` marks the split. Nothing here is React or
// I/O beyond the injected measure; it is all pure and node-testable.
import { isRoundTrip, legKey, type EngineAssumptions, type LegEstimate } from './engine'
import { routePath, type RoadLeg } from './routing'
import type { Trip } from '../data/types'

export interface RoadChainPoint { lat: number; lng: number }

export interface RoadChain {
  /** start → stops, plus the round-trip return-to-start and any trailing destination */
  points: RoadChainPoint[]
  /** Parallel to `points`: the day each point's ARRIVAL leg belongs to (null for the start) */
  ptDay: (number | null)[]
  /** Points in the outbound section (start → stops) — the Map tab's own view */
  outboundCount: number
}

/**
 * Build the one road chain for a trip. Points are the trip's start, every
 * non-rejected stop in day/order sequence, then — for a round trip — the return
 * to the start, and finally the last destination when it is not already the
 * final point.
 *
 * `outboundCount` is the boundary the Map tab consumes: legs before it belong to
 * start → stops (the journey the fatigue math and the suggestion corridor
 * describe); legs after it are the drive home / trailing destination the engine
 * corrections need but the map's outbound view must not double-count.
 */
export function buildRoadChain(trip: Pick<Trip, 'startLocationCoords' | 'days' | 'destinationCoords' | 'roundTrip' | 'transportMode'>): RoadChain {
  const points: RoadChainPoint[] = []
  const ptDay: (number | null)[] = []
  if (trip.startLocationCoords) {
    points.push({ lat: trip.startLocationCoords.lat, lng: trip.startLocationCoords.lng })
    ptDay.push(null)
  }
  ;[...trip.days]
    .sort((a, b) => a.index - b.index)
    .forEach(d => [...d.stops]
      .filter(s => s.status !== 'rejected')
      .sort((a, b) => a.orderInDay - b.orderInDay)
      .forEach(s => {
        points.push({ lat: s.lat, lng: s.lng })
        ptDay.push(d.index)
      }))
  // The outbound journey ends here: everything below is the drive back.
  const outboundCount = points.length
  if (isRoundTrip(trip) && trip.startLocationCoords) {
    points.push({ lat: trip.startLocationCoords.lat, lng: trip.startLocationCoords.lng })
    ptDay.push(null)
  }
  const dc = trip.destinationCoords ?? []
  const lastDest = dc.length ? dc[dc.length - 1] : undefined
  const tail = points[points.length - 1]
  if (lastDest && !(tail && tail.lat === lastDest.lat && tail.lng === lastDest.lng)) {
    points.push({ lat: lastDest.lat, lng: lastDest.lng })
    ptDay.push(null)
  }
  return { points, ptDay, outboundCount }
}

export type RoadOutcome =
  | { ok: true; legs: RoadLeg[] }
  | { ok: false }

/** Measurement lifecycle: pending while in flight, failed only after the retry. */
export type RoadStatus = 'pending' | 'ok' | 'failed'

/** What a consumer surface (the Map tab) receives: the chain, its legs, and how it went. */
export interface TripRoadView {
  chain: RoadChain | null
  legs: RoadLeg[] | null
  status: RoadStatus
  /** re-run the measurement (after a transient failure) */
  retry: () => void
}

export interface MeasureOpts {
  /** one retry after this delay — the OSRM demo is shared and rate-limited */
  retryDelayMs?: number
  /** injectable for tests (keeps them synchronous) */
  sleep?: (ms: number) => Promise<void>
  /** injectable for tests (fetch counters / scripted failures) */
  measure?: (points: RoadChainPoint[], assumptions: EngineAssumptions) => Promise<RoadLeg[]>
}

/** Default backoff before the single retry (matches the pre-#188 map behaviour). */
export const ROAD_RETRY_DELAY_MS = 2000

/**
 * Measure the chain once, retrying ONCE after a transient failure. Returns an
 * explicit outcome rather than throwing: a caller must be able to tell "the road
 * did not resolve" (degrade honestly) from "there is no road to measure".
 *
 * "Did not resolve" covers BOTH a thrown measurement and a chain in which every
 * leg fell back to the engine's haversine `estimate` — the latter is what a
 * rate-limited OSRM actually produces (routePath degrades internally instead of
 * rejecting), and treating those chords as a measured road is exactly the
 * contradictory state #184 fixed (a straight-line "road" drawn while the detour
 * math claims to know the road). Any real leg counts: a partial corridor beats
 * none, and the Map tab renders what it got.
 */
export async function measureRoadChain(
  points: RoadChainPoint[],
  assumptions: EngineAssumptions,
  opts: MeasureOpts = {},
): Promise<RoadOutcome> {
  const measure = opts.measure ?? ((pts, asm) => routePath(pts, asm))
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)))
  const retryDelayMs = opts.retryDelayMs ?? ROAD_RETRY_DELAY_MS
  const attempt = async (): Promise<RoadLeg[] | null> => {
    const legs = await measure(points, assumptions)
    return legs.some(l => l.source !== 'estimate') ? legs : null
  }
  const first = await attempt().catch(() => null)
  if (first) return { ok: true, legs: first }
  await sleep(retryDelayMs)
  const second = await attempt().catch(() => null)
  return second ? { ok: true, legs: second } : { ok: false }
}

/**
 * The engine's leg corrections from a measured chain: keyed by legKey(a, b),
 * with the mirrored key too — the drive home runs the same road in reverse, and
 * a reversed road number beats a haversine fallback.
 */
export function correctionsFromLegs(
  chain: Pick<RoadChain, 'points'>,
  legs: RoadLeg[],
): Record<string, LegEstimate> {
  const map: Record<string, LegEstimate> = {}
  for (let i = 0; i < legs.length && i + 1 < chain.points.length; i++) {
    const est: LegEstimate = {
      distanceKm: legs[i].distanceKm,
      durationMinutes: legs[i].durationMinutes,
      geometry: legs[i].geometry,
    }
    map[legKey(chain.points[i], chain.points[i + 1])] = est
    const rk = legKey(chain.points[i + 1], chain.points[i])
    if (!map[rk]) map[rk] = est
  }
  return map
}

export interface MapRoadView {
  /** flat [lng, lat][] road geometry for the outbound journey (null while unmeasured) */
  geometry: [number, number][] | null
  /** outbound road total — the Map tab's planKm input (the loop factor is applied separately) */
  totalKm: number | null
  totalMin: number | null
  /** road km per day, aligned positionally with trip.days */
  dayRoadKm: number[] | null
}

const EMPTY_MAP_VIEW: MapRoadView = { geometry: null, totalKm: null, totalMin: null, dayRoadKm: null }

/**
 * The Map tab's view of a measured chain: ONLY the outbound legs
 * (start → stops). A round trip's chain carries the drive home too, and the
 * fatigue math already multiplies by its own loop factor — counting the return
 * here would double the journey.
 */
export function mapRoadViewFromLegs(
  chain: RoadChain | null,
  legs: RoadLeg[] | null,
  dayIndexes: number[],
): MapRoadView {
  if (!chain || !legs || legs.length === 0) return EMPTY_MAP_VIEW
  const outbound = Math.min(legs.length, Math.max(0, chain.outboundCount - 1))
  if (outbound <= 0) return EMPTY_MAP_VIEW
  const legsView = legs.slice(0, outbound)
  const perDay = new Map<number, number>()
  legsView.forEach((l, i) => {
    const day = chain.ptDay[i + 1]
    if (day != null) perDay.set(day, (perDay.get(day) ?? 0) + l.distanceKm)
  })
  return {
    geometry: legsView.flatMap(l => l.geometry),
    totalKm: legsView.reduce((sum, l) => sum + l.distanceKm, 0),
    totalMin: legsView.reduce((sum, l) => sum + l.durationMinutes, 0),
    dayRoadKm: dayIndexes.map(idx => perDay.get(idx) ?? 0),
  }
}

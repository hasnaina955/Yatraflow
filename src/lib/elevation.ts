// ============ Route heights: public terrain at the trip's own places ============
// The card draws a simple, honest shape: one public terrain estimate at each
// place the trip actually visits (start, every stop, the return, the
// destination), joined by a smooth curve that never rises above or falls below
// the two heights it connects.
//
// This is deliberately NOT a road survey. There is no 500 m sampling, no
// vertical axis and no claim about the ground between two places — the curve is
// illustrative, and the card says so.
//
// The source is the keyless AWS Terrain Tiles (Terrarium) bucket the Map tab's
// terrain mode already uses, so the app gains no provider, key or quota.
import type { RoadPointKind } from './tripRoad'

export const ELEVATION_TILE_URL =
  'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'

/** The credit the source asks for. `mapViewModes.ts` carries the short form. */
export const ELEVATION_CREDITS = [
  'ArcticDEM: DigitalGlobe imagery; NSF awards 1043681, 1559691, 1542736',
  'Australia: © Commonwealth of Australia (Geoscience Australia) 2017',
  'Austria: © offene Daten Österreichs – Digitales Geländemodell Österreich',
  'Canada: Open Government Licence – Canada',
  'Europe: Copernicus data and information funded by the European Union – EU-DEM',
  'Global ETOPO1: U.S. National Oceanic and Atmospheric Administration',
  'Mexico: INEGI, Continental relief, 2016',
  'New Zealand: Copyright 2011 Crown copyright (c) Land Information New Zealand and the New Zealand Government. All rights reserved',
  'Norway: © Kartverket',
  'United Kingdom: © Environment Agency copyright and/or database right 2015. All rights reserved',
  'United States 3DEP and global GMTED2010 and SRTM: courtesy of the U.S. Geological Survey',
] as const
export const ELEVATION_CREDIT_URL = 'https://github.com/tilezen/joerd/blob/master/docs/attribution.md'
export const ELEVATION_ATTRIBUTION = `AWS Terrain Tiles. ${ELEVATION_CREDITS.join('; ')}`

/** Distinct tiles one trip may fetch. A handful of places never needs more. */
export const ELEVATION_MAX_TILES = 6
/** Parallel tile requests. */
export const ELEVATION_CONCURRENCY = 4
/** Decoded tiles kept in memory. */
export const ELEVATION_TILE_CACHE_LIMIT = 24
/** Curve points drawn between the real places. */
export const ELEVATION_CURVE_SAMPLES = 120

export interface ElevationTileKey { z: number; x: number; y: number }
export interface ElevationTile { size: number; rgba: Uint8ClampedArray }
export type ElevationTileLoader = (key: ElevationTileKey, signal?: AbortSignal) => Promise<ElevationTile>

export interface RouteHeightInput {
  key: string
  title: string
  kind: RoadPointKind
  dayIndex: number | null
  lat: number
  lng: number
  chainIndex?: number
}

export interface RouteHeightPoint extends RouteHeightInput {
  /** Straight-line distance from the first place, in kilometres. */
  distanceKm: number
  /** Null when the tile under this place could not be read. Never zero-filled. */
  elevationM: number | null
  breakBefore?: boolean
}

export interface RouteHeightStats {
  minM: number
  maxM: number
  /** The highest PLACE, not a claimed high point between two places. */
  peak: RouteHeightPoint | null
  sampled: number
  missing: number
}

export interface RouteHeightCurveRun {
  points: Array<{ distanceKm: number; elevationM: number }>
}

export type RouteHeightsResult =
  | {
    kind: 'measured'
    points: RouteHeightPoint[]
    runs: RouteHeightCurveRun[]
    stats: RouteHeightStats
    zoom: number
    missingTiles: number
  }
  | { kind: 'empty'; reason: 'no-points' | 'no-data' }
  | { kind: 'failed'; reason: 'tiles' | 'aborted' }

/** Terrarium packs the height in the RGB channels, offset by 32768 m. */
export function terrariumHeight(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768
}

const MAX_MERCATOR_LAT = 85.05112878

/** Fractional tile position for a coordinate. `px`/`py` are pixels in the tile. */
export function elevationTileFor(lat: number, lng: number, z: number): { x: number; y: number; px: number; py: number } {
  const clampedLat = Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, lat))
  const n = 2 ** z
  const xF = ((lng + 180) / 360) * n
  const latRad = (clampedLat * Math.PI) / 180
  const yF = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  const x = Math.max(0, Math.min(n - 1, Math.floor(xF)))
  const y = Math.max(0, Math.min(n - 1, Math.floor(yF)))
  const px = Math.max(0, Math.min(255.999, (xF - x) * 256))
  const py = Math.max(0, Math.min(255.999, (yF - y) * 256))
  return { x, y, px, py }
}

/** Great-circle distance in kilometres. */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(h)))
}

function validCoord(point: { lat: number; lng: number }): boolean {
  return Number.isFinite(point.lat) && Number.isFinite(point.lng)
    && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180
}

/**
 * The trip's own places, in chain order, with a straight-line distance from the
 * first one. An invalid coordinate is dropped, exactly as the route list drops it.
 */
export function buildRouteHeightPoints(input: readonly RouteHeightInput[]): RouteHeightPoint[] {
  const points: RouteHeightPoint[] = []
  let distanceKm = 0
  let previous: RouteHeightPoint | null = null
  let skipped = false
  for (const item of input) {
    if (!validCoord(item)) { skipped = true; continue }
    if (previous) distanceKm += haversineKm(previous, item)
    const breakBefore = !!previous && (skipped || (previous.chainIndex != null && item.chainIndex != null && item.chainIndex !== previous.chainIndex + 1))
    const point: RouteHeightPoint = { ...item, distanceKm, elevationM: null, breakBefore }
    points.push(point)
    previous = point
    skipped = false
  }
  return points
}

/** The coarsest zoom that still fits the trip inside the tile cap. */
export function routeHeightZoom(points: readonly RouteHeightPoint[]): number {
  for (let zoom = 12; zoom >= 5; zoom--) {
    const keys = new Set(points.map(point => {
      const tile = elevationTileFor(point.lat, point.lng, zoom)
      return `${tile.x}/${tile.y}`
    }))
    if (keys.size <= ELEVATION_MAX_TILES) return zoom
  }
  return 5
}

/** Read one pixel's height from a decoded tile. */
export function tileHeightAt(tile: ElevationTile, px: number, py: number): number | null {
  const size = tile.size
  if (!(size > 0)) return null
  const x = Math.max(0, Math.min(size - 1, Math.floor(px)))
  const y = Math.max(0, Math.min(size - 1, Math.floor(py)))
  const at = (y * size + x) * 4
  if (at + 2 >= tile.rgba.length) return null
  const height = terrariumHeight(tile.rgba[at], tile.rgba[at + 1], tile.rgba[at + 2])
  return Number.isFinite(height) ? height : null
}

const tileCache = new Map<string, ElevationTile>()

export function clearElevationTileCache(): void {
  tileCache.clear()
}

function cacheGet(key: ElevationTileKey): ElevationTile | undefined {
  return tileCache.get(`${key.z}/${key.x}/${key.y}`)
}

function cacheSet(key: ElevationTileKey, tile: ElevationTile): void {
  const id = `${key.z}/${key.x}/${key.y}`
  tileCache.delete(id)
  tileCache.set(id, tile)
  while (tileCache.size > ELEVATION_TILE_CACHE_LIMIT) {
    const oldest = tileCache.keys().next()
    if (oldest.done) break
    tileCache.delete(oldest.value)
  }
}

/**
 * Fritsch–Carlson monotone cubic through the real heights. The curve is smooth
 * and it cannot overshoot: between two places it stays inside their two values,
 * so the drawing never invents a peak or a dip that no place has.
 */
export function routeHeightCurve(points: readonly RouteHeightPoint[]): RouteHeightCurveRun[] {
  const runs: RouteHeightCurveRun[] = []
  let run: RouteHeightPoint[] = []
  const flush = () => {
    if (run.length >= 2) runs.push({ points: sampleMonotone(run) })
    run = []
  }
  for (const point of points) {
    if (point.breakBefore) flush()
    if (point.elevationM == null) {
      flush()
      continue
    }
    run.push(point)
  }
  flush()
  return runs
}

function sampleMonotone(points: readonly RouteHeightPoint[]): Array<{ distanceKm: number; elevationM: number }> {
  const xs = points.map(point => point.distanceKm)
  const ys = points.map(point => point.elevationM as number)
  const n = points.length
  const slopes: number[] = []
  for (let index = 0; index < n - 1; index++) {
    const dx = xs[index + 1] - xs[index]
    slopes.push(dx > 0 ? (ys[index + 1] - ys[index]) / dx : 0)
  }
  const tangents: number[] = new Array(n).fill(0)
  tangents[0] = slopes[0] ?? 0
  tangents[n - 1] = slopes[n - 2] ?? 0
  for (let index = 1; index < n - 1; index++) {
    const a = slopes[index - 1]
    const b = slopes[index]
    if (a * b <= 0) {
      tangents[index] = 0
      continue
    }
    const average = (a + b) / 2
    const limit = 3 * Math.min(Math.abs(a), Math.abs(b))
    tangents[index] = Math.abs(average) > limit ? Math.sign(average) * limit : average
  }

  const out: Array<{ distanceKm: number; elevationM: number }> = []
  const total = xs[n - 1] - xs[0]
  const samples = Math.max(ELEVATION_CURVE_SAMPLES, n * 8)
  for (let index = 0; index < n - 1; index++) {
    const span = xs[index + 1] - xs[index]
    const steps = total > 0 ? Math.max(1, Math.round((span / total) * samples)) : 1
    for (let step = 0; step < steps; step++) {
      const t = step / steps
      out.push({
        distanceKm: xs[index] + span * t,
        elevationM: hermite(ys[index], ys[index + 1], tangents[index] * span, tangents[index + 1] * span, t),
      })
    }
  }
  out.push({ distanceKm: xs[n - 1], elevationM: ys[n - 1] })
  return out
}

function hermite(y0: number, y1: number, m0: number, m1: number, t: number): number {
  const t2 = t * t
  const t3 = t2 * t
  return (2 * t3 - 3 * t2 + 1) * y0
    + (t3 - 2 * t2 + t) * m0
    + (-2 * t3 + 3 * t2) * y1
    + (t3 - t2) * m1
}

export function routeHeightStats(points: readonly RouteHeightPoint[]): RouteHeightStats {
  let minM = Number.POSITIVE_INFINITY
  let maxM = Number.NEGATIVE_INFINITY
  let sampled = 0
  let missing = 0
  let peak: RouteHeightPoint | null = null
  for (const point of points) {
    if (point.elevationM == null) {
      missing += 1
      continue
    }
    sampled += 1
    minM = Math.min(minM, point.elevationM)
    if (point.elevationM > maxM) {
      maxM = point.elevationM
      peak = point
    }
  }
  return {
    minM: sampled > 0 ? minM : 0,
    maxM: sampled > 0 ? maxM : 0,
    peak,
    sampled,
    missing,
  }
}

async function runBatched<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<Array<PromiseSettledResult<R>>> {
  const results: Array<PromiseSettledResult<R>> = new Array(items.length)
  let next = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next++
      if (index >= items.length) return
      try {
        results[index] = { status: 'fulfilled', value: await worker(items[index]) }
      } catch (reason) {
        results[index] = { status: 'rejected', reason }
      }
    }
  })
  await Promise.all(runners)
  return results
}

/**
 * Read one public height per place. Tiles are fetched once and cached. A place
 * whose tile fails keeps a null height and breaks the curve there — the card
 * never fills the gap with a made-up number.
 */
export async function measureRouteHeights(
  input: readonly RouteHeightInput[],
  loadTile: ElevationTileLoader,
  signal?: AbortSignal,
): Promise<RouteHeightsResult> {
  const points = buildRouteHeightPoints(input)
  if (points.length < 2) return { kind: 'empty', reason: 'no-points' }
  if (signal?.aborted) return { kind: 'failed', reason: 'aborted' }

  const zoom = routeHeightZoom(points)
  const tiles = new Map<string, ElevationTile>()
  const pending: ElevationTileKey[] = []
  for (const point of points) {
    const tile = elevationTileFor(point.lat, point.lng, zoom)
    const key: ElevationTileKey = { z: zoom, x: tile.x, y: tile.y }
    const id = `${key.z}/${key.x}/${key.y}`
    if (tiles.has(id) || pending.some(entry => `${entry.z}/${entry.x}/${entry.y}` === id)) continue
    const cached = cacheGet(key)
    if (cached) tiles.set(id, cached)
    else pending.push(key)
  }

  const settled = await runBatched(pending, ELEVATION_CONCURRENCY, async key => {
    if (signal?.aborted) throw new Error('aborted')
    const tile = await loadTile(key, signal)
    cacheSet(key, tile)
    return { key, tile }
  })

  let missingTiles = 0
  settled.forEach(result => {
    if (result.status === 'fulfilled') {
      tiles.set(`${result.value.key.z}/${result.value.key.x}/${result.value.key.y}`, result.value.tile)
    } else {
      missingTiles += 1
    }
  })

  if (signal?.aborted) return { kind: 'failed', reason: 'aborted' }
  if (tiles.size === 0) return { kind: 'failed', reason: 'tiles' }

  const withHeights = points.map(point => {
    const tile = elevationTileFor(point.lat, point.lng, zoom)
    const loaded = tiles.get(`${zoom}/${tile.x}/${tile.y}`)
    return { ...point, elevationM: loaded ? tileHeightAt(loaded, tile.px, tile.py) : null }
  })
  const stats = routeHeightStats(withHeights)
  if (stats.sampled === 0) return { kind: 'empty', reason: 'no-data' }

  return {
    kind: 'measured',
    points: withHeights,
    runs: routeHeightCurve(withHeights),
    stats,
    zoom,
    missingTiles,
  }
}

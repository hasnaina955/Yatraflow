import { beforeEach, describe, expect, it } from 'vitest'
import {
  ELEVATION_MAX_TILES,
  buildRouteHeightPoints,
  clearElevationTileCache,
  elevationTileFor,
  haversineKm,
  measureRouteHeights,
  routeHeightCurve,
  routeHeightStats,
  routeHeightZoom,
  terrariumHeight,
  tileHeightAt,
  type ElevationTile,
  type RouteHeightInput,
  type RouteHeightPoint,
} from '../src/lib/elevation'
import { elevationResultApplies, routeHeightSignature } from '../src/hooks/useTripElevation'

/** A tile whose every pixel encodes one height. */
function flatTile(heightM: number, size = 8): ElevationTile {
  const packed = heightM + 32768
  const rgba = new Uint8ClampedArray(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    rgba[i * 4] = Math.floor(packed / 256)
    rgba[i * 4 + 1] = Math.floor(packed) % 256
    rgba[i * 4 + 2] = Math.floor((packed - Math.floor(packed)) * 256)
    rgba[i * 4 + 3] = 255
  }
  return { size, rgba }
}

const place = (key: string, lat: number, lng: number, title = key): RouteHeightInput => ({
  key,
  title,
  kind: key === 'start' ? 'start' : 'stop',
  dayIndex: 0,
  lat,
  lng,
})

const INPUT: RouteHeightInput[] = [
  place('start', 15.4909, 73.8278, 'Panaji'),
  place('a', 15.5185, 73.7628, 'Candolim'),
  place('b', 15.2754, 73.9228, 'Colva'),
]

describe('terrarium encoding', () => {
  it('reads the height from the three colour channels', () => {
    expect(terrariumHeight(0, 0, 0)).toBe(-32768)
    expect(terrariumHeight(128, 0, 0)).toBe(0)
    expect(terrariumHeight(128, 1, 0)).toBe(1)
    expect(terrariumHeight(128, 0, 128)).toBe(0.5)
  })

  it('reads a pixel and clamps out-of-range positions', () => {
    const tile = flatTile(1234)
    expect(tileHeightAt(tile, 0, 0)).toBe(1234)
    expect(tileHeightAt(tile, 999, 999)).toBe(1234)
    expect(tileHeightAt({ size: 0, rgba: new Uint8ClampedArray(0) }, 0, 0)).toBeNull()
  })
})

describe('tile maths', () => {
  it('puts the equator and prime meridian on a tile boundary', () => {
    expect(elevationTileFor(0, 0, 1)).toEqual({ x: 1, y: 1, px: 0, py: 0 })
  })

  it('clamps a polar latitude instead of returning a bad index', () => {
    const at = elevationTileFor(89.9, 0, 4)
    expect(at.y).toBe(0)
    expect(at.px).toBeGreaterThanOrEqual(0)
    expect(at.py).toBeGreaterThanOrEqual(0)
  })

  it('measures a real great-circle distance', () => {
    expect(haversineKm({ lat: 15.49, lng: 73.82 }, { lat: 15.49, lng: 73.82 })).toBeCloseTo(0, 6)
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(111.2, 0)
  })
})

describe('the trip places', () => {
  it('keeps one point per place with a running distance', () => {
    const points = buildRouteHeightPoints(INPUT)
    expect(points.map(point => point.key)).toEqual(['start', 'a', 'b'])
    expect(points[0].distanceKm).toBe(0)
    expect(points[1].distanceKm).toBeGreaterThan(0)
    expect(points[2].distanceKm).toBeGreaterThan(points[1].distanceKm)
    expect(points.every(point => point.elevationM === null)).toBe(true)
  })

  it('drops an invalid coordinate and keeps the order', () => {
    const points = buildRouteHeightPoints([INPUT[0], place('bad', Number.NaN, 0), INPUT[2]])
    expect(points.map(point => point.key)).toEqual(['start', 'b'])
    expect(points[1].breakBefore).toBe(true)
    expect(routeHeightCurve(points.map(point => ({ ...point, elevationM: 50 })))).toEqual([])
  })

  it('changes request identity for a renamed place or a small coordinate move', () => {
    const rows = INPUT.map((item, chainIndex) => ({ ...item, chainIndex }))
    expect(routeHeightSignature(rows)).not.toBe(routeHeightSignature(rows.map((item, index) => index === 1 ? { ...item, title: 'New name' } : item)))
    expect(routeHeightSignature(rows)).not.toBe(routeHeightSignature(rows.map((item, index) => index === 1 ? { ...item, lat: item.lat + 0.00001 } : item)))
  })

  it('picks a zoom that fits the trip inside the tile cap', () => {
    const points = buildRouteHeightPoints(INPUT)
    const zoom = routeHeightZoom(points)
    const keys = new Set(points.map(point => {
      const tile = elevationTileFor(point.lat, point.lng, zoom)
      return `${tile.x}/${tile.y}`
    }))
    expect(keys.size).toBeLessThanOrEqual(ELEVATION_MAX_TILES)
    expect(zoom).toBeGreaterThanOrEqual(5)
  })
})

describe('the curve', () => {
  const points: RouteHeightPoint[] = [
    { ...place('a', 15.5, 73.8), distanceKm: 0, elevationM: 20 },
    { ...place('b', 15.6, 73.9), distanceKm: 10, elevationM: 120 },
    { ...place('c', 15.7, 74.0), distanceKm: 20, elevationM: 40 },
  ]

  it('stays between the two heights it joins', () => {
    const runs = routeHeightCurve(points)
    expect(runs).toHaveLength(1)
    for (const sample of runs[0].points) {
      expect(sample.elevationM).toBeGreaterThanOrEqual(20 - 1e-6)
      expect(sample.elevationM).toBeLessThanOrEqual(120 + 1e-6)
    }
  })

  it('starts and ends on the real places', () => {
    const run = routeHeightCurve(points)[0]
    expect(run.points[0]).toEqual({ distanceKm: 0, elevationM: 20 })
    expect(run.points[run.points.length - 1].elevationM).toBeCloseTo(40, 6)
  })

  it('breaks where a place has no height', () => {
    const run = (distanceKm: number, elevationM: number | null): RouteHeightPoint => ({
      ...place(`p${distanceKm}`, 15.5, 73.8),
      distanceKm,
      elevationM,
    })
    const gapped = routeHeightCurve([
      run(0, 20),
      run(10, 30),
      run(20, null),
      run(30, 50),
      run(40, 60),
    ])
    expect(gapped).toHaveLength(2)
    expect(gapped[0].points.length).toBeGreaterThan(1)
    expect(gapped[1].points.length).toBeGreaterThan(1)
  })
})

describe('stats', () => {
  it('names the highest PLACE, not a point between places', () => {
    const stats = routeHeightStats([
      { ...place('a', 15.5, 73.8), distanceKm: 0, elevationM: 20 },
      { ...place('b', 15.6, 73.9), distanceKm: 10, elevationM: 120 },
      { ...place('c', 15.7, 74.0), distanceKm: 20, elevationM: null },
    ])
    expect(stats.maxM).toBe(120)
    expect(stats.minM).toBe(20)
    expect(stats.peak?.key).toBe('b')
    expect(stats.sampled).toBe(2)
    expect(stats.missing).toBe(1)
  })
})

describe('measuring the places', () => {
  beforeEach(() => clearElevationTileCache())

  it('reads one height per place and reuses the tile cache', async () => {
    let calls = 0
    const loader = async () => {
      calls += 1
      return flatTile(140)
    }
    const first = await measureRouteHeights(INPUT, loader)
    expect(first.kind).toBe('measured')
    if (first.kind !== 'measured') return
    expect(first.points.map(point => point.elevationM)).toEqual([140, 140, 140])
    expect(first.stats.maxM).toBe(140)
    expect(first.runs).toHaveLength(1)
    const firstCalls = calls
    await measureRouteHeights(INPUT, loader)
    expect(calls).toBe(firstCalls)
  })

  it('leaves a missing place at null, never zero', async () => {
    let calls = 0
    const loader = async () => {
      calls += 1
      if (calls === 2) throw new Error('tile down')
      return flatTile(90)
    }
    const result = await measureRouteHeights(INPUT, loader)
    expect(result.kind).toBe('measured')
    if (result.kind !== 'measured') return
    expect(result.stats.missing).toBeGreaterThan(0)
    expect(result.points.some(point => point.elevationM === null)).toBe(true)
  })

  it('fails when no tile loads, and reports an abort', async () => {
    const failing = await measureRouteHeights(INPUT, async () => { throw new Error('down') })
    expect(failing).toEqual({ kind: 'failed', reason: 'tiles' })

    const controller = new AbortController()
    controller.abort()
    const aborted = await measureRouteHeights(INPUT, async () => flatTile(10), controller.signal)
    expect(aborted).toEqual({ kind: 'failed', reason: 'aborted' })
  })

  it('returns empty with fewer than two places', async () => {
    expect(await measureRouteHeights([INPUT[0]], async () => flatTile(10))).toEqual({ kind: 'empty', reason: 'no-points' })
  })
})

describe('stale completions', () => {
  it('applies a result only to the places and attempt on screen', () => {
    const settled = { signature: 'trip-a', attempt: 0 }
    expect(elevationResultApplies(settled, 'trip-a', 0)).toBe(true)
    expect(elevationResultApplies(settled, 'trip-b', 0)).toBe(false)
    expect(elevationResultApplies(settled, 'trip-a', 1)).toBe(false)
    expect(elevationResultApplies(null, 'trip-a', 0)).toBe(false)
  })
})

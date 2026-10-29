import { describe, expect, it } from 'vitest'
import type { RouteHeightPoint, RouteHeightStats } from '../src/lib/elevation'
import { buildRouteHeightPlot, niceRouteHeightTop, smoothRouteHeightPath } from '../src/lib/elevationPlot'

const point = (distanceKm: number, elevationM: number | null, title = `p${distanceKm}`): RouteHeightPoint => ({
  key: `k${distanceKm}`,
  title,
  kind: 'stop',
  dayIndex: 0,
  lat: 15.5,
  lng: 73.8,
  distanceKm,
  elevationM,
})

const statsOf = (points: readonly RouteHeightPoint[]): RouteHeightStats => {
  const readable = points.filter(entry => entry.elevationM != null)
  const values = readable.map(entry => entry.elevationM as number)
  const maxM = values.length ? Math.max(...values) : 0
  const minM = values.length ? Math.min(...values) : 0
  return {
    minM,
    maxM,
    peak: readable.find(entry => entry.elevationM === maxM) ?? null,
    sampled: readable.length,
    missing: points.length - readable.length,
  }
}

/** The straight line between two heights, sampled so the plot has a run. */
const lineRun = (from: number, to: number, height: number) => ({
  points: [
    { distanceKm: from, elevationM: height },
    { distanceKm: to, elevationM: height },
  ],
})

describe('the height scale', () => {
  it('rounds up to a step with a 1000 m floor', () => {
    expect(niceRouteHeightTop(0)).toBe(1000)
    expect(niceRouteHeightTop(120)).toBe(1000)
    expect(niceRouteHeightTop(173)).toBe(1000)
    expect(niceRouteHeightTop(2500)).toBe(3000)
    expect(niceRouteHeightTop(5328)).toBe(6000)
  })
})

describe('plot geometry', () => {
  it('anchors zero at the baseline and the last place at the right edge', () => {
    const points = [point(0, 0), point(10, 100), point(20, 200)]
    const plot = buildRouteHeightPlot(points, [lineRun(0, 20, 100)], statsOf(points), 400, 200)
    expect(plot.topM).toBe(1000)
    expect(plot.ticksX.map(tick => tick.label)).toEqual(['0 km', '10 km', '20 km'])
    expect(plot.ticksX[0].x).toBeCloseTo(plot.pad.left, 5)
    expect(plot.ticksX[2].x).toBeCloseTo(400 - plot.pad.right, 5)
    expect(plot.marks).toHaveLength(2)
  })

  it('keeps a flat route flat instead of stretching it', () => {
    const points = [point(0, 40), point(10, 40), point(20, 40)]
    const plot = buildRouteHeightPlot(points, [lineRun(0, 20, 40)], statsOf(points), 400, 200)
    expect(plot.topM).toBe(1000)
    const ys = plot.marks.map(mark => mark.y)
    // A low route stays near the baseline.
    expect(Math.max(...ys)).toBeGreaterThan(plot.baseY - (plot.baseY - plot.pad.top) * 0.3)
  })

  it('names the highest place and skips places with no height', () => {
    const points = [point(0, 20, 'Panaji'), point(10, null, 'Gap'), point(20, 180, 'Palolem')]
    const plot = buildRouteHeightPlot(points, [lineRun(0, 20, 20)], statsOf(points), 400, 200)
    expect(plot.marks.map(mark => mark.title)).toEqual(['Panaji', 'Palolem'])
    expect(plot.peak?.title).toBe('Palolem')
    expect(plot.peak?.elevationM).toBe(180)
  })

  it('survives a trip with no readable height', () => {
    const points = [point(0, null), point(10, null)]
    const plot = buildRouteHeightPlot(points, [], statsOf(points), 400, 200)
    expect(plot.runs).toHaveLength(0)
    expect(plot.marks).toHaveLength(0)
    expect(plot.peak).toBeNull()
  })
})

describe('the height curve is a bounded illustrative stroke', () => {
  const numbers = (path: string) => (path.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
  const ysOf = (path: string) => numbers(path).filter((_, index) => index % 2 === 1)

  it('keeps every real place as a mark, in order, and stays inside their band', () => {
    const points = [point(0, 60), point(4, 72), point(8, 55), point(12, 180), point(20, 40)]
    const run = {
      points: points.map(entry => ({
        distanceKm: entry.distanceKm,
        elevationM: entry.elevationM as number,
      })),
    }
    const plot = buildRouteHeightPlot(points, [run], statsOf(points), 400, 200)
    // The marks are the data: every place, its own height, the same order.
    expect(plot.marks.map(mark => mark.elevationM)).toEqual([60, 72, 55, 180, 40])
    const line = plot.runs[0].line
    // The stroke opens on the first place and closes on the last.
    const values = numbers(line)
    expect(values[0]).toBeCloseTo(plot.marks[0].x, 2)
    expect(values[1]).toBeCloseTo(plot.marks[0].y, 2)
    const tail = values.slice(-2)
    expect(tail[0]).toBeCloseTo(plot.marks[plot.marks.length - 1].x, 2)
    expect(tail[1]).toBeCloseTo(plot.marks[plot.marks.length - 1].y, 2)
    // Nothing in the drawing leaves the real heights' own band, so no peak or
    // dip is invented anywhere along it.
    const band = plot.marks.map(mark => mark.y)
    for (const y of ysOf(line)) {
      expect(y).toBeGreaterThanOrEqual(Math.min(...band) - 0.01)
      expect(y).toBeLessThanOrEqual(Math.max(...band) + 0.01)
    }
  })

  it('draws a flat route flat, with no invented hill', () => {
    const path = smoothRouteHeightPath([{ x: 0, y: 40 }, { x: 100, y: 40 }, { x: 200, y: 40 }])
    expect(path).toContain('C')
    for (const y of ysOf(path)) expect(y).toBeCloseTo(40, 2)
  })

  it('keeps both heights when two endpoints share one distance', () => {
    const points = [point(0, 60), point(0, 120), point(10, 80)]
    const plot = buildRouteHeightPlot(points, [{
      points: [
        { distanceKm: 0, elevationM: 60 },
        { distanceKm: 0, elevationM: 120 },
        { distanceKm: 10, elevationM: 80 },
      ],
    }], statsOf(points), 400, 200)
    expect(plot.runs).toHaveLength(1)
    expect(plot.runs[0].line).toContain(' L ')
    expect(plot.marks.map(mark => mark.elevationM)).toEqual([120, 80])
  })

  it('keeps close endpoints and a nearby minimum on the path', () => {
    const points = [point(0, 0), point(1, 100), point(2, 5), point(3, 80), point(100, 40)]
    const plot = buildRouteHeightPlot(points, [], statsOf(points), 390, 170)
    const y = (height: number) => plot.baseY - height / plot.topM * (plot.baseY - plot.pad.top)
    const x = (distance: number) => plot.pad.left + distance / 100 * (plot.width - plot.pad.left - plot.pad.right)
    for (const [distance, height] of [[0, 0], [1, 100], [2, 5], [3, 80], [100, 40]]) {
      expect(plot.runs[0].line).toContain(`${x(distance).toFixed(2)} ${y(height).toFixed(2)}`)
    }
    const close = [point(0, 0), point(1, 100)]
    const short = buildRouteHeightPlot(close, [], statsOf(close), 390, 170)
    expect(short.runs[0].line.startsWith(`M ${short.pad.left.toFixed(2)} ${short.baseY.toFixed(2)}`)).toBe(true)
    expect(short.runs[0].line.endsWith(`${(short.width - short.pad.right).toFixed(2)} ${(short.baseY - 100 / short.topM * (short.baseY - short.pad.top)).toFixed(2)}`)).toBe(true)
  })

  it('places each representative and the peak on its curve without bridging gaps', () => {
    const points = [point(0, 9), point(1, 10), point(2, 79), point(3, 8), point(50, null), point(70, 12), point(100, 11)]
    const plot = buildRouteHeightPlot(points, [], statsOf(points), 390, 170)
    expect(plot.runs).toHaveLength(2)
    expect(plot.peak?.elevationM).toBe(79)
    expect(plot.marks.some(mark => mark.x === plot.peak?.x && mark.y === plot.peak?.y)).toBe(true)
    for (const mark of plot.marks) {
      const coordinate = `${mark.x.toFixed(2)} ${mark.y.toFixed(2)}`
      expect(plot.runs.some(run => run.line.includes(coordinate))).toBe(true)
    }
  })
})

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  STAY_RING_CANVAS_FRACTION,
  clampBoundsWithin,
  ringBounds,
  ringCaptionPoint,
  ringLabelPoint,
  stayFrameBounds,
} from '../src/lib/mapStyles/lensMarks'

const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const map = read('../src/components/TripMap.tsx')

const SQUARE: [number, number][] = [[73.0, 9.0], [74.0, 9.0], [74.0, 10.0], [73.0, 10.0]]
const CENTRE: [number, number][] = [[9.9, 9.9], [10.1, 9.9], [10.1, 10.1], [9.9, 10.1]]

describe('STAY_RING_CANVAS_FRACTION', () => {
  it('matches the measured Stay board ring', () => {
    expect(STAY_RING_CANVAS_FRACTION).toBeGreaterThanOrEqual(0.35)
    expect(STAY_RING_CANVAS_FRACTION).toBeLessThanOrEqual(0.45)
  })
})

describe('stayFrameBounds', () => {
  it('keeps the ring centre and grows by one over the fraction', () => {
    const framed = stayFrameBounds(SQUARE, 0.4)!
    const [[west, south], [east, north]] = framed
    expect((west + east) / 2).toBeCloseTo(73.5)
    expect((south + north) / 2).toBeCloseTo(9.5)
    expect(east - west).toBeCloseTo(1 / 0.4)
    expect(north - south).toBeCloseTo(1 / 0.4)
  })

  it('makes the ring diameter the given fraction of the frame', () => {
    const ring = ringBounds(SQUARE)!
    const framed = stayFrameBounds(SQUARE, 0.4)!
    const ringW = ring[1][0] - ring[0][0]
    const frameW = framed[1][0] - framed[0][0]
    expect(ringW / frameW).toBeCloseTo(0.4)
  })

  it('is a bigger frame for a smaller fraction', () => {
    const tight = stayFrameBounds(SQUARE, 0.5)!
    const wide = stayFrameBounds(SQUARE, 0.25)!
    expect(wide[1][0] - wide[0][0]).toBeGreaterThan(tight[1][0] - tight[0][0])
  })

  it('falls back to the board fraction for a bad input', () => {
    expect(stayFrameBounds(SQUARE, 0)).toEqual(stayFrameBounds(SQUARE, STAY_RING_CANVAS_FRACTION))
    expect(stayFrameBounds(SQUARE, 2)).toEqual(stayFrameBounds(SQUARE, STAY_RING_CANVAS_FRACTION))
  })

  it('returns null for an empty ring', () => {
    expect(stayFrameBounds([])).toBeNull()
    expect(stayFrameBounds([[Number.NaN, 1]])).toBeNull()
  })
})

describe('clampBoundsWithin stays in the fit', () => {
  it('keeps an expanded ring inside a wider route extent', () => {
    const framed = stayFrameBounds(CENTRE, 0.4)!
    const route = [[9.0, 9.0], [11.0, 11.0]] as [[number, number], [number, number]]
    expect(clampBoundsWithin(framed, route)).toEqual(framed)
  })

  it('falls back to the route when the frame leaves it', () => {
    const framed = stayFrameBounds(SQUARE, 0.4)!
    const route = [[73.4, 9.4], [73.6, 9.6]] as [[number, number], [number, number]]
    expect(clampBoundsWithin(framed, route)).toEqual(route)
  })
})

describe('ringCaptionPoint', () => {
  it('returns the lowest latitude, the ring foot', () => {
    expect(ringCaptionPoint(SQUARE)).toEqual([73.0, 9.0])
    expect(ringLabelPoint(SQUARE)?.[1]).toBe(10.0)
  })

  it('ignores non-finite points', () => {
    expect(ringCaptionPoint([[1, Number.NaN], [2, 5]])).toEqual([2, 5])
    expect(ringCaptionPoint([])).toBeNull()
  })
})

describe('the stay fit in TripMap', () => {
  it('frames the expanded ring and keeps the caps', () => {
    expect(map).toMatch(/const framed = stayFrameBounds\(first\.ring, STAY_RING_CANVAS_FRACTION\)/)
    expect(map).toMatch(/clampBoundsWithin\(framed, boundsOf\(fitPoints\)\)/)
    expect(map).toMatch(/padding: cameraPadding\(\), maxZoom: 15, duration: prefersReducedMotion\(\) \? 0 : motionTiming\('--motion-slow'\)\.duration/)
  })

  it('hangs the caption from the ring foot', () => {
    expect(map).toMatch(/ringCaptionPoint\(ring\.ring\)/)
    expect(map).toMatch(/anchor="top"/)
  })
})

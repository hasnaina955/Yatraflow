import { describe, expect, it } from 'vitest'
import { ribbonScrollTarget } from '../src/lib/ribbonScroll'
import { paidDaysLabel, paidHeightBands } from '../src/components/storefront/ride/RideElevation'
import type { RouteHeightPoint } from '../src/lib/elevation'

// A strip 1000 wide with 100 wide buttons and a 10 gap. Button n starts at n * 110 - scrollLeft.
const host = { left: 0, right: 1000 }
const box = (n: number, scrollLeft: number) => ({ left: n * 110 - scrollLeft, right: n * 110 - scrollLeft + 100 })

describe('ribbonScrollTarget', () => {
  it('centres a day at the right edge so the next days show', () => {
    // Button 8 sits at 880 to 980, fully in view, with button 9 cut off.
    const target = ribbonScrollTarget({ host, inset: 0, scrollLeft: 0, max: 1000, day: box(8, 0), prev: box(7, 0), next: box(9, 0) })
    expect(target).toBeCloseTo(430)
  })
  it('does not move when the day and both neighbours already show', () => {
    expect(ribbonScrollTarget({ host, inset: 0, scrollLeft: 0, max: 1000, day: box(4, 0), prev: box(3, 0), next: box(5, 0) })).toBeNull()
  })
  it('never leaves the scroll range', () => {
    expect(ribbonScrollTarget({ host, inset: 0, scrollLeft: 0, max: 200, day: box(8, 0), prev: box(7, 0), next: box(9, 0) })).toBe(200)
    expect(ribbonScrollTarget({ host, inset: 0, scrollLeft: 300, max: 1000, day: box(0, 300), next: box(1, 300) })).toBe(0)
  })
  it('stays put when the strip is already at the nearest reachable spot', () => {
    expect(ribbonScrollTarget({ host, inset: 0, scrollLeft: 200, max: 200, day: box(9, 200), prev: box(8, 200) })).toBeNull()
  })
  it('counts the scroll padding as the visible edge', () => {
    expect(ribbonScrollTarget({ host, inset: 20, scrollLeft: 0, max: 1000, day: box(8, 0), prev: box(7, 0), next: { left: 990, right: 1090 } })).not.toBeNull()
  })
})

const point = (key: string, dayIndex: number, distanceKm: number): RouteHeightPoint => ({ key, title: `Place ${key}`, kind: 'stop', dayIndex, lat: 0, lng: 0, distanceKm, elevationM: 3000 })
const plot = { width: 320, pad: { left: 20, right: 20, top: 30, bottom: 30 }, maxDistanceKm: 100 }

describe('paidHeightBands', () => {
  it('labels days by number only', () => {
    expect(paidDaysLabel(4, 7)).toBe('Days 5–8 · paid plan')
    expect(paidDaysLabel(4, 4)).toBe('Day 5 · paid plan')
  })
  it('puts one band across the gap between free places', () => {
    const points = [point('a', 2, 0), point('b', 3, 20), point('c', 8, 80), point('d', 9, 100)]
    const bands = paidHeightBands(points, plot, [4, 5, 6, 7])
    expect(bands).toHaveLength(1)
    expect(bands[0].label).toBe('Days 5–8 · paid plan')
    expect(bands[0].x).toBeCloseTo(20 + 0.2 * 280)
    expect(bands[0].width).toBeCloseTo(0.6 * 280)
    expect(JSON.stringify(bands)).not.toMatch(/Place/)
  })
  it('draws no band when no paid day sits in the gap', () => {
    const points = [point('a', 0, 0), point('b', 2, 50)]
    expect(paidHeightBands(points, plot, [5, 6])).toEqual([])
  })
  it('draws no band for paid days at the end of the trip', () => {
    expect(paidHeightBands([point('a', 0, 0), point('b', 1, 40)], plot, [2, 3])).toEqual([])
  })
})

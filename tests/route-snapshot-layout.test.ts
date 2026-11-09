import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { fitRoutePoints, routeBadges, routeEndpointLabel, ROUTE_BOX } from '../src/lib/routeSnapshotLayout'
import { RouteSnapshot } from '../src/components/ui'

describe('route snapshot layout', () => {
  it.each([
    [{ lat: 30, lng: 70, day: 0 }, { lat: 30, lng: 80, day: 1 }],
    [{ lat: 20, lng: 75, day: 0 }, { lat: 40, lng: 75, day: 1 }],
    [{ lat: 30, lng: 75, day: 0 }, { lat: 33, lng: 78, day: 1 }],
  ])('fits a route to one padded dimension without stretching it: %j', (...points) => {
    const fitted = fitRoutePoints(points)
    const xs = fitted.map(p => p.x), ys = fitted.map(p => p.y)
    const spanX = Math.max(...xs) - Math.min(...xs), spanY = Math.max(...ys) - Math.min(...ys)
    expect(spanX <= ROUTE_BOX.width - 88 + 0.001).toBe(true)
    expect(spanY <= ROUTE_BOX.height - 88 + 0.001).toBe(true)
    expect(Math.max(spanX / (ROUTE_BOX.width - 88), spanY / (ROUTE_BOX.height - 88))).toBeCloseTo(1)
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(ROUTE_BOX.width / 2)
    expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(ROUTE_BOX.height / 2)
    const [a, b] = points
    if (a.lng !== b.lng && a.lat !== b.lat) {
      const ratio = Math.abs((b.lng - a.lng) * Math.cos((a.lat + b.lat) * Math.PI / 360) / (b.lat - a.lat))
      expect(spanX / spanY).toBeCloseTo(ratio)
    }
  })

  it('centres repeated points and rejects invalid coordinates', () => {
    expect(fitRoutePoints([{ lat: NaN, lng: 70, day: 0 }])).toEqual([])
    const fitted = fitRoutePoints(Array.from({ length: 4 }, (_, day) => ({ lat: 30, lng: 75, day })))
    expect(fitted.every(p => p.x === 180 && p.y === 130)).toBe(true)
    expect(routeBadges(fitted).map(b => b.label)).toEqual(['1–4'])
  })

  it('merges collisions until no badges overlap and keeps every day', () => {
    const points = Array.from({ length: 30 }, (_, day) => ({ lat: 30, lng: 75, day, x: 40 + day * 9, y: 100 + day % 3 * 24 }))
    const badges = routeBadges(points)
    expect(badges.flatMap(b => b.days).sort((a, b) => a - b)).toEqual(points.map(p => p.day))
    for (const [i, a] of badges.entries()) {
      for (const b of badges.slice(i + 1)) {
        expect(Math.abs(a.x - b.x) >= (a.width + b.width) / 2 + 6 || Math.abs(a.y - b.y) >= 34).toBe(true)
      }
      expect(a.x - a.width / 2).toBeGreaterThanOrEqual(8)
      expect(a.x + a.width / 2).toBeLessThanOrEqual(352)
    }
  })

  it('anchors endpoint labels within the map', () => {
    for (const point of [{ x: 44, y: 44 }, { x: 316, y: 216 }]) {
      for (const end of [false, true]) {
        const label = routeEndpointLabel(point, 'A long endpoint name by the coast', end)
        expect(label.x).toBeGreaterThanOrEqual(8)
        expect(label.x + label.width).toBeLessThanOrEqual(352)
        expect(label.y).toBeGreaterThanOrEqual(8)
        expect(label.y + 22).toBeLessThanOrEqual(252)
        expect(Math.abs(label.y - point.y)).toBeLessThanOrEqual(44)
      }
    }
  })

  it('withholds locked endpoint names from text and accessible markup', () => {
    const props = { count: 3, startLabel: 'Private start', endLabel: 'Private end', roundTripNote: 'Return to Private start',
      points: [{ lat: 30, lng: 75, day: 0 }, { lat: 31, lng: 76, day: 1 }, { lat: 32, lng: 77, day: 2 }] }
    const markup = renderToStaticMarkup(createElement(RouteSnapshot, { ...props, lockedDays: new Set([0, 2]) }))
    expect(markup).not.toContain('Private')
    expect(markup).toContain('route-map-leg-locked')
    expect(markup).toContain('Free days')
    expect(markup).toContain('Locked days')
    expect(markup).toContain('Days 1')
    const open = renderToStaticMarkup(createElement(RouteSnapshot, props))
    expect(open).toContain('Private start')
    expect(open).toContain('Private end')
    expect(open).not.toContain('route-map-leg-locked')
  })

  it('shows no invented road when saved coordinates are absent', () => {
    const markup = renderToStaticMarkup(createElement(RouteSnapshot, { count: 10 }))
    expect(markup).toContain('No saved route coordinates.')
    expect(markup).not.toContain('<svg')
  })
})

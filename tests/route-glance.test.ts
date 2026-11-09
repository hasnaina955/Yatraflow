import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { glanceBadges, RouteGlanceView } from '../src/components/storefront/RouteGlance'
import type { RouteHeightPoint, RouteHeightsResult } from '../src/lib/elevation'
import type { RouteHeightPlotMark } from '../src/lib/elevationPlot'

const point = (key: string, dayIndex: number, distanceKm: number, elevationM: number, breakBefore = false): RouteHeightPoint =>
  ({ key, title: `Place ${key}`, kind: 'stop', dayIndex, lat: 32, lng: 78, distanceKm, elevationM, breakBefore })

const points = [
  point('a', 0, 0, 2200), point('b', 0, 40, 2600), point('c', 1, 90, 3400),
  point('d', 4, 260, 3900, true), point('e', 4, 300, 4100),
]
const measured: RouteHeightsResult = {
  kind: 'measured', points, zoom: 10, missingTiles: 0,
  runs: [
    { points: points.slice(0, 3).map(p => ({ distanceKm: p.distanceKm, elevationM: p.elevationM as number })) },
    { points: points.slice(3).map(p => ({ distanceKm: p.distanceKm, elevationM: p.elevationM as number })) },
  ],
  stats: { minM: 2200, maxM: 4100, peak: points[4], sampled: 5, missing: 0 },
}
const render = (props: Partial<Parameters<typeof RouteGlanceView>[0]>) =>
  renderToStaticMarkup(createElement(RouteGlanceView, { state: measured, paidIndexes: [2, 3], places: null, ...props }))

describe('glanceBadges', () => {
  const mark = (x: number, dayIndex: number | null): RouteHeightPlotMark =>
    ({ x, y: 50, title: 't', kind: 'stop', dayIndex, distanceKm: x, elevationM: 1 })

  it('puts one badge on the first mark of each day', () => {
    expect(glanceBadges([mark(10, 0), mark(80, 0), mark(150, 1)]).map(b => b.day)).toEqual([0, 1])
  })

  it('skips a mark no day owns', () => {
    expect(glanceBadges([mark(10, null), mark(90, 2)]).map(b => b.day)).toEqual([2])
  })

  it('drops a badge that would crowd the one before it', () => {
    expect(glanceBadges([mark(10, 0), mark(30, 1), mark(120, 2)]).map(b => b.day)).toEqual([0, 2])
  })
})

describe('RouteGlanceView', () => {
  it('draws the road with one-based day milestones', () => {
    const html = render({})
    expect(html).toContain('pi-glance-casing')
    expect(html).toContain('pi-glance-centre')
    expect(html).toContain('>1</text>')
    expect(html).toContain('2,200 to 4,100 m')
  })

  it('marks the paid stretch by day numbers only', () => {
    const html = render({})
    expect(html).toContain('Days 3–4 · paid')
    expect(html).toContain('Days 3–4 are in the paid plan.')
  })

  it('never prints a place name on the road', () => {
    const html = render({})
    for (const p of points) expect(html).not.toContain(p.title)
  })

  it('shows the stop line only when the page passes one', () => {
    expect(render({ places: 'Shimla · Kaza · Manali' })).toContain('Shimla · Kaza · Manali')
    expect(render({})).not.toContain('pi-glance-places')
  })

  it('keeps loading, failed and empty apart, with no road', () => {
    const loading = render({ state: { kind: 'loading' } })
    const failed = render({ state: { kind: 'failed', reason: 'tiles' } as RouteHeightsResult })
    const empty = render({ state: { kind: 'empty', reason: 'no-points' } })
    expect(loading).toContain('Loading the road…')
    expect(failed).toContain('The road heights are not available.')
    expect(empty).toContain('The free days have no saved places to measure.')
    for (const html of [loading, failed, empty]) expect(html).not.toContain('pi-glance-casing')
  })

  it('offers Ride along only with a handler', () => {
    expect(render({ onRide: () => {} })).toContain('Ride along the route')
    expect(render({})).not.toContain('Ride along the route')
  })
})

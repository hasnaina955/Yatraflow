// W4-B: the map and the left rail follow the active lens.
// The node env has no DOM, so component checks read the markup string.
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { bandCounts, scopeBandCountsText, MapScopeBand } from '../src/pages/trip/map/MapScopeBand'
import { LensRailExtras, fixStopTitle, fixTargetStopId, driveBudgetStep, driveBudgetBarText } from '../src/pages/trip/map/LensRailExtras'
import { fixMarkLabel, ringBounds, stayRingsFillGeoJson, clampBoundsWithin } from '../src/lib/mapStyles/lensMarks'

const noop = () => undefined
const clock = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

describe('W4-B map and rail', () => {
  it('proves the runner runs', () => { expect(1).toBe(1) })

  it('buckets only known scope bands', () => {
    expect(bandCounts(['inside', 'inside', 'just-past', 'outside', 'unknown', 'over-budget']))
      .toEqual({ inside: 2, justPast: 1, worthDetour: 1 })
  })

  it('omits unknown count parts', () => {
    expect(scopeBandCountsText(null)).toBeNull()
    expect(scopeBandCountsText({ inside: 9, justPast: null, worthDetour: 1 }))
      .toBe('9 Inside 1 Worth the detour')
  })

  it('renders no counts line when counts are unknown', () => {
    const html = renderToStaticMarkup(createElement(MapScopeBand, {
      minutes: 30, onMinutes: noop, counts: null,
    }))
    expect(html).not.toContain('mv2-lens-scope-counts')
  })

  it('renders the counts line when counts are known', () => {
    const html = renderToStaticMarkup(createElement(MapScopeBand, {
      minutes: 30, onMinutes: noop,
      counts: { inside: 9, justPast: 2, worthDetour: 1 },
    }))
    expect(html).toContain('Fits: 9')
    expect(html).not.toContain('2 just past')
    expect(html).not.toContain('1 Worth the detour')
    expect(html).not.toContain('·')
  })

  it('marks the active ring with aria-pressed', () => {
    const html = renderToStaticMarkup(createElement(LensRailExtras, {
      lens: 'stay', ringId: 'walk-15', onRing: noop,
    }))
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('aria-pressed="false"')
    expect(html).toContain('How far from the base')
  })

  it('adds no rail card for a lens other than stay', () => {
    expect(renderToStaticMarkup(createElement(LensRailExtras, {
      lens: 'drive', ringId: 'walk-15', onRing: noop,
    }))).toBe('')
  })

  it('picks the fix stop by id', () => {
    const days = [{ stops: [{ id: 's1', title: 'Waterfall' }, { id: 's2', title: 'Periyar boat' }] }]
    expect(fixStopTitle(days, 's2')).toBe('Periyar boat')
    expect(fixStopTitle(days, 'missing')).toBeNull()
  })

  it('falls back to the day commitment when the target has no stop id', () => {
    const commitments = [{ dayIndex: 0, stopId: 'fixture-boat' }, { dayIndex: 1, stopId: 'other' }]
    expect(fixTargetStopId({ stopId: 's2' }, commitments, 0)).toBe('s2')
    expect(fixTargetStopId({ stopId: null }, commitments, 0)).toBe('fixture-boat')
    expect(fixTargetStopId({ stopId: null }, commitments, 2)).toBeNull()
    expect(fixTargetStopId(null, commitments, 0)).toBe('fixture-boat')
  })

  it('shows the planned budget only when its total and limit are known', () => {
    expect(driveBudgetStep(9, 45)).toBe(1)
    expect(driveBudgetStep(null, 45)).toBeNull()
    expect(driveBudgetBarText({ kind: 'known', usedMin: 12, budgetMin: 45 }))
      .toBe('Detour 12 / 45 min')
    expect(driveBudgetBarText({ kind: 'unknown', usedMin: null, budgetMin: 45 })).toBe('Detour · Not measured')
    // A planned total can exceed its limit.
    expect(driveBudgetBarText({ kind: 'known', usedMin: 78, budgetMin: 25 }))
      .toBe('Detour 78 / 25 min · 53 min over')
    expect(driveBudgetBarText({ kind: 'known', usedMin: 25, budgetMin: 25 })).toBe('Detour 25 / 25 min')
    expect(driveBudgetBarText(null)).toBeNull()
  })

  it('builds the fix label from known facts only', () => {
    expect(fixMarkLabel('Boat', '15:30', null)).toBe('Boat 15:30')
    expect(fixMarkLabel('Boat', null, null)).toBe('Boat')
    expect(fixMarkLabel(null, '15:30', null)).toBeNull()
    expect(fixMarkLabel('Boat', '15:30', '15:05')).toBe('Boat 15:30 · jetty 15:05')
  })

  it('frames a ring and fills it as a polygon', () => {
    const ring: [number, number][] = [[77, 9], [78, 9], [78, 10], [77, 10], [77, 9]]
    expect(ringBounds(ring)).toEqual([[77, 9], [78, 10]])
    expect(stayRingsFillGeoJson([{ id: 'r', label: '15 min walk', ring }]).features[0].geometry.type)
      .toBe('Polygon')
  })

  it('clamps a camera fit inside the day route extent', () => {
    const route: [[number, number], [number, number]] = [[77, 9], [78, 10]]
    expect(clampBoundsWithin([[76, 8], [79, 11]], route)).toEqual(route)
    expect(clampBoundsWithin([[77.2, 9.2], [77.8, 9.8]], route))
      .toEqual([[77.2, 9.2], [77.8, 9.8]])
    expect(clampBoundsWithin(null, route)).toBeNull()
  })

  it('guards the source: the old drive ledger rows are gone', () => {
    const source = read('../src/pages/trip/MapTab.tsx')
    expect(source).not.toContain('seeForRail.slice(0, SEE_VISIBLE).map(ledgerRow)')
    expect(source).toContain('More like this')
  })

  it('guards the source: stay framing waits for the lens flag', () => {
    const source = read('../src/components/TripMap.tsx')
    expect(source).toContain('stayFrameAction({')
    expect(source).toContain('if (!stayOwnsCamera)')
    expect(source).toContain('clampBoundsWithin(framed, boundsOf(fitPoints))')
    expect(source).toContain("'fill-opacity': 0.16")
    expect(source).toContain('width={2} opacity={0.95}')
  })

  it('guards the source: extras sit in the rail flow', () => {
    const chrome = read('../src/components/map/MapWorkspaceChrome.tsx')
    const stops = chrome.indexOf('</ol>')
    const extras = chrome.indexOf('{railExtras}')
    const footer = chrome.indexOf('<footer className="mv2-day-footer">')
    expect(stops).toBeGreaterThan(-1)
    expect(extras).toBeGreaterThan(stops)
    expect(footer).toBeGreaterThan(extras)
    expect(chrome).toContain('is-fix-problem')
    expect(chrome).toContain('mv2-window-row')
    expect(chrome).toContain('mv2-budget-progress')
  })

  it('guards the source: no absolute rail card and no second budget card', () => {
    const css = read('../src/styles/components/map-v2-rail.css')
    expect(css).toContain('.mv2-itinerary .mv2-lens-rail-card {\n  position: static;')
    const extras = read('../src/pages/trip/map/LensRailExtras.tsx')
    expect(extras).not.toContain('The detour budget for this day is unknown')
    expect(extras).not.toContain('mv2-lens-window-row')
  })
})

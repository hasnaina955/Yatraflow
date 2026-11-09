// W4-B: the map and the left rail follow the active lens.
// The node env has no DOM, so component checks read the markup string.
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { bandCounts, scopeBandCountsText, MapScopeBand } from '../src/pages/trip/map/MapScopeBand'
import { LensRailExtras, fixStopTitle, fixTargetStopId, driveBudgetStep } from '../src/pages/trip/map/LensRailExtras'
import { fixMarkLabel, ringBounds, stayRingsFillGeoJson } from '../src/lib/mapStyles/lensMarks'

const noop = () => undefined
const clock = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

describe('W4-B map and rail', () => {
  it('proves the runner runs', () => { expect(1).toBe(1) })

  it('buckets only known scope bands', () => {
    expect(bandCounts(['inside', 'inside', 'just-past', 'outside', 'unknown', 'over-budget']))
      .toEqual({ inside: 2, justPast: 1, worthDetour: 1 })
  })

  it('omits unknown count parts', () => {
    expect(scopeBandCountsText(null)).toBeNull()
    expect(scopeBandCountsText({ inside: 9, justPast: null, worthDetour: 1 }))
      .toBe('9 inside · 1 worth the detour')
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
    expect(html).toContain('9 inside · 2 just past it · 1 worth the detour')
  })

  it('marks the active ring with aria-pressed', () => {
    const html = renderToStaticMarkup(createElement(LensRailExtras, {
      lens: 'stay', clock, windowRow: null, ringId: 'walk-15', onRing: noop,
      fixStopTitle: null, driveBudget: null,
    }))
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('aria-pressed="false"')
    expect(html).toContain('How far from the base')
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

  it('renders the coral problem row from the stop id', () => {
    const days = [{ stops: [{ id: 's2', title: 'Periyar boat' }] }]
    const html = renderToStaticMarkup(createElement(LensRailExtras, {
      lens: 'fix', clock, windowRow: null, ringId: 'walk-15', onRing: noop,
      fixStopTitle: fixStopTitle(days, 's2'), driveBudget: null,
    }))
    expect(html).toContain('mv2-lens-problem-row')
    expect(html).toContain('Periyar boat')
  })

  it('shows the budget bar only when both numbers are known', () => {
    expect(driveBudgetStep(9, 45)).toBe(1)
    expect(driveBudgetStep(null, 45)).toBeNull()
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

  it('guards the source: the old drive ledger rows are gone', () => {
    const source = readFileSync(new URL('../src/pages/trip/MapTab.tsx', import.meta.url), 'utf8')
      .replace(/\r\n/g, '\n')
    expect(source).not.toContain('seeForRail.slice(0, SEE_VISIBLE).map(ledgerRow)')
    expect(source).toContain('More like this')
  })
})

// W7-E: stay window rows, the thin-days caption, the preview chip and the
// re-timed ribbon. The node env has no DOM, so component checks read markup.
import { daysCaptionText } from '../src/components/map/railModel'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MapItinerary } from '../src/components/map/MapWorkspaceChrome'
import { ribbonClockMinutes, retimedStops, type RibbonStop } from '../src/lib/mapJourneyRibbon'
import type { Trip } from '../src/data/types'
import type { Journey } from '../src/lib/engine'

const noop = () => undefined
const clock = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

const trip = {
  id: 'w7e-trip',
  name: 'W7-E trip',
  startDate: '2027-11-14',
  fixedCommitments: [],
  days: [{ id: 'w7e-day', index: 0, title: 'Day one', startTime: '09:00', stops: [] }],
} as unknown as Trip

const anchor = (id: string, title: string, arrive: string, kind: 'start' | 'destination') => ({
  stop: { id, title, category: 'travel' },
  title,
  arrive,
  depart: arrive,
  dwellMinutes: 0,
  kind,
})
const point = (id: string, title: string, arrive: string) => ({
  stop: { id, title, category: 'nature' },
  title,
  arrive,
  depart: arrive,
  dwellMinutes: 20,
  kind: 'stop',
})

const journey = {
  dayIndex: 0,
  startTime: '09:00',
  startTitle: 'Munnar',
  endTitle: 'Thekkady',
  distanceKm: 40,
  driveMinutes: 90,
  points: [
    anchor('start', 'Munnar', '09:00', 'start'),
    point('tea', 'Tea stop', '11:00'),
    point('tea-2', 'Tea stop', '13:00'),
    anchor('end', 'Thekkady', '15:00', 'destination'),
  ],
} as unknown as Journey

function rail(props: Record<string, unknown> = {}) {
  return renderToStaticMarkup(createElement(MapItinerary, {
    trip,
    journey,
    activeDay: 0,
    budgetMin: 45,
    selectedStop: null,
    allDays: false,
    onShowAll: noop,
    onDayChange: noop,
    onSelect: noop,
    onFold: noop,
    ...props,
  }))
}

function nth(haystack: string, needle: string, n: number) {
  let at = -1
  for (let i = 0; i < n; i += 1) at = haystack.indexOf(needle, at + 1)
  return at
}

const ribbonStop = (id: string, arrive: number, depart: number): RibbonStop => ({
  point: { stop: { id }, title: id } as unknown as RibbonStop['point'],
  arrive,
  depart,
})
const preview = (clocks: Array<{ stopId: string; to: string }>) => ({
  newStop: { arrive: '10:00', depart: '10:20' },
  clocks,
})

describe('W7-E stay window rows', () => {
  it('proves the runner runs', () => { expect(1).toBe(1) })

  it('renders one row for each stay window in time order', () => {
    const html = rail({
      windowRows: [
        { label: 'Free evening', startMin: 1020, endMin: 1200, active: false },
        { label: 'Before you leave', startMin: 480, endMin: 600, active: true },
      ],
      clock,
    })
    expect(html.match(/mv2-window-row/g)).toHaveLength(2)
    expect(html.indexOf('Before you leave')).toBeLessThan(html.indexOf('Free evening'))
  })

  it('gives the outline to the active window only', () => {
    const html = rail({
      windowRows: [
        { label: 'Free evening', startMin: 1020, endMin: 1200, active: false },
        { label: 'Before you leave', startMin: 480, endMin: 600, active: true },
      ],
      clock,
    })
    expect(html.match(/is-active-window/g)).toHaveLength(1)
  })

  it('draws no row when the day has no windows', () => {
    const html = rail({ windowRows: [], clock })
    expect(html).not.toContain('mv2-window-row')
  })

  it('keeps one active row for a caller that holds one window', () => {
    const html = rail({ windowRow: { label: 'Free evening', startMin: 1020, endMin: 1200 }, clock })
    expect(html).toContain('mv2-window-row is-active-window')
  })
})

describe('W7-E thin days caption', () => {
  it('passes the selected day only while all days show', () => {
    const mapTab = read('../src/pages/trip/MapTab.tsx')
    expect(mapTab).toContain('mapShowsAll ? { selectedDay: activeDayIndex } : {}')
    expect(mapTab).toContain('{...thinDays}')
  })

  it('ships the short caption because a thin line has no click handler', () => {
    const mapTab = read('../src/pages/trip/MapTab.tsx')
    // The copy lives in railModel and names the day pills, not the thin line.
    expect(mapTab).toContain('daysCaptionText(mapShowsAll, ROUTE_PAINT.contextOpacity)')
    expect(daysCaptionText(true, 0.4)).toBe('Other days draw thin at 40%. Tap one to move the map there.')
    expect(daysCaptionText(true, 0.4)).not.toContain('line')
    const tripMap = read('../src/components/TripMap.tsx')
    const layers = read('../src/components/map/DayRouteLayers.tsx')
    expect(layers).toContain('interactive={false}')
    expect(tripMap).not.toContain('onDayFilterChange(day')
  })

  it('renders the caption under the day list only when all days show', () => {
    const chrome = read('../src/components/map/MapWorkspaceChrome.tsx')
    expect(chrome.indexOf('{daysCaption &&')).toBeGreaterThan(chrome.indexOf('mv2-day-strip'))
    expect(rail({ allDays: true, daysCaption: 'Other days draw thin.' })).toContain('Other days draw thin.')
    expect(rail({ allDays: false })).not.toContain('Other days draw thin.')
  })
})

describe('W7-E preview chip by stop id', () => {
  it('gives one chip when two stops share one title', () => {
    const html = rail({ previewChip: { index: 2, stopIds: ['tea', 'tea-2'], label: 'New pick' } })
    expect(html.match(/mv2-lens-tag/g)).toHaveLength(1)
  })

  it('puts the chip before the first row when the index is zero', () => {
    const html = rail({ previewChip: { index: 0, stopIds: ['tea', 'tea-2'], label: 'New pick' } })
    expect(html.match(/mv2-lens-tag/g)).toHaveLength(1)
    expect(html.indexOf('mv2-lens-tag')).toBeLessThan(html.indexOf('class="mv2-stop"'))
  })

  it('maps anchors by stop id, not by journey position', () => {
    const html = rail({ previewChip: { index: 1, stopIds: ['tea', 'tea-2'], label: 'New pick' } })
    const second = nth(html, 'class="mv2-stop"', 2)
    expect(html.indexOf('mv2-lens-tag')).toBeGreaterThan(second)
  })

  it('draws no chip when the label is unknown', () => {
    const html = rail({ previewChip: { index: 1, stopIds: ['tea'], label: null } })
    expect(html).not.toContain('mv2-lens-tag')
  })
})

describe('W7-E re-timed ribbon', () => {
  it('keeps the dwell time of a moved stop', () => {
    const out = retimedStops(
      [ribbonStop('a', 600, 630), ribbonStop('b', 700, 740)],
      preview([{ stopId: 'b', to: '12:00' }]),
    )
    expect(out[1].arrive).toBe(720)
    expect(out[1].depart - out[1].arrive).toBe(40)
  })

  it('keeps the time of a stop outside the preview clocks', () => {
    const stops = [ribbonStop('a', 600, 630), ribbonStop('b', 700, 740)]
    const out = retimedStops(stops, preview([{ stopId: 'b', to: '12:00' }]))
    expect(out[0]).toEqual(stops[0])
  })

  it('rolls a time after midnight to the next day', () => {
    const out = retimedStops(
      [ribbonStop('a', 1380, 1400), ribbonStop('b', 1420, 1450)],
      preview([{ stopId: 'b', to: '00:30' }]),
    )
    expect(out[1].arrive).toBe(1470)
    expect(out[1].arrive).toBeGreaterThanOrEqual(out[0].depart)
  })

  it('ignores a bad clock text', () => {
    const stops = [ribbonStop('a', 600, 630)]
    const out = retimedStops(stops, preview([{ stopId: 'a', to: 'not-a-clock' }]))
    expect(out[0]).toEqual(stops[0])
    expect(ribbonClockMinutes('not-a-clock')).toBeNull()
    expect(ribbonClockMinutes('12:30')).toBe(750)
  })
})

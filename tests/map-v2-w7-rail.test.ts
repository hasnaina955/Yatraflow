// W7 Package A: one detour budget block, the stay window row and the fix reason.
// The node env has no DOM, so component checks read the markup string.
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MapItinerary } from '../src/components/map/MapWorkspaceChrome'
import { budgetBlockView, fixReasonLine } from '../src/pages/trip/map/LensRailExtras'
import type { Trip } from '../src/data/types'
import type { Journey } from '../src/lib/engine'

const noop = () => undefined
const clock = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

const trip = {
  id: 'w7-trip',
  name: 'W7 trip',
  startDate: '2027-11-14',
  fixedCommitments: [],
  days: [{ id: 'w7-day', index: 0, title: 'Day one', startTime: '10:00', stops: [] }],
} as unknown as Trip

const journey = {
  dayIndex: 0,
  startTime: '10:00',
  startTitle: 'Munnar',
  endTitle: 'Thekkady',
  distanceKm: 10,
  driveMinutes: 30,
  points: [{
    stop: { id: 'boat', title: 'Periyar boat', category: 'nature' },
    title: 'Periyar boat',
    arrive: '17:00',
    dwellMinutes: 30,
    kind: 'stop',
  }],
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

describe('W7 left rail', () => {
  it('proves the runner runs', () => { expect(1).toBe(1) })

  it('shows the label and the budget alone when the used part is unknown', () => {
    expect(budgetBlockView(null, 35)).toEqual({ label: 'Detour budget', value: '35 min', showBar: false })
  })

  it('shows the used-of line and the bar when every part is known', () => {
    const view = budgetBlockView({ text: '12 of 45 min · 2 free stops', step: 2 }, 45)
    expect(view.label).toBe('Detour budget')
    expect(view.value).toBe('12 of 45 min · 2 free stops')
    expect(view.showBar).toBe(true)
  })

  it('renders one labelled block with no bar for a lens with no used part', () => {
    const html = rail()
    expect(html).toContain('Detour budget')
    expect(html).toContain('45 min')
    expect(html).not.toContain('Detour budget used')
    expect(html).not.toContain('min detour budget')
  })

  it('renders the same label and the bar when the used part is known', () => {
    const html = rail({ budgetBar: { text: '12 of 45 min · 2 free stops', step: 2 } })
    expect(html.match(/mv2-lens-budget-label/g)).toHaveLength(1)
    expect(html).toContain('12 of 45 min · 2 free stops')
    expect(html).toContain('role="progressbar"')
  })

  it('writes the problem sub line only when every part is known', () => {
    expect(fixReasonLine('Periyar boat', '2:53 PM', 'under ~45 min before the 15:00 commitment'))
      .toBe('Periyar boat 2:53 PM · under ~45 min before the 15:00 commitment')
    expect(fixReasonLine(null, '2:53 PM', 'reason')).toBeNull()
    expect(fixReasonLine('Periyar boat', null, 'reason')).toBeNull()
    expect(fixReasonLine('Periyar boat', '2:53 PM', null)).toBeNull()
    expect(fixReasonLine('Periyar boat', '2:53 PM', '  ')).toBeNull()
  })

  it('renders the window row with its time and no pick count', () => {
    const html = rail({ windowRow: { label: 'Free evening', startMin: 1020, endMin: 1200 }, clock })
    expect(html).toContain('mv2-window-row is-active-window')
    expect(html).toContain('mv2-lens-window-time')
    expect(html).toContain('17:00')
    expect(html).toContain('Free evening')
    expect(html).toContain('17:00–20:00')
    expect(html).not.toContain('picks nearby')
  })

  it('guards the source: no days caption while other days are not drawn thin', () => {
    expect(read('../src/pages/trip/MapTab.tsx')).not.toContain('selectedDay=')
    expect(read('../src/components/map/MapWorkspaceChrome.tsx')).not.toContain('Other days draw thin')
  })

  it('guards the source: one budget block and the fix reason live in the rail', () => {
    const chrome = read('../src/components/map/MapWorkspaceChrome.tsx')
    expect(chrome).toContain('mv2-lens-budget')
    expect(chrome).toContain('mv2-lens-fix-reason')
    expect(chrome).toContain('mv2-lens-window-time')
    const css = read('../src/styles.css')
    expect(css).toContain('.mv2-lens-budget .mv2-budget-progress { grid-column: 1 / -1;')
  })
})

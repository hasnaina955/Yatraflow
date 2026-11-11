// W14 rail and journey strip: the pure rules, plus a source check that the
// board values and the honest-data rules stay in place. Node env, no DOM.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { aroundKmText, daysCaptionText, picksText, railMarkerKind, railStopPaid, stayRailSub, stayRailTitle, windowAtMin } from '../src/components/map/railModel'
import { ribbonAxis, ribbonLabelLayout, ribbonPercent, ribbonTickText } from '../src/lib/mapJourneyRibbon'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

describe('rail marker kinds', () => {
  const base = { kind: 'stop' as const, category: 'sight', locked: false, isFix: false }
  it('draws one mark per row in order of weight', () => {
    expect(railMarkerKind(base)).toBe('number')
    expect(railMarkerKind({ ...base, category: 'hotel' })).toBe('stay')
    expect(railMarkerKind({ ...base, kind: 'start' })).toBe('car')
    expect(railMarkerKind({ ...base, kind: 'destination' })).toBe('car')
    expect(railMarkerKind({ ...base, category: 'hotel', locked: true })).toBe('lock')
    expect(railMarkerKind({ ...base, locked: true, isFix: true })).toBe('risk')
  })
  it('gives a halt no house mark', () => {
    expect(railMarkerKind({ ...base, kind: 'halt' })).toBe('number')
  })
})

describe('the Paid chip', () => {
  it('shows only for an expense that someone paid and that names the stop', () => {
    expect(railStopPaid(undefined, 'a')).toBe(false)
    expect(railStopPaid([], 'a')).toBe(false)
    expect(railStopPaid([{ stopId: 'a', paidBy: null }], 'a')).toBe(false)
    expect(railStopPaid([{ stopId: 'b', paidBy: 'u1' }], 'a')).toBe(false)
    expect(railStopPaid([{ stopId: 'a', paidBy: 'u1' }], 'a')).toBe(true)
  })
})

describe('stay header facts', () => {
  it('keeps out a part with no fact', () => {
    expect(stayRailSub({ arriveText: null, commitmentTitle: null, commitmentText: null, freeStartMin: null, freeEndMin: null })).toBeNull()
    expect(stayRailSub({ arriveText: '17:30', commitmentTitle: null, commitmentText: null, freeStartMin: 1080, freeEndMin: 1260 })).toBe('Arrive 17:30 · 3 h free')
    expect(stayRailSub({ arriveText: null, commitmentTitle: 'Boat', commitmentText: '15:30', freeStartMin: null, freeEndMin: null })).toBe('Boat at 15:30')
  })
  it('drops the check-in lead and never invents a name', () => {
    expect(stayRailTitle('Check in · Hill Resort', false)).toBe('Hill Resort · tonight')
    expect(stayRailTitle('Hill Resort', true)).toBe('Hill Resort · evening')
    expect(stayRailTitle(null, true)).toBeNull()
    expect(stayRailTitle('  ', true)).toBeNull()
  })
})

describe('window row facts', () => {
  it('hides what the trip does not hold', () => {
    expect(picksText(0)).toBeNull()
    expect(picksText(null)).toBeNull()
    expect(picksText(1)).toBe('1 pick')
    expect(picksText(7)).toBe('7 picks')
    expect(aroundKmText(undefined)).toBeNull()
    expect(aroundKmText(-1)).toBeNull()
    expect(aroundKmText(46.6)).toBe('around km 47')
  })
  it('uses the engine arrival only inside the window', () => {
    expect(windowAtMin(660, 870, 700)).toBe(700)
    expect(windowAtMin(660, 870, 900)).toBe(660)
    expect(windowAtMin(660, 870, null)).toBe(660)
  })
})

describe('days caption', () => {
  it('states the real map behaviour for both modes', () => {
    expect(daysCaptionText(true, 0.4)).toBe('Other days draw thin at 40%. Tap one to move the map there.')
    expect(daysCaptionText(false, 0.4)).toContain('Choose All')
  })
})

describe('journey strip axis', () => {
  it('starts on the hour, ends after the last window and ticks odd hours', () => {
    const axis = ribbonAxis({ start: 545, end: 900 }, [{ startMin: 1200, endMin: 1260 }])
    expect(axis.start).toBe(540)
    expect(axis.end).toBeGreaterThanOrEqual(1260)
    expect(axis.ticks.every(tick => (tick / 60) % 2 === 1)).toBe(true)
  })
  it('writes ticks for both clocks', () => {
    expect(ribbonTickText(540, '24h')).toBe('09')
    expect(ribbonTickText(540, '12h')).toBe('9 AM')
    expect(ribbonTickText(0, '12h')).toBe('12 AM')
    expect(ribbonTickText(13 * 60, '12h')).toBe('1 PM')
  })
  it('clamps a position to the axis', () => {
    expect(ribbonPercent({ start: 0, end: 100 }, 50)).toBe(50)
    expect(ribbonPercent({ start: 0, end: 100 }, 500)).toBe(100)
    expect(ribbonPercent({ start: 10, end: 10 }, 10)).toBe(0)
  })
  it('hides a label that would sit on the one before and keeps edges inside', () => {
    const layout = ribbonLabelLayout([
      { key: 'a', center: 4, width: 40 },
      { key: 'b', center: 30, width: 40 },
      { key: 'c', center: 196, width: 40 },
    ], 200)
    expect(layout.hidden).toContain('b')
    expect(layout.shift.a).toBeGreaterThan(0)
    expect(layout.shift.c).toBeLessThan(0)
  })
})

describe('rail and strip source rules', () => {
  const chrome = read('../src/components/map/MapWorkspaceChrome.tsx')
  const mapTab = read('../src/pages/trip/MapTab.tsx')
  const css = read('../src/styles.css')
  it('colours day marks through dayColor and numerals white', () => {
    expect(chrome).toContain('dayColor(')
    expect(css).toContain('color: var(--color-primary-foreground)')
  })
  it('hides the budget block on the Stay lens and takes the Paid chip from expenses', () => {
    expect(mapTab).toContain("hideBudget={lens === 'stay'}")
    expect(chrome).toContain('railStopPaid')
  })
  it('drops the plan clock block from the strip', () => {
    expect(chrome).not.toContain('mv2-clock-plan')
    expect(chrome).toContain('Day {(journey?.dayIndex ?? 0) + 1}')
  })
  it('keeps one W14 block at the end of the stylesheet', () => {
    expect(css.match(/\/\* 911-W14-rail:/g)).toHaveLength(1)
  })
})

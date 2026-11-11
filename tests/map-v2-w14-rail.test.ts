// W14 rail and journey strip: the pure rules, plus a source check that the
// board values and the honest-data rules stay in place. Node env, no DOM.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { aroundKmText, daysCaptionText, fixProblemSubLine, picksText, railMarkerKind, railStopNumber, railStopPaid, stayRailSub, stayRailTitle, windowAtMin } from '../src/components/map/railModel'
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
    const base = { id: 'a', notes: undefined, status: 'confirmed' as const }
    expect(railStopPaid(undefined, base)).toBe(false)
    expect(railStopPaid([], base)).toBe(false)
    expect(railStopPaid([{ id: 'e', label: 'Tea', category: 'food', amountInr: 20, stopId: 'b' }], base)).toBe(false)
    expect(railStopPaid([{ id: 'e', label: 'Boat', category: 'activities', amountInr: 900, stopId: 'a' }], base)).toBe(true)
    expect(railStopPaid([], { ...base, notes: 'Tickets booked · PNR-1' })).toBe(true)
    expect(railStopPaid([], { ...base, status: 'needs-booking' })).toBe(true)
  })
})

describe('rail stop numbers', () => {
  it('numbers the first visited stop 1 and skips the departure anchor', () => {
    const points = [
      { kind: 'start' as const },
      { kind: 'visit' as const },
      { kind: 'visit' as const },
      { kind: 'destination' as const, synthesized: true },
      { kind: 'visit' as const },
    ]
    expect(railStopNumber(points, 0)).toBe(0)
    expect(railStopNumber(points, 1)).toBe(1)
    expect(railStopNumber(points, 2)).toBe(2)
    expect(railStopNumber(points, 3)).toBe(2)
    expect(railStopNumber(points, 4)).toBe(3)
  })
  it('reads the same number source as the map marker', () => {
    const chrome = read('../src/components/map/MapWorkspaceChrome.tsx')
    expect(chrome).toContain('railStopNumber(points, index)')
  })
})

describe('the Fix problem subtitle', () => {
  it('builds the board line from the engine evidence and keeps unknown facts out', () => {
    expect(fixProblemSubLine({ title: 'Conflicts with Periyar boat', evidence: ['You reach Periyar boat ~15:05, after the 15:00 commitment.'] })).toBe('Jetty 15:05 · boarding closed')
    expect(fixProblemSubLine({ title: 'Thin buffer before Periyar boat', evidence: ['You reach Periyar boat ~14:53, under ~45 min before the 15:00 commitment.'] })).toBe('Jetty 14:53 · before 15:00')
    expect(fixProblemSubLine({ title: 'Short rest', evidence: ['Day 1 ends ~23:40 and Day 2 starts 06:00.'] })).toBe('Day 1 ends ~23:40 and Day 2 starts 06:00.')
    expect(fixProblemSubLine(null)).toBeNull()
    expect(fixProblemSubLine({ title: 'Unknown', evidence: [] })).toBeNull()
  })
})

describe('stay header facts', () => {
  it('keeps out a part with no fact', () => {
    expect(stayRailSub({ arriveText: null, commitmentTitle: null, commitmentText: null, freeStartMin: null, freeEndMin: null })).toBeNull()
    expect(stayRailSub({ arriveText: '17:30', commitmentTitle: null, commitmentText: null, freeStartMin: 1080, freeEndMin: 1260 })).toBe('Arrive 17:30 · 3 h free after it')
    expect(stayRailSub({ arriveText: null, commitmentTitle: 'Periyar boat', commitmentText: '15:30', freeStartMin: null, freeEndMin: null })).toBe('Periyar boat at 15:30')
  })
  it('drops the check-in lead and never invents a name', () => {
    expect(stayRailTitle('Thekkady', false)).toBe('Thekkady · tonight')
    expect(stayRailTitle('Thekkady', true)).toBe('Thekkady · evening')
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
    expect(css).toContain('.mv2-stop-mark { display: grid; place-items: center; flex: 0 0 auto; width: 24px; height: 24px; border-radius: var(--radius-pill); font-size: 11px; font-weight: 800; background: var(--mv2-day-tone, var(--color-primary)); color: #FFFFFF; }')
    expect(css).toContain('opacity: 1; }')
  })
  it('uses the Fix risk wash, a diamond and the window start in the rail', () => {
    expect(css).toContain(':root:where([data-theme=\'dark\']) .mv2-stop.is-fix-problem { background: #3A1C18;')
    expect(chrome).toContain('railMarkerKind({ kind: point.kind, category: point.stop.category, locked, isFix })')
    expect(chrome).toContain('clock?.(row.startMin)')
  })
  it('gives the fold its own glyph and keeps the user clock setting', () => {
    expect(chrome).toContain('<PanelLeftClose size={16} />')
    expect(chrome).toContain('data-clock={timeFormat}')
    expect(chrome).toContain('formatHM(point.arrive, timeFormat)')
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

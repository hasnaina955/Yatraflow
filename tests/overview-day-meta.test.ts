import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { dayKindLabel, dayTypeOf, daysToCheckLabel, overviewDayMetaLine, overviewDayTitle, overviewRibbonLine } from '../src/lib/dayKind'

const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
const journey = (distanceKm: number, driveMinutes: number, points = 3, air = false) => ({
  distanceKm,
  driveMinutes,
  points: Array.from({ length: points }, (_, i) => ({ legIn: i === 1 && air ? { kind: 'air' } : { kind: 'road' } })),
})
const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`

describe('day kind rule', () => {
  it('names stay, drive, mixed and flight days from the journey', () => {
    expect(dayTypeOf(journey(0, 0, 1))).toBe('STAY')
    expect(dayKindLabel(journey(0, 0, 1))).toBe('Stay day')
    expect(dayKindLabel(journey(128, 245))).toBe('Drive day')
    expect(dayKindLabel(journey(80, 180))).toBe('Drive day')
    expect(dayKindLabel(journey(20, 40))).toBe('Drive + local')
    expect(dayKindLabel(journey(900, 120, 3, true))).toBe('Flight day')
  })
  it('is the one rule the Timeline header reads', () => {
    const source = read('src/pages/trip/timeline/DaySection.tsx')
    expect(source).toContain('dayTypeOf(journey)')
    expect(source).toContain('{dayKindLabel(journey)}')
    expect(source).not.toContain("'Drive + local'")
  })
})

describe('overview day meta line', () => {
  it('prints type, stops, km and drive time from engine values', () => {
    expect(overviewDayMetaLine(journey(128.4, 245), 4, 'ok')).toBe('Drive day · 4 stops · 128 km · 4h 05m')
  })
  it('marks km the road did not measure', () => {
    expect(overviewDayMetaLine(journey(140, 230), 2, 'failed')).toBe('Drive day · 2 stops · ~140 km · 3h 50m')
    expect(overviewDayMetaLine(journey(140, 230), 1, 'partial')).toContain('~140 km')
  })
  it('leaves out a value the day does not have', () => {
    expect(overviewDayMetaLine(journey(0, 0, 1), 6, 'ok')).toBe('Stay day · 6 stops')
    expect(overviewDayMetaLine(journey(0, 0, 1), 0, 'ok')).toBe('Stay day')
  })
})

describe('overview day title', () => {
  it('adds the day title after an em dash', () => {
    expect(overviewDayTitle('Munnar', 1, 'Tea estates & Top Station')).toBe('Munnar — Tea estates & Top Station')
    expect(overviewDayTitle('Munnar to Thekkady', 2, 'Spice country')).toBe('Munnar to Thekkady — Spice country')
  })
  it('turns a place: theme title into the em dash form', () => {
    expect(overviewDayTitle('Munnar to Kundala Valley', 1, 'Munnar: tea estates & Top Station')).toBe('Munnar — tea estates & Top Station')
    expect(overviewDayTitle('Kochi to Munnar', 0, 'Kochi to Munnar: waterfalls en route')).toBe('Kochi to Munnar — waterfalls en route')
    expect(overviewDayTitle('Kochi', 0, 'Note:')).toBe('Kochi — Note:')
  })
  it('never adds a default or repeated title', () => {
    expect(overviewDayTitle('Kochi to Munnar', 0, undefined)).toBe('Kochi to Munnar')
    expect(overviewDayTitle('Kochi to Munnar', 0, 'Day 1')).toBe('Kochi to Munnar')
    expect(overviewDayTitle('Kochi to Munnar', 0, '  ')).toBe('Kochi to Munnar')
    expect(overviewDayTitle('Munnar', 1, 'munnar')).toBe('Munnar')
    expect(overviewDayTitle('Kochi to Munnar', 0, 'Munnar', ['Kochi', 'Munnar'])).toBe('Kochi to Munnar')
  })
})

describe('overview summary tile', () => {
  it('joins km, drive time and cost, and drops a zero value', () => {
    expect(overviewRibbonLine({ totalDistanceKm: 493.2, totalTravelMinutes: 933, totalCostInr: 62250 }, true, inr)).toBe('493 km · 15h 33m · ₹62,250')
    expect(overviewRibbonLine({ totalDistanceKm: 493.2, totalTravelMinutes: 933, totalCostInr: 0 }, false, inr)).toBe('~493 km · 15h 33m')
    expect(overviewRibbonLine({ totalDistanceKm: 0, totalTravelMinutes: 0, totalCostInr: 0 }, true, inr)).toBe('')
  })
  it('counts the days with something to fix', () => {
    expect(daysToCheckLabel([{ tone: 'clear' }, { tone: 'fix' }, { tone: 'risk' }, { tone: 'empty' }])).toBe('2 days to check')
    expect(daysToCheckLabel([{ tone: 'fix' }])).toBe('1 day to check')
    expect(daysToCheckLabel([{ tone: 'clear' }])).toBeNull()
  })
  it('stays phone-only and respects reduced motion', () => {
    const css = read('src/styles/legacy/17-overview-tiles-and-cover.css')
    expect(css).toMatch(/\.ovw-ribbon \{ display: none; \}/)
    expect(css).toMatch(/@media \(max-width: 767px\)[\s\S]*?\.ovw-ribbon \{\s*display: grid/)
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\n {2}\.ovw-ribbon,/)
  })
})

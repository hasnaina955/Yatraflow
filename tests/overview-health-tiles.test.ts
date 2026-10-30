import { describe, expect, it } from 'vitest'
import type { ScheduleWarning } from '../src/lib/engine'
import { HEALTH_TILE_TRAVEL_LIMITS, overviewHealthTiles } from '../src/lib/overviewHealthTiles'

const money = (value: number) => `₹${Math.round(value).toLocaleString('en-IN')}`

const base = {
  transportMode: 'car',
  warnings: [] as ScheduleWarning[],
  budgetPerPersonInr: 16000,
  costPerPersonInr: 15000,
  daysWithStops: 4,
  totalDays: 4,
  formatMoney: money,
}

const tile = (key: string, warnings: ScheduleWarning[] = [], over: Partial<typeof base> = {}) =>
  overviewHealthTiles({ ...base, warnings, ...over }).find(entry => entry.key === key)!

const travel = (severity: ScheduleWarning['severity'], dayIndex: number): ScheduleWarning => ({
  code: 'travel',
  severity,
  dayIndex,
  title: `Day ${dayIndex + 1}`,
  detail: '',
  fix: '',
})

describe('the three health tiles', () => {
  it('returns three shells, in order, with no time-zone check', () => {
    const tiles = overviewHealthTiles(base)
    expect(tiles.map(entry => entry.key)).toEqual(['drive', 'days', 'budget'])
    expect(tiles.some(entry => (entry.key as string) === 'daylight')).toBe(false)
    expect(tiles.every(entry => entry.label.length > 0 && entry.value.length > 0 && entry.note.length > 0)).toBe(true)
  })

  it('reads drive load from the engine travel thresholds', () => {
    expect(HEALTH_TILE_TRAVEL_LIMITS.longMinutes).toBe(210)
    expect(tile('drive').value).toBe('Steady')
    expect(tile('drive').tone).toBe('ok')

    const long = tile('drive', [travel('medium', 2)])
    expect(long.value).toBe('Long')
    expect(long.tone).toBe('watch')
    expect(long.note).toContain('1 day is')

    const heavy = tile('drive', [travel('high', 2), travel('medium', 3)])
    expect(heavy.value).toBe('Heavy')
    expect(heavy.tone).toBe('risk')
    expect(heavy.note).toContain('2 days are')
  })

  it('calls the tile travel load when the trip is not self-driven', () => {
    expect(tile('drive', [], { transportMode: 'train' }).label).toBe('Travel load')
    expect(tile('drive', [], { transportMode: 'car' }).label).toBe('Drive load')
  })

  it('counts days with a stop, and names the gap', () => {
    expect(tile('days').value).toBe('4 of 4 days')
    expect(tile('days').tone).toBe('ok')
    const partial = tile('days', [], { daysWithStops: 2 })
    expect(partial.value).toBe('2 of 4 days')
    expect(partial.tone).toBe('watch')
    expect(partial.note).toContain('2 days have')
    const none = tile('days', [], { daysWithStops: 0 })
    expect(none.tone).toBe('quiet')
  })

  it('compares cost per person with the target and says it is an estimate', () => {
    const under = tile('budget')
    expect(under.value).toBe('Under')
    expect(under.tone).toBe('ok')
    expect(under.note).toContain('under the')
    expect(under.note).toContain('estimate')
    expect(under.note).not.toContain('spent')

    const over = tile('budget', [], { costPerPersonInr: 17000 })
    expect(over.value).toBe('Over')
    expect(over.tone).toBe('risk')

    const none = tile('budget', [], { budgetPerPersonInr: 0 })
    expect(none.value).toBe('No target')
    expect(none.tone).toBe('quiet')
  })

  it('keeps every shell when the trip is empty', () => {
    const tiles = overviewHealthTiles({ ...base, daysWithStops: 0, totalDays: 0, warnings: [] })
    expect(tiles).toHaveLength(3)
    expect(tiles.find(entry => entry.key === 'days')!.value).toBe('No days')
  })
})

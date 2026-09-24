// ============ Creator trend: the daily series behind the chart ============
//
// The chart above the publications table and the numbers inside that table are
// two views of ONE window. The bug class this file exists to kill is them
// disagreeing — a trend that includes a day the table excludes, or an unlock
// counted from a different source than the unlock column. So the central test
// sums the series and compares it to `buildPubFunnels` over identical inputs.
//
// The other half is the axis honesty: empty days stay on the axis. Compressing
// them would draw a flat line where the truth is "nothing recorded", and would
// silently rescale every other point.
import { describe, expect, it } from 'vitest'
import {
  buildDailySeries, buildPubFunnels, funnelWindowStart, utcDayKey,
  type FunnelDailyRow, type FunnelPub, type FunnelSale,
} from '../src/lib/pubFunnel'

/** A fixed clock, so no assertion depends on when the suite runs. 2026-09-23
 *  12:00 UTC — mid-day, so "today" cannot be confused with a boundary. */
const NOW = Date.parse('2026-09-23T12:00:00Z')
const day = (offset: number) => utcDayKey(Date.parse('2026-09-23T00:00:00Z') + offset * 86400000)

const dailyRow = (pubId: string, d: string, views: number, forks: number): FunnelDailyRow =>
  ({ pubId, day: d, views, forks })

describe('buildDailySeries', () => {
  it('returns one point per day, oldest first, ending on today', () => {
    const series = buildDailySeries({ daily: [], sales: [], days: 7, now: NOW })
    expect(series).toHaveLength(7)
    expect(series[0].day).toBe(day(-6))
    expect(series[6].day).toBe(day(0))
    expect(series.map(p => p.day)).toEqual([...series.map(p => p.day)].sort())
  })

  it('keeps empty days on the axis instead of compressing them', () => {
    const series = buildDailySeries({
      daily: [dailyRow('p1', day(-3), 10, 2), dailyRow('p1', day(0), 4, 1)],
      sales: [],
      days: 7,
      now: NOW,
    })
    expect(series).toHaveLength(7)
    expect(series.filter(p => p.views === 0)).toHaveLength(5)
    expect(series[3].views).toBe(10)   // day(-3) is index 3 of a 7-day window
    expect(series[6].views).toBe(4)
  })

  it('excludes days before the window and never returns NaN', () => {
    const series = buildDailySeries({
      daily: [dailyRow('p1', day(-30), 999, 999), dailyRow('p1', day(0), 1, 0)],
      sales: [],
      days: 7,
      now: NOW,
    })
    expect(series.reduce((s, p) => s + p.views, 0)).toBe(1)
    for (const p of series) {
      expect(Number.isFinite(p.views)).toBe(true)
      expect(Number.isFinite(p.forks)).toBe(true)
      expect(Number.isFinite(p.unlocks)).toBe(true)
    }
  })

  it('buckets unlocks from the sales ledger onto their UTC day', () => {
    const sales: FunnelSale[] = [
      { pubId: 'p1', grantedAt: Date.parse(`${day(-2)}T23:30:00Z`) },
      { pubId: 'p1', grantedAt: Date.parse(`${day(-2)}T00:05:00Z`) },
      { pubId: 'p1', grantedAt: Date.parse(`${day(0)}T06:00:00Z`) },
    ]
    const series = buildDailySeries({ daily: [], sales, days: 7, now: NOW })
    expect(series.find(p => p.day === day(-2))?.unlocks).toBe(2)
    expect(series.find(p => p.day === day(0))?.unlocks).toBe(1)
    expect(series.reduce((s, p) => s + p.unlocks, 0)).toBe(3)
  })

  it('drops sales older than the window', () => {
    const series = buildDailySeries({
      daily: [], sales: [{ pubId: 'p1', grantedAt: Date.parse(`${day(-30)}T09:00:00Z`) }],
      days: 7, now: NOW,
    })
    expect(series.reduce((s, p) => s + p.unlocks, 0)).toBe(0)
  })

  it('agrees with the table about rows dated after now', () => {
    // Clock skew, or a hand-written timestamp: a step dated later than the
    // clock used to count in the per-publication table and fall off the
    // trend's axis. Both must call it out of the window.
    const future = day(3)
    const daily: FunnelDailyRow[] = [dailyRow('p1', future, 50, 5), dailyRow('p1', day(0), 7, 1)]
    const sales: FunnelSale[] = [{ pubId: 'p1', grantedAt: Date.parse(`${future}T09:00:00Z`) }]
    const series = buildDailySeries({ daily, sales, days: 7, now: NOW })
    const table = buildPubFunnels({
      daily, sales, pubs: [{ id: 'p1', title: 'P1', priceInr: null, lifetimeViews: 0, lifetimeForks: 0 }],
      days: 7, now: NOW,
    })
    expect(series.reduce((s, p) => s + p.views, 0)).toBe(7)
    expect(table.reduce((s, f) => s + f.views, 0)).toBe(7)
    expect(series.reduce((s, p) => s + p.unlocks, 0)).toBe(0)
    expect(table.reduce((s, f) => s + f.unlocks, 0)).toBe(0)
    expect(series.some(p => p.day === future)).toBe(false)
  })

  it('narrows to one publication when asked', () => {
    const series = buildDailySeries({
      daily: [dailyRow('p1', day(0), 5, 1), dailyRow('p2', day(0), 40, 9)],
      sales: [{ pubId: 'p1', grantedAt: Date.parse(`${day(0)}T01:00:00Z`) }, { pubId: 'p2', grantedAt: Date.parse(`${day(0)}T02:00:00Z`) }],
      days: 7, now: NOW, pubId: 'p1',
    })
    const today = series[series.length - 1]
    expect(today.views).toBe(5)
    expect(today.forks).toBe(1)
    expect(today.unlocks).toBe(1)
  })

  it('agrees with the table it sits above: same window, same buckets, same totals', () => {
    const pubs: FunnelPub[] = [
      { id: 'p1', title: 'Goa coast loop', priceInr: 499, lifetimeViews: 1000, lifetimeForks: 200 },
      { id: 'p2', title: 'Kerala backwaters', priceInr: null, lifetimeViews: 300, lifetimeForks: 40 },
    ]
    const daily: FunnelDailyRow[] = [
      dailyRow('p1', day(-6), 120, 12),
      dailyRow('p1', day(-2), 80, 6),
      dailyRow('p1', day(0), 30, 3),
      dailyRow('p2', day(-1), 55, 4),
      dailyRow('p1', day(-40), 500, 50),   // outside every window below
    ]
    const sales: FunnelSale[] = [
      { pubId: 'p1', grantedAt: Date.parse(`${day(-5)}T10:00:00Z`) },
      { pubId: 'p1', grantedAt: Date.parse(`${day(0)}T11:00:00Z`) },
      { pubId: 'p2', grantedAt: Date.parse(`${day(-1)}T11:00:00Z`) },
      { pubId: 'p1', grantedAt: Date.parse(`${day(-60)}T11:00:00Z`) },  // out of range
    ]

    for (const days of [7, 30, 90]) {
      const series = buildDailySeries({ daily, sales, days, now: NOW })
      const table = buildPubFunnels({ daily, sales, pubs, days, now: NOW })
      const sum = (k: 'views' | 'forks' | 'unlocks') => series.reduce((s, p) => s + p[k], 0)

      expect(sum('views')).toBe(table.reduce((s, f) => s + f.views, 0))
      expect(sum('forks')).toBe(table.reduce((s, f) => s + f.forks, 0))
      expect(sum('unlocks')).toBe(table.reduce((s, f) => s + f.unlocks, 0))
      // and the window really is the same one
      expect(series[0].day).toBe(utcDayKey(funnelWindowStart(days, NOW)))
    }
  })
})

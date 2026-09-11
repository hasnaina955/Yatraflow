// ============ Timeline collapsed-day summary helpers ============
// Pure, node-testable (docs/TIMELINE-PLAN.md Phase 1): route chain, stay-day
// summary, the accordion transition, and the dwell chart's busiest-stop pick.
import { describe, expect, it } from 'vitest'
import type { ItineraryDay, ItineraryStop } from '../src/data/types'
import { routeChain, stayDaySummary, accordionNext, dwellSegments } from '../src/lib/daySummary'

function mkStop(partial: Partial<ItineraryStop> & Pick<ItineraryStop, 'id' | 'title' | 'orderInDay'>): ItineraryStop {
  return {
    category: 'sightseeing', locationName: partial.title ?? '', lat: 0, lng: 0,
    visitMinutes: 0, entryFeeInrPerPerson: 0, transportCostInrTotal: 0,
    priority: 'must-do', status: 'confirmed',
    ...partial,
  }
}

function mkDay(stops: ItineraryStop[]): ItineraryDay {
  return { id: 'day-0', index: 0, stops }
}

describe('routeChain', () => {
  it('joins visible stop names in plan order', () => {
    const day = mkDay([
      mkStop({ id: 's2', title: 'Top Station', orderInDay: 2 }),
      mkStop({ id: 's1', title: 'Tea Museum', orderInDay: 1 }),
      mkStop({ id: 's3', title: 'Kundala Lake', orderInDay: 3 }),
    ])
    expect(routeChain(day)).toBe('Tea Museum → Top Station → Kundala Lake')
  })

  it('excludes rejected stops', () => {
    const day = mkDay([
      mkStop({ id: 's1', title: 'Keep', orderInDay: 1 }),
      mkStop({ id: 's2', title: 'Drop', orderInDay: 2, status: 'rejected' }),
    ])
    expect(routeChain(day)).toBe('Keep')
  })

  it('is empty for an unplanned day', () => {
    expect(routeChain(mkDay([]))).toBe('')
  })
})

describe('stayDaySummary', () => {
  it('offers the free-day line when nothing is planned', () => {
    expect(stayDaySummary(0)).toBe('No driving today · free morning')
  })

  it('counts nearby visits', () => {
    expect(stayDaySummary(1)).toBe('No driving today · 1 visit planned')
    expect(stayDaySummary(3)).toBe('No driving today · 3 visits planned')
  })
})

describe('accordionNext (negative control: state is lifted)', () => {
  it('opens a closed day', () => {
    expect(accordionNext(-1, 1)).toBe(1)
  })

  it('opening Day 2 collapses Day 1 — fails if collapse state lived per-day', () => {
    expect(accordionNext(0, 1)).toBe(1)
  })

  it('tapping the open day closes it (back to all collapsed)', () => {
    expect(accordionNext(1, 1)).toBe(-1)
  })
})

describe('dwellSegments', () => {
  it('is null for fewer than two visible stops (chart says nothing)', () => {
    const one = mkDay([mkStop({ id: 's1', title: 'Alone', orderInDay: 1, visitMinutes: 90 })])
    expect(dwellSegments(one)).toBeNull()
    expect(dwellSegments(mkDay([]))).toBeNull()
  })

  it('is null when nobody has a dwell (pure drive-through waypoints)', () => {
    const day = mkDay([
      mkStop({ id: 's1', title: 'A', orderInDay: 1 }),
      mkStop({ id: 's2', title: 'B', orderInDay: 2 }),
    ])
    expect(dwellSegments(day)).toBeNull()
  })

  it('marks the single longest-dwell stop as busiest', () => {
    const day = mkDay([
      mkStop({ id: 's1', title: 'Quick halt', orderInDay: 1, visitMinutes: 15 }),
      mkStop({ id: 's2', title: 'Main sight', orderInDay: 2, visitMinutes: 120 }),
      mkStop({ id: 's3', title: 'Lunch', orderInDay: 3, visitMinutes: 45 }),
    ])
    const segs = dwellSegments(day)
    expect(segs).not.toBeNull()
    const busiest = segs!.filter(s => s.busiest)
    expect(busiest).toHaveLength(1)
    expect(busiest[0].stop.title).toBe('Main sight')
    expect(busiest[0].minutes).toBe(120)
    // weights follow dwell, zero-dwell stops keep a visible sliver
    expect(segs!.find(s => s.stop.id === 's2')!.weight).toBeGreaterThan(segs!.find(s => s.stop.id === 's3')!.weight)
    expect(segs!.find(s => s.stop.id === 's3')!.weight).toBeGreaterThan(0)
  })

  it('breaks dwell ties toward the earlier stop (deterministic amber)', () => {
    const day = mkDay([
      mkStop({ id: 's1', title: 'First', orderInDay: 1, visitMinutes: 60 }),
      mkStop({ id: 's2', title: 'Second', orderInDay: 2, visitMinutes: 60 }),
    ])
    const segs = dwellSegments(day)!
    expect(segs.find(s => s.busiest)!.stop.title).toBe('First')
  })

  it('tolerates legacy rows with missing visitMinutes', () => {
    const day = mkDay([
      mkStop({ id: 's1', title: 'Legacy', orderInDay: 1 }),
      mkStop({ id: 's2', title: 'Planned', orderInDay: 2, visitMinutes: 30 }),
    ])
    delete (day.stops[0] as Partial<ItineraryStop>).visitMinutes
    const segs = dwellSegments(day)!
    expect(segs.find(s => s.busiest)!.stop.title).toBe('Planned')
  })
})

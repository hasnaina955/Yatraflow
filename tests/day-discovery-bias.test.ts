// #842 F17: blank-day discovery reads one day context. The planned-day
// predicate decides which days get chips, and the category bias — the chips
// search's ranking input — must not move when an unrelated title changes.
import { describe, expect, it } from 'vitest'
import { computeCategoryBias } from '../src/lib/engine'
import { hasUserPlannedStop } from '../src/lib/dayCards'
import type { Trip } from '../src/data/types'

function makeTrip(over: Partial<Trip>): Trip {
  return {
    id: 't1', name: 'T', startLocation: 'A', destinations: ['B'],
    startDate: '2026-09-01', endDate: '2026-09-02', travellers: 2,
    transportMode: 'car', budgetPerPersonInr: 10000, travelStyle: 'balanced',
    fixedCommitments: [], days: [], expenses: [], coverEmoji: '🚗',
    visibility: 'private', createdAt: 0, updatedAt: 0,
    ...over,
  } as Trip
}
function stop(cat: string, lat = 25, lng = 88, over: Record<string, unknown> = {}) {
  return {
    id: 's_' + Math.random(), title: 'S', category: cat, locationName: 'L', lat, lng,
    description: '', notes: '', visitMinutes: 60, openTime: '', closeTime: '',
    entryFeeInrPerPerson: 0, transportCostInrTotal: 0, priority: 'nice-to-have',
    sourceUrl: '', status: 'confirmed', orderInDay: 1, ...over,
  } as never
}
function day(stops: unknown[], title = '') {
  return { index: 0, title, stops } as never
}

describe('hasUserPlannedStop (F17 audit case 4)', () => {
  it('a day of only automatic anchors counts as unplanned', () => {
    expect(hasUserPlannedStop([stop('sightseeing', 25, 88, { auto: true })])).toBe(false)
  })

  it('a day of only rejected suggestions counts as unplanned', () => {
    expect(hasUserPlannedStop([stop('sightseeing', 25, 88, { status: 'rejected' })])).toBe(false)
  })

  it('any live user stop counts as planned', () => {
    expect(hasUserPlannedStop([
      stop('sightseeing', 25, 88, { auto: true }),
      stop('food', 25.1, 88.1, { status: 'suggested' }),
    ])).toBe(true)
  })
})

describe('computeCategoryBias ignores titles (F17 audit case 2)', () => {
  it('a day-title rename does not move the bias the chips search reads', () => {
    const stops = [stop('sightseeing'), stop('food', 24, 88)]
    const a = computeCategoryBias(makeTrip({ days: [day(stops, 'Fort Kochi wandering')] }))
    const b = computeCategoryBias(makeTrip({ days: [day(stops, 'A completely different name')] }))
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})

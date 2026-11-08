/**
 * #420, slice 15 — the rail rows' pure helpers, tested directly.
 *
 * The meter copy, the day identity, the chip facts and the alternative pool
 * used to live as closures inside the Map tab. They are pure now
 * (`map/railRows.ts`), so the rules pin here instead of through the page.
 */
import { describe, expect, it } from 'vitest'
import {
  activeDayLabel, activeReadinessLabel, alternativesFor, chipsFor,
} from '../src/pages/trip/map/railRows'
import type { ChipFacts } from '../src/pages/trip/map/railRows'
import type { ItineraryDay } from '../src/data/types'

describe('the rail meter copy', () => {
  it('says nothing is scheduled on an empty day', () => {
    expect(activeReadinessLabel({ total: 0, filled: 0, required: 0, auto: 0 }))
      .toBe('nothing scheduled for this day yet')
  })

  it('counts filled over required, naming the engine-managed parts', () => {
    expect(activeReadinessLabel({ total: 5, filled: 3, required: 4, auto: 1 }))
      .toBe('3 of 4 planned · 1 auto')
  })

  it('stays silent about auto parts when there are none', () => {
    expect(activeReadinessLabel({ total: 2, filled: 2, required: 2, auto: 0 }))
      .toBe('2 of 2 planned')
  })
})

describe("the header's day identity", () => {
  it('falls back to the drive when the day is gone', () => {
    expect(activeDayLabel([], 0)).toBe('your drive')
  })

  it('prefers the day’s own title', () => {
    const days = [{ index: 2, title: '  Kochi rest day  ', stops: [] }]
    expect(activeDayLabel(days as never, 2)).toBe('Kochi rest day')
  })

  it('reads first-to-last stops when the day is untitled', () => {
    const days = [{
      index: 1,
      title: '',
      stops: [
        { status: 'confirmed', locationName: 'Kochi', title: 'Kochi' },
        { status: 'rejected', locationName: 'Nowhere', title: 'Nowhere' },
        { status: 'confirmed', locationName: 'Alleppey', title: 'Alleppey' },
      ],
    }]
    expect(activeDayLabel(days as never, 1)).toBe('Kochi to Alleppey')
  })
})

describe('the row helpers delegate with the page’s facts', () => {
  const sh = {
    segment: { purpose: 'meal', targetKm: 100, etaMinutes: 60, minutesFromPrev: 30, index: 1 },
    hit: { id: 'h1', cumKm: 100, rating: 4.5, ratingCount: 10 },
  } as never
  const hit = (sh as { hit: never }).hit
  const bare = { id: 'bare', cumKm: 100 } as never
  const facts: ChipFacts = {
    detourMinFor: () => 12,
    days: [],
    dayForKm: () => 0,
    travelStyle: 'balanced',
  }
  const day = (index: number, stops: number): ItineraryDay => ({
    id: `day-${index}`,
    index,
    title: `Day ${index}`,
    stops: Array.from({ length: stops }, (_value, i) => ({
      id: `s${i}`,
      title: `Stop ${i}`,
      category: 'sightseeing',
      locationName: `Stop ${i}`,
      lat: 0,
      lng: 0,
      visitMinutes: 30,
      entryFeeInrPerPerson: 0,
      transportCostInrTotal: 0,
      priority: 'nice-to-have',
      status: 'confirmed',
      orderInDay: i + 1,
    })),
  })

  it('hands the pool to the ranking rule untouched', () => {
    const pool = { all: [], byPurpose: new Map(), byCategory: new Map() }
    expect(alternativesFor(sh, hit, pool)).toEqual([])
  })

  it('resolves the chips through the handed-in facts', () => {
    const chips = chipsFor(sh, hit, facts)
    expect(Array.isArray(chips)).toBe(true)
    expect(chips.length).toBeGreaterThan(0)
  })

  it('prints a real day’s share and no share at all for an unknown day', () => {
    const known = chipsFor(sh, bare, { ...facts, days: [day(0, 2)] })
    expect(known.find(c => c.key === 'budget-share')?.label).toBe('27% of budget')

    const unknown = chipsFor(sh, bare, facts)
    expect(unknown.some(c => c.key === 'budget-share')).toBe(false)
    expect(unknown.some(c => c.key === 'over-budget')).toBe(false)
  })

  it('consumes the canonical cost a row producer already computed', () => {
    const chips = chipsFor(sh, bare, facts, { detourMin: 12, dayBudget: 45, budgetSharePct: 90 })
    expect(chips.find(c => c.key === 'budget-share')?.label).toBe('90% of budget')
  })
})

// ============ PW-13 — the per-day split is a read-model, not a price ============
//
// The Budget chart stacks a day's spend by category. The engine owns the day
// total but exposes only its expenses and transport halves. `splitDaySpend`
// finishes the picture by repeating the engine's two attributions and closing
// on the engine's own total. These pins prove the invariant that matters:
// the segments always add up to `byDay.totalInr`, so the chart cannot claim a
// different total from the card beside it.
import { describe, expect, it } from 'vitest'
import { seedData } from '../src/data/seed'
import type { Expense, ItineraryStop, Trip } from '../src/data/types'
import { computeTotals } from '../src/lib/engine'
import { splitDaySpend } from '../src/lib/budgetDaySplit'

const sumSegments = (row: ReturnType<typeof splitDaySpend>[number]) =>
  row.segments.reduce((sum, segment) => sum + segment.amount, 0)

/** A two-day trip with no stops and no expenses, so each case adds only what
 *  it is testing. The seed trip supplies real day ids and route data. */
function twoDays(): Trip {
  const trip = structuredClone(seedData.trips[0])
  trip.expenses = []
  trip.days = [
    { id: 'split_day_0', index: 0, title: 'First', stops: [] },
    { id: 'split_day_1', index: 1, title: 'Second', stops: [] },
  ]
  trip.travellers = 4
  trip.budgetPerPersonInr = 10000
  return trip
}

function line(id: string, amountInr: number, extra: Partial<Expense> = {}): Expense {
  return { id, label: `Line ${id}`, category: 'food', amountInr, ...extra }
}

describe('splitDaySpend — the chart totals are the engine totals', () => {
  it('every seed trip closes on its own day and trip totals', () => {
    for (const seed of seedData.trips) {
      const totals = computeTotals(seed)
      const rows = splitDaySpend(seed, totals)
      expect(rows.map(row => row.dayIndex)).toEqual(totals.byDay.map(bucket => bucket.dayIndex))
      rows.forEach((row, i) => {
        expect(sumSegments(row), `${seed.name} day ${i}`).toBeCloseTo(totals.byDay[i].totalInr, 6)
        for (const segment of row.segments) {
          expect(Number.isFinite(segment.amount)).toBe(true)
          expect(segment.amount).toBeGreaterThan(0)
        }
      })
      const tripTotal = rows.reduce((sum, row) => sum + row.totalInr, 0)
      expect(tripTotal, seed.name).toBeCloseTo(totals.totalCostInr, 6)
    }
  })

  it('an unattached line spreads evenly, as the engine spreads it', () => {
    const trip = twoDays()
    trip.expenses = [line('a', 100)]
    const rows = splitDaySpend(trip, computeTotals(trip))
    expect(rows.map(sumSegments)).toEqual([50, 50])
  })

  it('a per-person line expands over the traveller count first', () => {
    const trip = twoDays()
    trip.expenses = [line('a', 100, { perPerson: true })]
    // 100 × 4 travellers = 400, spread over two days.
    expect(splitDaySpend(trip, computeTotals(trip)).map(sumSegments)).toEqual([200, 200])
  })

  it('an attached line follows its own day, never a spread', () => {
    const trip = twoDays()
    trip.expenses = [line('a', 300, { dayIndex: 1 })]
    const rows = splitDaySpend(trip, computeTotals(trip))
    expect(sumSegments(rows[0])).toBe(0)
    expect(sumSegments(rows[1])).toBe(300)
  })

  it('a stop-attached line follows its stop day', () => {
    const trip = twoDays()
    const stop: ItineraryStop = {
      ...structuredClone(seedData.trips[0].days[0].stops[0]),
      id: 'split_stop', entryFeeInrPerPerson: 0, transportCostInrTotal: 0, status: 'confirmed',
    }
    trip.days[1].stops = [stop]
    trip.expenses = [line('a', 300, { stopId: stop.id })]
    const rows = splitDaySpend(trip, computeTotals(trip))
    expect(sumSegments(rows[0])).toBe(0)
    expect(sumSegments(rows[1])).toBe(300)
  })

  it('a recorded entry fee replaces the stop estimate, never doubles it', () => {
    const trip = twoDays()
    const stop: ItineraryStop = {
      ...structuredClone(seedData.trips[0].days[0].stops[0]),
      id: 'split_fee_stop', entryFeeInrPerPerson: 50, transportCostInrTotal: 0, status: 'confirmed',
    }
    trip.days[1].stops = [stop]
    const withoutLine = computeTotals(trip)
    expect(splitDaySpend(trip, withoutLine)[1].segments.find(s => s.category === 'entry-fees')?.amount).toBe(200)

    trip.expenses = [{ id: 'ticket', label: 'Ticket', category: 'entry-fees', amountInr: 150, stopId: stop.id }]
    const withLine = computeTotals(trip)
    const entry = splitDaySpend(trip, withLine)[1].segments.find(s => s.category === 'entry-fees')?.amount
    expect(entry).toBe(150)
    expect(sumSegments(splitDaySpend(trip, withLine)[1])).toBeCloseTo(withLine.byDay[1].totalInr, 6)
  })

  it('a sparse day index stays on its own row', () => {
    const trip = twoDays()
    trip.days[1] = { ...trip.days[1], index: 2 }
    trip.expenses = [line('a', 100, { dayIndex: 2 })]
    const rows = splitDaySpend(trip, computeTotals(trip))
    expect(rows.map(row => row.dayIndex)).toEqual([0, 2])
    expect(rows[0].segments).toEqual([])
    expect(sumSegments(rows[1])).toBe(100)
  })

  it('a corrupt amount cannot poison the split', () => {
    const trip = twoDays()
    trip.expenses = [line('ok', 100), line('nan', Number.NaN), line('inf', Number.POSITIVE_INFINITY), line('neg', -50)]
    const totals = computeTotals(trip)
    const rows = splitDaySpend(trip, totals)
    for (const row of rows) {
      for (const segment of row.segments) expect(Number.isFinite(segment.amount)).toBe(true)
    }
    // The split speaks the one amount rule, so the refused lines are not
    // spend. A hand-poisoned engine total can still include the negative line;
    // the codec drops it before a real trip ever reaches this chart, so the
    // segment-sum invariant above is the one that governs stored data.
    expect(rows.reduce((sum, row) => sum + sumSegments(row), 0)).toBe(100)
  })
})

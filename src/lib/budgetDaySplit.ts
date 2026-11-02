// ============ Cost per day, split by category ============
// The Budget chart needs one day's spend broken into categories. The engine
// owns the day total (`TripTotals.byDay.totalInr`) but exposes only the
// expenses and transport halves of it. This module is the read-model that
// finishes the picture WITHOUT owning any money: it repeats the two
// attributions `computeTotals` already made and reconciles to the engine's own
// total, so a segment can never change what a day costs.
//
//   1. An expense lands on its own `dayIndex`, else on its stop's day. An
//      unattached line spreads evenly across the buckets — the same rule
//      `computeTotals` uses.
//   2. Entry fees come from stops whose ticket is not already a recorded
//      `entry-fees` line attached to that stop (#573).
//   3. Transport comes from the engine's `byDay.transportInr` (fuel, fare and
//      the rental day).
//   4. Whatever the engine's total still holds is the lodging share it spread
//      onto the first day of each hotel base, so it lands in accommodation.
//
// The invariant is the contract: the segments add up to `byDay.totalInr`. The
// component draws that total; it never adds a second price.
import type { ExpenseCategory, ID, Trip } from '../data/types'
import { EXPENSE_CATEGORIES } from '../data/types'
import { allowedAmount } from './expenseAmount'
import type { TripTotals } from './engine'

export interface BudgetDaySegment {
  category: ExpenseCategory
  amount: number
}

export interface BudgetDaySplit {
  dayIndex: number
  totalInr: number
  segments: BudgetDaySegment[]
}

/** A traveller count of 0 or a non-number reads as one, as the engine does. */
function headsOf(travellers: number): number {
  return Number.isFinite(travellers) && travellers > 0 ? travellers : 1
}

/**
 * Split each engine day bucket by category.
 *
 * `totals` is the engine's own result; this reads it and must not be handed a
 * hand-built shape. The returned rows keep the engine's order and total.
 */
export function splitDaySpend(trip: Trip, totals: Pick<TripTotals, 'byDay'>): BudgetDaySplit[] {
  const buckets = totals.byDay
  const dayCount = Math.max(1, trip.days.length)
  const heads = headsOf(trip.travellers)
  const stopDay = new Map<ID, number>()
  for (const day of trip.days) for (const stop of day.stops) stopDay.set(stop.id, day.index)

  const split = new Map<number, Map<ExpenseCategory, number>>()
  for (const bucket of buckets) split.set(bucket.dayIndex, new Map())
  const add = (index: number | undefined, category: ExpenseCategory, amount: number) => {
    if (index == null) return
    const row = split.get(index)
    if (!row) return
    row.set(category, (row.get(category) ?? 0) + amount)
  }

  for (const e of trip.expenses) {
    // The codec, the store and the settlement math speak one amount rule
    // (lib/expenseAmount). A refused line is not spend, so it is not a
    // segment — the same way the store would never accept it.
    const allowed = allowedAmount(e.amountInr)
    if (allowed === null) continue
    const amount = allowed * (e.perPerson ? heads : 1)
    if (!(amount > 0)) continue
    // A finite dayIndex is authoritative even when it names no bucket. The
    // engine then spreads the line; it never falls back to the stop's day.
    const dayKey = typeof e.dayIndex === 'number' && Number.isFinite(e.dayIndex)
      ? e.dayIndex
      : e.stopId !== undefined ? stopDay.get(e.stopId) : undefined
    const bucket = dayKey !== undefined ? split.get(dayKey) : undefined
    if (bucket) add(dayKey, e.category, amount)
    else for (const b of buckets) add(b.dayIndex, e.category, amount / dayCount)
  }

  // #573: a recorded entry-fees line attached to the stop replaces the stop's
  // own estimate. One monument ticket never counts twice.
  const covered = new Set<ID>(
    trip.expenses
      .filter(e => e.category === 'entry-fees' && e.stopId != null)
      .map(e => e.stopId as ID),
  )
  for (const day of trip.days) {
    for (const stop of day.stops) {
      if (stop.status === 'rejected' || covered.has(stop.id)) continue
      const fee = (Number.isFinite(stop.entryFeeInrPerPerson) ? stop.entryFeeInrPerPerson : 0) * heads
      if (fee > 0) add(day.index, 'entry-fees', fee)
    }
  }

  return buckets.map(bucket => {
    const byCategory = split.get(bucket.dayIndex) ?? new Map<ExpenseCategory, number>()
    if (bucket.transportInr > 0) {
      byCategory.set('transport', (byCategory.get('transport') ?? 0) + bucket.transportInr)
    }
    const attributed = [...byCategory.values()].reduce((sum, value) => sum + value, 0)
    // The engine's lodging share is the only amount left. It is an
    // accommodation cost, so the stack closes on the engine's total.
    const lodging = bucket.totalInr - attributed
    if (lodging > 0.5) {
      byCategory.set('accommodation', (byCategory.get('accommodation') ?? 0) + lodging)
    }
    const segments = EXPENSE_CATEGORIES
      .map(category => ({ category, amount: byCategory.get(category) ?? 0 }))
      .filter(segment => segment.amount > 0.5)
    return { dayIndex: bucket.dayIndex, totalInr: bucket.totalInr, segments }
  })
}

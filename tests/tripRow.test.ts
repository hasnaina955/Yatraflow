// ============ trips row serialization + missing-column detection ============
// Pure helpers from src/lib/tripRow.ts (node env, no DOM/supabase needed).
import { describe, it, expect } from 'vitest'
import { rowToTrip, tripToRow, isMissingColumnError } from '../src/lib/tripRow'
import { seedData } from '../src/data/seed'
import type { Trip, TripMember } from '../src/data/types'

function tripWithExpenses(): Trip {
  const base = structuredClone(seedData.trips[0])
  return {
    ...base,
    expenses: [
      { id: 'ex-1', label: 'Houseboat', category: 'accommodation' as const, amountInr: 8000, dayIndex: 1 },
      { id: 'ex-2', label: 'Backwater lunch', category: 'food' as const, amountInr: 600, perPerson: true, dayIndex: 2 },
    ],
  }
}

const MEMBERS: TripMember[] = [{ userId: 'owner-1', role: 'owner', joinedAt: 1 }]

/** Every optional column present — the steady state once migrations are applied.
 *  Spread this and override, rather than hand-writing the object: the probe is
 *  all-required, so adding a column used to break every call site at once. */
const ALL_COLUMNS = {
  economy: true, price: true, roundTrip: true, cover: true,
  inviteCode: true, deleted: true, stayStyle: true,
}

/** The bare fixture — no optional fields set. */
const baseTrip = (): Trip => structuredClone(seedData.trips[0])

describe('trip row serialization round-trip (issue #16)', () => {
  it('tripToRow always emits expenses — insert and update share the same mapper', () => {
    const t = tripWithExpenses()
    const row = tripToRow(t, 'owner-1')
    expect(row.expenses).toEqual(t.expenses)
    expect(row.expenses.length).toBe(2)
  })

  it('expenses survive rowToTrip(tripToRow(t)) rehydration', () => {
    const t = tripWithExpenses()
    const row = tripToRow(t, 'owner-1')
    const back = rowToTrip({ ...row, created_at: t.createdAt, updated_at: t.updatedAt }, MEMBERS)
    expect(back.expenses).toEqual(t.expenses)
    expect(back.name).toBe(t.name)
    expect(back.days).toEqual(t.days)
  })

  it('fuel/round-trip fields are only serialized when the probe says the column exists', () => {
    const t = { ...tripWithExpenses(), fuelEconomyKmL: 18, roundTrip: false }
    const full = tripToRow(t, 'owner-1', ALL_COLUMNS)
    expect(full.fuel_economy_km_per_l).toBe(18)
    expect(full.round_trip).toBe(false)
    const minimal = tripToRow(t, 'owner-1', { ...ALL_COLUMNS, economy: false, price: false, roundTrip: false })
    expect(minimal.fuel_economy_km_per_l).toBeUndefined()
    expect(minimal.round_trip).toBeUndefined()
  })
})

// The stay-budget dial shipped in deecbcc with no column and no row mapping, so
// the tier a traveller picked was session-only and silently reverted to the
// legacy-derived value on every load. These pin the mapping that fixes it —
// including the pre-migration path, which must stay a no-op rather than write a
// column the database does not have (that fails the whole insert/update).
describe('the stay budget dial is persisted (20260914_trip_stay_budget.sql)', () => {
  const rehydrate = (row: ReturnType<typeof tripToRow>, t: Trip) =>
    rowToTrip({ ...row, created_at: t.createdAt, updated_at: t.updatedAt }, MEMBERS)

  it('writes stay_style when the probe says the column exists', () => {
    const t = { ...baseTrip(), stayStyle: 'luxury' as const }
    expect(tripToRow(t, 'owner-1', ALL_COLUMNS).stay_style).toBe('luxury')
  })

  it('does not write it when the column is missing', () => {
    const t = { ...baseTrip(), stayStyle: 'luxury' as const }
    expect(tripToRow(t, 'owner-1', { ...ALL_COLUMNS, stayStyle: false }).stay_style).toBeUndefined()
  })

  it('survives the row round trip', () => {
    const t = { ...baseTrip(), stayStyle: 'budget' as const }
    expect(rehydrate(tripToRow(t, 'owner-1', ALL_COLUMNS), t).stayStyle).toBe('budget')
  })

  it('reads back undefined on a pre-migration row, so the engine derives the tier', () => {
    // Not null, not a default — undefined is what tells stayKeyFor() to fall
    // back to the legacy travelStyle and leave an existing bill alone.
    const t = baseTrip()
    const row = tripToRow(t, 'owner-1', { ...ALL_COLUMNS, stayStyle: false })
    expect(rehydrate(row, t).stayStyle).toBeUndefined()
  })

  it('writes an explicit null when a trip has no dial', () => {
    // Null is what clears a stale tier on an existing row; undefined would be
    // omitted from the update payload and leave the old value in place.
    const t = baseTrip()
    expect(tripToRow(t, 'owner-1', ALL_COLUMNS).stay_style).toBeNull()
  })
})

describe('isMissingColumnError (issue #17)', () => {
  it('treats PostgREST PGRST204 and Postgres 42703 as a missing column', () => {
    expect(isMissingColumnError({ code: 'PGRST204', message: "Could not find the 'fuel_economy_km_per_l' column of 'trips' in the schema cache" })).toBe(true)
    expect(isMissingColumnError({ code: '42703', message: 'column trips.fuel_economy_km_per_l does not exist' })).toBe(true)
    expect(isMissingColumnError({ message: "Could not find the 'round_trip' column of 'trips' in the schema cache" })).toBe(true)
  })

  it('treats network/transient errors as NOT a missing column', () => {
    expect(isMissingColumnError({ message: 'Failed to fetch' })).toBe(false)
    expect(isMissingColumnError({ message: 'TypeError: fetch failed' })).toBe(false)
    expect(isMissingColumnError({ code: '42501', message: 'permission denied' })).toBe(false)
    expect(isMissingColumnError(undefined)).toBe(false)
    expect(isMissingColumnError(new Error('network'))).toBe(false)
  })
})
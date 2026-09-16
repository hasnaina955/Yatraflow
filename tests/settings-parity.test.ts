// #213 Phase 5/6 — the parity invariants between Create Trip and Trip settings.
// Each of these pins a value that used to be written out by hand in two or
// three places and had already drifted once.
import { describe, it, expect } from 'vitest'
import { CREW_CHIPS, CREW_MIN, CREW_MAX, clampCrew } from '../src/lib/crew'
import {
  DEFAULT_FUEL_ECONOMY_KML, FUEL_PRICE_INR_PER_L, MODE_SPEED, computeTotals,
} from '../src/lib/engine'
import { BENCH_DEFAULTS, STAY_STYLES } from '../src/lib/planBench'
import { STAY_RATE_PER_NIGHT } from '../src/lib/rates'
import { TRANSPORT_MODES } from '../src/data/types'
import { seedData } from '../src/data/seed'

describe('crew options are one owner (#213 Phase 5)', () => {
  it('clampCrew floors, ceils and rounds', () => {
    expect(clampCrew(0)).toBe(CREW_MIN)
    expect(clampCrew(-5)).toBe(CREW_MIN)
    expect(clampCrew(999)).toBe(CREW_MAX)
    expect(clampCrew(4.4)).toBe(4)
    expect(clampCrew(4.6)).toBe(5)
    // Unreadable input falls to the FLOOR, not the ceiling: "we couldn't read a
    // number" must not silently claim a 30-person party.
    expect(clampCrew(Number.NaN)).toBe(CREW_MIN)
    expect(clampCrew(Number.POSITIVE_INFINITY)).toBe(CREW_MIN)
    expect(clampCrew(Number.NEGATIVE_INFINITY)).toBe(CREW_MIN)
  })

  it('a 15-person party survives the clamp (the old Math.min(12,…) reported it as 12)', () => {
    expect(clampCrew(15)).toBe(15)
  })

  it('every chip sits inside the supported range', () => {
    for (const n of CREW_CHIPS) {
      expect(n).toBeGreaterThanOrEqual(CREW_MIN)
      expect(n).toBeLessThanOrEqual(CREW_MAX)
      expect(clampCrew(n)).toBe(n)
    }
  })
})

describe('shared vocabularies cannot drift (#213 Phase 5)', () => {
  it('the stay rate table keys are exactly the stay vocabulary', () => {
    expect(Object.keys(STAY_RATE_PER_NIGHT).sort()).toEqual([...STAY_STYLES].sort())
  })

  it('every transport mode the grid can render is priced and speeded by the engine', () => {
    // Create Trip's tiles are derived from TRANSPORT_MODES; a mode with no entry
    // in the engine's tables would render a tile the bill cannot price.
    for (const mode of TRANSPORT_MODES) {
      expect(Number.isFinite(MODE_SPEED[mode]), `MODE_SPEED.${mode}`).toBe(true)
    }
  })
})

describe('one fuel-economy default (#213 Phase 5)', () => {
  it('the bench default IS the shared constant', () => {
    expect(BENCH_DEFAULTS.kmPerL).toBe(DEFAULT_FUEL_ECONOMY_KML)
  })

  it('the shared constant sits inside the engine hard band', () => {
    expect(DEFAULT_FUEL_ECONOMY_KML).toBeGreaterThanOrEqual(2)
    expect(DEFAULT_FUEL_ECONOMY_KML).toBeLessThanOrEqual(80)
  })

  it('and the fuel-price default is unchanged', () => {
    expect(FUEL_PRICE_INR_PER_L).toBe(105)
    expect(BENCH_DEFAULTS.inrPerL).toBe(FUEL_PRICE_INR_PER_L)
  })
})

describe('per-head division is guarded (#213 Phase 6)', () => {
  it('travellers 0 yields a finite figure, not Infinity/NaN', () => {
    const trip = structuredClone(seedData.trips[0])
    trip.travellers = 0
    const totals = computeTotals(trip)
    expect(Number.isFinite(totals.costPerPersonInr)).toBe(true)
  })
})

// ============ Plan Bench bill math ============
// Pure-logic coverage for the Landing page's what-if calculator (issue #37).
// Node env — no DOM. Every test pins one honest-bill behaviour: clamping,
// room derivation, mode re-rating, the return-leg double, formula strings,
// the fatigue verdict thresholds and the one-shot prefill hand-off.
import { describe, it, expect, beforeEach } from 'vitest'
import {
  computeBenchBill, BENCH_DEFAULTS, BENCH_LIMITS, BENCH_PRESETS,
  STAY_RATE_PER_NIGHT, MEALS_PER_HEAD_DAY, STAY_TO_TRAVEL_STYLE,
  parseBenchPrefill, readBenchPrefill, isBenchFuelMode,
  type BenchInputs,
} from '../src/lib/planBench'

const input = (over: Partial<BenchInputs> = {}): BenchInputs => ({ ...BENCH_DEFAULTS, ...over })

describe('computeBenchBill — transport', () => {
  it('prices a fuel mode as km ÷ economy × pump price', () => {
    const b = computeBenchBill(input({ km: 612, mode: 'car', roundTrip: false, kmPerL: 15, inrPerL: 105 }))
    expect(b.roadKm).toBe(612)
    expect(b.transportCost).toBe(Math.round((612 / 15) * 105))
    expect(b.transportFormula).toBe('612 km ÷ 15 km/L × ₹105')
  })

  it('doubles the road distance when the return toggle is on', () => {
    const b = computeBenchBill(input({ km: 300, roundTrip: true, mode: 'car', kmPerL: 10, inrPerL: 100 }))
    expect(b.roadKm).toBe(600)
    expect(b.transportCost).toBe(Math.round((600 / 10) * 100))
  })

  it('re-rates a fare mode from the blended ₹/km table with its formula', () => {
    const b = computeBenchBill(input({ km: 500, mode: 'train', roundTrip: false }))
    expect(b.transportCost).toBe(Math.round(500 * 1.6))
    expect(b.transportFormula).toBe('500 km × ₹1.6/km fare')
  })

  it('ignores the fuel sliders for fare modes', () => {
    const train = computeBenchBill(input({ mode: 'train', kmPerL: 2, inrPerL: 250, km: 400, roundTrip: false }))
    const train2 = computeBenchBill(input({ mode: 'train', kmPerL: 80, inrPerL: 50, km: 400, roundTrip: false }))
    expect(train.transportCost).toBe(train2.transportCost)
  })
})

describe('computeBenchBill — stays, meals, splits', () => {
  it('derives rooms as ⌈crew/2⌉ and prices the stay with its formula', () => {
    const b = computeBenchBill(input({ crew: 5, nights: 4, stay: 'comfort' }))
    expect(b.rooms).toBe(3)
    expect(b.stayCost).toBe(4 * 3 * STAY_RATE_PER_NIGHT.comfort)
    expect(b.stayFormula).toBe(`4 nights × 3 rooms × ₹${STAY_RATE_PER_NIGHT.comfort}`)
  })

  it('scales meals over nights+1 days per head', () => {
    const b = computeBenchBill(input({ crew: 2, nights: 3 }))
    expect(b.days).toBe(4)
    expect(b.mealCost).toBe(4 * 2 * MEALS_PER_HEAD_DAY)
    expect(b.mealFormula).toBe(`4 days × 2 heads × ₹${MEALS_PER_HEAD_DAY}`)
  })

  it('splits the total per head', () => {
    const b = computeBenchBill(input({ crew: 4 }))
    expect(b.total).toBe(b.transportCost + b.stayCost + b.mealCost)
    expect(b.perHead).toBe(Math.round(b.total / 4))
  })
})

describe('computeBenchBill — clamps and fatigue', () => {
  it('clamps every dial into its band', () => {
    const b = computeBenchBill(input({ km: 99999, nights: 99, crew: 99, kmPerL: 1, inrPerL: 999 }))
    expect(b.roadKm).toBe(BENCH_LIMITS.km[1] * 2)
    expect(b.days).toBe(BENCH_LIMITS.nights[1] + 1)
    // kmPerL/inrPerL pinned to their band edges: km 900 → 1800 road km ÷ 2 km/L × ₹250
    expect(b.transportCost).toBe(Math.round((1800 / 2) * 250))
  })

  it('grades fatigue by wheel hours per day', () => {
    const chill = computeBenchBill(input({ km: 150, mode: 'car', nights: 6, roundTrip: false }))
    expect(chill.fatigue.tone).toBe('calm')
    // ~19h wheel over 3 days ≈ 6.3 h/day — inside the "full driving days" band
    const mid = computeBenchBill(input({ km: 800, mode: 'car', nights: 2, roundTrip: false }))
    expect(mid.fatigue.tone).toBe('warn')
    const brutal = computeBenchBill(input({ km: 900, mode: 'car', nights: 1, roundTrip: true }))
    expect(brutal.fatigue.tone).toBe('hot')
  })

  it('keeps presets within the clamps', () => {
    for (const p of BENCH_PRESETS) {
      const b = computeBenchBill(input(p))
      expect(Number.isFinite(b.total)).toBe(true)
      expect(b.total).toBeGreaterThan(0)
    }
  })
})

describe('prefill hand-off', () => {
  it('serialises the bill + inputs into a valid prefill payload', () => {
    const inp = input({ crew: 5, mode: 'motorcycle', stay: 'budget' })
    const bill = computeBenchBill(inp)
    const prefill = {
      travellers: inp.crew,
      transportMode: inp.mode,
      budgetPerPersonInr: bill.perHead,
      travelStyle: STAY_TO_TRAVEL_STYLE.budget,
      roundTrip: inp.roundTrip,
      ...(isBenchFuelMode(inp.mode) ? { kmPerL: inp.kmPerL, inrPerL: inp.inrPerL } : {}),
    }
    expect(parseBenchPrefill(JSON.stringify(prefill))).toEqual(prefill)
    expect(prefill.kmPerL).toBe(inp.kmPerL) // fuel sliders ride along for fuel modes
  })

  it('omits fuel fields for fare modes', () => {
    const inp = input({ mode: 'train' })
    const bill = computeBenchBill(inp)
    const prefill = {
      travellers: inp.crew, transportMode: 'train' as const,
      budgetPerPersonInr: bill.perHead, travelStyle: STAY_TO_TRAVEL_STYLE.comfort,
      roundTrip: inp.roundTrip,
    }
    expect(parseBenchPrefill(JSON.stringify(prefill))).toEqual(prefill)
    expect(parseBenchPrefill(JSON.stringify(prefill))!.kmPerL).toBeUndefined()
  })

  it('rejects corrupt / malformed stashes instead of throwing', () => {
    expect(parseBenchPrefill(null)).toBeNull()
    expect(parseBenchPrefill(undefined)).toBeNull()
    expect(parseBenchPrefill('')).toBeNull()
    expect(parseBenchPrefill('{not json')).toBeNull()
    expect(parseBenchPrefill(JSON.stringify({ travellers: 'x' }))).toBeNull()
    expect(parseBenchPrefill(JSON.stringify({ travellers: 2, transportMode: 'camel', budgetPerPersonInr: 100, travelStyle: 'balanced' }))).toBeNull()
  })

  it('storage wrappers degrade to no-ops without sessionStorage (node env)', () => {
    expect(readBenchPrefill()).toBeNull() // must not throw when storage is absent
  })

  it('classifies fuel modes correctly', () => {
    expect(isBenchFuelMode('car')).toBe(true)
    expect(isBenchFuelMode('motorcycle')).toBe(true)
    expect(isBenchFuelMode('bus')).toBe(false)
    expect(isBenchFuelMode('train')).toBe(false)
  })
})

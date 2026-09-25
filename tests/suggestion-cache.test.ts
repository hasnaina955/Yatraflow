// Scout finding: the Map tab reused its cached plan on scope match alone,
// so editing stops (new anchors) still served the old route's suggestions.
import { describe, it, expect } from 'vitest'
import { isMapCacheFresh, planInputsHash } from '../src/hooks/useSuggestionCache'

function cached(over = {}) {
  return { segments: [], inputsHash: 'placeholder', scopeKm: 20, ts: Date.now(), ...over }
}

const baseInputs = () => ({
  anchorsHash: 'abc', routeHash: 'def', travelStyle: 'relaxed',
  transportMode: 'car', scopeKm: 20,
  travellers: 2, budgetPerPersonInr: 15000,
})

describe('map cache freshness', () => {
  it('reuses the cache when scope and inputs both match', () => {
    const h = planInputsHash(baseInputs())
    expect(isMapCacheFresh(cached({ inputsHash: h }), 20, h)).toBe(true)
  })

  it('misses when stops moved the anchors', () => {
    expect(isMapCacheFresh(cached(), 20, planInputsHash({ ...baseInputs(), anchorsHash: 'xyz' }))).toBe(false)
  })

  it('misses when the detour scope changed', () => {
    expect(isMapCacheFresh(cached(), 30, planInputsHash({ ...baseInputs(), scopeKm: 30 }))).toBe(false)
  })

it('misses on an empty cache', () => {
    expect(isMapCacheFresh(null, 20, planInputsHash(baseInputs()))).toBe(false)
  })

  // #213 Phase 3: the previous hash omitted every input the search actually
  // reads. A crew change (driverCount, hasVulnerable), a fuel-economy tweak,
  // a round-trip toggle or a vehicle profile change used to serve stale
  // plans tuned for the old party. These pin that the hash now busts on each.
  it('misses when the crew changes (driverCount, hasVulnerable)', () => {
    expect(isMapCacheFresh(cached(), 20, planInputsHash({ ...baseInputs(), driverCount: 2 }))).toBe(false)
    expect(isMapCacheFresh(cached(), 20, planInputsHash({ ...baseInputs(), hasVulnerable: true }))).toBe(false)
  })

  it('misses when the fuel inputs change', () => {
    expect(isMapCacheFresh(cached(), 20, planInputsHash({ ...baseInputs(), fuelEconomyKmL: 18 }))).toBe(false)
    expect(isMapCacheFresh(cached(), 20, planInputsHash({ ...baseInputs(), fuelPricePerL: 110 }))).toBe(false)
    expect(isMapCacheFresh(cached(), 20, planInputsHash({ ...baseInputs(), roundTrip: false }))).toBe(false)
  })

  it('misses when the vehicle profile changes', () => {
    const profile = { vehicleType: 'motorcycle' as const, fuelType: 'petrol' as const, capacity: 12, economy: 40 }
    const baseWithoutProfile = planInputsHash(baseInputs())
    const withProfile = planInputsHash({ ...baseInputs(), vehicleProfile: profile })
    expect(withProfile).not.toBe(baseWithoutProfile)
    expect(isMapCacheFresh(cached(), 20, withProfile)).toBe(false)
  })

  it('misses when the per-person budget changes', () => {
    expect(isMapCacheFresh(cached(), 20, planInputsHash({ ...baseInputs(), budgetPerPersonInr: 25000 }))).toBe(false)
  })

  it('misses when time, weather, halt pins, DNA or speed inputs change', () => {
    const base = planInputsHash(baseInputs())
    expect(planInputsHash({ ...baseInputs(), dayStartTimes: ['09:00'] })).not.toBe(base)
    expect(planInputsHash({ ...baseInputs(), dayRainPct: [80] })).not.toBe(base)
    expect(planInputsHash({ ...baseInputs(), dayWeatherCode: [95] })).not.toBe(base)
    expect(planInputsHash({ ...baseInputs(), haltPins: { 0: 120 } })).not.toBe(base)
    expect(planInputsHash({ ...baseInputs(), dnaVector: { sightseeing: 2 } })).not.toBe(base)
    expect(planInputsHash({ ...baseInputs(), speedKmph: 25 })).not.toBe(base)
  })
})

describe('planInputsHash is order-stable', () => {
  it('produces the same hash for the same input regardless of object key order', () => {
    const a = planInputsHash({
      anchorsHash: 'a', routeHash: 'b', travelStyle: 'relaxed', transportMode: 'car',
      scopeKm: 20, travellers: 2, budgetPerPersonInr: 15000,
    })
    const b = planInputsHash({
      budgetPerPersonInr: 15000, travellers: 2, scopeKm: 20,
      transportMode: 'car', travelStyle: 'relaxed', routeHash: 'b', anchorsHash: 'a',
    })
    expect(a).toBe(b)
  })

  it('treats undefined crew inputs consistently (no stale cache after opt-in fields stay unset)', () => {
    const a = planInputsHash({ ...baseInputs() })
    const b = planInputsHash({ ...baseInputs(), driverCount: undefined, hasVulnerable: undefined })
    expect(a).toBe(b)
  })

  it('treats undefined fuel inputs consistently', () => {
    const a = planInputsHash({ ...baseInputs() })
    const b = planInputsHash({ ...baseInputs(), fuelEconomyKmL: undefined, fuelPricePerL: undefined, roundTrip: undefined })
    expect(a).toBe(b)
  })

  it('distinguishes explicit false from undefined for roundTrip', () => {
    // One-way drives set roundTrip: false (≠ undefined) — different fuel math.
    const a = planInputsHash({ ...baseInputs() })
    const b = planInputsHash({ ...baseInputs(), roundTrip: false })
    expect(a).not.toBe(b)
  })
})

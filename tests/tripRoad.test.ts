// roadChainSig — the geometry-only signature the workspace uses to memoise
// the chain (#213 Phase 3). It must change on any change that alters the
// ROAD, and stay stable across changes that don't (fuel, crew, dates, budget).
import { describe, it, expect } from 'vitest'
import { roadChainSig, buildRoadChain } from '../src/lib/tripRoad'
import { isRoundTrip } from '../src/lib/engine'
import { seedData } from '../src/data/seed'
import type { Trip } from '../src/data/types'

const baseTrip = (): Trip => {
  const t = structuredClone(seedData.trips[0])
  // The seed trips intentionally leave startLocationCoords undefined (the
  // engine falls back to the first stop's position), so a few of these
  // cases need a coords to exercise. Set a sensible default for tests
  // that care about start-position sensitivity.
  t.startLocationCoords = { lat: 9.97, lng: 76.30 }
  return t
}

describe('roadChainSig (the geometry-only memo key #213)', () => {
  it('returns a stable string for the same trip', () => {
    const a = roadChainSig(baseTrip())
    const b = roadChainSig(baseTrip())
    expect(a).toBe(b)
  })

  it('matches what buildRoadChain actually consumes (start + stops + destinations + roundTrip)', () => {
    const t = baseTrip()
    const sig = roadChainSig(t)
    // Source of truth is buildRoadChain itself — if it changes what the chain
    // consumes, this test starts failing and tells us to update roadChainSig.
    expect(sig.split('|')).toHaveLength(buildRoadChain(t).points.length + 1) // +1 for the roundTrip flag
  })

  it('changes when the start coords move', () => {
    const a = roadChainSig(baseTrip())
    const t = baseTrip()
    t.startLocationCoords = { lat: t.startLocationCoords!.lat + 0.001, lng: t.startLocationCoords!.lng }
    expect(roadChainSig(t)).not.toBe(a)
  })

  it('changes when a destination is added', () => {
    const a = roadChainSig(baseTrip())
    const t = baseTrip()
    const dc = (t.destinationCoords ?? []).slice()
    dc.push({ lat: 12.34, lng: 56.78 })
    t.destinationCoords = dc
    t.destinations = [...t.destinations, 'New dest']
    expect(roadChainSig(t)).not.toBe(a)
  })

  it('changes when a stop is added to an existing day', () => {
    const a = roadChainSig(baseTrip())
    const t = baseTrip()
    const day = t.days[0]
    day.stops.push({
      id: 's-new',
      index: day.index,
      orderInDay: day.stops.length,
      locationName: 'New stop',
      title: 'New stop',
      lat: 23.5,
      lng: 78.5,
      status: 'planned',
      placeId: null,
      category: 'food',
      dwellMinutes: 0,
    })
    expect(roadChainSig(t)).not.toBe(a)
  })

  it('changes when a stop is rejected (it drops out of the chain)', () => {
    const a = roadChainSig(baseTrip())
    const t = baseTrip()
    const day = t.days[0]
    day.stops[0].status = 'rejected'
    expect(roadChainSig(t)).not.toBe(a)
  })

  it('changes when stops are reordered within a day', () => {
    const a = roadChainSig(baseTrip())
    const t = baseTrip()
    const day = t.days[0]
    const stops = day.stops
    if (stops.length >= 2) {
      const [first, second] = stops
      first.orderInDay = 1
      second.orderInDay = 0
    }
    expect(roadChainSig(t)).not.toBe(a)
  })

  it('changes when roundTrip flips (true ↔ false; undefined default is already covered)', () => {
    const base = baseTrip()
    const a = roadChainSig(base)
    // Set roundTrip=false explicitly — the only way to flip isRoundTrip away
    // from the car/rental/motorcycle default of "true when roundTrip !== false".
    const off: Trip = { ...base, roundTrip: false }
    expect(isRoundTrip(off)).toBe(false)
    expect(roadChainSig(off)).not.toBe(a)
    const on: Trip = { ...off, roundTrip: true }
    expect(isRoundTrip(on)).toBe(true)
    expect(roadChainSig(on)).toBe(a)
  })

  it('STAYS stable for fuel/crew/budget/dates/cover changes (the whole point)', () => {
    const a = roadChainSig(baseTrip())
    const t = baseTrip()
    t.fuelEconomyKmL = 18
    t.fuelPricePerL = 110
    t.budgetPerPersonInr = 25000
    t.driverCount = 2
    t.hasVulnerable = true
    t.driveAfterDinnerMin = 120
    t.vehicleProfile = { vehicleType: 'motorcycle', fuelType: 'petrol', capacity: 12, economy: 40 }
    t.startDate = '2027-01-01'
    t.endDate = '2027-01-05'
    t.travelStyle = 'packed'
    t.stayStyle = 'luxury'
    expect(roadChainSig(t)).toBe(a)
  })

  it('STAYS stable when stop metadata changes but not coords (title/name/placeId)', () => {
    const a = roadChainSig(baseTrip())
    const t = baseTrip()
    const day = t.days[0]
    day.stops[0].title = 'Renamed'
    day.stops[0].locationName = 'Renamed place'
    day.stops[0].placeId = 'pid:abc'
    day.stops[0].dwellMinutes = 60
    expect(roadChainSig(t)).toBe(a)
  })
})
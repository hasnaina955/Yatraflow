import { describe, it, expect } from 'vitest'
import {
  defaultVehicleProfile,
  resolveVehicleRange,
  formatCapacity,
  isElectric,
  fuelStopLabel,
  normalizeVehicleProfile,
} from '../src/lib/vehicleProfile'

describe('vehicleProfile', () => {
  it('default car profile', () => {
    const p = defaultVehicleProfile('car')
    expect(p.vehicleType).toBe('car')
    expect(p.fuelType).toBe('petrol')
    expect(p.capacity).toBe(45)
    expect(p.economy).toBe(15)
  })

  it('default motorcycle profile', () => {
    const p = defaultVehicleProfile('motorcycle')
    expect(p.vehicleType).toBe('motorcycle')
    expect(p.capacity).toBe(12)
    expect(p.economy).toBe(40)
  })

  it('default EV profile', () => {
    const p = defaultVehicleProfile('ev')
    expect(p.vehicleType).toBe('ev')
    expect(p.fuelType).toBe('electric')
    expect(p.capacity).toBe(50)
    expect(p.economy).toBe(6)
  })

  it('falls back to car for unknown mode', () => {
    const p = defaultVehicleProfile('train')
    expect(p.vehicleType).toBe('car')
  })

  it('resolve range for car', () => {
    const r = resolveVehicleRange(defaultVehicleProfile('car'))
    expect(r.rangeKm).toBeCloseTo(675, 0)     // 45 * 15
    expect(r.reserveKm).toBeCloseTo(101.25, 2) // 675 * 0.15
    expect(r.planCadenceKm).toBeCloseTo(573.75, 2) // 675 - 101.25
  })

  it('resolve range for motorcycle', () => {
    const r = resolveVehicleRange(defaultVehicleProfile('motorcycle'))
    expect(r.rangeKm).toBeCloseTo(480, 0)
    expect(r.planCadenceKm).toBeCloseTo(408, 0)
  })

  it('resolve range for EV', () => {
    const r = resolveVehicleRange(defaultVehicleProfile('ev'))
    expect(r.rangeKm).toBeCloseTo(300, 0)     // 50 * 6
    expect(r.planCadenceKm).toBeCloseTo(255, 0) // 300 * 0.85
  })

  it('falls back to car when no profile or mode given', () => {
    const r = resolveVehicleRange()
    expect(r.rangeKm).toBeCloseTo(675, 0)
  })

  it('formatCapacity', () => {
    expect(formatCapacity(defaultVehicleProfile('car'))).toBe('45 L')
    expect(formatCapacity(defaultVehicleProfile('ev'))).toBe('50 kWh')
  })

  it('isElectric', () => {
    expect(isElectric(defaultVehicleProfile('ev'))).toBe(true)
    expect(isElectric(defaultVehicleProfile('car'))).toBe(false)
    expect(isElectric()).toBe(false)
  })

  it('fuelStopLabel', () => {
    expect(fuelStopLabel(defaultVehicleProfile('car'))).toBe('Fuel')
    expect(fuelStopLabel(defaultVehicleProfile('ev'))).toBe('Charge')
    expect(fuelStopLabel({ ...defaultVehicleProfile('car'), fuelType: 'cng' })).toBe('CNG')
    expect(fuelStopLabel()).toBe('Fuel')
  })
})

// normalizeVehicleProfile is the JSONB validator that tripRow.ts applies on
// read (#20260915_trip_party_prefs.sql): a hand-edited or legacy row can
// carry any shape, and a junk value reaching the planner would corrupt the
// fuel-stop cadence. Any failure drops the whole profile — the engine's
// mode-default kicks in instead, so fuel stops always have *something* sane.
describe('normalizeVehicleProfile (JSONB validation)', () => {
  const valid = (overrides: Partial<ReturnType<typeof defaultVehicleProfile>> = {}) => ({
    vehicleType: 'car' as const,
    fuelType: 'petrol' as const,
    capacity: 45,
    economy: 15,
    ...overrides,
  })

  it('passes through a valid profile', () => {
    expect(normalizeVehicleProfile(valid())).toEqual(valid())
    expect(normalizeVehicleProfile(valid({ vehicleType: 'motorcycle', capacity: 12, economy: 40 })))
      .toEqual({ vehicleType: 'motorcycle', fuelType: 'petrol', capacity: 12, economy: 40 })
    expect(normalizeVehicleProfile(valid({ vehicleType: 'ev', fuelType: 'electric', capacity: 50, economy: 6 })))
      .toEqual({ vehicleType: 'ev', fuelType: 'electric', capacity: 50, economy: 6 })
  })

  it('rejects non-objects (null, primitive, array)', () => {
    expect(normalizeVehicleProfile(null)).toBeUndefined()
    expect(normalizeVehicleProfile(undefined)).toBeUndefined()
    expect(normalizeVehicleProfile('car')).toBeUndefined()
    expect(normalizeVehicleProfile(45)).toBeUndefined()
    expect(normalizeVehicleProfile([45, 15])).toBeUndefined()
  })

  it('rejects an unknown vehicleType', () => {
    expect(normalizeVehicleProfile(valid({ vehicleType: 'scooter' as never }))).toBeUndefined()
    expect(normalizeVehicleProfile(valid({ vehicleType: '' as never }))).toBeUndefined()
    expect(normalizeVehicleProfile(valid({ vehicleType: 'Car' as never }))).toBeUndefined() // case-sensitive
  })

  it('rejects an unknown fuelType', () => {
    expect(normalizeVehicleProfile(valid({ fuelType: 'hydrogen' as never }))).toBeUndefined()
    expect(normalizeVehicleProfile(valid({ fuelType: '' as never }))).toBeUndefined()
  })

  it('rejects non-numeric capacity / economy', () => {
    expect(normalizeVehicleProfile(valid({ capacity: '45' as never }))).toBeUndefined()
    expect(normalizeVehicleProfile(valid({ economy: '15' as never }))).toBeUndefined()
  })

  it('rejects non-finite capacity / economy', () => {
    expect(normalizeVehicleProfile(valid({ capacity: Number.POSITIVE_INFINITY }))).toBeUndefined()
    expect(normalizeVehicleProfile(valid({ capacity: Number.NaN }))).toBeUndefined()
    expect(normalizeVehicleProfile(valid({ economy: Number.NaN }))).toBeUndefined()
  })

  it('rejects out-of-range capacity / economy', () => {
    expect(normalizeVehicleProfile(valid({ capacity: 0 }))).toBeUndefined()
    expect(normalizeVehicleProfile(valid({ capacity: -1 }))).toBeUndefined()
    expect(normalizeVehicleProfile(valid({ capacity: 0.1 }))).toBeUndefined() // < 0.5
    expect(normalizeVehicleProfile(valid({ capacity: 600 }))).toBeUndefined() // > 500
    expect(normalizeVehicleProfile(valid({ economy: 0 }))).toBeUndefined()
    expect(normalizeVehicleProfile(valid({ economy: -5 }))).toBeUndefined()
    expect(normalizeVehicleProfile(valid({ economy: 101 }))).toBeUndefined() // > 100
  })

  it('accepts boundary values', () => {
    expect(normalizeVehicleProfile(valid({ capacity: 0.5, economy: 1 }))).toBeDefined()
    expect(normalizeVehicleProfile(valid({ capacity: 500, economy: 100 }))).toBeDefined()
  })

  it('drops the whole profile if a single field is missing', () => {
    const { capacity, ...partial } = valid()
    expect(normalizeVehicleProfile(partial)).toBeUndefined()
    const { fuelType, ...partial2 } = valid()
    expect(normalizeVehicleProfile(partial2)).toBeUndefined()
  })
})

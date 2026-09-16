// ============ Vehicle profile — range & fuel/charging cadence ============
// Pure module. No network, no env. Computes real range from user-stated
// capacity + economy, with a 15 % reserve buffer so fuel stops are planned
// before the tank is empty.

import type { VehicleProfile, FuelType } from '../data/types'

/** Vehicle-type vocabulary the form + engine agree on. */
const VEHICLE_TYPES = ['car', 'motorcycle', 'ev'] as const
/** Fuel/energy-source vocabulary. */
const FUEL_TYPES: readonly FuelType[] = ['petrol', 'diesel', 'electric', 'cng']
/** Plausible ranges — junk/legacy values outside these are dropped. */
const CAPACITY_BOUNDS = { min: 0.5, max: 500 } // 0.5 L/kWh is silly, 500 is a fuel tanker
const ECONOMY_BOUNDS = { min: 1, max: 100 } // 1 km/L is below any car; 100 km/L is a hypermiler

export interface ResolvedRange {
  /** capacity × economy — total theoretical range */
  rangeKm: number
  /** range × 0.15 — never plan a stop below this */
  reserveKm: number
  /** range − reserve = the km at which we plan a fuel/charging stop */
  planCadenceKm: number
}

const DEFAULTS: Record<string, VehicleProfile> = {
  car: { vehicleType: 'car', fuelType: 'petrol', capacity: 45, economy: 15 },
  motorcycle: { vehicleType: 'motorcycle', fuelType: 'petrol', capacity: 12, economy: 40 },
  ev: { vehicleType: 'ev', fuelType: 'electric', capacity: 50, economy: 6 },
}

/** Build a default profile from a transport mode (best-effort). */
export function defaultVehicleProfile(mode: string): VehicleProfile {
  return DEFAULTS[mode] ?? DEFAULTS.car
}

/** Compute range, reserve, and plan cadence from a profile or mode fallback. */
export function resolveVehicleRange(
  profile?: VehicleProfile,
  transportMode?: string,
): ResolvedRange {
  const p = profile ?? (transportMode ? defaultVehicleProfile(transportMode) : DEFAULTS.car)
  const rangeKm = p.capacity * p.economy
  const reserveKm = rangeKm * 0.15
  return {
    rangeKm,
    reserveKm,
    planCadenceKm: Math.max(80, rangeKm - reserveKm),
  }
}

/** Human-readable capacity string, e.g. "45 L" or "50 kWh". */
export function formatCapacity(profile: VehicleProfile): string {
  return profile.fuelType === 'electric'
    ? `${profile.capacity} kWh`
    : `${profile.capacity} L`
}

/** True when the profile is for an electric vehicle. */
export function isElectric(profile?: VehicleProfile): boolean {
  return profile?.fuelType === 'electric'
}

/** Fuel-type-aware label for a fuel stop: "Fuel", "CNG", or "Charge". */
export function fuelStopLabel(profile?: VehicleProfile): string {
  if (!profile) return 'Fuel'
  if (profile.fuelType === 'electric') return 'Charge'
  if (profile.fuelType === 'cng') return 'CNG'
  return 'Fuel'
}

/**
 * Validate and shape a vehicle profile read from the DB (#20260915
 * trip_party_prefs.sql: the column is JSONB, so a hand-edited row can carry
 * junk values, and legacy data has no profile at all). Returns the profile
 * only if every field passes its vocabulary / range check; undefined
 * otherwise (the caller falls back to the transport-mode default, so the
 * fuel cadence never sees garbage math).
 */
export function normalizeVehicleProfile(raw: unknown): VehicleProfile | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const vehicleType = r.vehicleType
  const fuelType = r.fuelType
  const capacity = r.capacity
  const economy = r.economy
  if (typeof vehicleType !== 'string' || !VEHICLE_TYPES.includes(vehicleType as VehicleProfile['vehicleType'])) return undefined
  if (typeof fuelType !== 'string' || !FUEL_TYPES.includes(fuelType as FuelType)) return undefined
  if (typeof capacity !== 'number' || !Number.isFinite(capacity) || capacity < CAPACITY_BOUNDS.min || capacity > CAPACITY_BOUNDS.max) return undefined
  if (typeof economy !== 'number' || !Number.isFinite(economy) || economy < ECONOMY_BOUNDS.min || economy > ECONOMY_BOUNDS.max) return undefined
  return {
    vehicleType: vehicleType as VehicleProfile['vehicleType'],
    fuelType: fuelType as FuelType,
    capacity,
    economy,
  }
}

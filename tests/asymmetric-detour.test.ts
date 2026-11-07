// Ticket 01 (#886): ONE return-driving fact.
// An 8 km spur at 40 km/h costs 24 minutes there and back. Supplied road
// evidence wins over the geometric spur. Unknown or invalid evidence stays
// unknown and is never read as free.
import { describe, it, expect } from 'vitest'
import { spurKm, asymmetricDetourKm, asymmetricDetourMinutes, detourKm } from '../src/lib/providers/hits'

// A straight lat/lng polyline running due east at lat 10 (1 km ≈ 0.00899° lng)
const EAST = Array.from({ length: 11 }, (_, i) => ({ lat: 10, lng: 10 + i * 0.009 }))
// A {lat,lng} point sitting right ON the polyline vs. one 5 km south of it
const ON_ROAD = { latitude: 10.0, longitude: 10.09 } as const
const OFF_ROAD = { latitude: 10.0 - 0.045, longitude: 10.09 } as const // ~5 km south

describe('spur distance to the route', () => {
  it('reads ~0 for a point on the road', () => {
    const s = spurKm(ON_ROAD as never, EAST)
    expect(s).not.toBeNull()
    expect(s!).toBeLessThan(0.2)
  })

  it('reads ~5 km for a point 5 km off', () => {
    const s = spurKm(OFF_ROAD as never, EAST)
    expect(s).not.toBeNull()
    expect(s!).toBeGreaterThan(4)
    expect(s!).toBeLessThan(6)
  })
})

describe('one return-driving fact', () => {
  it('an 8 km supplied spur at 40 km/h shows 24 minutes there and back', () => {
    const h = { latitude: 10, longitude: 10.09, offRouteKm: 8 }
    expect(asymmetricDetourKm(h as never, [], EAST)).toBe(8)
    expect(asymmetricDetourMinutes(h as never, [], EAST, 40)).toBeCloseTo(24, 5)
  })

  it('reads a geometric spur as return minutes too (never one-way)', () => {
    const m = asymmetricDetourMinutes(OFF_ROAD as never, [], EAST, 40)
    expect(m).not.toBeNull()
    // ~5 km one-way at 40 km/h ≈ 7.5 min out, 15 min there and back.
    expect(m!).toBeGreaterThan(13)
    expect(m!).toBeLessThan(17)
  })

  it('charges ~0 for a known on-road candidate', () => {
    expect(asymmetricDetourKm(ON_ROAD as never, [], EAST)).toBeLessThan(0.2)
    expect(asymmetricDetourMinutes(ON_ROAD as never, [], EAST, 40)).toBeLessThan(1)
  })

  it('keeps supplied road evidence instead of the geometric spur', () => {
    const h = { latitude: 10, longitude: 10.09, offRouteKm: 3 }
    expect(asymmetricDetourKm(h as never, [], EAST)).toBe(3)
    expect(asymmetricDetourMinutes(h as never, [], EAST, 40)).toBeCloseTo(9, 5)
  })

  it('uses supplied evidence on a Google along-route hit instead of calling it free', () => {
    const h = { latitude: 10, longitude: 10.09, offRouteKm: 8, fromGoogleAlongRoute: true }
    expect(asymmetricDetourMinutes(h as never, [], EAST, 40)).toBeCloseTo(24, 5)
  })

  it('keeps an along-route hit with no evidence unknown, not free', () => {
    const h = { latitude: 10, longitude: 10.09, fromGoogleAlongRoute: true }
    expect(asymmetricDetourKm(h as never, [], EAST)).toBeNull()
    expect(asymmetricDetourMinutes(h as never, [], EAST, 40)).toBeNull()
  })

  it('keeps missing, negative or non-finite evidence unknown', () => {
    expect(asymmetricDetourKm({ latitude: 10, longitude: 77 } as never, [], null)).toBeNull()
    expect(asymmetricDetourMinutes({ latitude: 10, longitude: 77 } as never, [], null, 40)).toBeNull()
    for (const bad of [-5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const h = { latitude: 10, longitude: 10.09, offRouteKm: bad }
      expect(asymmetricDetourKm(h as never, [], EAST)).toBeNull()
      expect(asymmetricDetourMinutes(h as never, [], EAST, 40)).toBeNull()
      expect(detourKm(h as never, [])).toBeNull()
    }
  })

  it('keeps a supplied zero as a known on-road fact, not unknown', () => {
    const h = { latitude: 10, longitude: 10.09, offRouteKm: 0 }
    expect(asymmetricDetourMinutes(h as never, [], EAST, 40)).toBe(0)
  })

  it('still measures a symmetric fallback without geometry', () => {
    const appr = asymmetricDetourKm(OFF_ROAD as never, [{ lat: 10, lng: 10.09 }])
    expect(appr).toBeGreaterThan(2)
  })
})

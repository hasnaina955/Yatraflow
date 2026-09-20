// ============ Directional corridor km (the Return-home toggle's meaning) =====
// #polylines: the map's Return-home toggle used to be a drawing switch only —
// the suggestion rails' km labels stayed loop-relative no matter what, so a
// place on the ride home read "90% of the loop" instead of "30 km from home
// on the way back". The toggle now reports direction up to the Map tab and
// the labels wrap accordingly. Pins:
//   · directionalKm — loop passthrough vs outbound-only wrap
//   · alongRouteKmOf — total span of a drawn polyline + snap km
import { describe, expect, it } from 'vitest'
import { directionalKm, alongRouteKmOf } from '../src/lib/providers/hits'

// a straight 300 km east-west road (1° lng ≈ 110.6 km at the equator)
const LINE: { lat: number; lng: number }[] = [
  { lat: 10, lng: 77 },
  { lat: 10, lng: 78 },
  { lat: 10, lng: 79 },
]

describe('directionalKm', () => {
  it('passes loop km through unchanged when the return leg is shown (default)', () => {
    expect(directionalKm(250, 300, true)).toBe(250)
    expect(directionalKm(50, 300, true)).toBe(50)
  })

  it('wraps km to the distance from HOME when the return leg is hidden', () => {
    // a place 250 km out is 50 km from home on the way back
    expect(directionalKm(250, 300, false)).toBe(50)
    // a place on the outbound half keeps its own km (the outbound road reads the same either way)
    expect(directionalKm(50, 300, false)).toBe(50)
    // the far end reads 0 from home either way
    expect(directionalKm(300, 300, false)).toBe(0)
  })
})

describe('alongRouteKmOf', () => {
  it('returns the snap km and the polyline span', () => {
    const r = alongRouteKmOf(10, 77.5, LINE)
    expect(r).not.toBeNull()
    expect(r!.totalKm).toBeGreaterThan(200) // ~2° of road
    expect(r!.km).toBeGreaterThan(40)
    expect(r!.km).toBeLessThan(70)
  })

  it('is null without a usable polyline', () => {
    expect(alongRouteKmOf(10, 77.5, null)).toBeNull()
    expect(alongRouteKmOf(10, 77.5, [{ lat: 10, lng: 77 }])).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { dayDiscoveryContext, dayStayBase } from '../src/pages/trip/map/useCorridorCache'
import { circleCoverage } from '../src/lib/providers/hits'

const day = { id: 'day-a', index: 0, stops: [{ lat: 12, lng: 77, name: 'Base', category: 'hotel' }] }

describe('day discovery context', () => {
  it('keeps an anchorless day separate from a successful empty scan', () => {
    const context = dayDiscoveryContext({ day: { ...day, stops: [] }, routeGeometry: null, stayBase: null, purposes: ['sight'] })
    expect(context.kind).toBe('needs-anchor')
  })

  it('uses only the day route, stay base and purposes', () => {
    const context = dayDiscoveryContext({ day, routeGeometry: [[78, 13], [79, 14]], stayBase: { lat: 13, lng: 78 }, purposes: ['sight'] })
    expect(context.kind).toBe('ready')
    expect(context.routeGeometry).toEqual([[78, 13], [79, 14]])
    expect(context.anchors).toContainEqual({ lat: 13, lng: 78 })
    expect(context.purposes).toEqual(['sight'])
    expect(context.scopeMinutes).toBe(30)
  })

  it('distinguishes days, stay bases, categories and minute scopes, but ignores titles', () => {
    const input = { day, routeGeometry: null, stayBase: null, purposes: ['sight' as const] }
    const key = dayDiscoveryContext(input).key
    expect(dayDiscoveryContext({ ...input, day: { ...day, id: 'day-b', index: 1 } }).key).not.toBe(key)
    expect(dayDiscoveryContext({ ...input, stayBase: { lat: 13, lng: 78 } }).key).not.toBe(key)
    expect(dayDiscoveryContext({ ...input, day: { ...day, stops: [{ ...day.stops[0], category: 'museum' }] } }).key).not.toBe(key)
    expect(dayDiscoveryContext({ ...input, scopeMinutes: 45 }).key).not.toBe(key)
    expect(dayDiscoveryContext({ ...input, day: { ...day, title: 'New title' } }).key).toBe(key)
  })
})

describe('bounded circle coverage', () => {
  it('discloses uncovered road between distant query circles', () => {
    const coverage = circleCoverage([{ lat: 12, lng: 77 }, { lat: 12, lng: 79 }], [{ lat: 12, lng: 77 }], 10000)
    expect(coverage.totalKm).toBeGreaterThan(200)
    expect(coverage.coveredKm).toBeGreaterThan(0)
    expect(coverage.coveredKm).toBeLessThan(11)
    expect(coverage.complete).toBe(false)
  })

  it('does not invent road length for a point search', () => {
    expect(circleCoverage(null, [{ lat: 12, lng: 77 }], 10000)).toMatchObject({ totalKm: null, coveredKm: null, complete: false, anchorCount: 1 })
  })
})

describe('dayStayBase', () => {
  const stop = (id: string, category: string, lat: number, lng: number, status = 'confirmed') =>
    ({ id, category, lat, lng, status }) as never
  const trip = {
    days: [
      { id: 'a', index: 0, title: 'D1', stops: [stop('h0', 'hotel', 10, 76)] },
      { id: 'b', index: 1, title: 'D2', stops: [stop('s1', 'food', 11, 77)] },
      { id: 'c', index: 2, title: 'D3', stops: [stop('h2', 'hotel', 12, 78), stop('h2r', 'hotel', 13, 79, 'rejected')] },
    ],
  } as never

  it('uses the same-day hotel and skips a rejected one', () => {
    expect(dayStayBase(trip, 2)).toEqual({ lat: 12, lng: 78 })
  })
  it('falls back to the day before, and no further', () => {
    expect(dayStayBase(trip, 1)).toEqual({ lat: 10, lng: 76 })
    expect(dayStayBase({ days: [(trip as { days: unknown[] }).days[0], (trip as { days: unknown[] }).days[1], { id: 'x', index: 5, title: 'D6', stops: [] }] } as never, 5)).toBeNull()
  })
  it('never invents a base when the trip has no hotel', () => {
    expect(dayStayBase({ days: [{ id: 'a', index: 0, title: 'D1', stops: [] }] } as never, 0)).toBeNull()
  })
})

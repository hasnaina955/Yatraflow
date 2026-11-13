// The Drive corridor keeps picks along the whole road, not in one famous town.
// Google ranks Search Along Route by fame, so towns at the ends of a drive took
// every slot. The spread takes the best place of each road stretch in turn.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { corridorPickCount, polylineKm, rankAndCap, ROUTE_STRETCH_KM, spreadByStretch, type PlaceHit } from '../src/lib/providers/hits'

const ANCHORS = [{ lat: 10, lng: 76 }]
// Two categories of the same tier, so only fame and position differ.
const CATEGORIES = ['sightseeing', 'nature'] as const

function hit(id: string, km: number, index: number, famous: boolean): PlaceHit {
  return {
    id, name: `Spot${id}zz`, latitude: 10 + index * 0.01, longitude: 76, kind: 'poi', source: 'google',
    category: CATEGORIES[index % CATEGORIES.length], alongRouteKm: km,
    ...(famous ? { rating: 4.8, ratingCount: 2000 } : {}),
  }
}

// Six famous places in the end town, and two plain ones mid-route.
const town = Array.from({ length: 6 }, (_, i) => hit(`town${i}`, 535 + i, i, true))
const mid = [hit('mid100', 100, 6, false), hit('mid300', 300, 7, false)]
const pool = [...town, ...mid]

describe('Corridor picks spread along the road', () => {
  it('without the spread, the famous town fills every slot (the reported fault)', () => {
    const kept = rankAndCap(pool, ANCHORS, 10_000, 4)
    expect(kept.every(h => (h.alongRouteKm ?? 0) >= 535)).toBe(true)
  })

  it('with the spread, each stretch of road keeps its best place', () => {
    const kept = rankAndCap(pool, ANCHORS, 10_000, 4, { spreadKm: ROUTE_STRETCH_KM })
    const ids = kept.map(h => h.id)
    expect(ids).toContain('mid100')
    expect(ids).toContain('mid300')
    expect(kept).toHaveLength(4)
  })

  it('keeps the kept places in score order', () => {
    const kept = rankAndCap(pool, ANCHORS, 10_000, 4, { spreadKm: ROUTE_STRETCH_KM })
    // A large count lifts the per-category cap, so every place has a rank.
    const plain = rankAndCap(pool, ANCHORS, 10_000, 30)
    const rank = (id: string) => plain.findIndex(h => h.id === id)
    const order = kept.map(h => rank(h.id))
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it('interleaves stretches, and puts hits with no road position in one stretch', () => {
    const a = { id: 'a', alongRouteKm: 10 }, b = { id: 'b', alongRouteKm: 20 }, c = { id: 'c', alongRouteKm: 130 }, d = { id: 'd', alongRouteKm: undefined }
    expect(spreadByStretch([a, b, c, d], 60).map(h => h.id)).toEqual(['d', 'a', 'c', 'b'])
  })

  it('keeps 16 picks up to 200 km, more on a long drive, and never more than 32', () => {
    expect(corridorPickCount(null)).toBe(16)
    expect(corridorPickCount(120)).toBe(16)
    expect(corridorPickCount(476)).toBe(32)
    expect(corridorPickCount(300)).toBe(24)
    expect(corridorPickCount(5000)).toBe(32)
  })

  it('measures a road line in km', () => {
    expect(polylineKm(null)).toBeNull()
    expect(polylineKm([[76, 10], [76, 11]])).toBeCloseTo(111.2, 0)
  })

  it('wires the spread and the scaled count into the Drive scan', () => {
    const hook = readFileSync(new URL('../src/pages/trip/map/useCorridorCache.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
    expect(hook).toContain('scopeKm * 1000, corridorPickCount(polylineKm(routeGeometry)),')
    expect(hook).toContain('spreadKm: ROUTE_STRETCH_KM')
  })
})

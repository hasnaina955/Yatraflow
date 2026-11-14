// ============ Corridor snapshot publication identity (#08 S2) ============
// The key must cover every fact that shapes a row, not a length or an edge.
// These tests use real SegmentHit/PlaceHit shapes and a real driving plan.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  deriveDrivingPlan,
  type PlaceHit,
  type RideSegment,
  type SegmentHit,
} from '../src/lib/geocode'
import { dayAttributionKeyFor, corridorSnapshotKey, corridorStatusFor, hitFactKey, retainCorridorRowsOnFailure, type CorridorSnapshot } from '../src/pages/trip/map/corridorSnapshot'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function hit(overrides: Partial<PlaceHit> & Pick<PlaceHit, 'id' | 'name'>): PlaceHit {
  return { latitude: 10, longitude: 76, kind: 'poi', ...overrides }
}

function segment(index: number, overrides: Partial<RideSegment> = {}): RideSegment {
  return {
    index,
    purpose: 'meal',
    label: `Break ${index}`,
    targetKm: 40 + index * 10,
    minKm: 30 + index * 10,
    maxKm: 50 + index * 10,
    kmFromPrev: 10,
    minutesFromPrev: 15,
    hint: `Hint ${index}`,
    ...overrides,
  }
}

function segHit(sh: RideSegment, h: PlaceHit | null, score = 1): SegmentHit {
  return { segment: sh, hit: h, score }
}

const planA = deriveDrivingPlan({ totalKm: 120, driveMinutes: 180 })
const planB = deriveDrivingPlan({ totalKm: 160, driveMinutes: 220 })

const attribution = {
  dayForKm: (km: number | null | undefined): number | null => (km == null ? null : Math.floor(km / 60)),
  dayOfSegment: () => 0,
  daySpanKm: () => ({ fromKm: 0, toKm: 120 }),
}

const hitA = hit({ id: 'a', name: 'A', source: 'google', placeId: 'g-a', cumKm: 20, offRouteKm: 2 })
const hitB = hit({ id: 'b', name: 'B', source: 'osm', cumKm: 30, offRouteKm: 0 })
const hitC = hit({ id: 'c', name: 'C', source: 'wikipedia', cumKm: 50, offRouteKm: 5 })
const hitD = hit({ id: 'd', name: 'D', source: 'mappls', eLoc: 'm-d', cumKm: 60, offRouteKm: 1 })

function snap(overrides: Partial<CorridorSnapshot> = {}): CorridorSnapshot {
  return {
    tripId: 'trip-1',
    inputsHash: 'hash-a',
    scopeKm: 20,
    status: 'ready',
    source: 'scan',
    pois: [segHit(segment(0), hitA), segHit(segment(1), hitB)],
    anchors: [{ lat: 10, lng: 76 }],
    routePolyline: [{ lat: 10, lng: 76 }, { lat: 10.2, lng: 76.4 }],
    drivingPlan: planA,
    dayAttribution: attribution,
    dayAttributionKey: dayAttributionKeyFor([60, 60], []),
    altPool: [hitC],
    detourMinFor: h => h.offRouteKm ?? null,
    detourKmFor: h => h.offRouteKm ?? null,
    heldBackIds: new Set(['b']),
    ...overrides,
  }
}

function keyOf(overrides: Partial<CorridorSnapshot> = {}): string {
  return corridorSnapshotKey(snap(overrides))
}

describe('same-id display facts still republish', () => {
  it('changes on a name, category, rating or hours change under one provider id', () => {
    const base = keyOf()
    const renamed = hit({ ...hitA, name: 'A renamed' })
    const recategorised = hit({ ...hitA, category: 'cafe' })
    const rated = hit({ ...hitA, rating: 4.7, ratingCount: 120 })
    const withHours = hit({
      ...hitA,
      hours: { source: 'google', fetchedOn: '2026-11-01', days: {} } as unknown as NonNullable<PlaceHit['hours']>,
    })
    expect(keyOf({ pois: [segHit(segment(0), renamed), segHit(segment(1), hitB)] })).not.toBe(base)
    expect(keyOf({ pois: [segHit(segment(0), recategorised), segHit(segment(1), hitB)] })).not.toBe(base)
    expect(keyOf({ pois: [segHit(segment(0), rated), segHit(segment(1), hitB)] })).not.toBe(base)
    expect(keyOf({ pois: [segHit(segment(0), withHours), segHit(segment(1), hitB)] })).not.toBe(base)
  })
})

describe('main-scan status and retained rows', () => {
  it('keeps the fraction note out of the snapshot status', () => {
    expect(corridorStatusFor({ quota: false, scanFailed: false, loading: false })).toBe('ready')
    expect(corridorStatusFor({ quota: false, scanFailed: false, loading: true })).toBe('scanning')
    expect(corridorStatusFor({ quota: false, scanFailed: true, loading: false })).toBe('failed')
    expect(corridorStatusFor({ quota: true, scanFailed: true, loading: false })).toBe('quota')
  })

  it('retains rows only for the same query', () => {
    const meta = { hash: 'h1', scopeKm: 20 }
    expect(retainCorridorRowsOnFailure({ hasRows: true, meta, inputsHash: 'h1', scopeKm: 20 })).toBe(true)
    expect(retainCorridorRowsOnFailure({ hasRows: true, meta, inputsHash: 'h2', scopeKm: 20 })).toBe(false)
    expect(retainCorridorRowsOnFailure({ hasRows: true, meta, inputsHash: 'h1', scopeKm: 30 })).toBe(false)
    expect(retainCorridorRowsOnFailure({ hasRows: false, meta, inputsHash: 'h1', scopeKm: 20 })).toBe(false)
  })
})

describe('the publication key covers the row content', () => {
  it('is equal for identical content held in new arrays, objects and sets', () => {
    const a = snap()
    const b = snap({
      pois: [segHit(segment(0), hitA), segHit(segment(1), hitB)],
      anchors: [{ lat: 10, lng: 76 }],
      routePolyline: [{ lat: 10, lng: 76 }, { lat: 10.2, lng: 76.4 }],
      altPool: [hitC],
      heldBackIds: new Set(['b']),
      dayAttribution: { ...attribution },
    })
    expect(corridorSnapshotKey(a)).toBe(corridorSnapshotKey(b))
  })

  it('changes when a middle row hit changes at the same length', () => {
    expect(keyOf({ pois: [segHit(segment(0), hitA), segHit(segment(1), hitB)] }))
      .not.toBe(keyOf({ pois: [segHit(segment(0), hitA), segHit(segment(1), hitC)] }))
  })

  it('changes when a segment fact changes at the same length', () => {
    expect(keyOf()).not.toBe(keyOf({
      pois: [segHit(segment(0, { etaMinutes: 600 }), hitA), segHit(segment(1), hitB)],
    }))
    expect(keyOf()).not.toBe(keyOf({
      pois: [segHit(segment(0), hitA), segHit(segment(1, { roadWarning: 'Ghat road' }), hitB)],
    }))
  })

  it('changes on a same-size rank swap', () => {
    const forward = keyOf({ pois: [segHit(segment(0), hitA), segHit(segment(1), hitB)] })
    const swapped = keyOf({ pois: [segHit(segment(1), hitB), segHit(segment(0), hitA)] })
    expect(forward).not.toBe(swapped)
  })

  it('changes when a detour result or an unknown/zero fact changes', () => {
    const zero = keyOf({ pois: [segHit(segment(0), hitB)] })
    const unknown = keyOf({
      pois: [segHit(segment(0), hitB)],
      detourMinFor: () => null,
      detourKmFor: () => null,
    })
    expect(zero).not.toBe(unknown)
    expect(keyOf({ detourMinFor: () => 4 })).not.toBe(keyOf({ detourMinFor: () => 5 }))
  })

  it('changes when the attribution data, anchors, road or driving plan changes', () => {
    expect(keyOf({ dayAttributionKey: dayAttributionKeyFor([70, 50], []) })).not.toBe(keyOf())
    expect(keyOf({ anchors: [{ lat: 11, lng: 76 }] })).not.toBe(keyOf())
    expect(keyOf({ routePolyline: [{ lat: 10, lng: 76 }] })).not.toBe(keyOf())
    expect(keyOf({ drivingPlan: planB })).not.toBe(keyOf())
  })

  it('changes when altPool or heldBack changes at the same size', () => {
    expect(keyOf({ altPool: [hitC] })).not.toBe(keyOf({ altPool: [hitD] }))
    expect(keyOf({ altPool: [hitC, hitD] })).not.toBe(keyOf({ altPool: [hitD, hitC] }))
    expect(keyOf({ heldBackIds: new Set(['b']) })).not.toBe(keyOf({ heldBackIds: new Set(['c']) }))
  })

  it('covers a same-size day-attribution reclassification', () => {
    const moved = {
      ...attribution,
      dayForKm: (km: number | null | undefined): number | null => (km == null ? null : (km > 25 ? 1 : 0)),
    }
    expect(keyOf()).not.toBe(keyOf({ dayAttribution: moved }))
  })
})

describe('hit identity is provider-aware', () => {
  it('keeps two providers that share a raw id apart', () => {
    const google = hit({ id: 1, name: 'One', source: 'google', placeId: 'g-1' })
    const osm = hit({ id: 1, name: 'One', source: 'osm' })
    expect(hitFactKey(google)).not.toBe(hitFactKey(osm))
    expect(hitFactKey(google)).toBe(hitFactKey(hit({ id: 1, name: 'One', source: 'google', placeId: 'g-1' })))
  })
})

describe('publication wiring', () => {
  const mapTab = readFileSync(join(root, 'src', 'pages', 'trip', 'MapTab.tsx'), 'utf8').replace(/\r\n/g, '\n')
  const cache = readFileSync(join(root, 'src', 'pages', 'trip', 'map', 'useCorridorCache.ts'), 'utf8').replace(/\r\n/g, '\n')

  function assertLivePin(source: string, label: string, pattern: RegExp, marker: string) {
    expect(source, `${label}: live source`).toMatch(pattern)
    expect(source, `${label}: marker present`).toContain(marker)
    expect(source.replace(marker, ''), `${label}: negative control`).not.toMatch(pattern)
  }

  it('publishes through the full key and a callback ref', () => {
    assertLivePin(mapTab, 'snapshot key', /corridorSnapshotKey\(next\)/, 'corridorSnapshotKey(next)')
    assertLivePin(mapTab, 'callback ref', /onCorridorStateRef\.current\?\.\(next\)/, 'onCorridorStateRef.current?.(next)')
    expect(mapTab).toMatch(/publishedCorridorKeyRef\.current === key/)
    expect(mapTab).toMatch(/onCorridorState\?: \(snapshot: CorridorSnapshot \| null\) => void/)
  })

  it('clears the rows and the query when the route disappears', () => {
    expect(cache).toMatch(/setCorridorSource\('none'\)[\s\S]{0,220}setPois\(\[\]\)[\s\S]{0,220}poisMetaRef\.current = null/)
  })

  it('tracks the real cache, scan and none branches', () => {
    expect(cache).toMatch(/corridorSource, setCorridorSource\] = useState<'cache' \| 'scan' \| 'none' \| 'retained'>/)
    expect(cache).toMatch(/setCorridorSource\('cache'\)/)
    expect(cache).toMatch(/setCorridorSource\('scan'\)/)
    expect(cache).toMatch(/setCorridorSource\('none'\)/)
    expect(cache).toMatch(/setCorridorSource\('retained'\)/)
    expect(mapTab).toMatch(/corridorSource === 'none' && anchors\.length === 0/)
    expect(cache).toMatch(/return \{[^}]*corridorSource/)
  })
})

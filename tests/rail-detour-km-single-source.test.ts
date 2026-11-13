// #08 AC5 residual: the rail's alternative-pool km must be the upstream detour.
// The pool used to derive its own straight-line km from the anchors, while the
// corridor and the omnibar read the spur off the drawn road. One hit then
// printed two different "km off" values on screen.
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import type { PlaceHit, SegmentHit } from '../src/lib/geocode'
import type { PlaceIdentity } from '../src/lib/placeIdentity'
import { asymmetricDetourKm, detourKm } from '../src/lib/providers/hits'
import { useRailContent } from '../src/pages/trip/map/useRailContent'

// useMemo runs outside a render here, so each factory runs in place.
vi.mock('react', async importOriginal => ({
  ...(await importOriginal<typeof import('react')>()),
  useMemo: <T,>(make: () => T): T => make(),
}))

const ANCHORS = [{ lat: 10, lng: 77 }]
// A drawn road due east along latitude 10.
const ROAD = [{ lat: 10, lng: 77 }, { lat: 10, lng: 78 }]

const place = (id: string, latitude: number, longitude: number) =>
  ({ id, name: `Place ${id}`, latitude, longitude }) as unknown as PlaceHit
const ON_ROAD = place('on', 10, 77.5)
const OFF_ROAD = place('off', 10.05, 77.5)
const NO_COORDS = place('none', Number.NaN, Number.NaN)

const identity = {
  names: new Set(),
  keys: [],
  places: [],
  added: new Set(),
  dismissed: new Set(),
} as unknown as PlaceIdentity

// The upstream km, computed the way MapTab's detourKmFor computes it.
const upstreamKm = (hit: PlaceHit) => asymmetricDetourKm(hit, ANCHORS, ROAD)

function railKmById(): Map<string, number | null> {
  // The anchors stay in the fixture. An old re-derivation then shows as a value
  // mismatch, not as a TypeError on a missing argument.
  const args = {
    pois: [ON_ROAD, OFF_ROAD, NO_COORDS].map(hit => ({ hit }) as unknown as SegmentHit),
    identity,
    anchors: ANCHORS,
    detourKmFor: upstreamKm,
  }
  const { altPool } = useRailContent(args)
  return new Map(altPool.all.map(entry => [String(entry.h.id), entry.dKm]))
}

describe('rail detour km reads the upstream detour (#08 AC5)', () => {
  it('the fixture separates the old formula from the upstream spur', () => {
    expect(detourKm(OFF_ROAD, ANCHORS)).toBeGreaterThan(40)
    expect(upstreamKm(OFF_ROAD)).toBeLessThan(6)
  })

  it('an off-road hit shows the upstream km', () => {
    expect(railKmById().get('off')).toBeCloseTo(upstreamKm(OFF_ROAD) as number, 6)
  })

  it('a known zero stays zero', () => {
    expect(railKmById().get('on')).toBeCloseTo(0, 6)
  })

  it('a missing km stays unknown', () => {
    expect(railKmById().get('none')).toBeNull()
  })
})

// Source pins. Full-line comments are stripped first, so the pins judge code
// only. CRLF is normalised to LF.
const strip = (src: string) =>
  src.replace(/\r\n/g, '\n').split('\n').filter(line => !/^\s*(\/\/|\/?\*)/.test(line)).join('\n')

describe('rail detour km has one source (#08 AC5)', () => {
  const hookCode = strip(readFileSync(new URL('../src/pages/trip/map/useRailContent.ts', import.meta.url), 'utf8'))
  const mapTabCode = strip(readFileSync(new URL('../src/pages/trip/MapTab.tsx', import.meta.url), 'utf8'))

  it('the rail hook takes the upstream km and imports no second formula', () => {
    expect(hookCode).not.toMatch(/\bdetourKm\b/)
    expect(hookCode).toMatch(/detourKmFor: \(hit: PlaceHit\) => number \| null/)
    expect(hookCode).toMatch(/dKm: detourKmFor\(h\)/)
  })

  it('MapTab defines the upstream km before it passes it to the rail hook', () => {
    const defined = mapTabCode.indexOf('const detourKmFor = useCallback(')
    const call = mapTabCode.indexOf('useRailContent({')
    expect(defined).toBeGreaterThan(-1)
    expect(call).toBeGreaterThan(defined)
    const callArgs = mapTabCode.slice(call, mapTabCode.indexOf('})', call))
    expect(callArgs).toMatch(/\bdetourKmFor\b/)
    expect(callArgs).not.toMatch(/\banchors\b/)
  })
})

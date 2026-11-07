// Family-query plumbing through the provider facade (ticket 09, non-UI slice).
//
// The family table and `familyQueryEntries` already existed, and the Google
// provider already consumed `families`, but the facade never forwarded them, so
// an explicit family request was dropped. These regressions run the exported
// entry with controlled fetches and pin the unrelated Mappls integration off
// before the provider module is evaluated.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { queriesForFamily, queriesForPurpose } from '../src/lib/purposeQueries'

vi.hoisted(() => {
  vi.stubEnv('VITE_MAPPLS_KEY', '')
})

const { searchNearbyPoisMulti } = await import('../src/lib/geocode')

const ANCHOR = { lat: 10, lng: 76 }
/** [lng, lat] pairs, the facade's own route format. */
const ROUTE: [number, number][] = [[76, 10], [76.5, 10]]

type Captured = { url: string; method: string; body: string }

const captured: Captured[] = []

function jsonResponse(body: unknown): Response {
  return { ok: true, json: async () => body } as Response
}

/** One OSM payload: a supported waterfall, a viewpoint and a functional conflict. */
const OSM_ELEMENTS = [
  { type: 'node', id: 1, lat: 10.05, lon: 76.05, tags: { name: 'Falls Creek', waterway: 'waterfall' } },
  { type: 'node', id: 2, lat: 10.06, lon: 76.06, tags: { name: 'Sunset Point', tourism: 'viewpoint' } },
  { type: 'node', id: 3, lat: 10.07, lon: 76.07, tags: { name: 'Peak Cafe', amenity: 'cafe', natural: 'peak' } },
]

/** Decode the `data=` form field of an Overpass POST body. */
function overpassQuery(call: Captured): string {
  const params = new URLSearchParams(call.body)
  return params.get('data') ?? ''
}

function installFetch(opts: { google?: boolean } = {}): void {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    captured.push({ url, method: init?.method ?? 'GET', body: String(init?.body ?? '') })
    if (url.includes('places:searchText')) return jsonResponse({ places: [] })
    if (url.includes('overpass') || url.includes('interpreter')) return jsonResponse({ elements: OSM_ELEMENTS })
    if (url.includes('wikipedia.org')) return jsonResponse({ query: { pages: {} } })
    if (opts.google && url.includes('places.googleapis.com')) return jsonResponse({ places: [] })
    throw new Error(`unexpected request: ${url}`)
  }))
}

function googleBodies(): Array<Record<string, unknown>> {
  return captured
    .filter(c => c.url.includes('places:searchText'))
    .map(c => JSON.parse(c.body) as Record<string, unknown>)
}

beforeEach(() => {
  captured.length = 0
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('Google along-route scan: families reach the provider', () => {
  it('a default purpose scan keeps its exact request count and query order', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key')
    installFetch({ google: true })
    await searchNearbyPoisMulti([ANCHOR], 10000, 16, { routeCoords: ROUTE, purposes: ['meal'] })
    const meal = queriesForPurpose('meal').googleQueries
    expect(googleBodies()).toHaveLength(meal.length)
    expect(googleBodies().map(b => b.textQuery)).toEqual(meal)
    // Default scan never asks for family queries.
    expect(googleBodies().some(b => b.textQuery === 'waterfalls')).toBe(false)
  })

  it('an explicit family adds exactly its own queries, after the purpose ones', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key')
    installFetch({ google: true })
    await searchNearbyPoisMulti([ANCHOR], 10000, 16, {
      routeCoords: ROUTE, purposes: ['meal'], families: ['water'],
    })
    const meal = queriesForPurpose('meal').googleQueries
    const water = queriesForFamily('water').googleQueries
    const bodies = googleBodies()
    expect(bodies).toHaveLength(meal.length + water.length)
    expect(bodies.map(b => b.textQuery)).toEqual([...meal, ...water])
    // The family entries carry no server-side type gate (the audit's flaw 5).
    for (const body of bodies.slice(meal.length)) {
      expect(body.includedType).toBeUndefined()
    }
  })

  it('the purpose requests are byte-for-byte identical with and without a family', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key')
    installFetch({ google: true })
    await searchNearbyPoisMulti([ANCHOR], 10000, 16, { routeCoords: ROUTE, purposes: ['meal'] })
    const withoutFamily = googleBodies()
    captured.length = 0
    await searchNearbyPoisMulti([ANCHOR], 10000, 16, {
      routeCoords: ROUTE, purposes: ['meal'], families: ['water'],
    })
    const withFamily = googleBodies()
    expect(withFamily.slice(0, withoutFamily.length)).toEqual(withoutFamily)
  })
})

describe('free OSM scan: families ride the same single request', () => {
  it('a default scan makes one Overpass POST and one Wikipedia geosearch', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '')
    installFetch()
    const hits = await searchNearbyPoisMulti([ANCHOR], 10000, 16, {})
    expect(captured).toHaveLength(2)
    expect(captured[0].url).toContain('overpass')
    expect(captured[0].method).toBe('POST')
    expect(captured[1].url).toContain('wikipedia.org')
    expect(overpassQuery(captured[0])).not.toContain('natural=water')
    expect(hits.length).toBeGreaterThan(0)
  })

  it('an explicit family adds its tag selectors without a second request', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '')
    installFetch()
    const hits = await searchNearbyPoisMulti([ANCHOR], 10000, 16, { families: ['water'] })
    expect(captured).toHaveLength(2)
    const query = overpassQuery(captured[0])
    expect(query).toContain('natural=water')
    expect(query).toContain('waterway=waterfall')
    // The base tourist selectors survive: a family scan ADDS, never replaces.
    expect(query).toContain('tourism~"^(attraction|viewpoint|zoo|theme_park|aquarium|museum|gallery)$"')
    // Family classification rides the existing helper and stays additive: the
    // classifier's own category and description are unchanged.
    const falls = hits.find(h => h.name === 'Falls Creek')
    expect(falls?.category).toBe('sightseeing')
    expect(falls?.description).toBe('Place')
    expect(falls?.family).toBe('water')
    expect(falls?.subtype).toBe('waterfall')
  })

  it('functional-tag exclusions and the generic fallback are preserved', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '')
    installFetch()
    const hits = await searchNearbyPoisMulti([ANCHOR], 10000, 16, { families: ['views'] })
    const cafe = hits.find(h => h.name === 'Peak Cafe')
    expect(cafe?.category).toBe('nature') // the legacy classifier's own class
    expect(cafe?.family).toBeUndefined()
    expect(cafe?.subtype).toBeUndefined()
    const point = hits.find(h => h.name === 'Sunset Point')
    expect(point?.family).toBe('views')
  })
})

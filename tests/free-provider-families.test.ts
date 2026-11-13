// Free-provider family wiring (mechanical assignment): OSM hits may carry the
// existing familyFromOsmTags facts, and nothing else may change. The suite runs
// the exported discovery entry with controlled fetch responses.
//
// The provider snapshots its Mappls key when the module is first evaluated, so
// this OSM/Wikipedia-focused suite pins that unrelated integration OFF before
// the import below runs. Without this pin a key present in the process makes
// the Mappls layer issue its own requests and the discovery-request count
// changes, which has nothing to do with the family facts under test.
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest'

vi.hoisted(() => {
  // Runs before any import is evaluated, so the provider sees no Mappls key.
  vi.stubEnv('VITE_MAPPLS_KEY', '')
})

const { searchNearbyPoisMultiFree, mapplsEnabled } = await import('../src/lib/providers/free')

afterAll(() => {
  vi.unstubAllEnvs()
})

const ANCHOR = { lat: 10, lng: 76 }
const requests: Array<{ url: string; method: string }> = []

/** Controlled Overpass payload: every case in one scan, exactly as OSM sends it. */
const ELEMENTS = [
  // Supported scenic families.
  { type: 'node', id: 1, lat: 10.02, lon: 76.02, tags: { name: 'Sunset Point', tourism: 'viewpoint' } },
  { type: 'node', id: 2, lat: 10.03, lon: 76.03, tags: { name: 'Falls Creek', waterway: 'waterfall' } },
  { type: 'node', id: 3, lat: 10.04, lon: 76.04, tags: { name: 'Quiet Lake', natural: 'water' } },
  // Valid scenic category, but no tag row in the helper: family stays absent.
  { type: 'node', id: 4, lat: 10.05, lon: 76.05, tags: { name: 'Plunge Falls', natural: 'waterfall' } },
  // No supported evidence at all.
  { type: 'node', id: 5, lat: 10.06, lon: 76.06, tags: { name: 'Mystery Spot', tourism: 'attraction' } },
  // Conflicting functional classifications must keep their class and stay unenriched.
  { type: 'node', id: 6, lat: 10.07, lon: 76.07, tags: { name: 'HP Pump', amenity: 'fuel', natural: 'waterfall' } },
  { type: 'node', id: 7, lat: 10.08, lon: 76.08, tags: { name: 'Corner Cafe', amenity: 'cafe', tourism: 'viewpoint' } },
  { type: 'node', id: 8, lat: 10.09, lon: 76.09, tags: { name: 'Hill Hotel', tourism: 'hotel', waterway: 'waterfall' } },
  { type: 'node', id: 9, lat: 10.1, lon: 76.1, tags: { name: 'Old Temple', amenity: 'place_of_worship', natural: 'peak' } },
  // The legacy classifier checks natural/leisure before food and lodging, so a
  // functional hit with a scenic secondary tag can inherit a scenic category.
  // The raw functional tag must still block any scenic family fact.
  { type: 'node', id: 13, lat: 10.11, lon: 76.11, tags: { name: 'Peak Cafe', amenity: 'cafe', natural: 'peak' } },
  { type: 'node', id: 14, lat: 10.12, lon: 76.12, tags: { name: 'Peak Hotel', tourism: 'hotel', natural: 'peak' } },
  { type: 'node', id: 15, lat: 10.13, lon: 76.13, tags: { name: 'Reserve Guest House', tourism: 'guest_house', leisure: 'nature_reserve' } },
  // Duplicate name: the nearer node survives, unchanged behaviour.
  { type: 'node', id: 11, lat: 10.011, lon: 76.011, tags: { name: 'Twin Lake', natural: 'water' } },
  { type: 'node', id: 12, lat: 10.4, lon: 76.4, tags: { name: 'Twin Lake', natural: 'water' } },
  // Invalid coordinates are skipped before classification.
  { type: 'node', id: 10, tags: { name: 'No Coords', natural: 'water' } },
]

function jsonResponse(body: unknown): Response {
  return { ok: true, json: async () => body } as Response
}

beforeEach(() => {
  requests.length = 0
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    requests.push({ url, method: init?.method ?? 'GET' })
    if (url.includes('overpass') || url.includes('interpreter')) return jsonResponse({ elements: ELEMENTS })
    if (url.includes('wikipedia.org')) return jsonResponse({ query: { pages: {} } })
    throw new Error(`unexpected request: ${url}`)
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('OSM hits carry confirmed family facts at the provider boundary', () => {
  it('a supported scenic viewpoint reaches the exported result with its helper family', async () => {
    const hits = await searchNearbyPoisMultiFree([ANCHOR], 10000, 20, { includeFuel: true })
    const point = hits.find(h => h.name === 'Sunset Point')
    expect(point).toBeDefined()
    expect(point!.id).toBe('osm_node_1')
    expect(point!.category).toBe('sightseeing')
    expect(point!.description).toBe('Viewpoint')
    expect(point!.latitude).toBe(10.02)
    expect(point!.longitude).toBe(76.02)
    expect(point!.source).toBe('osm')
    expect(point!.family).toBe('views')
    expect(point!.subtype).toBe('viewpoint')
  })

  it('a supported waterfall tag attaches the water family, not a new category', async () => {
    const hits = await searchNearbyPoisMultiFree([ANCHOR], 10000, 20, { includeFuel: true })
    const falls = hits.find(h => h.name === 'Falls Creek')
    expect(falls).toBeDefined()
    expect(falls!.category).toBe('sightseeing') // classifier's own class, unchanged
    expect(falls!.description).toBe('Place')
    expect(falls!.family).toBe('water')
    expect(falls!.subtype).toBe('waterfall')
  })

  it('a natural water hit keeps nature and gains the lake subtype', async () => {
    const hits = await searchNearbyPoisMultiFree([ANCHOR], 10000, 20, { includeFuel: true })
    const lake = hits.find(h => h.name === 'Quiet Lake')
    expect(lake).toBeDefined()
    expect(lake!.category).toBe('nature')
    expect(lake!.family).toBe('water')
    expect(lake!.subtype).toBe('lake')
  })
})

describe('unknown and conflicting evidence stays absent', () => {
  it('a valid scenic hit without supported tag evidence has no family', async () => {
    const hits = await searchNearbyPoisMultiFree([ANCHOR], 10000, 20, { includeFuel: true })
    const plunge = hits.find(h => h.name === 'Plunge Falls')
    expect(plunge).toBeDefined()
    expect(plunge!.category).toBe('nature')
    expect(plunge!.family).toBeUndefined()
    expect(plunge!.subtype).toBeUndefined()
    const attraction = hits.find(h => h.name === 'Mystery Spot')
    expect(attraction).toBeDefined()
    expect(attraction!.family).toBeUndefined()
  })

  it('fuel, food, lodging and worship keep their class and get no scenic facts', async () => {
    const hits = await searchNearbyPoisMultiFree([ANCHOR], 10000, 20, { includeFuel: true })
    const expectations: Array<[string, string]> = [
      ['HP Pump', 'transport-hub'],
      ['Corner Cafe', 'food'],
      ['Hill Hotel', 'hotel'],
      ['Old Temple', 'temple'],
    ]
    for (const [name, category] of expectations) {
      const hit = hits.find(h => h.name === name)
      expect(hit, name).toBeDefined()
      expect(hit!.category, name).toBe(category)
      expect(hit!.family, name).toBeUndefined()
      expect(hit!.subtype, name).toBeUndefined()
    }
  })
})

describe('raw functional tags block scenic enrichment from secondary tags', () => {
  it('a cafe with natural=peak keeps its legacy nature category and gains no family', async () => {
    const hits = await searchNearbyPoisMultiFree([ANCHOR], 10000, 20, { includeFuel: true })
    const cafe = hits.find(h => h.name === 'Peak Cafe')
    expect(cafe).toBeDefined()
    // Legacy classification is preserved, even where it is imperfect.
    expect(cafe!.category).toBe('nature')
    expect(cafe!.description).toBe('Peak')
    expect(cafe!.id).toBe('osm_node_13')
    expect(cafe!.latitude).toBe(10.11)
    expect(cafe!.longitude).toBe(76.11)
    expect(cafe!.family).toBeUndefined()
    expect(cafe!.subtype).toBeUndefined()
  })

  it('a hotel with natural=peak keeps its legacy category and gains no family', async () => {
    const hits = await searchNearbyPoisMultiFree([ANCHOR], 10000, 20, { includeFuel: true })
    const hotel = hits.find(h => h.name === 'Peak Hotel')
    expect(hotel).toBeDefined()
    expect(hotel!.category).toBe('nature')
    expect(hotel!.description).toBe('Peak')
    expect(hotel!.id).toBe('osm_node_14')
    expect(hotel!.family).toBeUndefined()
    expect(hotel!.subtype).toBeUndefined()
  })

  it('a lodging hit with leisure=nature_reserve gains no wildlife family', async () => {
    const hits = await searchNearbyPoisMultiFree([ANCHOR], 10000, 20, { includeFuel: true })
    const stay = hits.find(h => h.name === 'Reserve Guest House')
    expect(stay).toBeDefined()
    expect(stay!.category).toBe('nature')
    expect(stay!.description).toBe('Nature reserve')
    expect(stay!.id).toBe('osm_node_15')
    expect(stay!.family).toBeUndefined()
    expect(stay!.subtype).toBeUndefined()
  })
})

describe('existing dedupe and invalid-coordinate behaviour is unchanged', () => {
  it('a duplicate name keeps the nearest hit', async () => {
    const hits = await searchNearbyPoisMultiFree([ANCHOR], 10000, 20, { includeFuel: true })
    const twins = hits.filter(h => h.name === 'Twin Lake')
    expect(twins).toHaveLength(1)
    expect(twins[0].id).toBe('osm_node_11')
    expect(twins[0].family).toBe('water')
    expect(twins[0].subtype).toBe('lake')
  })

  it('a hit without finite coordinates is skipped', async () => {
    const hits = await searchNearbyPoisMultiFree([ANCHOR], 10000, 20, { includeFuel: true })
    expect(hits.find(h => h.name === 'No Coords')).toBeUndefined()
  })
})

describe('the request sequence proves no extra discovery request', () => {
  it('the fixture pins the unrelated Mappls integration off', () => {
    // Proves the suite owns its configuration, whatever the process carries.
    expect(mapplsEnabled()).toBe(false)
    expect(process.env.VITE_MAPPLS_KEY).toBe('')
  })

  it('one Overpass POST and one Wikipedia geosearch, nothing else', async () => {
    await searchNearbyPoisMultiFree([ANCHOR], 10000, 20, { includeFuel: true })
    expect(requests).toHaveLength(2)
    expect(requests[0].url).toContain('overpass')
    expect(requests[0].method).toBe('POST')
    expect(requests[1].url).toContain('wikipedia.org')
    for (const r of requests) {
      expect(r.url.toLowerCase()).not.toContain('family')
      expect(r.url.toLowerCase()).not.toContain('waterfall')
    }
  })
})

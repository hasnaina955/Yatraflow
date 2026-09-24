// ============ Map-tab search-to-add (searchPlacesText) ============
// The surface ranks/annotates rows by road position BEFORE a pick, so its
// hits must carry real coordinates. Autocomplete placeholders (0,0 "resolved
// on pick") measuring Null Island produced the live bug — five different
// places all labelled "~1675 km into the trip · 8448 km off-route"
// (found live 2026-09-14).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QuotaExhaustedError } from '../src/lib/providers/google'
import { SOFT_CAPS, quotaResetForTests, quotaUsed } from '../src/lib/providers/quota'
import { searchPlacesText } from '../src/lib/geocode'

const TEXT_SEARCH_HITS = {
  places: [
    {
      id: 'P1',
      displayName: { text: 'Food Express Durgapur' },
      location: { latitude: 23.52, longitude: 87.31 },
      formattedAddress: 'Durgapur, West Bengal, India',
      primaryTypeDisplayName: { text: 'Restaurant' },
      primaryType: 'restaurant',
      types: ['restaurant', 'food'],
    },
    {
      id: 'P2',
      displayName: { text: 'Dada Haji Biryani' },
      location: { latitude: 23.48, longitude: 87.32 },
      primaryType: 'restaurant',
    },
  ],
}

function routeFetch(handlers: Array<[RegExp, unknown]>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    for (const [re, body] of handlers) {
      if (re.test(url)) return new Response(JSON.stringify(body), { status: 200 })
    }
    throw new Error('unexpected fetch: ' + url)
  })
}

describe('facade: searchPlacesText (search-to-add)', () => {
  beforeEach(() => quotaResetForTests())
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); quotaResetForTests() })

  it('Google mode: Text Search hits carry REAL coordinates (never placeholders)', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key')
    const f = routeFetch([
      [/places:searchText/, TEXT_SEARCH_HITS],
      [/open-meteo/, {}],
      [/wikipedia/, {}],
    ])
    vi.stubGlobal('fetch', f)
    const hits = await searchPlacesText('food express durgapur')
    expect(f.mock.calls.some(([u]) => String(u).includes('places:autocomplete'))).toBe(false)
    expect(hits[0]).toMatchObject({ name: 'Food Express Durgapur', latitude: 23.52, longitude: 87.31, source: 'google' })
    expect(hits.every(h => h.latitude !== 0 || h.longitude !== 0)).toBe(true)
  })

  it('counts exactly one textSearchPro event per search', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key')
    vi.stubGlobal('fetch', routeFetch([
      [/places:searchText/, TEXT_SEARCH_HITS],
      [/open-meteo/, {}],
      [/wikipedia/, {}],
    ]))
    await searchPlacesText('durgapur food')
    expect(quotaUsed('textSearchPro')).toBe(1)
  })

  it('without a key it never touches Google (free stack unchanged)', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '')
    const f = routeFetch([
      [/open-meteo/, { results: [{ id: 1, name: 'Durgapur', latitude: 23.52, longitude: 87.31, admin1: 'West Bengal', country: 'India' }] }],
      [/wikipedia/, {}],
    ])
    vi.stubGlobal('fetch', f)
    const hits = await searchPlacesText('durgapur')
    expect(f.mock.calls.some(([u]) => String(u).includes('places:'))).toBe(false)
    expect(hits[0]).toMatchObject({ name: 'Durgapur', source: 'open-meteo' })
  })

  it('transient Google failure degrades to the free stack (quota errors do NOT)', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key')
    const f = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('places:searchText')) return new Response('{}', { status: 500 })
      if (url.includes('open-meteo')) return new Response(JSON.stringify({ results: [{ id: 1, name: 'Durgapur', latitude: 23.52, longitude: 87.31, country: 'India' }] }), { status: 200 })
      if (url.includes('wikipedia')) return new Response('{}', { status: 200 })
      throw new Error('unexpected fetch: ' + url)
    })
    vi.stubGlobal('fetch', f)
    const hits = await searchPlacesText('durgapur')
    expect(hits.some(h => h.source === 'open-meteo')).toBe(true)
  })

  it('quota exhaustion THROWS instead of silently falling back', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key')
    const prev = SOFT_CAPS.textSearchPro
    SOFT_CAPS.textSearchPro = 0
    try {
      await expect(searchPlacesText('durgapur')).rejects.toBeInstanceOf(QuotaExhaustedError)
    } finally {
      SOFT_CAPS.textSearchPro = prev
    }
  })

  it('a Mappls-style coords-pending hit is resolved or dropped — never measured at (0,0)', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '')
    // Free stack returns a hit with placeholder coords + eLoc (Mappls shape);
    // resolution fails (no usable upstream), so the hit must be DROPPED,
    // not returned to be projected onto the route as Null Island.
    const f = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('open-meteo')) return new Response(JSON.stringify({ results: [{ id: 1, name: 'Food Express', latitude: 0, longitude: 0, eLoc: 'INDEL' }] }), { status: 200 })
      if (url.includes('wikipedia')) return new Response('{}', { status: 200 })
      if (url.includes('mappls')) return new Response('{}', { status: 500 })
      if (url.includes('nominatim')) return new Response('[]', { status: 200 })
      throw new Error('unexpected fetch: ' + url)
    })
    vi.stubGlobal('fetch', f)
    const hits = await searchPlacesText('food express')
    expect(hits.some(h => h.latitude === 0 && h.longitude === 0)).toBe(false)
  })

  it('merges a pool beyond the geocode box\'s 8 so route-ranking can surface a closer free hit', async () => {
    // The search-to-add surface ranks EVERY hit by its road detour and only
    // then slices — so the merge must not drop free-stack hits in provider
    // order (Google first, capped at 8) before that ranking ever runs. Google
    // Text Search returns its max of 8; the free stack adds 3 more distinct
    // places that the old cap of 8 silently discarded.
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key')
    const googlePlaces = Array.from({ length: 8 }, (_, i) => ({
      id: `G${i}`,
      displayName: { text: `Google Place ${i}` },
      location: { latitude: 20 + i * 0.1, longitude: 78 + i * 0.1 },
    }))
    const freeResults = Array.from({ length: 3 }, (_, i) => ({
      id: 1000 + i, name: `Free Place ${i}`, latitude: 21 + i * 0.1, longitude: 79 + i * 0.1, country: 'India',
    }))
    const f = routeFetch([
      [/places:searchText/, { places: googlePlaces }],
      [/open-meteo/, { results: freeResults }],
      [/wikipedia/, {}],
    ])
    vi.stubGlobal('fetch', f)
    const hits = await searchPlacesText('place')
    // All 8 Google + 3 free survive the merge (old behaviour capped it at 8).
    expect(hits.length).toBe(11)
    expect(hits.filter(h => h.source === 'google').length).toBe(8)
    expect(hits.filter(h => h.source === 'open-meteo').length).toBe(3)
  })

  it('the Google Text Search body carries the route polyline when the caller passes one', async () => {
    // Found live 2026-09-24: the free-form Text Search carried NO spatial
    // constraint, so Google applied its implicit IP-based location bias and a
    // lunch search filled the rows with the SEARCHER's city instead of the
    // trip's corridor. With the route passed, the same request must run
    // Search-Along-Route (searchAlongRouteParameters with the encoded
    // polyline) — the bias rides the trip's road, not the user's location.
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key')
    let capturedBody = ''
    const f = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('places:searchText')) {
        capturedBody = String(init?.body ?? '')
        return new Response(JSON.stringify({ places: [] }), { status: 200 })
      }
      if (url.includes('open-meteo') || url.includes('wikipedia')) return new Response('{}', { status: 200 })
      throw new Error('unexpected fetch: ' + url)
    })
    vi.stubGlobal('fetch', f)
    const routeCoords: [number, number][] = [[87.31, 23.52], [87.9, 23.1]] // Durgapur → Panagarh, [lng,lat]
    await searchPlacesText('food express durgapur', { routeCoords })
    expect(capturedBody).toContain('searchAlongRouteParameters')
    expect(capturedBody).toContain('encodedPolyline')
    // Spot-check the encoding: 23.52e5 and 87.31e5 as the first delta pair.
    expect(capturedBody).toMatch(/"textQuery":"food express durgapur"/)
  })

  it('without route geometry the search still goes out (no bias) — never blocked', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key')
    let capturedBody = ''
    const f = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('places:searchText')) {
        capturedBody = String(init?.body ?? '')
        return new Response(JSON.stringify(TEXT_SEARCH_HITS), { status: 200 })
      }
      if (url.includes('open-meteo') || url.includes('wikipedia')) return new Response('{}', { status: 200 })
      throw new Error('unexpected fetch: ' + url)
    })
    vi.stubGlobal('fetch', f)
    const hits = await searchPlacesText('durgapur food')
    expect(capturedBody).not.toContain('searchAlongRouteParameters')
    expect(hits.length).toBeGreaterThan(0)
  })

  it('free stack: hits rank by distance to the corridor, not provider order', async () => {
    // Keyless mode has no biasable API either (Mappls needs a premium location
    // param; Open-Meteo/Wikipedia are global), so the facade must rank the
    // merged hits against the route: a place ON the corridor outranks a
    // same-named place in the searcher's own city.
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '')
    const f = routeFetch([
      // Open-Meteo returns the OFF-route hit first, the ON-route hit second.
      [/open-meteo/, { results: [
        { id: 1, name: 'Food Junction', latitude: 12.97, longitude: 77.59, country: 'India' }, // Bangalore — searcher's city
        { id: 2, name: 'Food Point Durgapur', latitude: 23.52, longitude: 87.315, country: 'India' }, // on the route
      ] }],
      [/wikipedia/, {}],
    ])
    vi.stubGlobal('fetch', f)
    const routeCoords: [number, number][] = [[87.31, 23.52], [87.9, 23.1]]
    const hits = await searchPlacesText('food', { routeCoords })
    expect(hits[0]?.name).toBe('Food Point Durgapur')
    expect(hits[1]?.name).toBe('Food Junction')
  })

  it('free stack: anchors bias the ranking when no route geometry exists', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '')
    const f = routeFetch([
      [/open-meteo/, { results: [
        { id: 1, name: 'Far Cafe', latitude: 12.97, longitude: 77.59, country: 'India' },
        { id: 2, name: 'Near Cafe', latitude: 23.53, longitude: 87.32, country: 'India' },
      ] }],
      [/wikipedia/, {}],
    ])
    vi.stubGlobal('fetch', f)
    const hits = await searchPlacesText('cafe', { anchors: [{ lat: 23.52, lng: 87.31 }] })
    expect(hits[0]?.name).toBe('Near Cafe')
  })
})

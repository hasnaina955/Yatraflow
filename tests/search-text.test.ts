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
})

// The synthetic Map fixture must never wait on a live place provider. The page
// says its provider transport is controlled. This file makes that true on every
// dev server, not only the isolated one. It answers the free place scan:
// Overpass and Wikipedia. Every other request passes through unchanged.
//
// Rules kept here:
//  - The answer reads the anchor in the request. It invents no real place.
//  - A provider call settles at once. A waiting deck cannot stay in `scanning`.
//  - Every synthetic place name starts with "Synthetic".

/** The provider hosts the free place scan uses. */
export type FixtureProvider = 'overpass' | 'wikipedia'

export interface FixtureAnchor {
  lat: number
  lng: number
}

/** The Overpass mirrors that the free provider tries, in its own order. */
const OVERPASS_HOSTS = ['maps.mail.ru', 'overpass-api.de']

/** The Wikipedia API host and path. */
const WIKIPEDIA_HOST = 'en.wikipedia.org'
const WIKIPEDIA_PATH = '/w/api.php'

/** The anchor for a scan that names no place. The fixture trip starts here. */
const FALLBACK_ANCHOR: FixtureAnchor = { lat: 10.088, lng: 77.059 }

/** One synthetic stub place. The offsets keep it inside the scan radius. */
const SYNTHETIC_PLACES: ReadonlyArray<{
  id: number
  name: string
  tags: Record<string, string>
  dLat: number
  dLng: number
}> = [
  { id: 910001, name: 'Synthetic cardamom estate', tags: { natural: 'waterfall' }, dLat: 0.02, dLng: 0.03 },
  { id: 910002, name: 'Synthetic tea stop', tags: { amenity: 'restaurant' }, dLat: 0.05, dLng: -0.02 },
  { id: 910003, name: 'Synthetic valley viewpoint', tags: { tourism: 'viewpoint' }, dLat: 0.08, dLng: 0.01 },
  { id: 910004, name: 'Synthetic spice stay', tags: { tourism: 'hotel' }, dLat: 0.03, dLng: 0.06 },
]

/**
 * Which controlled answer a URL needs. Null means the request is not a place
 * provider call, so it passes through to the real transport.
 */
export function fixtureProviderFor(url: string): FixtureProvider | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (OVERPASS_HOSTS.includes(parsed.host) && parsed.pathname.includes('/interpreter')) return 'overpass'
  if (parsed.host === WIKIPEDIA_HOST && parsed.pathname === WIKIPEDIA_PATH) return 'wikipedia'
  return null
}

/** The first anchor in an Overpass query, or the fixture trip start. */
export function fixtureAnchorFromQuery(query: string): FixtureAnchor {
  const match = /around:\d+,(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(query)
  if (!match) return FALLBACK_ANCHOR
  const lat = Number(match[1])
  const lng = Number(match[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return FALLBACK_ANCHOR
  return { lat, lng }
}

/** The Overpass answer: four stub places around the requested anchor. */
export function fixtureOverpassElements(query: string): {
  elements: Array<{ type: 'node'; id: number; lat: number; lon: number; tags: Record<string, string> }>
} {
  const anchor = fixtureAnchorFromQuery(query)
  return {
    elements: SYNTHETIC_PLACES.map(place => ({
      type: 'node' as const,
      id: place.id,
      lat: Number((anchor.lat + place.dLat).toFixed(6)),
      lon: Number((anchor.lng + place.dLng).toFixed(6)),
      tags: { name: place.name, ...place.tags },
    })),
  }
}

/** The JSON body of the controlled answer for one provider request. */
export function fixtureAnswerBody(url: string, body?: string | null): string {
  const provider = fixtureProviderFor(url)
  if (provider === 'wikipedia') return JSON.stringify({ batchcomplete: true, query: { pages: {} } })
  if (provider === 'overpass') {
    let query = ''
    try {
      const raw = (body ?? '').replace(/^data=/, '')
      query = raw ? decodeURIComponent(raw) : ''
    } catch {
      query = ''
    }
    return JSON.stringify(fixtureOverpassElements(query))
  }
  return '{}'
}

/** The controlled answer as a response the provider code can read. */
export function fixtureResponse(url: string, body?: string | null): Response {
  return new Response(fixtureAnswerBody(url, body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

/** The one fetch function the guard replaces. A test passes a fake scope. */
export interface FixtureFetchScope {
  fetch: typeof fetch
}

/**
 * Answer every place provider call from this file. Returns the undo function.
 * A call settles at once, so no lens can wait on a network read.
 */
export function installFixtureTransport(scope: FixtureFetchScope = globalThis as unknown as FixtureFetchScope): () => void {
  const original = scope.fetch
  if (typeof original !== 'function') return () => undefined
  scope.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (fixtureProviderFor(url) == null) return original(input, init)
    const body = typeof init?.body === 'string' ? init.body : null
    return Promise.resolve(fixtureResponse(url, body))
  }) as typeof fetch
  return () => { scope.fetch = original }
}

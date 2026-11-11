// The synthetic Map fixture must never wait on a live place provider. The page
// says its provider transport is controlled. This file makes that true on every
// dev server, not only the isolated one. It answers the free place scan:
// Overpass and Wikipedia. Every other request passes through unchanged.
//
// Rules kept here:
//  - The answer reads the anchor in the request. It invents no real place.
//  - A provider call settles at once. A waiting deck cannot stay in `scanning`.
//  - Every synthetic place name starts with "Synthetic".

import boardRoad from './map-board-day3-road.json'

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

/**
 * The `near` answer: one stub place beside each anchor in the query, so the
 * places spread along the whole road and not only at its start.
 */
export function fixtureNearElements(query: string): {
  elements: Array<{ type: 'node'; id: number; lat: number; lon: number; tags: Record<string, string> }>
} {
  const anchors = [...query.matchAll(/around:\d+,(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)]
    .map(match => ({ lat: Number(match[1]), lng: Number(match[2]) }))
    .filter(anchor => Number.isFinite(anchor.lat) && Number.isFinite(anchor.lng))
  const unique = anchors.filter((anchor, index) => anchors.findIndex(other => other.lat === anchor.lat && other.lng === anchor.lng) === index)
  return {
    elements: unique.slice(0, 8).map((anchor, index) => {
      const place = SYNTHETIC_PLACES[index % SYNTHETIC_PLACES.length]
      return {
        type: 'node' as const,
        id: 920000 + index,
        lat: Number((anchor.lat + 0.002).toFixed(6)),
        lon: Number((anchor.lng + 0.02).toFixed(6)),
        tags: { name: `${place.name} ${index + 1}`, ...place.tags },
      }
    }),
  }
}


/** One sample place of the board trip: a spot on the recorded road, and a small offset from it. */
const BOARD_PLACES: ReadonlyArray<{ id: number; name: string; km: number; dLat: number; dLng: number; tags: Record<string, string> }> = [
  { id: 930001, name: 'Nalla Ruchi Kitchen', km: 57, dLat: 0.003, dLng: 0.011, tags: { amenity: 'restaurant', cuisine: 'kerala', 'diet:vegetarian': 'yes', opening_hours: 'Mo-Su 11:00-15:30' } },
  { id: 930002, name: 'Spice Route Café', km: 57, dLat: -0.004, dLng: 0.012, tags: { amenity: 'restaurant', cuisine: 'south_indian', opening_hours: 'Mo-Su 08:00-15:00' } },
  { id: 930003, name: 'Hill Garden Meals', km: 57, dLat: 0.006, dLng: 0.014, tags: { amenity: 'restaurant', cuisine: 'regional', opening_hours: 'Mo-Su 12:00-16:00' } },
  { id: 930004, name: 'Idukki dam', km: 40, dLat: 0.012, dLng: -0.02, tags: { tourism: 'attraction', man_made: 'dam' } },
  { id: 930005, name: 'Kalvari Mount', km: 36, dLat: -0.01, dLng: 0.025, tags: { tourism: 'viewpoint' } },
  { id: 930006, name: 'Murickassery spice garden', km: 31, dLat: 0.008, dLng: 0.015, tags: { tourism: 'attraction', leisure: 'garden' } },
  { id: 930007, name: 'Kadathanadan Kalari Centre', km: 88.7, dLat: 0.0004, dLng: 0.0006, tags: { tourism: 'attraction', amenity: 'theatre', opening_hours: 'Mo-Su 17:00-19:30' } },
  { id: 930008, name: 'Kumily spice market', km: 88.7, dLat: -0.0003, dLng: 0.0006, tags: { amenity: 'marketplace', opening_hours: 'Mo-Su 08:00-21:00' } },
  { id: 930009, name: 'Periyar spice garden', km: 88.7, dLat: 0.0006, dLng: -0.0004, tags: { tourism: 'attraction', leisure: 'garden', opening_hours: 'Mo-Su 09:00-18:00' } },
  { id: 930010, name: 'Boat landing viewpoint', km: 88.7, dLat: 0.008, dLng: 0.011, tags: { tourism: 'viewpoint', opening_hours: 'Mo-Su 06:00-18:30' } },
  { id: 930011, name: 'Bamboo rafting', km: 90.2, dLat: -0.016, dLng: 0.02, tags: { tourism: 'attraction', leisure: 'sports_centre' } },
]

/** Kilometres along the recorded road for every vertex. */
function boardCumulativeKm(): number[] {
  const line = boardRoad.coordinates as [number, number][]
  const out = [0]
  for (let i = 1; i < line.length; i += 1) {
    out.push(out[i - 1] + Math.hypot((line[i][1] - line[i - 1][1]) * 111, (line[i][0] - line[i - 1][0]) * 109))
  }
  return out
}

/** The Overpass answer for the board trip. Each place carries `sample=yes`. */
export function fixtureBoardElements(): {
  elements: Array<{ type: 'node'; id: number; lat: number; lon: number; tags: Record<string, string> }>
} {
  const line = boardRoad.coordinates as [number, number][]
  const cumulative = boardCumulativeKm()
  const scale = cumulative[cumulative.length - 1] / boardRoad.totalKm
  return {
    elements: BOARD_PLACES.map(place => {
      const target = place.km * scale
      let index = cumulative.findIndex(km => km >= target)
      if (index < 0) index = line.length - 1
      return {
        type: 'node' as const,
        id: place.id,
        lat: Number((line[index][1] + place.dLat).toFixed(6)),
        lon: Number((line[index][0] + place.dLng).toFixed(6)),
        tags: { name: place.name, sample: 'yes', 'addr:city': 'Kumily', ...place.tags },
      }
    }),
  }
}


// ---- The recorded Day 3 road --------------------------------------------------
type LngLat = [number, number]
const BOARD_LINE = boardRoad.coordinates as LngLat[]

/** The sample numbers of the board trip's Day 3 legs, keyed by the two road stops. */
const BOARD_LEG_NUMBERS: Record<string, { distanceKm: number; durationMinutes: number }> = {
  'munnar>attukad': { distanceKm: 8, durationMinutes: 20 },
  'attukad>spiceVillage': { distanceKm: 63, durationMinutes: 155 },
  'spiceVillage>jetty': { distanceKm: 2.6, durationMinutes: 4 },
}

function nearestBoardVertex(lat: number, lng: number): { index: number; km: number } {
  let best = -1
  let bestKm = Infinity
  BOARD_LINE.forEach(([x, y], index) => {
    const km = Math.hypot((y - lat) * 111, (x - lng) * 109)
    if (km < bestKm) { bestKm = km; best = index }
  })
  return { index: best, km: bestKm }
}

function boardStopKey(lat: number, lng: number): string | null {
  for (const key of ['munnar', 'attukad', 'spiceVillage', 'jetty'] as const) {
    const [x, y] = boardRoad.stops[key].at
    if (Math.hypot((y - lat) * 111, (x - lng) * 109) < 0.3) return key
  }
  return null
}

/**
 * One leg of the board road. Two points that stand on the recorded line get the
 * line between them, with the board's sample kilometres and minutes. Any other
 * pair returns null, and the caller keeps its own straight estimate.
 */
export function boardLegBetween(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): { distanceKm: number; durationMinutes: number; geometry: LngLat[] } | null {
  const a = nearestBoardVertex(from.lat, from.lng)
  const b = nearestBoardVertex(to.lat, to.lng)
  if (a.km > 0.6 || b.km > 0.6 || a.index === b.index) return null
  const geometry = a.index < b.index ? BOARD_LINE.slice(a.index, b.index + 1) : BOARD_LINE.slice(b.index, a.index + 1).reverse()
  const fromKey = boardStopKey(from.lat, from.lng)
  const toKey = boardStopKey(to.lat, to.lng)
  const numbers = fromKey && toKey ? BOARD_LEG_NUMBERS[`${fromKey}>${toKey}`] ?? BOARD_LEG_NUMBERS[`${toKey}>${fromKey}`] : undefined
  let lineKm = 0
  for (let i = 1; i < geometry.length; i += 1) lineKm += Math.hypot((geometry[i][1] - geometry[i - 1][1]) * 111, (geometry[i][0] - geometry[i - 1][0]) * 109)
  return { distanceKm: numbers?.distanceKm ?? lineKm, durationMinutes: numbers?.durationMinutes ?? Math.round((lineKm / 40) * 60), geometry }
}

/** The OSRM answer for a route request, from the recorded road. Null when the URL is not a route request. */
export function fixtureOsrmAnswer(url: string): string | null {
  let parsed: URL
  try { parsed = new URL(url) } catch { return null }
  if (parsed.host !== 'router.project-osrm.org' || !parsed.pathname.includes('/route/v1/driving/')) return null
  const path = parsed.pathname.split('/route/v1/driving/')[1] ?? ''
  const points = path.split(';').map(pair => pair.split(',').map(Number)).filter(pair => pair.length === 2 && pair.every(Number.isFinite)).map(([lng, lat]) => ({ lat, lng }))
  if (points.length < 2) return null
  const legs = points.slice(1).map((point, index) => {
    const from = points[index]
    const road = boardLegBetween(from, point)
    if (road) return { distance: road.distanceKm * 1000, duration: road.durationMinutes * 60, geometry: { type: 'LineString', coordinates: road.geometry } }
    const km = Math.hypot((point.lat - from.lat) * 111, (point.lng - from.lng) * 109)
    return { distance: km * 1000, duration: (km / 40) * 3600, geometry: { type: 'LineString', coordinates: [[from.lng, from.lat], [point.lng, point.lat]] } }
  })
  const coordinates = legs.flatMap(leg => leg.geometry.coordinates)
  return JSON.stringify({
    code: 'Ok',
    routes: [{
      distance: legs.reduce((sum, leg) => sum + leg.distance, 0),
      duration: legs.reduce((sum, leg) => sum + leg.duration, 0),
      geometry: { type: 'LineString', coordinates },
      legs,
    }],
  })
}

/** The JSON body of the controlled answer for one provider request. */
export function fixtureAnswerBody(url: string, body?: string | null, near = false, board = false): string {
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
    return JSON.stringify(board ? fixtureBoardElements() : near ? fixtureNearElements(query) : fixtureOverpassElements(query))
  }
  return '{}'
}

/** The controlled answer as a response the provider code can read. */
export function fixtureResponse(url: string, body?: string | null, near = false, board = false): Response {
  return new Response(fixtureAnswerBody(url, body, near, board), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

/** The one fetch function the guard replaces. A test passes a fake scope. */
export interface FixtureFetchScope {
  fetch: typeof fetch
}

/**
 * How the controlled provider answers. `answer` is the default. The other
 * three exist so a review can draw each lens phase on purpose:
 *  - `fail` answers with a server error, so a deck shows its failed phase.
 *  - `hang` never answers, so a deck stays in its scanning phase.
 *  - `empty` answers with no place, so a deck shows its empty phase.
 *  - `near` puts each place close to the road, so a pick has a proven road
 *    position and its add preview, with the ghost road, can draw.
 *  - `board` answers the sample places of the Kerala board trip, each beside the
 *    recorded Day 3 road. Every one is marked as sample data.
 */
export type FixtureProviderMode = 'answer' | 'fail' | 'hang' | 'empty' | 'near' | 'board'

/** The mode a URL query asks for. An unknown value gives the default. */
export function fixtureModeFromSearch(search: string): FixtureProviderMode {
  const value = new URLSearchParams(search).get('provider')
  return value === 'fail' || value === 'hang' || value === 'empty' || value === 'near' || value === 'board' ? value : 'answer'
}

/**
 * Answer every place provider call from this file. Returns the undo function.
 * In the default mode a call settles at once, so no lens can wait on a network read.
 */
export function installFixtureTransport(
  scope: FixtureFetchScope = globalThis as unknown as FixtureFetchScope,
  mode: FixtureProviderMode = 'answer',
): () => void {
  const original = scope.fetch
  if (typeof original !== 'function') return () => undefined
  scope.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (mode === 'board') {
      const road = fixtureOsrmAnswer(url)
      if (road != null) return Promise.resolve(new Response(road, { status: 200, headers: { 'content-type': 'application/json' } }))
    }
    if (fixtureProviderFor(url) == null) return original(input, init)
    if (mode === 'hang') return new Promise<Response>(() => undefined)
    if (mode === 'fail') return Promise.resolve(new Response('{}', { status: 503 }))
    if (mode === 'empty') return Promise.resolve(new Response(JSON.stringify({ elements: [], batchcomplete: true, query: { pages: {} } }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const body = typeof init?.body === 'string' ? init.body : null
    return Promise.resolve(fixtureResponse(url, body, mode === 'near', mode === 'board'))
  }) as typeof fetch
  return () => { scope.fetch = original }
}

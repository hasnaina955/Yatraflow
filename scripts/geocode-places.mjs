// ============ Shared place geocoder (Nominatim / OpenStreetMap) ============
// The gallery pipeline's one rule about coordinates: they are LOOKED UP, never
// typed from memory. Hand-recalled coordinates for the Bylakuppe / Dubare /
// Nisargadhama cluster came out ~15 km off, which bends every distance the
// engine then computes — and the import gates cannot see it.
//
// One implementation, because this is where two truths would drift apart: the
// research CLI (gallery-geocode.mjs) and the authoring scaffold (new-itinerary.mjs)
// must resolve a place the same way, including the punctuation fallbacks.
//
// Nominatim usage policy: identify yourself, and stay at or under 1 request/second.

export const GEOCODE_USER_AGENT = 'YatraFlow-gallery-pipeline/1.0 (repo research tooling; contact: repo owner)'
export const RATE_LIMIT_MS = 1100

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

/** The query strings to try, in order. Punctuation defeats Nominatim's match
 *  ("Raja's Seat, Madikeri, Karnataka" → no hit; "Raja Seat Madikeri Karnataka
 *  India" → hit), so a miss retries with it stripped before giving up. */
export function geocodeAttempts(place) {
  const possessiveFree = place.replace(/[''‘’]s\b/gi, '')
  return [
    place,
    place.replace(/[''‘’]/g, ''),
    possessiveFree,
    `${possessiveFree.replace(/[''‘’.,]/g, ' ').replace(/\s+/g, ' ').trim()} India`,
  ]
}

/** One lookup. Returns `{ lat, lng, matched }` or null. Throws only on a
 *  transport/HTTP failure, so a caller can tell "no such place" from "offline". */
export async function geocodePlace(place, { fetchImpl = fetch } = {}) {
  for (const q of geocodeAttempts(place)) {
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q)
    const r = await fetchImpl(url, { headers: { 'User-Agent': GEOCODE_USER_AGENT } })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const hits = await r.json()
    if (hits?.[0]) {
      return { lat: Number(hits[0].lat), lng: Number(hits[0].lon), matched: hits[0].display_name }
    }
    await sleep(RATE_LIMIT_MS)
  }
  return null
}

/** Geocode a list of places, politely and in order. Always resolves — a miss is
 *  reported as `{ lat: null }` with `missed` counted, never thrown, so a batch
 *  run keeps going and the caller decides what a miss means. */
export async function geocodeMany(places, { onResult, rateLimitMs = RATE_LIMIT_MS } = {}) {
  const results = []
  for (const place of places) {
    let hit = null
    let error = null
    try {
      hit = await geocodePlace(place)
    } catch (e) {
      error = e.message
    }
    const row = hit
      ? { query: place, lat: hit.lat, lng: hit.lng, matched: hit.matched }
      : { query: place, lat: null, lng: null, matched: null, ...(error ? { error } : {}) }
    results.push(row)
    onResult?.(row)
    await sleep(rateLimitMs)
  }
  return { results, missed: results.filter(r => r.lat === null).length }
}

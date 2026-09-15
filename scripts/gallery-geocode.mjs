#!/usr/bin/env node
// ============ Gallery research — geocode the places a draft itinerary names ============
// Stage 2 of docs/PLAYBOOK-GALLERY-RESEARCH.md: coordinates are LOOKED UP, never typed
// from memory. Hand-recalled coordinates for the Bylakuppe/Dubare/Nisargadhama cluster
// came out ~15 km off in the first reference draft — enough to bend every distance the
// engine then computed.
//
// Uses Nominatim (OpenStreetMap) — the same free provider stack the app itself falls back
// to — with a polite User-Agent and ≤1 request/second.
//
// Usage:
//   node scripts/gallery-geocode.mjs "Abbey Falls, Madikeri, Karnataka" "Dubare Elephant Camp, Karnataka"
//   node scripts/gallery-geocode.mjs --json places.txt        # one place per line → JSON array
//
// Output per place:  Name  ->  lat, lng  [matched display name]
// Exit 1 if any place has no match (so a research loop can't silently skip a stop).

const args = process.argv.slice(2)
const asJson = args.includes('--json')
const inputs = args.filter(a => a !== '--json')

let places = inputs
if (inputs.length === 1 && /\.(txt|md)$/i.test(inputs[0])) {
  const { readFileSync } = await import('node:fs')
  places = readFileSync(inputs[0], 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
}
if (places.length === 0) {
  console.error('Usage: node scripts/gallery-geocode.mjs [--json] "<place, district, state>" [...] | <places.txt>')
  process.exit(2)
}

const UA = 'YatraFlow-gallery-pipeline/1.0 (repo research tooling; contact: repo owner)'
const results = []
let missed = 0

async function lookup(q) {
  const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q)
  const r = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const j = await r.json()
  return j[0]
}

for (const p of places) {
  try {
    // Punctuation breaks Nominatim's match ("Raja's Seat, Madikeri, Karnataka" → no hit;
    // "Raja Seat Madikeri Karnataka India" → hit), so a miss retries twice — punctuation
    // stripped, then comma-free with "India" appended — before being reported as a miss.
    const possessiveFree = p.replace(/[''‘’]s\b/gi, '') // "Raja's Seat" → "Raja Seat" (the spelling Nominatim indexes)
    const attempts = [
      p,
      p.replace(/[''‘’]/g, ''),
      possessiveFree,
      `${possessiveFree.replace(/[''‘’.,]/g, ' ').replace(/\s+/g, ' ').trim()} India`,
    ]
    let hit = null
    for (const q of attempts) {
      hit = await lookup(q)
      if (hit) break
      await new Promise(res => setTimeout(res, 1100))
    }
    if (!hit) {
      missed++
      if (!asJson) console.log(`NO HIT  ${p}   ← rephrase with district + state, or drop the stop`)
      results.push({ query: p, lat: null, lng: null, matched: null })
    } else {
      const lat = Number(hit.lat), lng = Number(hit.lon)
      if (!asJson) console.log(`${p}\n  -> ${lat.toFixed(4)}, ${lng.toFixed(4)}   [${hit.display_name}]`)
      results.push({ query: p, lat, lng, matched: hit.display_name })
    }
  } catch (e) {
    missed++
    if (!asJson) console.log(`ERROR   ${p}: ${e.message}`)
    results.push({ query: p, lat: null, lng: null, error: e.message })
  }
  await new Promise(res => setTimeout(res, 1100)) // Nominatim usage policy: ≤1 req/s
}

if (asJson) console.log(JSON.stringify(results, null, 2))
else console.log(`\n${places.length - missed}/${places.length} geocoded.${missed ? ' Fix the misses before drafting — a guessed coordinate is the one error the import gates cannot catch.' : ''}`)

process.exit(missed ? 1 : 0)

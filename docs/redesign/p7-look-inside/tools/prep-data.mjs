// Builds data/*.js from the corpus. Run: node tools/prep-data.mjs
// Each trip gets two files:
//   data/<id>.js       the PUBLIC payload. Locked days carry a preview only:
//                      teaser, rhythm segments, counts. No stop titles, no day title.
//   data/<id>.paid.js  the PAID payload: locked days' real titles and stops.
//                      The page loads it only after the pretend payment.
// Times are APPROXIMATE (haversine x road factor / mode speed). The real page uses the engine.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const out = path.join(here, '..', 'data')
const corpus = path.join(here, '..', '..', 'corpus')
const NOW = Date.UTC(2026, 9, 15) // prototype "today", 2026-10-15

const readJSON = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''))
const page = (name) => readJSON(path.join(corpus, 'pipeline-fixtures', 'page', name + '.json'))
const live = readJSON(path.join(corpus, 'publications.json'))
const raw = (id) => {
  const j = readJSON(path.join(corpus, 'raw', id + '.json'))
  return { publication: live.find((p) => p.id === id), trip: Array.isArray(j) ? j[0] : j }
}

// ---------- samples (marked sample in NOTES.md) ----------
const CREATORS = {
  has9: { name: 'Has9', initial: 'H', plans: 2, bio: 'Plans long road days with early starts. Writes down every fuel stop and every dhaba worth the halt.' },
  aditi: { name: 'Aditi Rathore', initial: 'A', plans: 4, bio: 'Grew up in Jaipur. Writes short plans for a first visit, timed around the tour buses.' },
  rahul: { name: 'Rahul Menon', initial: 'R', plans: 6, bio: 'Has crossed India by train many times. Keeps every halt, every platform and every bed in one plan.' },
  sana: { name: 'Sana Qureshi', initial: 'S', plans: 3, bio: 'Flies a lot for work and plans short city hops around the flights.' },
  kavya: { name: 'Kavya Iyer', initial: 'K', plans: 5, bio: 'Lives in Bangalore and drives to the hills most winters. Splits every long drive in two.' },
  neha: { name: 'Neha Pillai', initial: 'N', plans: 2, bio: 'Plans slow trips with one thing a day and long gaps for the sea.' },
}

const TRIPS = [
  {
    id: 'spiti', label: 'Spiti Valley Circuit (real, priced, photo)', src: () => raw('pub_usoazm90lrp'), creator: 'has9',
    pitch: 'Every drive is timed to clear the high passes before the afternoon wind. My dhaba and fuel stops are in the paid days.',
    cover: { kind: 'local', file: 'assets/photos/nako-lake-and-nako-village-himachal-pradesh.jpg', focus: '58% 62%', alt: 'Nako lake below Nako village, with bare mountains behind' },
    gallery: [
      'shimla-ridges.jpg', 'chitkul-village-kinnaur-himachal-pradesh.jpg', 'tabo-monastery-tabo-spiti-himachal-pradesh-d72.jpg',
      'spiti-valley-mountains.jpg', 'road-to-rohtang-pass-from-manali.jpg',
    ],
    teasers: {
      4: 'A cliff-edge morning, then a side valley most tours skip',
      5: 'The view on every Spiti poster, and the climb above it',
      6: 'Three high villages in one loop, back before the cold',
      7: 'The hardest pass of the trip, and a night beside the water',
    },
  },
  {
    id: 'jaipur', label: 'Jaipur in Two Days (2-day base, no cover)', src: () => page('single-base-2day.nocover'), creator: 'aditi',
    pitch: 'Two days, timed so you reach the forts before the tour buses. Every ticket price is checked for 2026.',
    cover: null,
    teasers: { 1: 'Up the ridge before the crowds, and an evening built for families' },
  },
  {
    id: 'longway', label: 'The Long Way Round (30 days, rail)', src: () => page('long-30day.priced'), creator: 'rahul',
    pitch: 'Every train, every halt and every bed for thirty days. I rebuilt the whole plan after my 2026 run.',
    cover: { kind: 'none', why: 'The fixture cover is a Himachal photo. This trip never goes there, so the page uses the plate.' },
    teasers: {
      1: 'The old city on foot, with a lunch worth the crowd', 2: 'Into the pink city, straight to the big three',
      3: 'Palaces in the morning, and a sweet stop you will talk about', 4: 'The blue city from its highest wall',
      5: 'A slow day of gardens, and the street food the city is known for', 6: 'A boat hour on the lake, and an evening of music',
      7: 'An island crossing, and the best sunset of the first week', 8: 'A quiet morning, and a loud night market',
      9: 'A stepwell older than most cities, and a lake walk', 10: 'The harbour front, end to end, by dusk',
      11: 'A ferry out to the caves, and the snack the city runs on', 12: 'Forest inside the city, and caves most visitors miss',
      13: 'Old churches, a fort on the sea, and the first beach afternoon',
    },
  },
  {
    id: 'air', label: 'Three Cities by Air (flights, free, hot-linked cover)', src: () => page('multi-city-flight.free'), creator: 'sana',
    pitch: 'Three cities in four days, with no wasted hours at airports. Fork it and move the dates.',
    cover: { kind: 'remote', alt: 'Ridges of hills in layers, seen from Shimla', credit: '"Shimla ridges" by Gayatri Priyadarshini, CC BY-SA 4.0, via Wikimedia Commons', page: 'https://commons.wikimedia.org/w/index.php?curid=49341080', focus: '50% 55%' },
    teasers: {},
  },
  {
    id: 'coorg', label: 'Coorg Loop (road loop, priced)', src: () => page('coorg-loop-from-bangalore.priced'), creator: 'kavya',
    pitch: 'The seven-hour drive is split at Mysore both ways, so nobody arrives wrecked. Every fee is checked for 2026.',
    cover: { kind: 'none', why: 'The fixture cover URL is not verified for this prototype, so the page uses the plate.' },
    teasers: {
      1: 'Into the coffee hills: a waterfall, a long lunch, the town’s sunset spot',
      2: 'An early animal morning, a monastery town, and a river walk',
      3: 'Birds at first light, an old river town, then back to the palace city',
      4: 'A breakfast worth the queue, one craft stop, and the road home',
    },
  },
  {
    id: 'pondy', label: 'Pondicherry, Slowly (sparse, priced)', src: () => page('sparse-3day.priced'), creator: 'neha',
    pitch: 'Three slow days with one stop each. The paid days hold the timing that keeps them quiet.',
    cover: { kind: 'none', why: 'The fixture cover is a Himachal photo, so the page uses the plate.' },
    teasers: { 1: 'One quiet hour that sets the pace for the whole trip', 2: 'A slow road out of town, and back in time for the sea' },
  },
  {
    id: 'purulia', label: 'Purulia Escape (real, sparse, free)', src: () => raw('pub_qtdyxuidh2u'), creator: 'has9',
    pitch: null,
    cover: { kind: 'none', why: 'The live cover sits in the app’s storage, which this prototype does not load.' },
    teasers: {},
  },
]

// ---------- geometry and schedule (approximate) ----------
const R = 6371
function km(a, b) {
  const t = (x) => (x * Math.PI) / 180
  const dLat = t(b.lat - a.lat), dLng = t(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
const hhmm = (s) => { if (!s) return null; const [h, m] = s.split(':').map(Number); return h * 60 + (m || 0) }
const ROAD = { car: [1.3, 38], taxi: [1.3, 38], rental: [1.3, 38], bike: [1.3, 34], bus: [1.3, 32], train: [1.15, 55], flight: [1.3, 30] }
const CAT_P = { sightseeing: 'sights', temple: 'temples', nature: 'nature stops', food: 'food stops', shopping: 'markets', museum: 'museums', beach: 'beaches', adventure: 'outdoor stops', event: 'evenings out', 'transport-hub': 'transfers' }
const CAT_S = { sightseeing: 'sight', temple: 'temple', nature: 'nature stop', food: 'food stop', shopping: 'market', museum: 'museum', beach: 'beach', adventure: 'outdoor stop', event: 'evening out', 'transport-hub': 'transfer' }
const CAT_LABEL = { sightseeing: 'Sight', temple: 'Temple', nature: 'Nature', food: 'Food', shopping: 'Market', museum: 'Museum', beach: 'Beach', adventure: 'Outdoors', event: 'Evening', hotel: 'Stay', travel: 'Travel', 'transport-hub': 'Transfer' }

function schedule(trip) {
  const mode = trip.transport_mode || 'car'
  const [factor, speed] = ROAD[mode] || ROAD.car
  const days = [...trip.days].sort((a, b) => a.index - b.index)
  const flights = trip.flights || []
  let prev = trip.start_location_coords || null
  const all = []
  const res = days.map((day) => {
    const stops = [...(day.stops || [])].filter(Boolean).sort((a, b) => (a.orderInDay ?? 0) - (b.orderInDay ?? 0))
    const start = hhmm(day.startTime) ?? 8 * 60
    let t = start
    const segs = []
    const timeline = []
    let dayKm = 0, roadMin = 0
    const legs = flights.filter((f) => f.dayIndex === day.index)
    let pendingLeg = null
    for (const s of stops) {
      if (s.category === 'hotel') { timeline.push({ kind: 'stay', t, s }); continue }
      if (Number.isFinite(s.lat) && Number.isFinite(s.lng)) {
        if (prev === 'airport') {
          segs.push({ k: 'travel', a: t, b: t + 45 }); pendingLeg = { km: null, min: 45, mode: 'transfer' }; t += 45; roadMin += 45
        } else if (prev) {
          const d = km(prev, s)
          if (d > 0.3) {
            const road = d * factor, mins = Math.max(10, Math.round(road / speed * 60))
            segs.push({ k: 'travel', a: t, b: t + mins })
            pendingLeg = { km: Math.round(road), min: mins, mode: mode === 'train' && road > 80 ? 'train' : 'road' }
            t += mins; dayKm += road; roadMin += mins
          }
        }
        prev = s
        all.push(s)
      }
      const open = hhmm(s.openTime)
      if (open != null && t < open) { t = open }
      const v = s.visitMinutes || 0
      const entry = { kind: 'stop', t, s, leg: pendingLeg }
      pendingLeg = null
      timeline.push(entry)
      if (v > 0) { segs.push({ k: 'visit', a: t, b: t + v, c: s.category }); t += v + 10 }
    }
    for (const f of legs) {
      const a = Math.max(t + 60, 17 * 60)
      segs.push({ k: 'flight', a, b: a + 150 })
      timeline.splice(timeline.findIndex((x) => x.kind === 'stay') >= 0 ? timeline.findIndex((x) => x.kind === 'stay') : timeline.length, 0, { kind: 'flight', t: a, f })
      t = a + 150
      prev = 'airport'
    }
    const visits = stops.filter((s) => s.category !== 'hotel' && s.category !== 'travel')
    const cats = {}
    for (const s of visits) cats[s.category] = (cats[s.category] || 0) + 1
    return { day, stops, visits, segs, timeline, dayKm, roadMin, cats, start, end: t, flights: legs }
  })
  let spread = 0
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) spread = Math.max(spread, km(all[i], all[j]))
  const totalKm = res.reduce((s, d) => s + d.dayKm, 0)
  const st = trip.start_location_coords, last = all[all.length - 1]
  const endsNearStart = !!(st && last && km(st, last) < 40)
  return { mode, days: res, flights, spread, totalKm, all, endsNearStart }
}

// ---------- copy helpers ----------
const fmtKm = (n) => Math.round(n >= 1000 ? Math.round(n / 10) * 10 : n).toLocaleString('en-IN')
function chain(list, back) {
  const out = []
  for (const x of list || []) { const c = String(x).replace(/, India$/, ''); if (c && out[out.length - 1] !== c) out.push(c) }
  const loop = out.length > 2 && out[0] === out[out.length - 1]
  const body = loop ? out.slice(0, -1) : out
  const parts = body.length > 7 ? [...body.slice(0, 3), `${body.length - 5} more`, ...body.slice(-2)] : body
  return { parts, back: (loop || back) && body.length > 1 ? body[0] : null }
}
function travelLine(pub, trip, a) {
  if (a.flights.length) {
    const codes = a.flights.map((f) => f.fromAirport).concat(a.flights.slice(-1).map((f) => f.toAirport))
    return { value: `${a.flights.length} flights`, label: codes.join(' to ') }
  }
  if (a.all.length > 1 && a.spread < 40) {
    const base = String((pub.route_summary || [])[0] ?? trip.start_location).replace(/, India$/, '')
    return { value: `One base`, label: `${base}, every stop within ${Math.max(5, Math.round(a.spread / 5) * 5)} km` }
  }
  const how = { train: 'by train', bus: 'by bus', car: 'by road', taxi: 'by road', rental: 'by road', bike: 'by road' }[a.mode]
  return { value: `${fmtKm(a.totalKm)} km`, label: how ? `${how}, approximate` : 'end to end, approximate' }
}
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s)
function catLine(cats) {
  return Object.entries(cats).sort((x, y) => y[1] - x[1]).slice(0, 3)
    .map(([k, v]) => `${v} ${v === 1 ? (CAT_S[k] ?? k) : (CAT_P[k] ?? k + 's')}`).join(', ')
}

// ---------- build ----------
fs.mkdirSync(out, { recursive: true })
const index = []
for (const T of TRIPS) {
  const { publication: pub, trip } = T.src()
  const a = schedule(trip)
  const free = new Set(pub.free_day_indexes || [])
  const priced = (pub.premium_price_inr || 0) > 0
  const counts = {
    stops: a.days.reduce((s, d) => s + d.visits.length, 0),
    timed: a.days.reduce((s, d) => s + d.visits.filter((x) => x.visitMinutes > 0).length, 0),
    fees: a.days.reduce((s, d) => s + d.visits.filter((x) => x.entryFeeInrPerPerson > 0).length, 0),
    hours: a.days.reduce((s, d) => s + d.visits.filter((x) => x.openTime).length, 0),
    notes: a.days.reduce((s, d) => s + d.visits.filter((x) => (x.notes || '').trim()).length, 0),
  }
  const stopOut = (e) => {
    if (e.kind === 'flight') return { kind: 'flight', t: e.t, from: e.f.fromAirport, to: e.f.toAirport, ...(e.f.airline ? { airline: e.f.airline } : {}) }
    const s = e.s
    return {
      kind: e.kind, t: e.t, title: s.title, cat: s.category, catLabel: CAT_LABEL[s.category] ?? cap(s.category),
      min: s.visitMinutes || 0, open: s.openTime || null, close: s.closeTime || null,
      fee: s.entryFeeInrPerPerson || 0, note: (s.notes || '').trim() || null, place: s.locationName || null,
      leg: e.leg || null,
    }
  }
  const pubDays = [], paidDays = {}
  for (const d of a.days) {
    const i = d.day.index
    const locked = priced && !free.has(i)
    const preview = {
      index: i, locked,
      segs: d.segs.map((s) => ({ k: s.k, a: Math.round(s.a), b: Math.round(s.b) })),
      stats: { stops: d.visits.length, km: Math.round(d.dayKm), road: Math.round(d.roadMin), start: d.start, end: Math.round(d.end), flights: d.flights.length },
      cats: catLine(d.cats),
      mix: d.cats, // category counts only, never names: safe on a locked day
      timed: d.visits.filter((x) => x.visitMinutes > 0).length,
    }
    const full = { title: d.day.title || null, stops: d.timeline.map(stopOut) }
    if (locked) {
      preview.teaser = T.teasers[i] ?? null
      paidDays[i] = full
    } else {
      Object.assign(preview, full)
    }
    pubDays.push(preview)
  }
  const updatedAt = pub.refreshed_at ?? pub.published_at
  const ch = chain(pub.route_summary, trip.round_trip && a.endsNearStart)
  const creator = { ...CREATORS[T.creator], sample: true }
  let cover = null
  if (T.cover?.kind === 'local') {
    const c = readJSON(path.join(here, '..', 'assets', 'photos', 'credits.json')).find((x) => x.file.endsWith(path.basename(T.cover.file)))
    cover = { kind: 'local', src: T.cover.file, alt: T.cover.alt, focus: T.cover.focus, credit: c.credit, page: c.page }
  } else if (T.cover?.kind === 'remote') {
    cover = { kind: 'remote', src: pub.cover_image_url, alt: T.cover.alt, focus: T.cover.focus, credit: T.cover.credit, page: T.cover.page }
  }
  let gallery = null
  if (T.gallery) {
    const cr = readJSON(path.join(here, '..', 'assets', 'photos', 'credits.json'))
    gallery = T.gallery.map((f) => { const c = cr.find((x) => x.file.endsWith(f)); return { src: 'assets/photos/' + f, w: c.width, h: c.height, title: c.title.replace(/ -D72 6869$/, '').replace(/ photography by .*/, ''), credit: `${c.creator}, ${c.license}`, page: c.page } })
  }
  const data = {
    id: T.id,
    pub: {
      title: pub.title, tagline: pub.tagline || null, route: ch, days: pub.duration_days,
      budget: pub.estimated_budget_per_person_inr || 0, style: pub.travel_style || null, season: pub.best_season || null,
      tips: pub.travel_tips || [], warnings: pub.warnings_and_assumptions || [], free: [...free].sort((x, y) => x - y),
      price: priced ? pub.premium_price_inr : null, publishedAt: pub.published_at, updatedAt,
      updatedDays: Math.max(0, Math.round((NOW - updatedAt) / 86400000)), refreshed: !!pub.refreshed_at,
      views: pub.views || 0, copies: pub.copies || 0, pitch: T.pitch, pitchSample: !!T.pitch,
    },
    creator, cover, coverNote: T.cover?.why ?? null, gallery,
    travel: travelLine(pub, trip, a), mode: a.mode,
    counts, days: pubDays,
    mix: a.days.reduce((m, d) => { for (const [k, v] of Object.entries(d.cats)) m[k] = (m[k] || 0) + v; return m }, {}),
  }
  const pubJs = `/* PUBLIC payload for "${pub.title}". Locked days hold a preview only. Generated by tools/prep-data.mjs */\nwindow.YF_TRIPS = window.YF_TRIPS || {};\nwindow.YF_TRIPS[${JSON.stringify(T.id)}] = ${JSON.stringify(data)};\n`
  fs.writeFileSync(path.join(out, T.id + '.js'), pubJs)
  if (Object.keys(paidDays).length) {
    const paidJs = `/* PAID payload for "${pub.title}". The page loads this only after the pretend payment. */\nwindow.YF_PAID = window.YF_PAID || {};\nwindow.YF_PAID[${JSON.stringify(T.id)}] = ${JSON.stringify({ days: paidDays })};\n`
    fs.writeFileSync(path.join(out, T.id + '.paid.js'), paidJs)
  }
  index.push({ id: T.id, label: T.label })
  console.log(T.id.padEnd(8), String(pub.duration_days).padStart(2), 'days', priced ? 'priced' : 'free  ', 'locked', Object.keys(paidDays).length, 'km', Math.round(a.totalKm), 'travel', JSON.stringify(data.travel))
}
fs.writeFileSync(path.join(out, 'index.js'), `/* Trip list for the dev switcher. Generated. */\nwindow.YF_INDEX = ${JSON.stringify(index)};\n`)

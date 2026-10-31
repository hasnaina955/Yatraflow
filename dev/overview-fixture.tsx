import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource/sora/500.css'
import '@fontsource/sora/600.css'
import '@fontsource/sora/700.css'
import '@fontsource/plus-jakarta-sans/400.css'
import '@fontsource/plus-jakarta-sans/500.css'
import '@fontsource/plus-jakarta-sans/600.css'
import '@fontsource/plus-jakarta-sans/700.css'
import '../src/styles.css'
import type { ActivityEntry, CachedUser, ItineraryStop, Trip, TripDecision } from '../src/data/types'
import type { RoadLeg } from '../src/lib/routing'
import { buildRoadChain, setRoadMeasureForTests } from '../src/lib/tripRoad'
import { setElevationTileLoaderForTests } from '../src/lib/elevationTiles'
import { clearWeatherCacheForTests, setWeatherTransportForTests } from '../src/lib/weather'
import { TripWorkspace } from '../src/pages/TripWorkspace'
import { TripsHero } from '../src/components/trips/TripsHero'
import { heroPostcards } from '../src/lib/tripsPage'
import { getSnapshot } from '../src/store/store'

const TRIP_ID = 'fixture-trip'
const OWNER_ID = 'fixture-owner'
const EDITOR_ID = 'fixture-editor'
// A third member, so the stack proves the mockup's three-circle case: the
// reported bug was three circles in one pale mint reading as a single block.
const VIEWER_ID = 'fixture-viewer'

const params = new URLSearchParams(location.search)
const THEME = params.get('theme') === 'dark' ? 'dark' : 'light'
const MODE = params.get('mode') ?? 'rental'
// Default to a trip with NO manual cover, so the fixture proves the real
// artwork resolver rather than a picture handed in by the harness.
const COVER = params.get('cover') ?? 'art'
// A destination override, so the fixture can prove the WIDER region table beats
// an unrelated origin (Gulmarg out of Mumbai) with the real resolver.
const PLACE = params.get('place')
const START = params.get('start') ?? 'Panaji, Goa'
// 'workspace' is the trip screen; 'hero' is the My trips hero, whose postcards
// draw the same plan through the same renderer.
const SURFACE = params.get('surface') === 'hero' ? 'hero' : 'workspace'
const WEATHER = params.get('weather') ?? 'ok'
const ELEVATION = params.get('elev') ?? 'ok'
const ROAD = params.get('road') ?? 'ok'
// `tab` reaches any workspace tab, not just overview and settings, so the Board
// surface can be measured without a session. The workspace validates the key
// itself and falls back to overview, so a bad value cannot make the fixture lie.
const TAB = params.get('tab') ?? 'overview'

const stop = (
  id: string,
  title: string,
  lat: number,
  lng: number,
  orderInDay: number,
  category: ItineraryStop['category'] = 'sightseeing',
  locationName = title,
): ItineraryStop => ({
  id,
  title,
  category,
  locationName,
  lat,
  lng,
  visitMinutes: 45,
  entryFeeInrPerPerson: 0,
  transportCostInrTotal: 0,
  priority: 'must-do',
  status: 'confirmed',
  orderInDay,
})

const users: CachedUser[] = [
  {
    id: OWNER_ID,
    kind: 'private',
    email: 'fixture-owner@example.invalid',
    profile: { name: 'Owner One', languages: ['en'], travelStyles: ['balanced'], isCreator: false, creatorAvailable: true },
    createdAt: 1,
  },
  {
    id: EDITOR_ID,
    kind: 'public',
    profile: { name: 'Editor Two', isCreator: false, creatorAvailable: true },
  },
  {
    id: VIEWER_ID,
    kind: 'public',
    profile: { name: 'Viewer Three', isCreator: false, creatorAvailable: true },
  },
]

const COVERS: Record<string, Pick<Trip, 'coverEmoji' | 'coverImageUrl'>> = {
  // The artwork resolver's own answer: no manual cover of any kind.
  art: { coverEmoji: '', coverImageUrl: '' },
  // The row the store wrote for a trip whose traveller never touched the emoji
  // picker. It must read as "no choice" and show the artwork, not a dark card.
  legacy: { coverEmoji: '🧭', coverImageUrl: '' },
  // THE regression: a saved beach emoji must not decide the cover. The trip
  // still starts at Panaji and visits three Goan beaches, so the Goa artwork
  // paints and no emoji node exists at all.
  savedbeach: { coverEmoji: '🏖', coverImageUrl: '' },
  // The same, in the emoji-with-variation-selector spelling a phone keyboard
  // produces.
  savedbeachvs: { coverEmoji: '🏖️', coverImageUrl: '' },
  // A manual image still wins over the resolver.
  source: { coverEmoji: '', coverImageUrl: '/dev/assets/cover.jpg' },
  photo: { coverEmoji: '', coverImageUrl: 'https://picsum.photos/seed/yatraflow/1200/600' },
  // An upload that cannot load is not a usable cover: the artwork shows, and
  // the emoji still does not.
  broken: { coverEmoji: '🏖', coverImageUrl: 'https://localhost:5178/definitely-missing-cover.png' },
}

const trip: Trip = {
  id: TRIP_ID,
  name: params.get('long') === '1' ? 'Goa, North to the Quiet South: Beaches, Forts and Family Adventures Across the Coast' : 'Goa, North to the Quiet South',
  startLocation: START,
  startLocationCoords: { lat: 15.4909, lng: 73.8278 },
  destinations: PLACE
    ? [PLACE]
    : params.get('scene') === 'goa' ? ['Goa'] : ['Candolim', 'Colva', 'Palolem'],
  destinationCoords: [
    { lat: 15.5185, lng: 73.7628 },
    { lat: 15.2754, lng: 73.9228 },
    { lat: 15.01, lng: 74.0233 },
  ],
  startDate: '2026-11-02',
  endDate: '2026-11-06',
  travellers: 2,
  transportMode: MODE as Trip['transportMode'],
  roundTrip: false,
  budgetPerPersonInr: 16000,
  travelStyle: 'relaxed',
  stayStyle: 'comfort',
  fixedCommitments: [
    { id: 'commitment-1', title: 'Hotel check-in', type: 'hotel-checkin', dayIndex: 1, time: '15:00', stopId: 'night-1' },
  ],
  days: [
    {
      id: 'fixture-day-0',
      index: 0,
      title: 'Panaji lanes',
      stops: [
        stop('panaji-market', 'Panaji market', 15.4989, 73.8278, 0, 'shopping'),
        stop('fontainhas', 'Fontainhas walk', 15.4981, 73.8317, 1),
        stop('night-0', 'Night in Panaji', 15.4909, 73.8278, 2, 'hotel', 'Panaji'),
      ],
    },
    {
      id: 'fixture-day-1',
      index: 1,
      title: 'Candolim coast',
      stops: [
        stop('candolim-beach', 'Candolim beach', 15.5185, 73.7628, 0, 'beach'),
        stop('aguada', 'Fort Aguada', 15.4926, 73.7737, 1),
        stop('night-1', 'Night in Candolim', 15.5185, 73.7628, 2, 'hotel', 'Candolim'),
      ],
    },
    {
      id: 'fixture-day-2',
      index: 2,
      title: 'South Goa',
      stops: [
        stop('colva', 'Colva beach', 15.2754, 73.9228, 0, 'beach'),
        stop('lunch-colva', 'Lunch on the way', 15.3106, 73.9144, 1, 'food', 'Colva road'),
        stop('night-2', 'Night in Colva', 15.2754, 73.9228, 2, 'hotel', 'Colva'),
      ],
    },
    {
      id: 'fixture-day-3',
      index: 3,
      title: 'Palolem',
      stops: [
        stop('palolem', 'Palolem beach', 15.01, 74.0233, 0, 'beach'),
        stop('night-3', 'Night in Palolem', 15.01, 74.0233, 1, 'hotel', 'Palolem'),
      ],
    },
  ],
  expenses: [
    { id: 'expense-1', label: 'Fuel', category: 'transport', amountInr: 4800 },
    { id: 'expense-2', label: 'Stay', category: 'accommodation', amountInr: 12000 },
  ],
  members: [
    { userId: OWNER_ID, role: 'owner', joinedAt: 1 },
    { userId: EDITOR_ID, role: 'editor', joinedAt: 2 },
    { userId: VIEWER_ID, role: 'viewer', joinedAt: 3 },
  ],
  ...COVERS[COVER] ?? COVERS.art,
  visibility: 'private',
  createdAt: 1,
  updatedAt: 2,
}

const decision: TripDecision = {
  id: 'fixture-decision',
  tripId: TRIP_ID,
  question: 'Which beach should we keep for the last morning?',
  options: [
    { id: 'palolem', label: 'Palolem' },
    { id: 'colva', label: 'Colva' },
  ],
  votesByUserId: { [EDITOR_ID]: 'palolem' },
  comments: [],
  status: 'open',
  raisedBy: EDITOR_ID,
  createdAt: 3,
}

const activity: ActivityEntry = {
  id: 'fixture-activity',
  tripId: TRIP_ID,
  actorId: EDITOR_ID,
  verb: 'added a beach stop',
  target: 'Palolem beach',
  at: Date.now() - 1000 * 60 * 8,
}

// ---- Controlled road: real geometry, no OSRM round trip ----
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(h)))
}

function syntheticLegs(points: Array<{ lat: number; lng: number }>): RoadLeg[] {
  const legs: RoadLeg[] = []
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]
    const b = points[i + 1]
    const geometry: Array<[number, number]> = []
    const steps = 24
    for (let s = 0; s <= steps; s++) {
      const t = s / steps
      const bow = Math.sin(t * Math.PI) * 0.0018
      geometry.push([a.lng + (b.lng - a.lng) * t + bow, a.lat + (b.lat - a.lat) * t - bow * 0.7])
    }
    const km = haversineKm(a, b) * 1.18
    legs.push({ distanceKm: km, durationMinutes: Math.round((km / 55) * 60), source: 'osrm', geometry })
  }
  return legs
}

// ---- Controlled terrain: a deterministic ridge, Terrarium-encoded ----
function tileLatLng(z: number, x: number, y: number, px: number, py: number) {
  const n = 2 ** z
  const lng = ((x + px / 256) / n) * 360 - 180
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * ((y + py / 256) / n))))
  return { lat: (latRad * 180) / Math.PI, lng }
}

function syntheticHeight(lat: number, lng: number): number {
  const fort = 70 * Math.exp(-((lat - 15.4926) ** 2 + (lng - 73.7737) ** 2) / 0.0002)
  return Math.round(9 + fort + 3 * Math.sin(lat * 80))
}

function makeTerrainTile({ z, x, y }: { z: number; x: number; y: number }) {
  const rgba = new Uint8ClampedArray(256 * 256 * 4)
  for (let py = 0; py < 256; py++) {
    for (let px = 0; px < 256; px++) {
      const { lat, lng } = tileLatLng(z, x, y, px, py)
      const packed = syntheticHeight(lat, lng) + 32768
      const at = (py * 256 + px) * 4
      rgba[at] = Math.floor(packed / 256)
      rgba[at + 1] = Math.floor(packed) % 256
      rgba[at + 2] = Math.floor((packed - Math.floor(packed)) * 256)
      rgba[at + 3] = 255
    }
  }
  return { size: 256, rgba }
}

const elevationAttempts = new Map<string, number>()
let elevationRetryRequested = false
document.addEventListener('click', event => {
  if (event.target instanceof Element && event.target.closest('.ovw-road-note.is-failed button')) elevationRetryRequested = true
}, true)
setElevationTileLoaderForTests(async key => {
  const id = `${key.z}/${key.x}/${key.y}`
  const attempt = (elevationAttempts.get(id) ?? 0) + 1
  elevationAttempts.set(id, attempt)
  if (ELEVATION === 'failed') throw new Error('fixture terrain failure')
  // First pass fails everywhere, so one retry can prove the recovery path.
  if (ELEVATION === 'recover' && !elevationRetryRequested) throw new Error('fixture terrain first pass')
  if (ELEVATION === 'partial' && attempt % 3 === 0) throw new Error('fixture terrain gap')
  return makeTerrainTile(key)
})

// ---- Controlled weather: per-anchor success, failure and recovery ----
clearWeatherCacheForTests()
const weatherCalls = new Map<string, number>()
setWeatherTransportForTests(async url => {
  const parsed = new URL(url)
  const key = parsed.search
  const seen = (weatherCalls.get(key) ?? 0) + 1
  weatherCalls.set(key, seen)
  const lat = Number(parsed.searchParams.get('latitude'))
  const lng = Number(parsed.searchParams.get('longitude'))
  const anchorIndex = Math.round((lat - 15.0) * 100) + Math.round((lng - 73.7) * 100)
  const failFirst = WEATHER === 'failed' || WEATHER === 'recover'
  const failNow = WEATHER === 'failed'
    ? seen === 1
    : WEATHER === 'recover'
      ? seen > 1 || Math.abs(anchorIndex) % 2 === 0
      : WEATHER === 'partial'
        ? Math.abs(anchorIndex) % 2 === 0
        : false
  if (failFirst && failNow) {
    return new Response('fixture weather failure', { status: 503 })
  }
  const start = parsed.searchParams.get('start_date') ?? '2027-02-10'
  const end = parsed.searchParams.get('end_date') ?? start
  const days: string[] = []
  const cursor = new Date(`${start}T00:00:00Z`)
  const last = new Date(`${end}T00:00:00Z`)
  while (cursor <= last) {
    days.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return new Response(JSON.stringify({
    daily: {
      time: days,
      weather_code: days.map(() => 1),
      temperature_2m_max: days.map((_, i) => 30 + (i % 3)),
      temperature_2m_min: days.map((_, i) => 21 + (i % 2)),
      precipitation_probability_max: days.map((_, i) => (i % 2 === 0 ? 10 : 70)),
    },
  }), { status: 200, headers: { 'content-type': 'application/json' } })
})

let roadRetryRequested = false
document.addEventListener('click', event => {
  if (!(event.target instanceof Element)) return
  const note = event.target.closest('.ovw-road-note')
  if (note && !note.classList.contains('is-failed') && note.textContent?.includes('Road not measured.')) {
    roadRetryRequested = true
  }
}, true)
setRoadMeasureForTests(async points => {
  if (ROAD === 'failed' || (ROAD === 'recover' && !roadRetryRequested)) throw new Error('fixture road failure')
  return syntheticLegs(points)
})
// Build the chain once so a bad fixture coordinate fails loudly here.
buildRoadChain(trip)

const db = getSnapshot()
db.users = users
db.trips = [trip]
db.suggestions = []
db.decisions = [decision]
db.activity = [activity]
db.notifications = []
db.published = []
db.sessionUserId = OWNER_ID
db.ready = true
db.sliceReads = { decisions: 'ok', activity: 'ok' }

document.documentElement.dataset.theme = THEME

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <>
      {SURFACE === 'hero' ? (
        <TripsHero
          headline={{ lead: 'Next stop,', accent: 'Panaji.' }}
          lede="Fixture hero: the same postcards the My trips page draws."
          stats={[{ label: 'trips', value: 1 }]}
          postcards={heroPostcards({ trips: [trip], today: new Date('2026-10-29T12:00:00Z'), ready: true })}
          note={null}
          primary={null}
          secondary={null}
        />
      ) : (
        <TripWorkspace tripId={TRIP_ID} initialTab={TAB} onNavigate={() => undefined} />
      )}
      <div
        style={{
          position: 'fixed',
          right: 12,
          bottom: 12,
          zIndex: 2147483647,
          padding: '6px 10px',
          borderRadius: 999,
          background: '#0C1420',
          color: '#FCFEFD',
          font: '700 11px/1.2 "Plus Jakarta Sans", sans-serif',
          letterSpacing: '.08em',
          textTransform: 'uppercase',
          pointerEvents: 'none',
        }}
      >
        Dev only - synthetic trip data
      </div>
    </>
  </React.StrictMode>,
)

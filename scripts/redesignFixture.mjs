// Synthetic browser data only. These rows must never reach a live backend.
import { isDeepStrictEqual } from 'node:util'

export const SYNTHETIC_FORK_ID = '00000000-0000-4000-8000-000000000301'
const forkReservations = new WeakMap()
export const FIXTURE_NOW = Date.parse('2026-10-08T08:00:00Z')
export const OWNER_ID = '00000000-0000-4000-8000-000000000001'
export const OTHER_ID = '00000000-0000-4000-8000-000000000002'
export const TRIP_ID = '00000000-0000-4000-8000-000000000101'
export const ANALYTICS_SESSION_ID = '00000000000000000000000000000101'
export const ANALYTICS_EVENT_ID = '00000000-0000-4000-8000-000000000201'
export const FIXTURE_COVER = 'https://redesign-fixture.invalid/cover.svg'
export const COVER_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#174d50"/><stop offset="1" stop-color="#80aa93"/></linearGradient></defs><path fill="url(#g)" d="M0 0h1200v800H0z"/><path fill="#427660" d="M0 650 350 180 700 620 1000 250 1200 600v200H0z"/><path fill="#a8c8aa" d="M0 760 420 410 900 760 1200 500v300H0z"/></svg>'

export function buildFixture(scenario = 'mixed') {
  const profiles = [[OWNER_ID, 'Fixture Asha', 'Kochi'], [OTHER_ID, 'Fixture Kabir', 'Jaipur']].map(([id, name, city]) => ({
    id, name, email: `${id.slice(-1)}@redesign-fixture.invalid`, home_city: city,
    languages: ['en'], travel_styles: ['balanced'], is_creator: true, is_disabled: false,
    creator_bio: 'Synthetic creator for local browser checks.', created_at: FIXTURE_NOW,
    social_links: id === OWNER_ID ? {
      youtube: 'https://social.redesign-fixture.invalid/youtube/asha',
      instagram: 'https://social.redesign-fixture.invalid/instagram/asha',
    } : {},
  }))
  const names = ['Fixture Kerala Coast', 'Fixture Goa Weekend', 'Fixture Rajasthan Trail', 'Fixture Himalayan Paths']
  const places = ['Kochi', 'Goa', 'Jaipur', 'Shimla']
  const trips = names.map((name, i) => ({
    id: `00000000-0000-4000-8000-00000000010${i + 1}`, owner_id: i === 3 ? OTHER_ID : OWNER_ID,
    name, start_location: places[i], start_location_coords: { lat: 9.97, lng: 76.28 },
    destinations: [places[i], 'Local viewpoint'], destination_coords: [{ lat: 9.98, lng: 76.29 }, { lat: 10, lng: 76.30 }],
    start_date: `2026-10-${12 + i * 4}`, end_date: `2026-10-${14 + i * 4}`, travellers: 2,
    transport_mode: 'car', budget_per_person_inr: 12000 + i * 2000, travel_style: i === 3 ? 'adventure' : 'balanced',
    fixed_commitments: [], expenses: [], cover_emoji: '🌿', cover_image_url: FIXTURE_COVER,
    visibility: 'public', created_at: FIXTURE_NOW - 86400000, updated_at: FIXTURE_NOW - 86400000,
    days: Array.from({ length: 3 }, (_, day) => ({
      id: `fixture-day-${i}-${day}`, index: day, title: `${places[i]} day ${day + 1}`, startTime: '08:30',
      stops: ['Market walk', 'Lake viewpoint'].map((title, stop) => ({
        id: `fixture-stop-${i}-${day}-${stop}`, title: `${title} ${day + 1}`, category: 'sightseeing',
        locationName: places[i], lat: 9.97 + day * 0.01, lng: 76.28 + stop * 0.01,
        visitMinutes: 60, entryFeeInrPerPerson: 100, transportCostInrTotal: 100,
        priority: 'must-do', status: 'confirmed', orderInDay: stop, legDistanceKm: 2, legTravelMinutes: 10,
      })),
    })),
  }))
  const published = trips.map((trip, i) => ({
    id: `fixture-publication-${i + 1}`, trip_id: trip.id, creator_id: trip.owner_id, title: trip.name,
    tagline: 'Synthetic local acceptance itinerary', cover_image_url: `https://redesign-fixture.invalid/cover-publication-${i + 1}.svg`,
    route_summary: trip.destinations, duration_days: 3, estimated_budget_per_person_inr: trip.budget_per_person_inr,
    travel_style: trip.travel_style, best_season: 'October to March', travel_tips: ['Carry drinking water.'],
    warnings_and_assumptions: ['Synthetic data. No bookings.'], free_day_indexes: i === 1 ? [0] : [0, 1, 2],
    premium_price_inr: i === 1 ? 499 : null, subscriber_cta: i === 2 ? 'Subscribe for route notes' : null,
    published_at: FIXTURE_NOW - 3600000, refreshed_at: FIXTURE_NOW - 3600000, unpublished_at: null,
    views: 120 - i * 20, copies: 12 - i * 2,
  }))
  const edgeTrips = [
    { id: 'fixture-past-trip', name: 'Fixture Past Journey', start_date: '2026-09-01', end_date: '2026-09-03' },
    { id: 'fixture-undated-trip', name: 'Fixture Undated Journey', start_date: '', end_date: '' },
    { id: 'fixture-no-days-trip', name: 'Fixture Long Name Journey Across The Western Ghats With Friends And Family', days: [] },
    // No stored photo, and the default compass emoji that every trip is born
    // with. That combination is what makes the owner-only cover action testable.
    { id: 'fixture-coverless-trip', name: 'Fixture Coverless Journey', cover_image_url: '', cover_emoji: '🧭' },
  ].map(patch => ({ ...structuredClone(trips[0]), ...patch }))
  trips.push(...edgeTrips)
  if (scenario === 'past-only') for (const trip of trips) {
    trip.start_date = '2026-09-01'; trip.end_date = '2026-09-03'
  }
  if (scenario === 'duplicate-names') profiles[1].name = profiles[0].name
  // The viewer trip carries no stored photo either, so its card must not offer
  // the owner-only cover action.
  trips[3].cover_image_url = ''
  // Keep one stale page and one archived page beside the three pricing states.
  published[0].refreshed_at = FIXTURE_NOW - 172800000
  published.push({ ...structuredClone(published[0]), id: 'fixture-publication-archived', trip_id: 'fixture-past-trip', title: 'Fixture Archived Coast', unpublished_at: FIXTURE_NOW - 60000, cover_image_url: 'https://redesign-fixture.invalid/cover-archived.svg' })
  const members = trips.map(trip => ({ trip_id: trip.id, user_id: trip.owner_id, role: 'owner', joined_at: FIXTURE_NOW }))
  members.push({ trip_id: trips[3].id, user_id: OWNER_ID, role: 'viewer', joined_at: FIXTURE_NOW })

  /* ---- scenario overlays ----
     These run LAST, after the base fixture finalises everything above —
     including the archived publication, the coverless viewer trip, and the
     membership rows. An overlay placed earlier would be silently undone by
     that finalisation, which is how the sparse scenario used to read an
     undeclared `members`. */
  // Equal creators is the harder tie: the SAME name AND identical public
  // evidence, so neither the visible name nor the fork count can tell the two
  // cards apart. The distinct accessible name has to come from the rank the
  // card already shows, and the stable ID tie has to decide the order.
  if (scenario === 'equal-creators') {
    profiles[1].name = profiles[0].name
    for (let index = 0; index < 2; index++) published.push({
      ...structuredClone(published[3]), id: `fixture-equal-publication-${index + 1}`,
      title: `Fixture Equal Mountain Route ${index + 1}`,
      cover_image_url: `https://redesign-fixture.invalid/cover-equal-${index + 1}.svg`,
    })
    for (const row of published) { row.views = 60; row.copies = 6 }
  }
  // A sparse catalog is the honest-empty case: one live publication and one
  // creator. The discovery rails must collapse rather than pad themselves with
  // repeated data, and the counts must say one, not four.
  if (scenario === 'sparse') {
    const keep = published[0]
    published.length = 0
    published.push(keep)
    profiles.length = 1
    for (let index = members.length - 1; index >= 0; index--) {
      if (members[index].user_id !== keep.creator_id) members.splice(index, 1)
    }
  }
  // More publications than one page, so "Load more" and the pagination reset
  // are exercised against real rows rather than a single page.
  if (scenario === 'many-publications') {
    for (let extra = 0; extra < 14; extra++) {
      published.push({
        ...structuredClone(published[extra < 2 ? 0 : extra % 3]),
        id: `fixture-publication-extra-${extra + 1}`,
        title: `Fixture Extra Route ${extra + 1}`,
        duration_days: extra < 12 ? 3 : extra - 8,
        views: extra < 2 ? 40 : 40 - extra, copies: extra < 2 ? 4 : 4 - (extra % 4),
        published_at: FIXTURE_NOW - 3600000 - (extra < 2 ? 0 : extra * 60000),
      })
    }
  }
  // An editor's saved cover must win over the route fallback, and each card
  // must show its own photograph rather than one shared placeholder. The index
  // runs over every row, so the archived publication gets its own cover too.
  if (scenario === 'editor-cover') {
    published.forEach((row, index) => {
      row.cover_image_url = `https://redesign-fixture.invalid/cover-${index}.svg`
    })
  }
  // No stored cover anywhere: every card falls back to its route photograph,
  // and an unknown route must stay neutral rather than borrow a landscape.
  if (scenario === 'missing-cover') {
    for (const row of published) row.cover_image_url = ''
    for (const trip of trips) trip.cover_image_url = ''
  }
  // A cover that is present but cannot load. The image's error arm has to fire
  // and the card has to keep its surface, geometry, and caption.
  if (scenario === 'broken-cover') {
    for (const row of published) row.cover_image_url = 'https://redesign-fixture-broken.invalid/cover.svg'
    for (const trip of trips) trip.cover_image_url = 'https://redesign-fixture-broken.invalid/cover.svg'
  }
  return {
    profiles, trips, published_itineraries: published,
    trip_members: members,
    suggestions: [], decisions: [], activity: [], notifications: [], entitlements: [], purchase_orders: [],
    user_dna: [{ user_id: OWNER_ID, log: [] }],
    create_funnel_events: [{ id: ANALYTICS_EVENT_ID, session_id: ANALYTICS_SESSION_ID, user_id: null, event: 'started' }],
  }
}

// One free non-owner Fork per context. Reservations cannot appear in REST reads.
export function reserveFixtureFork(fixture) {
  const publication = fixture.published_itineraries.find(row => row.id === 'fixture-publication-4')
  const source = fixture.trips.find(row => row.id === '00000000-0000-4000-8000-000000000104')
  if (forkReservations.has(fixture) || !source || !publication || publication.trip_id !== source.id
      || publication.creator_id !== OTHER_ID || publication.premium_price_inr != null || publication.unpublished_at
      || fixture.trips.some(row => row.id === SYNTHETIC_FORK_ID)) {
    throw new Error('The requested synthetic Fork is not available')
  }
  const { created_at: _created, updated_at: _updated, ...fields } = structuredClone(source)
  forkReservations.set(fixture, {
    publicationId: publication.id, inserted: false, memberInserted: false, counterApplied: false,
    expected: {
      ...fields, id: SYNTHETIC_FORK_ID, owner_id: OWNER_ID, name: `${publication.title} (copy)`,
      visibility: 'private', ref: 'explore',
      fuel_economy_km_per_l: null, fuel_price_per_l: null, round_trip: null,
      invite_code: null, deleted_at: null, stay_style: null, driver_count: null,
      has_vulnerable: false, drive_after_dinner_min: null, vehicle_profile: null,
      tank_l: null, rent_per_day_inr: null, local_train: null,
    },
  })
}

function acceptReservedFork({ table, method, params, body, fixture, currentUserId }) {
  const scope = forkReservations.get(fixture)
  if (!scope || currentUserId !== OWNER_ID || method !== 'POST') return null
  if (table === 'trips' && !scope.inserted && params.size === 0 && body && !Array.isArray(body)) {
    const expected = structuredClone(scope.expected)
    const ids = new Set(fixture.trips.flatMap(row => row.days.flatMap(day => [day.id, ...day.stops.map(stop => stop.id)])))
    if (!Array.isArray(body.days) || body.days.length !== expected.days.length) return null
    for (let index = 0; index < expected.days.length; index += 1) {
      const day = body.days[index]
      const expectedDay = expected.days[index]
      if (!day || !/^day_[a-f0-9]{12}$/.test(day.id) || ids.has(day.id)
          || !Array.isArray(day.stops) || day.stops.length !== expectedDay.stops.length) return null
      ids.add(day.id); expectedDay.id = day.id
      for (let stopIndex = 0; stopIndex < expectedDay.stops.length; stopIndex += 1) {
        const stop = day.stops[stopIndex]
        if (!stop || !/^st_[a-f0-9]{12}$/.test(stop.id) || ids.has(stop.id)) return null
        ids.add(stop.id); expectedDay.stops[stopIndex].id = stop.id
      }
    }
    if (!isDeepStrictEqual(body, expected)) return null
    fixture.trips.push({ ...structuredClone(body), created_at: FIXTURE_NOW, updated_at: FIXTURE_NOW })
    scope.inserted = true
    return { status: 201, body: '', fixtureOperation: 'synthetic-fork-trip' }
  }
  if (table === 'trip_members' && scope.inserted && !scope.memberInserted
      && params.size === 1 && params.get('columns') === '"trip_id","user_id","role","joined_at"') {
    const expected = [{ trip_id: SYNTHETIC_FORK_ID, user_id: OWNER_ID, role: 'owner', joined_at: FIXTURE_NOW }]
    if (!isDeepStrictEqual(body, expected)) return null
    fixture.trip_members.push(...structuredClone(body))
    scope.memberInserted = true
    return { status: 201, body: '', fixtureOperation: 'synthetic-fork-member' }
  }
  if (table === 'rpc/bump_published_stats' && scope.inserted && scope.memberInserted
      && !scope.counterApplied && params.size === 0
      && isDeepStrictEqual(body, { p_id: scope.publicationId, p_kind: 'copies', p_source: 'explore' })) {
    const publication = fixture.published_itineraries.find(row => row.id === scope.publicationId && !row.unpublished_at)
    if (!publication) return null
    publication.copies += 1
    scope.counterApplied = true
    return { status: 204, body: '', fixtureOperation: 'synthetic-fork-counter' }
  }
  return null
}

export function buildSession() {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  const expires = Math.floor(FIXTURE_NOW / 1000) + 315360000
  return {
    access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: OWNER_ID, role: 'authenticated', exp: expires, app_metadata: {} })}.synthetic-not-a-valid-signature`,
    refresh_token: 'synthetic-browser-local-only', token_type: 'bearer', expires_in: 315360000, expires_at: expires,
    user: { id: OWNER_ID, aud: 'authenticated', role: 'authenticated', email: '1@redesign-fixture.invalid',
      app_metadata: {}, user_metadata: {}, created_at: '2026-10-08T08:00:00Z' },
  }
}

// Only known read RPCs may use POST. Every other mutation fails closed.
export function fixtureResponse({ method, url, body = null, accept = '', state = 'populated', scenario = 'mixed', fixture = null, currentUserId = null }) {
  const parsed = new URL(url)
  const path = parsed.pathname
  const data = fixture ?? buildFixture(scenario)
  const fork = fixture && acceptReservedFork({ table: path.replace('/rest/v1/', ''), method, params: parsed.searchParams, body, fixture, currentUserId })
  if (fork) return fork
  if (path === '/rest/v1/create_funnel_events' && method === 'PATCH') {
    const event = fixture?.create_funnel_events.find(row => row.id === ANALYTICS_EVENT_ID && row.session_id === ANALYTICS_SESSION_ID)
    const validBody = body && Object.keys(body).length === 1 && body.user_id === OWNER_ID
    const validFilters = parsed.searchParams.get('session_id') === `eq.${ANALYTICS_SESSION_ID}`
      && parsed.searchParams.get('user_id') === 'is.null'
      && [...parsed.searchParams.keys()].every(key => ['session_id', 'user_id', 'id'].includes(key))
      && (!parsed.searchParams.has('id') || parsed.searchParams.get('id') === `eq.${ANALYTICS_EVENT_ID}`)
    if (currentUserId === OWNER_ID && event && [null, OWNER_ID].includes(event.user_id) && validBody && validFilters) {
      event.user_id = OWNER_ID
      return { status: 204, body: '', fixtureOperation: 'synthetic-analytics-backfill' }
    }
    return { status: 405, body: { message: 'Fixture rejected mutation' }, rejected: true }
  }
  // Accept only public-plan view events with the exact local request schema.
  // Copy counters need the completed reserved Fork above; all others fail closed.
  if (path === '/rest/v1/rpc/bump_published_stats' && method === 'POST') {
    const publication = fixture?.published_itineraries.find(row => row.id === body?.p_id && row.unpublished_at == null)
    const validBody = body && !Array.isArray(body)
      && Object.keys(body).sort().join(',') === 'p_id,p_kind,p_source'
      && body.p_kind === 'views' && [null, 'explore'].includes(body.p_source)
    if (publication && validBody && !parsed.search && Number.isSafeInteger(publication.views)) {
      publication.views += 1
      return { status: 204, body: '', fixtureOperation: 'synthetic-pub-counter-bump' }
    }
    return { status: 405, body: { message: 'Fixture rejected mutation' }, rejected: true }
  }
  // ShareTab mints an invite code on the known synthetic owner's first trip.
  // This rule must not accept general trip fields or other trip IDs.
  if (path === '/rest/v1/trips' && method === 'PATCH') {
    const trip = fixture?.trips.find(row => row.id === TRIP_ID && row.owner_id === OWNER_ID)
    const validFilter = parsed.searchParams.size === 1 && parsed.searchParams.get('id') === `eq.${TRIP_ID}`
    const validBody = body && !Array.isArray(body) && Object.keys(body).join(',') === 'invite_code'
      && typeof body.invite_code === 'string' && /^FIXTUREKER-[A-Z0-9]{4}$/.test(body.invite_code)
    if (currentUserId === OWNER_ID && trip && validFilter && validBody) {
      trip.invite_code = body.invite_code
      return { status: 204, body: '', fixtureOperation: 'synthetic-trip-invite-code' }
    }
    return { status: 405, body: { message: 'Fixture rejected mutation' }, rejected: true }
  }
  if (method === 'OPTIONS') return { status: 204, body: '' }
  if (path === '/auth/v1/user' && method === 'GET') return { status: 200, body: buildSession().user }
  const rpc = path.match(/^\/rest\/v1\/rpc\/([^/]+)$/)?.[1]
  const readRpcs = ['get_creator_sales', 'get_creator_funnel', 'get_public_trip', 'get_trashed_trips']
  if (!['GET', 'HEAD'].includes(method) && !(method === 'POST' && readRpcs.includes(rpc))) {
    return { status: 405, body: { message: 'Fixture rejected mutation' }, rejected: true }
  }
  if (state === 'error') return { status: 503, body: { message: 'Synthetic read failure' } }
  if (rpc) {
    if (!readRpcs.includes(rpc)) return { status: 501, body: { message: 'Unknown fixture RPC' }, unexpected: true }
    const pub = data.published_itineraries.find(row => row.id === body?.p_pub_id)
    return { status: 200, body: state === 'empty' ? [] : rpc === 'get_public_trip' ? data.trips.filter(row => row.id === pub?.trip_id) : [] }
  }
  const table = path.match(/^\/rest\/v1\/([^/]+)$/)?.[1]
  if (!table || !Object.hasOwn(data, table)) return { status: 501, body: { message: 'Unknown fixture read' }, unexpected: true }
  let rows = state === 'empty' && !['profiles', 'trip_members'].includes(table) ? [] : data[table]
  for (const [column, expression] of parsed.searchParams) {
    if (expression.startsWith('eq.')) rows = rows.filter(row => String(row[column]) === expression.slice(3))
    if (expression.startsWith('in.(')) {
      const values = expression.slice(4, -1).split(',').map(value => value.replaceAll('"', ''))
      rows = rows.filter(row => values.includes(String(row[column])))
    }
  }
  const limit = parsed.searchParams.get('limit')
  if (limit) rows = rows.slice(0, Number(limit))
  return { status: 200, body: accept.includes('application/vnd.pgrst.object+json') ? rows[0] ?? null : rows }
}

import { describe, expect, it } from 'vitest'
// @ts-expect-error The browser fixture is a standalone Node script.
import { buildFixture, buildSession, fixtureResponse, reserveFixtureFork, OWNER_ID, FIXTURE_NOW, SYNTHETIC_FORK_ID, ANALYTICS_SESSION_ID, ANALYTICS_EVENT_ID } from '../scripts/redesignFixture.mjs'
import { rowToTrip } from '../src/lib/tripRow'
import { featuredCreators } from '../src/lib/discovery'
import type { User, PublishedItinerary } from '../src/data/types'

const backend = 'https://fixture.supabase.co'
const read = (path: string, extra: Record<string, unknown> = {}) => fixtureResponse({ method: 'GET', url: backend + path, ...extra })

describe('local redesign fixture', () => {
  it('maps literal trip rows through the production mapper', () => {
    const fixture = buildFixture()
    const trip = rowToTrip(fixture.trips[0], [])
    expect({ name: trip.name, dayCount: trip.days.length, titles: trip.days[0].stops.map(stop => stop.title) }).toEqual({
      name: 'Fixture Kerala Coast', dayCount: 3, titles: ['Market walk 1', 'Lake viewpoint 1'],
    })
    expect(fixture.profiles.map((profile: { name: string }) => profile.name)).toEqual(['Fixture Asha', 'Fixture Kabir'])
  })

  it('keeps three owned pricing states and a second creator', () => {
    const rows = buildFixture().published_itineraries
    expect(rows.map((row: { premium_price_inr: number | null; subscriber_cta: string | null }) => [row.premium_price_inr, row.subscriber_cta])).toEqual([
      [null, null], [499, null], [null, 'Subscribe for route notes'], [null, null], [null, null],
    ])
    expect(new Set(rows.map((row: { creator_id: string }) => row.creator_id)).size).toBe(2)
    expect(rows.map((row: { views: number; copies: number }) => [row.views, row.copies])).toEqual([[120, 12], [100, 10], [80, 8], [60, 6], [120, 12]])
  })

  it('returns isolated synthetic auth without an admin claim', () => {
    expect(buildSession().user).toEqual({
      id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated',
      email: '1@redesign-fixture.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-10-08T08:00:00Z',
    })
    expect(buildSession().access_token.endsWith('.synthetic-not-a-valid-signature')).toBe(true)
  })

  it('filters scoped membership reads', () => {
    expect(read('/rest/v1/trip_members?user_id=eq.00000000-0000-4000-8000-000000000002').body).toEqual([
      { trip_id: '00000000-0000-4000-8000-000000000104', user_id: '00000000-0000-4000-8000-000000000002', role: 'owner', joined_at: 1791446400000 },
    ])
    expect(read('/rest/v1/trips?id=in.(00000000-0000-4000-8000-000000000101)&limit=1').body.map((row: { name: string }) => row.name)).toEqual(['Fixture Kerala Coast'])
  })

  it.each(['POST', 'PATCH', 'DELETE', 'PUT'])('rejects %s writes', method => {
    expect(read('/rest/v1/trips', { method })).toEqual({ status: 405, body: { message: 'Fixture rejected mutation' }, rejected: true })
  })

  it('acknowledges only the synthetic session backfill inside its fixture', () => {
    const fixture = buildFixture()
    const path = `/rest/v1/create_funnel_events?session_id=eq.${ANALYTICS_SESSION_ID}&user_id=is.null`
    const options = { method: 'PATCH', body: { user_id: OWNER_ID }, fixture, currentUserId: OWNER_ID }
    expect(read(path, options)).toEqual({ status: 204, body: '', fixtureOperation: 'synthetic-analytics-backfill' })
    expect(fixture.create_funnel_events).toEqual([{
      id: '00000000-0000-4000-8000-000000000201', session_id: '00000000000000000000000000000101',
      user_id: '00000000-0000-4000-8000-000000000001', event: 'started',
    }])
    expect(read(path, options)).toEqual({ status: 204, body: '', fixtureOperation: 'synthetic-analytics-backfill' })
    expect(buildFixture().create_funnel_events[0].user_id).toBeNull()
  })

  it('acknowledges the public counter bump only for a real fixture publication', () => {
    const fixture = buildFixture()
    const publication = fixture.published_itineraries[0]
    const accepted = { status: 204, body: '', fixtureOperation: 'synthetic-pub-counter-bump' }
    expect(read('/rest/v1/rpc/bump_published_stats', {
      method: 'POST', fixture, body: { p_id: publication.id, p_kind: 'views', p_source: 'explore' },
    })).toEqual(accepted)
    expect(publication.views).toBe(121)
    expect(read('/rest/v1/rpc/bump_published_stats', {
      method: 'POST', fixture, body: { p_id: publication.id, p_kind: 'views', p_source: null },
    })).toEqual(accepted)
    expect(publication.views).toBe(122)
  })

  it('rejects the public counter bump outside its publication and kind', () => {
    const fixture = buildFixture()
    const publication = fixture.published_itineraries[0]
    const rejected = { status: 405, body: { message: 'Fixture rejected mutation' }, rejected: true }
    expect(read('/rest/v1/rpc/bump_published_stats', {
      method: 'POST', fixture, body: { p_id: 'no-such-publication', p_kind: 'views' },
    })).toEqual(rejected)
    expect(read('/rest/v1/rpc/bump_published_stats', {
      method: 'POST', fixture, body: { p_id: publication.id, p_kind: 'likes' },
    })).toEqual(rejected)
    expect(read('/rest/v1/rpc/bump_published_stats', {
      method: 'PATCH', fixture, body: { p_id: publication.id, p_kind: 'views' },
    })).toEqual(rejected)
  })

  it('rejects trip patches until their exact operation is modelled', () => {
    const fixture = buildFixture()
    const trip = fixture.trips[0]
    const before = structuredClone(trip)
    const rejected = { status: 405, body: { message: 'Fixture rejected mutation' }, rejected: true }
    for (const query of [`id=eq.${trip.id}`, `id=${trip.id}`, `id=eq.${trip.id}&owner_id=eq.foreign`]) {
      for (const currentUserId of [null, OWNER_ID, 'foreign-user']) {
        expect(read(`/rest/v1/trips?${query}`, { method: 'PATCH', fixture, currentUserId, body: { name: 'changed' } })).toEqual(rejected)
      }
    }
    expect(fixture.trips[0]).toEqual(before)
  })

  it('persists only the known owner trip invite code in fixture memory', () => {
    const fixture = buildFixture()
    const trip = fixture.trips[0]
    const options = { method: 'PATCH', fixture, currentUserId: OWNER_ID, body: { invite_code: 'FIXTUREKER-Q4LU' } }
    const path = `/rest/v1/trips?id=eq.${trip.id}`
    const rejected = { status: 405, body: { message: 'Fixture rejected mutation' }, rejected: true }
    for (const invalid of [
      { currentUserId: null }, { currentUserId: 'foreign-user' },
      { body: { invite_code: 'foreign' } }, { body: { invite_code: 'FIXTUREKER-Q4LU', name: 'changed' } },
      { body: ['FIXTUREKER-Q4LU'] },
    ]) expect(read(path, { ...options, ...invalid })).toEqual(rejected)
    for (const query of [`id=${trip.id}`, `id=eq.${trip.id}&id=eq.${trip.id}`, `id=eq.${trip.id}&extra=1`, 'id=eq.foreign']) {
      expect(read('/rest/v1/trips?' + query, options)).toEqual(rejected)
    }
    expect(read(`/rest/v1/trips?id=eq.${fixture.trips[3].id}`, options)).toEqual(rejected)
    expect(trip.invite_code).toBeUndefined()
    expect(read(path, options)).toEqual({ status: 204, body: '', fixtureOperation: 'synthetic-trip-invite-code' })
    expect(trip.invite_code).toBe('FIXTUREKER-Q4LU')
    expect(read(path, { fixture }).body[0].invite_code).toBe('FIXTUREKER-Q4LU')
    expect(buildFixture().trips[0].invite_code).toBeUndefined()
  })

  it('rejects malformed, archived, or unattributed counter operations without changing memory', () => {
    const fixture = buildFixture()
    const publication = fixture.published_itineraries[0]
    const before = structuredClone(fixture)
    const rejected = { status: 405, body: { message: 'Fixture rejected mutation' }, rejected: true }
    for (const body of [
      { p_id: publication.id, p_kind: 'views' },
      { p_id: publication.id, p_kind: 'views', p_source: 'foreign' },
      { p_id: publication.id, p_kind: 'views', p_source: null, extra: true },
      { p_id: 'fixture-publication-archived', p_kind: 'views', p_source: null },
      { p_id: publication.id, p_kind: 'copies', p_source: 'explore' },
    ]) expect(read('/rest/v1/rpc/bump_published_stats', { method: 'POST', fixture, body })).toEqual(rejected)
    expect(read('/rest/v1/rpc/bump_published_stats?extra=1', {
      method: 'POST', fixture, body: { p_id: publication.id, p_kind: 'views', p_source: null },
    })).toEqual(rejected)
    expect(fixture).toEqual(before)
  })

  it('rejects analytics writes outside the exact synthetic user and event scope', () => {
    const path = `/rest/v1/create_funnel_events?session_id=eq.${ANALYTICS_SESSION_ID}&user_id=is.null`
    const fixture = buildFixture()
    const options = { method: 'PATCH', body: { user_id: OWNER_ID }, fixture, currentUserId: OWNER_ID }
    const rejected = { status: 405, body: { message: 'Fixture rejected mutation' }, rejected: true }
    expect(read(path, { ...options, currentUserId: null })).toEqual(rejected)
    expect(read(path, { ...options, body: { user_id: 'foreign-user' } })).toEqual(rejected)
    expect(read(path, { ...options, body: { user_id: OWNER_ID, event: 'created' } })).toEqual(rejected)
    expect(read('/rest/v1/create_funnel_events?session_id=eq.foreign&user_id=is.null', options)).toEqual(rejected)
    expect(read(path + '&id=eq.foreign-event', options)).toEqual(rejected)
    expect(read(path.replace('user_id=is.null', 'user_id=not.is.null'), options)).toEqual(rejected)
    expect(read(path, { ...options, fixture: { create_funnel_events: [{ id: ANALYTICS_EVENT_ID, session_id: 'foreign' }] } })).toEqual(rejected)
    expect(read(path, { ...options, method: 'POST' })).toEqual(rejected)
    expect(fixture.create_funnel_events[0].user_id).toBeNull()
  })

  it('rejects auth refresh, storage writes and counter RPCs', () => {
    for (const path of ['/auth/v1/token', '/storage/v1/object/covers/example', '/rest/v1/rpc/bump_published_stats']) {
      expect(read(path, { method: 'POST' })).toEqual({ status: 405, body: { message: 'Fixture rejected mutation' }, rejected: true })
    }
    expect(read('/rest/v1/rpc/get_creator_sales', { method: 'POST' })).toEqual({ status: 200, body: [] })
    expect(read('/rest/v1/unknown')).toEqual({ status: 501, body: { message: 'Unknown fixture read' }, unexpected: true })
  })

  it('supplies past, undated, empty-day and viewer-cover cases', () => {
    const fixture = buildFixture()
    expect(fixture.trips.slice(4).map((row: { name: string; start_date: string; days: unknown[] }) => [row.name, row.start_date, row.days.length])).toEqual([
      ['Fixture Past Journey', '2026-09-01', 3],
      ['Fixture Undated Journey', '', 3],
      ['Fixture Long Name Journey Across The Western Ghats With Friends And Family', '2026-10-12', 0],
      ['Fixture Coverless Journey', '2026-10-12', 3],
    ])
    // The owner trip with no stored photo is the positive control for the
    // owner-only cover action. The viewer trip with no stored photo is its
    // negative control. The default compass emoji never counts as a cover.
    const ownerless = fixture.trips.find((row: { id: string }) => row.id === 'fixture-coverless-trip')
    expect(ownerless.cover_image_url).toEqual('')
    expect(ownerless.cover_emoji).toEqual('🧭')
    expect(fixture.trips[3].cover_image_url).toEqual('')
    expect(fixture.trip_members.at(-1)).toEqual({ trip_id: '00000000-0000-4000-8000-000000000104', user_id: '00000000-0000-4000-8000-000000000001', role: 'viewer', joined_at: 1791446400000 })
    expect(buildFixture('past-only').trips.map((row: { start_date: string }) => row.start_date)).toEqual(['2026-09-01', '2026-09-01', '2026-09-01', '2026-09-01', '2026-09-01', '2026-09-01', '2026-09-01', '2026-09-01'])
  })

  it('keeps duplicate creator names in stable ID order through the production selector', () => {
    const fixture = buildFixture('duplicate-names')
    const users: User[] = fixture.profiles.map((row: { id: string; email: string; name: string }) => ({
      id: row.id, email: row.email, createdAt: 0, profile: { name: row.name, languages: ['en'], travelStyles: ['balanced'], isCreator: true },
    }))
    const pubs: PublishedItinerary[] = users.map(user => ({
      id: user.id, tripId: 'fixture-trip', creatorId: user.id, title: 'Fixture equal evidence', tagline: '',
      routeSummary: [], durationDays: 3, estimatedBudgetPerPersonInr: 12000, travelStyle: 'balanced',
      travelTips: [], warningsAndAssumptions: [], freeDayIndexes: [0], publishedAt: 0, views: 25, copies: 1,
    }))
    expect(featuredCreators([...users].reverse(), pubs).map(rank => rank.user.id)).toEqual([
      '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002',
    ])
  })

  it('gives the equal-creators scenario identical names and identical evidence', () => {
    const fixture = buildFixture('equal-creators')
    const names = fixture.profiles.map((row: { name: string }) => row.name)
    expect(new Set(names).size).toBe(1)
    const evidence = fixture.published_itineraries.map((row: { views: number; copies: number }) => `${row.views}/${row.copies}`)
    expect(new Set(evidence).size).toBe(1)
    // The production selector must still order them by ID, not by arrival.
    const users: User[] = fixture.profiles.map((row: { id: string; email: string; name: string }) => ({
      id: row.id, email: row.email, createdAt: 0, profile: { name: row.name, languages: ['en'], travelStyles: ['balanced'], isCreator: true },
    }))
    const pubs: PublishedItinerary[] = users.map((user, index) => ({
      id: `pub-${index === 0 ? 'z' : 'a'}`, tripId: 'fixture-trip', creatorId: user.id, title: 'Equal', tagline: '',
      routeSummary: [], durationDays: 3, estimatedBudgetPerPersonInr: 12000, travelStyle: 'balanced',
      travelTips: [], warningsAndAssumptions: [], freeDayIndexes: [0], publishedAt: 0, views: 25, copies: 1,
    }))
    expect(featuredCreators([...users].reverse(), pubs).map(rank => rank.user.id)).toEqual([
      '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002',
    ])
  })

  it('reduces the sparse scenario to one live publication and one creator', () => {
    const sparse = buildFixture('sparse')
    expect(sparse.published_itineraries.length).toBe(1)
    expect(new Set(sparse.published_itineraries.map((row: { creator_id: string }) => row.creator_id)).size).toBe(1)
    expect(sparse.profiles.length).toBe(1)
    // Membership rows for the removed creator must not survive and claim access.
    const kept = sparse.published_itineraries[0].creator_id
    expect(sparse.trip_members.every((row: { user_id: string }) => row.user_id === kept)).toBe(true)
    expect(buildFixture().published_itineraries.length).toBeGreaterThan(1)
  })

  it('gives each publication its own cover identity for route-matched reference captures', () => {
    const publications = buildFixture().published_itineraries
    expect(new Set(publications.map(row => row.cover_image_url)).size).toBe(publications.length)
  })

  it('ties actual aggregate creator evidence in the equal-creators scenario', () => {
    const fixture = buildFixture('equal-creators')
    const evidence = fixture.profiles.map(user => {
      const live = fixture.published_itineraries.filter(row => !row.unpublished_at && row.creator_id === user.id)
      return { count: live.length, views: live.reduce((sum, row) => sum + row.views, 0), copies: live.reduce((sum, row) => sum + row.copies, 0) }
    })
    expect(evidence[0]).toEqual(evidence[1])
    expect(evidence[0].count).toBeGreaterThan(0)
  })

  it('fills the many-publications scenario past one page', () => {
    const many = buildFixture('many-publications')
    expect(many.published_itineraries.length).toBeGreaterThan(12)
    expect(new Set(many.published_itineraries.map((row: { id: string }) => row.id)).size).toBe(many.published_itineraries.length)
    // Every extra row must carry real evidence, or the featured selector would
    // pick a zero-evidence row and print a "0 forks" credibility line.
    expect(many.published_itineraries.every((row: { copies: number; views: number }) => row.copies >= 1 || row.views >= 25)).toBe(true)
  })

  it('gives each publication its own cover in editor-cover and none in missing-cover', () => {
    const editor = buildFixture('editor-cover')
    const covers = editor.published_itineraries.map((row: { cover_image_url: string }) => row.cover_image_url)
    expect(new Set(covers).size).toBe(covers.length)
    expect(covers.every(Boolean)).toBe(true)
    const missing = buildFixture('missing-cover')
    expect(missing.published_itineraries.every((row: { cover_image_url: string }) => !row.cover_image_url)).toBe(true)
    expect(missing.trips.every((row: { cover_image_url: string }) => !row.cover_image_url)).toBe(true)
    expect(missing.published_itineraries.every((row: { route_summary: string[] }) => row.route_summary.length > 0)).toBe(true)
  })

  it('points the broken-cover scenario at a host the harness cannot serve', () => {
    const broken = buildFixture('broken-cover')
    expect(broken.published_itineraries.every((row: { cover_image_url: string }) => row.cover_image_url === 'https://redesign-fixture-broken.invalid/cover.svg')).toBe(true)
    expect(broken.trips.every((row: { cover_image_url: string }) => row.cover_image_url === 'https://redesign-fixture-broken.invalid/cover.svg')).toBe(true)
  })

  // Removing a scope, schema, identity, or stage guard must fail these checks.
  function forkRequest(fixture: ReturnType<typeof buildFixture>) {
    const source = fixture.trips[3]
    const { created_at: _created, updated_at: _updated, ...fields } = structuredClone(source)
    return {
      ...fields, id: SYNTHETIC_FORK_ID, owner_id: OWNER_ID, name: 'Fixture Himalayan Paths (copy)',
      visibility: 'private', ref: 'explore',
      days: source.days.map((day, index) => ({
        ...structuredClone(day), id: `day_${String(index + 1).padStart(12, '0')}`,
        stops: day.stops.map((stop, stopIndex) => ({
          ...structuredClone(stop), id: `st_${String(index * 2 + stopIndex + 1).padStart(12, '0')}`,
        })),
      })),
      fuel_economy_km_per_l: null, fuel_price_per_l: null, round_trip: null,
      invite_code: null, deleted_at: null, stay_style: null, driver_count: null,
      has_vulnerable: false, drive_after_dinner_min: null, vehicle_profile: null,
      tank_l: null, rent_per_day_inr: null, local_train: null,
    }
  }

  const forkMember = () => [{ trip_id: SYNTHETIC_FORK_ID, user_id: OWNER_ID, role: 'owner', joined_at: FIXTURE_NOW }]
  const memberPath = '/rest/v1/trip_members?columns=%22trip_id%22,%22user_id%22,%22role%22,%22joined_at%22'
  const rejectedWrite = { status: 405, body: { message: 'Fixture rejected mutation' }, rejected: true }

  it('persists the reserved free fork, owner membership, and one attributed copy in memory', () => {
    const fixture = buildFixture()
    reserveFixtureFork(fixture)
    const options = { method: 'POST', fixture, currentUserId: OWNER_ID }
    const request = forkRequest(fixture)
    expect(read('/rest/v1/trips', { ...options, body: request })).toEqual({ status: 201, body: '', fixtureOperation: 'synthetic-fork-trip' })
    expect(read(memberPath, { ...options, body: forkMember() })).toEqual({ status: 201, body: '', fixtureOperation: 'synthetic-fork-member' })
    expect(read('/rest/v1/rpc/bump_published_stats', { ...options,
      body: { p_id: 'fixture-publication-4', p_kind: 'copies', p_source: 'explore' },
    })).toEqual({ status: 204, body: '', fixtureOperation: 'synthetic-fork-counter' })
    expect(read(`/rest/v1/trips?id=eq.${SYNTHETIC_FORK_ID}`, { fixture }).body).toEqual([
      { ...request, created_at: FIXTURE_NOW, updated_at: FIXTURE_NOW },
    ])
    expect(read(`/rest/v1/trip_members?trip_id=eq.${SYNTHETIC_FORK_ID}`, { fixture }).body).toEqual(forkMember())
    expect(fixture.published_itineraries[3].copies).toBe(7)
    request.days[0].stops[0].title = 'Changed after insert'
    expect(fixture.trips.at(-1).days[0].stops[0].title).toBe('Market walk 1')
    expect(buildFixture().trips.some(row => row.id === SYNTHETIC_FORK_ID)).toBe(false)
  })

  it('rejects unreserved, foreign, malformed, or repeated fork trip inserts', () => {
    const fixture = buildFixture()
    const request = forkRequest(fixture)
    const options = { method: 'POST', fixture, currentUserId: OWNER_ID, body: request }
    expect(read('/rest/v1/trips', options)).toEqual(rejectedWrite)
    reserveFixtureFork(fixture)
    const before = structuredClone(fixture)
    for (const invalid of [
      { currentUserId: null }, { currentUserId: 'foreign-user' },
      { body: { ...request, id: 'foreign-trip' } }, { body: { ...request, owner_id: 'foreign-user' } },
      { body: { ...request, visibility: 'public' } }, { body: { ...request, ref: null } },
      { body: { ...request, invite_code: 'foreign' } }, { body: { ...request, deleted_at: '2026-10-08' } },
      { body: { ...request, extra: true } }, { body: { ...request, destinations: ['Foreign destination'] } },
      { body: { ...request, days: [] } }, { body: [request] },
      { body: { ...request, days: [{ ...request.days[0], id: fixture.trips[3].days[0].id }, ...request.days.slice(1)] } },
      { body: { ...request, days: request.days.map(day => ({ ...day, id: request.days[0].id })) } },
      { body: { ...request, days: request.days.map(day => ({
        ...day, stops: day.stops.map(stop => ({ ...stop, title: 'Foreign stop' })),
      })) } },
    ]) expect(read('/rest/v1/trips', { ...options, ...invalid })).toEqual(rejectedWrite)
    for (const key of Object.keys(request)) {
      const missing = { ...request }; delete missing[key]
      expect(read('/rest/v1/trips', { ...options, body: missing }), key).toEqual(rejectedWrite)
    }
    expect(read('/rest/v1/trips?extra=1', options)).toEqual(rejectedWrite)
    expect(fixture).toEqual(before)
    read('/rest/v1/trips', options)
    const inserted = structuredClone(fixture)
    expect(read('/rest/v1/trips', options)).toEqual(rejectedWrite)
    expect(fixture).toEqual(inserted)
  })

  it('rejects owner membership outside the inserted fork and exact request schema', () => {
    const fixture = buildFixture(); reserveFixtureFork(fixture)
    const options = { method: 'POST', fixture, currentUserId: OWNER_ID, body: forkMember() }
    expect(read(memberPath, options)).toEqual(rejectedWrite)
    read('/rest/v1/trips', { ...options, body: forkRequest(fixture) })
    const before = structuredClone(fixture)
    for (const invalid of [
      { currentUserId: null }, { currentUserId: 'foreign-user' },
      { body: [{ ...forkMember()[0], user_id: 'foreign-user' }] },
      { body: [{ ...forkMember()[0], trip_id: fixture.trips[0].id }] },
      { body: [{ ...forkMember()[0], role: 'editor' }] },
      { body: [{ ...forkMember()[0], joined_at: FIXTURE_NOW + 1 }] },
      { body: [{ ...forkMember()[0], extra: true }] }, { body: forkMember()[0] },
      { body: [...forkMember(), ...forkMember()] }, { body: [] },
    ]) expect(read(memberPath, { ...options, ...invalid })).toEqual(rejectedWrite)
    expect(read(memberPath + '&extra=1', options)).toEqual(rejectedWrite)
    expect(fixture).toEqual(before)
    read(memberPath, options)
    expect(read(memberPath, options)).toEqual(rejectedWrite)
  })

  it('rejects fork counters before both inserts and outside the reserved publication', () => {
    const fixture = buildFixture(); reserveFixtureFork(fixture)
    const path = '/rest/v1/rpc/bump_published_stats'
    const options = { method: 'POST', fixture, currentUserId: OWNER_ID,
      body: { p_id: 'fixture-publication-4', p_kind: 'copies', p_source: 'explore' } }
    expect(read(path, options)).toEqual(rejectedWrite)
    read('/rest/v1/trips', { ...options, body: forkRequest(fixture) })
    expect(read(path, options)).toEqual(rejectedWrite)
    read(memberPath, { ...options, body: forkMember() })
    const before = structuredClone(fixture)
    for (const invalid of [
      { currentUserId: null }, { currentUserId: 'foreign-user' },
      { body: { ...options.body, p_id: 'fixture-publication-1' } },
      { body: { ...options.body, p_id: 'fixture-publication-archived' } },
      { body: { ...options.body, p_source: null } }, { body: { ...options.body, extra: true } },
    ]) expect(read(path, { ...options, ...invalid })).toEqual(rejectedWrite)
    expect(read(path + '?extra=1', options)).toEqual(rejectedWrite)
    expect(fixture).toEqual(before)
    read(path, options)
    const count = fixture.published_itineraries[3].copies
    expect(read(path, options)).toEqual(rejectedWrite)
    expect(fixture.published_itineraries[3].copies).toBe(count)
  })

  it('includes an exact sorting tie across all catalog metrics in the many-publications fixture', () => {
    const fixture = buildFixture('many-publications')
    const rows = fixture.published_itineraries.filter(row => row.id.startsWith('fixture-publication-extra-')).slice(0, 2)
    expect(rows).toHaveLength(2)
    for (const key of ['views', 'copies', 'published_at', 'estimated_budget_per_person_inr', 'duration_days', 'unpublished_at']) {
      expect(rows[0][key], key).toEqual(rows[1][key])
    }
    expect(rows[0].id).not.toBe(rows[1].id)
  })

  it('keeps empty and error reads separate', () => {
    expect(read('/rest/v1/published_itineraries', { state: 'empty' })).toEqual({ status: 200, body: [] })
    expect(read('/rest/v1/published_itineraries', { state: 'error' })).toEqual({ status: 503, body: { message: 'Synthetic read failure' } })
  })
})

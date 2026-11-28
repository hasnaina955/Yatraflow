import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { hashClaimToken, generateClaimToken, isValidTokenFormat } from '../api/_auth.js'
import { normalizeSeedTrip } from '../api/_creatorClaimTrip.js'
import admin from '../api/admin-creator-claims.js'
import claim from '../api/creator-claim.js'
import { authNext } from '../src/lib/authNext'
import { parseTripImport } from '../src/lib/tripImport'
import { tripToRow } from '../src/lib/tripRow'

const fetchMock = vi.fn<typeof fetch>()
const ENV = {
  SUPABASE_URL: 'https://database.example.test/',
  SUPABASE_ANON_KEY: 'public-key',
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_example',
  PUBLIC_ORIGIN: 'https://app.example.test',
}
const adminId = '10000000-0000-4000-8000-000000000001'
const shadowId = '10000000-0000-4000-8000-000000000002'
const claimId = '10000000-0000-4000-8000-000000000003'
const tripId = '10000000-0000-4000-8000-000000000004'
const claimerId = '10000000-0000-4000-8000-000000000005'
const token = 'a'.repeat(64)
const adminUser = { id: adminId, app_metadata: { role: 'masteradmin' } }
const auth = { authorization: 'Bearer session-token' }

function makeRes() {
  return {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: '',
    setHeader(key: string, value: string) { this.headers[key.toLowerCase()] = value },
    status(code: number) { this.statusCode = code; return this },
    send(body: string) { this.body = body; return this },
    end() { return this },
  }
}
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status })
}
function parsedTrip() {
  return parseTripImport(JSON.stringify({
    name: 'Weekend', startLocation: 'Panaji', startLocationCoords: { lat: 15.5, lng: 73.9 },
    destinations: ['Palolem'], destinationCoords: [{ lat: 15.01, lng: 74.02 }],
    startDate: '2026-12-10', endDate: '2026-12-10', travellers: 3,
    transportMode: 'mixed', drivesPart: false, roundTrip: true,
    travelStyle: 'balanced', stayStyle: 'comfort', budgetPerPersonInr: 5000,
    driverCount: 2, hasVulnerable: true, driveAfterDinnerMin: 60,
    fuelEconomyKmL: 15, fuelPricePerL: 95, tankL: 45, rentPerDayInr: 800, localTrain: true,
    vehicleProfile: { vehicleType: 'car', fuelType: 'diesel', capacity: 45, economy: 14 },
    coverEmoji: '🧭', coverImageUrl: 'https://images.example.test/cover.jpg',
    flights: [{ id: 'f1', dayIndex: 0, fromAirport: 'BOM', toAirport: 'GOI', flightNumber: 'AB123', bookingRef: 'REF' }],
    fixedCommitments: [{ id: 'c', title: 'Ferry', dayIndex: 0, time: '08:00' }],
    expenses: [{ id: 'e', label: 'Lunch', category: 'food', amountInr: 500 }],
    days: [{ id: 'd', index: 0, stops: [{
      id: 's1', title: 'Fort', category: 'sightseeing', status: 'confirmed', priority: 'must-do',
      locationName: 'Fort', lat: 15.5, lng: 73.9, visitMinutes: 60, entryFeeInrPerPerson: 0,
      transportCostInrTotal: 0, orderInDay: 1, notes: 'Example private note',
    }] }],
  })).trip
}
const claimInput = () => ({
  name: 'Creator Name', homeCity: 'Panaji', creatorBio: 'Creator profile', outreachNote: 'Contact note',
  avatarUrl: 'https://images.example.test/avatar.jpg',
  socialLinks: { youtube: 'https://youtube.com/example' }, expiresDays: 30,
  trips: [parsedTrip()],
})

beforeEach(() => {
  for (const [key, value] of Object.entries(ENV)) vi.stubEnv(key, value)
  fetchMock.mockReset()
  fetchMock.mockRejectedValue(new Error('Unexpected fetch'))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('claim token format', () => {
  it('uses the whole token as a lowercase hex fragment and hashes it', () => {
    const raw = generateClaimToken()
    expect(isValidTokenFormat(raw)).toBe(true)
    expect(raw).toMatch(/^[0-9a-f]{64}$/)
    expect(hashClaimToken(raw)).toMatch(/^[0-9a-f]{64}$/)
    expect(hashClaimToken(raw)).not.toBe(raw)
    expect(hashClaimToken(raw)).toBe(hashClaimToken(raw))
    expect(authNext('/claim')).toBe('/claim')
  })
  it('rejects malformed tokens', () => {
    for (const value of [undefined, '', 'a'.repeat(63), 'A'.repeat(64), ['a'.repeat(64)]]) {
      expect(isValidTokenFormat(value)).toBe(false)
    }
  })
})

describe('seed trip mapping', () => {
  it('preserves the app content columns and leaves identity and access to the database', () => {
    const trip = parsedTrip()
    const expected = tripToRow(trip, shadowId, {
      economy: true, price: true, roundTrip: true, cover: true, inviteCode: true, deleted: true,
      stayStyle: true, driverCount: true, hasVulnerable: true, driveAfterDinner: true, vehicleProfile: true,
      tankL: true, rentPerDayInr: true, localTrain: true, drivesPart: true, flights: true, ref: true, growth: true,
    })
    const { id, owner_id, visibility, invite_code, deleted_at, ref, creation_kind, source_pub_id, campaign_id, ...content } = expected
    void id; void owner_id; void visibility; void invite_code; void deleted_at; void ref; void creation_kind; void source_pub_id; void campaign_id
    expect(normalizeSeedTrip(trip)).toEqual(content)
  })

  it('accepts the repository itinerary examples after they pass the same parser', () => {
    const folder = 'docs/examples/itineraries'
    const names = readdirSync(folder).filter(file => file.endsWith('.json'))
    expect(names.length).toBeGreaterThan(0)
    for (const name of names) {
      const { trip } = parseTripImport(readFileSync(join(folder, name), 'utf8'))
      expect(() => normalizeSeedTrip(trip), name).not.toThrow()
    }
  })
})

describe('admin creator claims', () => {
  it('validates the user role before any write', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: claimerId, app_metadata: {} }))
    const res = makeRes()
    await admin({ method: 'POST', headers: auth, body: claimInput() }, res)
    expect(res.statusCode).toBe(403)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not make a shadow account for an invalid trip', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(adminUser))
      .mockResolvedValueOnce(jsonResponse([{ is_disabled: false }]))
    const res = makeRes()
    await admin({ method: 'POST', headers: auth, body: { name: 'Creator', trips: [{ name: 'Incomplete' }] } }, res)
    expect(res.statusCode).toBe(400)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('seeds a neutral shadow account, sends content rows and returns a canonical link', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(adminUser))
      .mockResolvedValueOnce(jsonResponse([{ is_disabled: false }]))
      .mockResolvedValueOnce(jsonResponse({ id: shadowId }))
      .mockResolvedValueOnce(jsonResponse([{ claim_id: claimId, trip_ids: [tripId] }]))
    const data = claimInput()
    const res = makeRes()
    await admin({ method: 'POST', headers: { ...auth, host: 'preview.example.test' }, body: data }, res)
    expect(res.statusCode).toBe(201)
    const result = JSON.parse(res.body)
    expect(result.claimId).toBe(claimId)
    expect(result.tripIds).toEqual([tripId])
    expect(result.claimUrl).toBe(ENV.PUBLIC_ORIGIN + result.claimPath)
    const account = JSON.parse(String(fetchMock.mock.calls[2][1]?.body))
    expect(account.user_metadata).toEqual({ name: 'Unclaimed creator' })
    expect(account.email).toMatch(/^unclaimed\+.+@internal\.yatraflow\.invalid$/)
    expect(account.email_confirm).toBe(false)
    expect(fetchMock.mock.calls[2][1]?.headers).toMatchObject({ apikey: ENV.SUPABASE_SERVICE_ROLE_KEY })
    expect(fetchMock.mock.calls[2][1]?.headers).not.toHaveProperty('authorization')
    const row = JSON.parse(String(fetchMock.mock.calls[3][1]?.body))
    expect(row.p_shadow_profile_id).toBe(shadowId)
    expect(row.p_target_name).toBe(data.name)
    expect(row.p_trips).toEqual(data.trips.map(normalizeSeedTrip))
    expect(row.p_token_hash).toBe(hashClaimToken(result.claimPath.slice('/claim#'.length)))
    expect(String(fetchMock.mock.calls[3][1]?.body)).not.toContain(result.claimPath)
    expect(fetchMock.mock.calls[3][1]?.headers).toMatchObject(auth)
    expect(res.headers['cache-control']).toContain('no-store')
  })

  it('cleans up after a confirmed database refusal', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(adminUser))
      .mockResolvedValueOnce(jsonResponse([{ is_disabled: false }]))
      .mockResolvedValueOnce(jsonResponse({ id: shadowId }))
      .mockResolvedValueOnce(jsonResponse({ code: '42501', message: 'masteradmin role needed' }, 403))
      .mockResolvedValueOnce(jsonResponse({}))
    const res = makeRes()
    await admin({ method: 'POST', headers: auth, body: claimInput() }, res)
    expect(res.statusCode).toBe(403)
    expect(fetchMock.mock.calls[4][0]).toBe('https://database.example.test/auth/v1/admin/users/' + shadowId)
    expect(fetchMock.mock.calls[4][1]?.method).toBe('DELETE')
  })

  it('does not delete the account when the write outcome is unknown', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(adminUser))
      .mockResolvedValueOnce(jsonResponse([{ is_disabled: false }]))
      .mockResolvedValueOnce(jsonResponse({ id: shadowId }))
      .mockRejectedValueOnce(new Error('Response lost'))
    const res = makeRes()
    await admin({ method: 'POST', headers: auth, body: claimInput() }, res)
    expect(res.statusCode).toBe(503)
    expect(res.body).toContain('could not confirm')
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('revokes with the single admin RPC', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(adminUser))
      .mockResolvedValueOnce(jsonResponse([{ is_disabled: false }]))
      .mockResolvedValueOnce(jsonResponse({ claim_id: claimId, status: 'revoked' }))
    const res = makeRes()
    await admin({ method: 'DELETE', headers: auth, query: { id: claimId } }, res)
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ revoked: true })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[2][0]).toBe('https://database.example.test/rest/v1/rpc/admin_revoke_creator_claim')
    expect(fetchMock.mock.calls[2][1]?.headers).toMatchObject(auth)
  })

  it('lists claim records without the hash', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(adminUser))
      .mockResolvedValueOnce(jsonResponse([{ is_disabled: false }]))
      .mockResolvedValueOnce(jsonResponse([{ id: claimId, target_name: 'Creator', status: 'unclaimed', expires_at: '2000-01-01', created_at: '1999-01-01', token_hash: 'private' }]))
    const res = makeRes()
    await admin({ method: 'GET', headers: auth }, res)
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)[0].status).toBe('expired')
    expect(res.body).not.toContain('token_hash')
    expect(String(fetchMock.mock.calls[2][0])).not.toContain('token_hash')
  })
  it.each(['POST', 'GET', 'DELETE'])('refuses a disabled admin before %s dispatch', async method => {
    fetchMock.mockResolvedValueOnce(jsonResponse(adminUser)).mockResolvedValueOnce(jsonResponse([{ is_disabled: true }]))
    const res = makeRes()
    await admin({ method, headers: auth, query: { id: claimId }, body: claimInput() }, res)
    expect(res.statusCode).toBe(403)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
  it('refuses an admin with a missing profile row before creating a shadow account', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(adminUser)).mockResolvedValueOnce(jsonResponse([]))
    const res = makeRes()
    await admin({ method: 'POST', headers: auth, body: claimInput() }, res)
    expect(res.statusCode).toBe(403)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
  it('returns 503 when the admin profile check fails', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(adminUser)).mockResolvedValueOnce(jsonResponse({}, 500))
    const res = makeRes()
    await admin({ method: 'GET', headers: auth }, res)
    expect(res.statusCode).toBe(503)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('read-only claim preview', () => {
  it('maps the approved preview fields without forwarding private trip fields', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      found: true, status: 'unclaimed', expires_at: '2027-01-01', creator: { name: 'Creator' },
      trips: [{ id: tripId, name: 'Trip', destinations: ['Goa'], days: [{ index: 0, stops: [{ title: 'Fort', notes: 'Private' }] }], expenses: [] }],
    }))
    const res = makeRes()
    await claim({ method: 'POST', body: { action: 'preview', token } }, res)
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).trips[0].days[0].stops[0].title).toBe('Fort')
    expect(res.body).not.toContain('notes')
    expect(res.body).not.toContain('expenses')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).not.toContain(token)
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ p_token_hash: hashClaimToken(token) })
    expect(res.headers['x-robots-tag']).toBe('noindex, nofollow, noarchive')
  })

  it.each(['claimed', 'revoked', 'expired'])('keeps %s terminal state with no profile or trips', async status => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ found: true, status, creator: { name: 'Creator' }, trips: [] }))
    const res = makeRes()
    await claim({ method: 'POST', body: { action: 'preview', token } }, res)
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ found: true, status })
  })
  it('reports a service failure rather than an invalid link for an invalid response', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ found: true, status: 'unclaimed' }))
    const res = makeRes()
    await claim({ method: 'POST', body: { action: 'preview', token } }, res)
    expect(res.statusCode).toBe(503)
  })
})

describe('redeem creator claim', () => {
  it('requires a session and takes the account identity only from Auth', async () => {
    const denied = makeRes()
    await claim({ method: 'POST', body: { action: 'redeem', token }, headers: {} }, denied)
    expect(denied.statusCode).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()

    fetchMock.mockResolvedValueOnce(jsonResponse({ id: claimerId }))
      .mockResolvedValueOnce(jsonResponse({ claim_id: claimId, claimer_id: claimerId, shadow_profile_id: shadowId, moved_trip_ids: [tripId] }))
    const res = makeRes()
    await claim({ method: 'POST', body: { action: 'redeem', token }, headers: auth }, res)
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ ok: true, claimerId, movedTripIds: [tripId] })
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      p_token_hash: hashClaimToken(token), p_claimer_id: claimerId,
    })
    // No cleanup call after a successful transfer. The transaction owns it.
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
  it.each([
    ['claim_already_redeemed', 409], ['claim_expired', 410], ['claim_revoked', 410], ['claim_not_found', 404],
    ['claimer_ineligible', 403], ['paid_publication_requires_manual_review:' + tripId, 409],
  ])('preserves the typed result for %s', async (message, status) => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: claimerId }))
      .mockResolvedValueOnce(jsonResponse({ message, code: 'P0001' }, 400))
    const res = makeRes()
    await claim({ method: 'POST', body: { action: 'redeem', token }, headers: auth }, res)
    expect(res.statusCode).toBe(status)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
  it('reports upstream Auth failure distinctly from an invalid session', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 503))
    const res = makeRes()
    await claim({ method: 'POST', body: { action: 'redeem', token }, headers: auth }, res)
    expect(res.statusCode).toBe(503)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('claim OG', () => {
  it('serves the same neutral no-store card without reading the backend', () => {
    const a = makeRes(), b = makeRes()
    claim({ method: 'GET', query: { og: '1', token }, headers: { host: 'preview.example.test' } }, a)
    claim({ method: 'GET', query: { og: '1', token: 'b'.repeat(64) } }, b)
    expect(a.statusCode).toBe(200)
    expect(a.body).toBe(b.body)
    expect(a.body).toContain('og:title')
    expect(a.body).toContain(ENV.PUBLIC_ORIGIN + '/og/creator-claim-invite.png')
    expect(a.body).not.toContain(token)
    expect(a.headers['cache-control']).toContain('no-store')
    expect(a.headers['referrer-policy']).toBe('no-referrer')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('claim endpoint routing', () => {
  it('fits the function limit', () => {
    expect(readdirSync('api').filter(name => name.endsWith('.js') && !name.startsWith('_')).length).toBeLessThanOrEqual(12)
  })
  it('rejects unknown actions and non-card GET requests', async () => {
    const unknown = makeRes(), get = makeRes()
    await claim({ method: 'POST', body: { action: 'other' } }, unknown)
    await claim({ method: 'GET' }, get)
    expect(unknown.statusCode).toBe(400)
    expect(get.statusCode).toBe(405)
    expect(get.headers.allow).toBe('GET, HEAD, POST')
  })
  it('blocks admin accounts before the transfer', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(adminUser))
    const res = makeRes()
    await claim({ method: 'POST', headers: auth, body: { action: 'redeem', token } }, res)
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).code).toBe('invalid_claimer')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

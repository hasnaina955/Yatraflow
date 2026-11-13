// Ticket 09 AC5: the Google point-search path must forward `families` and
// `purposes` like the along-route path already does. Without this, a family
// request reaches the facade and is silently dropped whenever the road
// geometry is missing or the route collapses to point scans.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { queriesForFamily, queriesForPurpose } from '../src/lib/purposeQueries'

vi.hoisted(() => {
  vi.stubEnv('VITE_MAPPLS_KEY', '')
})

const { searchNearbyPoisMulti } = await import('../src/lib/geocode')

const A = { lat: 10, lng: 76 }
const B = { lat: 10.1, lng: 76.05 }

const captured: Array<Record<string, unknown>> = []

beforeEach(() => {
  captured.length = 0
  vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key')
  vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    captured.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>)
    return { ok: true, json: async () => ({ places: [] }) } as Response
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('Google point scan forwards families and purposes', () => {
  it('multi-anchor degraded scan asks each requested family query once', async () => {
    await searchNearbyPoisMulti([A, B], 10000, 16, {})
    const baseline = [...captured]
    captured.length = 0
    await searchNearbyPoisMulti([A, B], 10000, 16, { families: ['nature'] })
    const nature = queriesForFamily('nature').googleQueries
    const bodies = captured.filter(b => b.locationBias)
    // The point scan runs its full set per anchor: baseline statics, then the
    // family queries, anchor by anchor — twice here, never duplicated within
    // one anchor's scan.
    const statics = baseline.slice(0, 3).map(b => b.textQuery)
    expect(bodies.map(b => b.textQuery)).toEqual([...statics, ...nature, ...statics, ...nature])
    for (const q of nature) expect(bodies.filter(b => b.textQuery === q)).toHaveLength(2)
  })

  it('single-anchor scan forwards purposes and families to the provider', async () => {
    await searchNearbyPoisMulti([A], 10000, 16, {
      purposes: ['meal'], families: ['nature', 'faith'],
    })
    const meal = queriesForPurpose('meal').googleQueries
    const family = [
      ...queriesForFamily('nature').googleQueries,
      ...queriesForFamily('faith').googleQueries,
    ]
    expect(captured.map(b => b.textQuery)).toEqual([...meal, ...family])
  })
})

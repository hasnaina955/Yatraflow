// Ticket 09 AC5 runtime proof: the route-scoped corridor scan makes one
// family query per family (cached — a cache hit makes zero new calls), and a
// failed scan stays distinct from an empty one.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { queriesForFamily } from '../src/lib/purposeQueries'

vi.hoisted(() => {
  vi.stubEnv('VITE_MAPPLS_KEY', '')
})

const { planJourneyHalts, deriveDrivingPlan } = await import('../src/lib/geocode')

const ANCHORS = [
  { lat: 10, lng: 76 },
  { lat: 10.4, lng: 76.5 },
  { lat: 10.8, lng: 77 },
]
const ROUTE: [number, number][] = [[76, 10], [76.25, 10.2], [76.5, 10.4], [76.75, 10.6], [77, 10.8]]

const captured: Array<Record<string, unknown>> = []

beforeEach(() => {
  captured.length = 0
  vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key')
  vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    captured.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>)
    return { ok: true, json: async () => ({ places: [] }) } as Response
  }))
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

function scanCalls(): Array<Record<string, unknown>> {
  return captured.filter(b => b.textQuery != null)
}

const plan = deriveDrivingPlan({ totalKm: 120, driveMinutes: 180 })

describe('route-scoped corridor scan', () => {
  it('makes exactly one family query per family per scan', async () => {
    await planJourneyHalts(ANCHORS, 120, 180, {
      transportMode: 'car', travellers: 2, travelStyle: 'relaxed',
      routeCoords: ROUTE, purposes: ['meal'], families: ['nature', 'faith', 'culture'], plan,
    })
    const families = ['nature', 'faith', 'culture'] as const
    const wanted = families.flatMap(f => queriesForFamily(f).googleQueries)
    const asked = scanCalls().map(b => b.textQuery)
    for (const q of wanted) expect(asked.filter(t => t === q)).toHaveLength(1)
  })

  it('a failed scan rejects instead of inventing empty rows', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network down')
    }))
    await expect(planJourneyHalts(ANCHORS, 120, 180, {
      transportMode: 'car', travellers: 2, travelStyle: 'relaxed',
      routeCoords: ROUTE, rejectOnFailure: true, families: ['nature'], plan,
    })).rejects.toThrow('network down')
  })
})

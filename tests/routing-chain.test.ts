// ============ The routing layer's chain request + session leg cache ============
// #polylines (Sep 2026): routePath used to fire N−1 SEQUENTIAL per-leg fetches
// and cache nothing, so the map's road lines took ~30 serial round-trips to
// finish drawing and re-fetched everything on every mount/chip flip. The pins:
// one chain request per span, per-leg geometry split back out, chunking past
// 25 waypoints, cache hits skip fetches, estimate legs stay uncached, and an
// aborted caller stops paying the fetch budget.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { routePath, clearRouteCacheForTests, routeCacheSizeForTests } from '../src/lib/routing'
import { getAssumptions } from '../src/lib/engine'

// The chain request is the KEYLESS path by design (a keyed caller spends
// Google quota per leg instead) — force it explicitly: vitest loads .env, so
// the developer's real VITE_GOOGLE_MAPS_API_KEY would silently take the
// Google-per-leg path and these assertions would measure the wrong branch.
async function stubKeyless() {
  vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '')
  const { routesEnabled } = await import('../src/lib/providers/routes')
  expect(routesEnabled()).toBe(false)
}

const A = { lat: 10.0, lng: 77.0 }
const B = { lat: 10.1, lng: 77.1 }
const C = { lat: 10.2, lng: 77.2 }

const asm = getAssumptions({ transportMode: 'car' })

/** OSRM chain response for a waypoint list: one leg per consecutive pair. */
function chainResponse(points: { lat: number; lng: number }[]) {
  const legs = [] as unknown[]
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    legs.push({
      distance: 10_000,
      duration: 600,
      geometry: { coordinates: [[a.lng, a.lat], [(a.lng + b.lng) / 2, (a.lat + b.lat) / 2], [b.lng, b.lat]] },
      annotation: { distance: [5_000, 5_000], duration: [300, 300] },
    })
  }
  return { code: 'Ok', routes: [{ legs }] }
}

let fetchCalls: string[] = []

beforeEach(async () => {
  clearRouteCacheForTests()
  fetchCalls = []
  await stubKeyless()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  clearRouteCacheForTests()
})

describe('routePath as one chain request', () => {
  it('measures a whole corridor in ONE OSRM fetch and splits per-leg geometry', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      fetchCalls.push(String(input))
      return new Response(JSON.stringify(chainResponse([A, B, C])), { status: 200 })
    }))
    const legs = await routePath([A, B, C], asm)
    expect(legs.length).toBe(2)
    expect(legs.every(l => l.source === 'osrm')).toBe(true)
    // leg 0's geometry runs A→B (its own polyline, not the concatenated whole)
    expect(legs[0].geometry[0]).toEqual([A.lng, A.lat])
    expect(legs[0].geometry[legs[0].geometry.length - 1]).toEqual([B.lng, B.lat])
    expect(legs[1].geometry[0]).toEqual([B.lng, B.lat])
    expect(legs[1].geometry[legs[1].geometry.length - 1]).toEqual([C.lng, C.lat])
    expect(fetchCalls.length).toBe(1)
    // the chain URL carries all three waypoints
    expect(fetchCalls[0]).toContain(`${A.lng},${A.lat};${B.lng},${B.lat};${C.lng},${C.lat}`)
  })

  it('chunks a long corridor (over 25 waypoints) into parallel sub-requests', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      fetchCalls.push(String(input))
      // echo the waypoints back as a proper chain response for whatever came in
      const coords = String(input).split('/route/v1/driving/')[1]!.split('?')[0]!
        .split(';').map(s => s.split(',').map(Number))
      const pts = coords.map(([lng, lat]) => ({ lat, lng }))
      return new Response(JSON.stringify(chainResponse(pts)), { status: 200 })
    }))
    const pts = Array.from({ length: 40 }, (_, i) => ({ lat: 10 + i * 0.01, lng: 77 + i * 0.01 }))
    const legs = await routePath(pts, asm)
    expect(legs.length).toBe(39)
    expect(legs.every(l => l.source === 'osrm')).toBe(true)
    // 40 waypoints = ceil(39 / 24) chunk requests, not 39
    expect(fetchCalls.length).toBe(2)
  })

  it('falls back to per-leg measurement when the chain request refuses', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      fetchCalls.push(String(input))
      const url = String(input)
      // the chain request (3 waypoints) fails; per-leg requests (2 waypoints) succeed
      if (url.includes(`${A.lng},${A.lat};${B.lng},${B.lat};${C.lng},${C.lat}`)) {
        return new Response(JSON.stringify({ code: 'NoRoute' }), { status: 200 })
      }
      return new Response(JSON.stringify(chainResponse([A, B])), { status: 200 })
    }))
    const legs = await routePath([A, B, C], asm)
    expect(legs.length).toBe(2)
    expect(legs.every(l => l.source === 'osrm')).toBe(true)
    expect(fetchCalls.length).toBe(3) // 1 failed chain + 2 per-leg
  })

  it('degrades unmeasured legs to the engine estimate — never throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))
    const legs = await routePath([A, B, C], asm)
    expect(legs.length).toBe(2)
    expect(legs.every(l => l.source === 'estimate')).toBe(true)
  })
})

describe('the session leg cache', () => {
  it('a measured span is not re-fetched on the next routePath over the same legs', async () => {
    // URL-faithful stub: OSRM always answers with legs matching the REQUESTED
    // waypoints — a canned body here would wrongly fail the leg-count check
    // and route the test through the per-leg fallback.
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      fetchCalls.push(String(input))
      const coords = String(input).split('/route/v1/driving/')[1]!.split('?')[0]!
        .split(';').map(s => s.split(',').map(Number))
      const pts = coords.map(([lng, lat]) => ({ lat, lng }))
      return new Response(JSON.stringify(chainResponse(pts)), { status: 200 })
    }))
    await routePath([A, B, C], asm)
    expect(fetchCalls.length).toBe(1)
    await routePath([A, B, C], asm)
    expect(fetchCalls.length).toBe(1) // zero new fetches
    expect(routeCacheSizeForTests()).toBe(2)
    // a partial overlap still fetches only the unknown leg's span
    const D = { lat: 10.3, lng: 77.3 }
    await routePath([C, D], asm)
    expect(fetchCalls.length).toBe(2)
    expect(String(fetchCalls[1])).toContain(`${C.lng},${C.lat};${D.lng},${D.lat}`)
  })

  it('estimate legs are never cached — a rate-limited leg can recover', async () => {
    let down = true
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      fetchCalls.push(String(input))
      if (down) throw new Error('rate limited')
      return new Response(JSON.stringify(chainResponse([A, B])), { status: 200 })
    }))
    const first = await routePath([A, B], asm)
    expect(first[0].source).toBe('estimate')
    expect(routeCacheSizeForTests()).toBe(0)
    down = false
    const second = await routePath([A, B], asm)
    expect(second[0].source).toBe('osrm')
    expect(routeCacheSizeForTests()).toBe(1)
  })

  it('cache entries are keyed by transport mode', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      fetchCalls.push(String(input))
      return new Response(JSON.stringify(chainResponse([A, B])), { status: 200 })
    }))
    await routePath([A, B], asm)
    await routePath([A, B], getAssumptions({ transportMode: 'motorcycle' }))
    expect(fetchCalls.length).toBe(2)
    expect(routeCacheSizeForTests()).toBe(2)
  })
})

describe('abort propagation', () => {
  it('an aborted signal stops the in-flight chain request', async () => {
    const ac = new AbortController()
    let sawSignal: AbortSignal | null = null
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      sawSignal = init?.signal ?? null
      await new Promise(r => setTimeout(r, 30))
      throw new Error('should not matter — caller aborts first')
    }))
    const p = routePath([A, B, C], asm, ac.signal)
    ac.abort()
    const legs = await p
    // aborted fetches reject → the span degrades to estimates; the caller's
    // cancelled-flag decides whether they're ever used
    expect(legs.every(l => l.source === 'estimate')).toBe(true)
    expect(sawSignal).not.toBeNull()
    expect(sawSignal!.aborted).toBe(true)
  })
})

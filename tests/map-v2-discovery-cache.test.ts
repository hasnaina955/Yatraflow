import { beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  slots: [] as unknown[], cursor: 0,
  effects: [] as (() => void | (() => void))[],
  scan: vi.fn(),
}))
vi.mock('react', () => ({
  useState: (initial: unknown) => {
    const index = runtime.cursor++
    if (!(index in runtime.slots)) runtime.slots[index] = initial
    return [runtime.slots[index], (value: unknown) => { runtime.slots[index] = value }]
  },
  useRef: (initial: unknown) => {
    const index = runtime.cursor++
    if (!(index in runtime.slots)) runtime.slots[index] = { current: initial }
    return runtime.slots[index]
  },
  useMemo: (read: () => unknown) => read(),
  useEffect: (effect: () => void | (() => void)) => { runtime.effects.push(effect) },
}))
vi.mock('../src/lib/geocode', async importOriginal => ({
  ...await importOriginal<typeof import('../src/lib/geocode')>(),
  searchNearbyPoisMulti: runtime.scan,
}))
vi.mock('../src/lib/tripDna', async importOriginal => ({
  ...await importOriginal<typeof import('../src/lib/tripDna')>(),
  loadDnaLog: () => [], buildDnaVectorAcrossTrips: () => null,
}))

import { useCorridorCache, type CorridorCacheArgs } from '../src/pages/trip/map/useCorridorCache'
import { QuotaExhaustedError } from '../src/lib/providers/google'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const hit = { id: 'sight-a', name: 'Museum', latitude: 12.01, longitude: 77.01, kind: 'poi' as const, category: 'museum' }

function input(dayIndex = 0): CorridorCacheArgs {
  return {
    trip: { id: 'trip', days: [{ id: 'a', index: 0, stops: [] }, { id: 'b', index: 1, stops: [] }], travelStyle: 'balanced', transportMode: 'car', travellers: 2, budgetPerPersonInr: 1000 } as unknown as CorridorCacheArgs['trip'],
    discoveryDay: { dayIndex, routeGeometry: null, stayBase: { lat: 12 + dayIndex, lng: 77 }, purposes: ['sight'] },
    anchors: [{ lat: 25, lng: 80 }], routeGeometry: null, scopeKm: 10,
    dayRainPct: null, dayWeatherCode: null, crewSeeds: [], dnaTick: 0,
    pois: [], setPois: vi.fn(), nearbyOpts: {}, planKm: 0, wholeTripMin: 0,
    drivingPlan: { outbound: [], inbound: [] } as unknown as CorridorCacheArgs['drivingPlan'],
    refreshTick: 0,
    suggestionCache: { cache: { map: null, fraction: null, halts: {} }, setMapCache: vi.fn(), setFractionCache: vi.fn(), setHaltCache: vi.fn(), clearMap: vi.fn() },
  }
}
function render(args: CorridorCacheArgs) {
  runtime.cursor = 0
  runtime.effects = []
  const result = useCorridorCache(args)
  return { result, start: () => runtime.effects.map(effect => effect()).filter((cleanup): cleanup is () => void => typeof cleanup === 'function') }
}
async function settle() { await new Promise(resolve => setImmediate(resolve)) }

beforeEach(() => { runtime.slots = []; runtime.scan.mockReset() })

describe('day scan ownership and evidence', () => {
  it('distinguishes trips with the same route and copied day ids', () => {
    const args = input()
    const original = render(args).result.mapInputsHash
    expect(render({ ...args, trip: { ...args.trip, id: 'another-trip' } }).result.mapInputsHash).not.toBe(original)
  })

  it('cancels day one and discards its late result after day two wins', async () => {
    const first = deferred<typeof hit[]>()
    const second = deferred<typeof hit[]>()
    runtime.scan.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const args = input()
    const cleanups = render(args).start()
    await settle()
    const signal: AbortSignal = runtime.scan.mock.calls[0][3].signal
    cleanups.forEach(cleanup => cleanup())
    const next = { ...args, discoveryDay: input(1).discoveryDay }
    render(next).start()
    second.resolve([{ ...hit, id: 'day-two' }])
    await settle()
    first.resolve([hit])
    await settle()
    expect(signal.aborted).toBe(true)
    expect(render(next).result.discoveryRows.map(row => row.hit?.id)).toEqual(['day-two'])
  })

  it.each([new Error('network'), new QuotaExhaustedError('textSearchPro')])('retains same-context rows and their real timestamp after %s', async error => {
    runtime.scan.mockResolvedValueOnce([hit]).mockRejectedValueOnce(error)
    const args = input()
    const cleanups = render(args).start()
    await settle()
    const fetchedAt = render(args).result.fetchedAt
    expect(fetchedAt).toBeTypeOf('number')
    cleanups.forEach(cleanup => cleanup())
    render({ ...args, refreshTick: 1 }).start()
    await settle()
    const result = render(args).result
    expect(result.discoveryRows.map(row => row.hit?.id)).toEqual([hit.id])
    expect(result.corridorSource).toBe('retained')
    expect(result.fetchedAt).toBe(fetchedAt)
    expect(result.scanFailed || result.scanQuotaOut).toBe(true)
  })

  it('does not scan an anchorless day or borrow trip anchors', async () => {
    const args = input()
    args.discoveryDay = { ...args.discoveryDay!, stayBase: null }
    render(args).start()
    await settle()
    expect(runtime.scan).not.toHaveBeenCalled()
    expect(render(args).result.discoveryStatus).toBe('needs-anchor')
    expect(render(args).result.fetchedAt).toBeNull()
  })

  it('never retains a previous day after the new day fails', async () => {
    runtime.scan.mockResolvedValueOnce([hit]).mockRejectedValueOnce(new Error('network'))
    const args = input()
    const cleanups = render(args).start()
    await settle()
    cleanups.forEach(cleanup => cleanup())
    const next = { ...args, discoveryDay: input(1).discoveryDay }
    render(next).start()
    await settle()
    expect(render(next).result).toMatchObject({ discoveryRows: [], fetchedAt: null, discoveryStatus: 'failed' })
  })

  it('keeps a completed empty scan separate from a failure', async () => {
    runtime.scan.mockResolvedValueOnce([])
    const args = input()
    render(args).start()
    await settle()
    expect(render(args).result).toMatchObject({ discoveryRows: [], discoveryStatus: 'empty', scanFailed: false })
    expect(render(args).result.fetchedAt).toBeTypeOf('number')
  })

  it('loads the recorded fetch time from cache and never substitutes its storage time', async () => {
    const args = input()
    const hash = render(args).result.mapInputsHash
    args.suggestionCache.cache.map = { segments: [], inputsHash: hash, scopeKm: 10, ts: 9999, fetchedAt: 1234 }
    render(args).start()
    await settle()
    expect(runtime.scan).not.toHaveBeenCalled()
    expect(render(args).result.fetchedAt).toBe(1234)
  })

  it('keeps the age unknown for cache rows without a recorded fetch time', async () => {
    const args = input()
    const hash = render(args).result.mapInputsHash
    args.suggestionCache.cache.map = { segments: [], inputsHash: hash, scopeKm: 10, ts: 9999 }
    render(args).start()
    await settle()
    expect(render(args).result.fetchedAt).toBeNull()
  })
})

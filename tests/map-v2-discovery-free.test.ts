import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchNearbyPoisMultiFree } from '../src/lib/providers/free'

afterEach(() => vi.unstubAllGlobals())
const anchors = [{ lat: 12, lng: 77 }]

describe('free discovery failures and cancellation', () => {
  it('rejects a failed scan instead of reporting successful empty rows', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(searchNearbyPoisMultiFree(anchors, 10000, 10, { rejectOnFailure: true })).rejects.toThrow()
  })

  it('aborts active provider requests when a day becomes obsolete', async () => {
    const signals: AbortSignal[] = []
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      const signal = init.signal!
      signals.push(signal)
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    })))
    const controller = new AbortController()
    const scan = searchNearbyPoisMultiFree(anchors, 10000, 10, { rejectOnFailure: true, signal: controller.signal })
    controller.abort()
    await expect(scan).rejects.toThrow()
    expect(signals.length).toBeGreaterThan(0)
    expect(signals.every(signal => signal.aborted)).toBe(true)
  })

  it('reports bounded coverage only after successful reads', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(new Response(JSON.stringify(
      url.includes('wikipedia') ? { query: { pages: {} } } : { elements: [] },
    ), { status: 200 }))))
    const onCoverage = vi.fn()
    await expect(searchNearbyPoisMultiFree(anchors, 35000, 10, {
      rejectOnFailure: true, onCoverage, routeCoords: [[77, 12], [79, 12]],
    })).resolves.toEqual([])
    expect(onCoverage).toHaveBeenCalledWith(expect.objectContaining({ method: 'circles', radiusM: 10000, complete: false }))
  })
})

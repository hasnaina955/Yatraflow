// ============ Retry-scan status (#08 R6) ============
// A retry is a third state: the previous failure must not survive the new scan
// start, and the snapshot must report scanning, not failed/quota.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { corridorStatusFor } from '../src/pages/trip/map/corridorSnapshot'

const cache = readFileSync(new URL('../src/pages/trip/map/useCorridorCache.ts', import.meta.url), 'utf8')

describe('retry scan status', () => {
  it('clears the prior scan failure/quota at the new scan start', () => {
    const start = cache.indexOf('setLoadingPois(true)')
    expect(start).toBeGreaterThan(-1)
    const open = cache.lastIndexOf('queueMicrotask', start)
    const block = cache.slice(open, cache.indexOf('})', start))
    expect(block).toContain('setScanFailed(false)')
    expect(block).toContain('setScanQuotaOut(false)')
    expect(block).not.toContain('setCorridorQuotaOut(false)')
  })

  it('reports scanning while the retry is in flight', () => {
    expect(corridorStatusFor({ quota: false, scanFailed: false, loading: true })).toBe('scanning')
    expect(corridorStatusFor({ quota: false, scanFailed: true, loading: true })).toBe('failed')
  })
})

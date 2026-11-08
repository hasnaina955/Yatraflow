// Map V2 ticket 09 AC5: the corridor scan must carry an approved family set.
//
// The site is the trip/route-scoped scan in useCorridorCache — the MapTab
// caller is another lane's wiring, so these contract checks read the hook
// source: the scan must pass a capped { nature, faith, culture } set, the
// cache key must change when that set changes, and the hook source must
// record families in the inputs hash it publishes.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { planInputsHash } from '../src/hooks/useSuggestionCache'

const cache = readFileSync(
  new URL('../src/pages/trip/map/useCorridorCache.ts', import.meta.url),
  'utf8',
).replace(/\r\n/g, '\n')

const baseInputs = () => ({
  anchorsHash: 'abc', routeHash: 'def', travelStyle: 'relaxed',
  transportMode: 'car', scopeKm: 20, travellers: 2, budgetPerPersonInr: 15000,
})

describe('corridor scan family set', () => {
  it('the route-scoped scan passes the approved families, capped at three', () => {
    expect(cache).toContain("const CORRIDOR_FAMILIES: readonly PlaceFamily[] = ['nature', 'faith', 'culture']")
    const scan = cache.slice(cache.indexOf('planJourneyHalts('))
    expect(scan).toContain('families: CORRIDOR_FAMILIES')
  })

  it('records the family set in the cache key it publishes', () => {
    const hashBlock = cache.slice(cache.indexOf('planInputsHash({'), cache.indexOf('}), [anchors'))
    expect(hashBlock).toContain('families:')
  })
})

describe('cache key changes with the family set', () => {
  it('misses when the scanned family set changes', () => {
    const base = planInputsHash(baseInputs())
    expect(planInputsHash({ ...baseInputs(), families: ['nature', 'faith', 'culture'] })).not.toBe(base)
    expect(planInputsHash({ ...baseInputs(), families: ['nature', 'faith'] }))
      .not.toBe(planInputsHash({ ...baseInputs(), families: ['nature', 'faith', 'culture'] }))
    expect(planInputsHash({ ...baseInputs(), families: ['culture', 'nature', 'faith'] }))
      .toBe(planInputsHash({ ...baseInputs(), families: ['nature', 'faith', 'culture'] }))
  })
})

// ============ The synthetic Map fixture answers its own place scan ==========
// The fixture page says its provider transport is controlled. When the page ran
// on the plain dev server, the free place scan called live Overpass. That call
// hung, so the Drive and Stay decks showed "Looking…" until it failed. These
// checks pin the two rules that stop it: every scan endpoint has a controlled
// answer, and a settled source never reads as scanning.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  fixtureAnchorFromQuery, fixtureAnswerBody, fixtureProviderFor, installFixtureTransport,
} from '../dev/map-workspace-fixture.transport'
import { lensViewOf } from '../src/lib/mapLensContracts'
import type { JourneyStatus } from '../src/pages/trip/journey/journeyDays'

const freeProviderSource = readFileSync(new URL('../src/lib/providers/free.ts', import.meta.url), 'utf8')

/**
 * Endpoints that only run for a typed search or a keyed provider. The fixture
 * makes neither call, so the guard passes them through.
 */
const NOT_A_SCAN_ENDPOINT = ['nominatim.openstreetmap.org', 'geocoding-api.open-meteo.com', 'photon.komoot.io']

/** Every absolute URL the free provider file names. */
function providerUrls(): string[] {
  return [...new Set(freeProviderSource.match(/https:\/\/[^\s'"`]+/g) ?? [])]
}

describe('the fixture answers every place scan endpoint', () => {
  it('controls each scan URL the free provider can call', () => {
    const scanUrls = providerUrls().filter(url => !NOT_A_SCAN_ENDPOINT.some(host => url.includes(host)))
    expect(scanUrls.length).toBeGreaterThanOrEqual(3)
    for (const url of scanUrls) expect(fixtureProviderFor(url), url).not.toBeNull()
  })

  it('passes a non-provider URL through to the real transport', () => {
    expect(fixtureProviderFor('https://tiles.openfreemap.org/planet')).toBeNull()
    expect(fixtureProviderFor('not a url')).toBeNull()
    expect(fixtureProviderFor('https://router.project-osrm.org/route/v1/driving/1,2;3,4')).toBeNull()
  })
})

describe('the controlled answers have the shapes the scan parses', () => {
  it('returns Overpass elements with a name and real coordinates', () => {
    const body = fixtureAnswerBody('https://overpass-api.de/api/interpreter', 'data=' + encodeURIComponent('[out:json][timeout:20];(nwr(around:30000,9.6,77.1)[natural];);out center tags 60;'))
    const data = JSON.parse(body) as { elements: Array<{ lat: number; lon: number; tags: Record<string, string> }> }
    expect(Array.isArray(data.elements)).toBe(true)
    expect(data.elements.length).toBe(4)
    for (const element of data.elements) {
      expect(element.tags.name).toMatch(/^Synthetic /)
      expect(Number.isFinite(element.lat)).toBe(true)
      expect(Number.isFinite(element.lon)).toBe(true)
      expect(Object.keys(element.tags).length).toBeGreaterThan(1)
    }
  })

  it('returns a Wikipedia query with no pages, never an error shape', () => {
    const body = fixtureAnswerBody('https://en.wikipedia.org/w/api.php?action=query&generator=geosearch')
    const data = JSON.parse(body) as { query?: { pages?: Record<string, unknown> } }
    expect(data.query).toBeTypeOf('object')
    expect(data.query?.pages).toEqual({})
  })

  it('places the answer near the anchor in the request', () => {
    const anchor = fixtureAnchorFromQuery('[out:json];(nwr(around:12000,9.604,77.164););out;')
    expect(anchor).toEqual({ lat: 9.604, lng: 77.164 })
    const body = fixtureAnswerBody('https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'data=' + encodeURIComponent('around:12000,9.604,77.164'))
    const data = JSON.parse(body) as { elements: Array<{ lat: number; lon: number }> }
    for (const element of data.elements) {
      expect(Math.abs(element.lat - 9.604)).toBeLessThan(0.15)
      expect(Math.abs(element.lon - 77.164)).toBeLessThan(0.15)
    }
  })

  it('falls back to the trip start when the query names no anchor', () => {
    expect(fixtureAnchorFromQuery('[out:json];node(1);out;')).toEqual({ lat: 10.088, lng: 77.059 })
  })
})

describe('the installed guard settles a provider call without the network', () => {
  it('answers at once and restores the original fetch', async () => {
    const reached: string[] = []
    const original = (async () => {
      reached.push('network')
      return new Response('{}')
    }) as typeof fetch
    const scope = { fetch: original }
    const undo = installFixtureTransport(scope)
    const response = await scope.fetch('https://maps.mail.ru/osm/tools/overpass/api/interpreter', {
      method: 'POST',
      body: 'data=' + encodeURIComponent('around:30000,10.088,77.059'),
    })
    expect(response.ok).toBe(true)
    const data = (await response.json()) as { elements: unknown[] }
    expect(data.elements).toHaveLength(4)
    expect(reached).toEqual([])
    undo()
    expect(scope.fetch).toBe(original)
  })
})

describe('a lens cannot stay in scanning once its source settles', () => {
  const rows = [{ id: 'row-1' }] as unknown as readonly never[]
  const settled: JourneyStatus[] = [
    { kind: 'unscanned' },
    { kind: 'ready', source: 'scan' },
    { kind: 'ready', source: 'cache' },
    { kind: 'failed' },
    { kind: 'quota' },
  ]

  it.each(settled)('keeps $kind out of the scanning phase', status => {
    expect(lensViewOf(status, rows).phase).not.toBe('scanning')
    expect(lensViewOf(status, [] as readonly never[]).phase).not.toBe('scanning')
  })

  it('shows scanning only while the source is still scanning', () => {
    expect(lensViewOf({ kind: 'scanning' }, rows).phase).toBe('scanning')
  })
})

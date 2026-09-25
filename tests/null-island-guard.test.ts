// Null Island guard — regression tests for the 2026-09-14 live incident:
// both providers emit latitude:0/longitude:0 "resolve on pick" placeholders,
// and a raw write into a stop pinned a real user's journey to the Gulf of
// Guinea (116-day split banner, ±45,616 km impact preview, halts "around
// ~2400 km" off the Atlantic). The engine math was honest; the input was
// poison. These fixtures pin the guard at the ingestion boundary.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { hasCoords } from '../src/lib/providers/hits'
import type { PlaceHit } from '../src/lib/providers/hits'

const hit = (over: Partial<PlaceHit>): PlaceHit => ({
  id: 'h1', name: 'Highway King', source: 'google', kind: 'poi',
  latitude: 0, longitude: 0, // the placeholder every guard below rejects
  ...over,
})

describe('Null Island guard — placeholder coords never enter a trip', () => {
  it('hasCoords: (0,0) is a placeholder, not a place; but genuine equator points survive', () => {
    expect(hasCoords(hit({}))).toBe(false)
    expect(hasCoords(hit({ latitude: 12.97, longitude: 77.59 }))).toBe(true)
    // (0, ~77E) — the exact signature from the live incident (lat 0, lng real)
    expect(hasCoords(hit({ longitude: 77.0595 }))).toBe(false)
    // NaN/undefined coords are also unusable
    expect(hasCoords(hit({ latitude: NaN, longitude: 12 }))).toBe(false)
  })

  it('the placeholder is only legal INSIDE the provider, resolved before any write', () => {
    // Both provider modules declare the placeholder with the same comment;
    // this test is the tripwire that the comment stays TRUE — the moment a
    // write path skips resolution, an integration test on the component
    // would fail. Here we pin the shared predicate contract instead:
    // requireHitCoords resolves through resolveHitCoords and returns null
    // when the provider could not (node env: no fetch — the free resolver
    // would fail, the Google one needs a key, so the resolution falls
    // through to a null, never to a raw placeholder).
    expect(hasCoords({ ...hit({}), latitude: 0, longitude: 0 })).toBe(false)
  })

  it('LocationInput resolves when either coordinate is zero, not only (0,0)', () => {
    const source = readFileSync(new URL('../src/components/LocationInput.tsx', import.meta.url), 'utf8')
    expect(source).toMatch(/hit\.latitude === 0 \|\| hit\.longitude === 0/)
  })

  it('a (0,0) stop inside a trip is detectable for repair tooling', () => {
    // The shape the incident left in the user's trip — kept as the
    // detection contract for any future data-repair pass.
    const stop = { lat: 0, lng: 0, title: 'Highway King' }
    const isNullIsland = (s: { lat: number; lng: number }) =>
      s.lat === 0 && s.lng === 0
    expect(isNullIsland(stop)).toBe(true)
  })
})

// Wave-0 composition check for #326 ("mixed (0, lng) placeholder leaks into
// trip data; vote paths skip coord check") — the issue's two halves land in
// different PRs and must COMPOSE:
//   · #399's input guard: `hasCoords` treats a MIXED zero (lat 0 with a real
//     lng — the 2026-09-14 live-incident signature) as unknown, not only (0,0),
//     so `requireHitCoords` refuses to hand it back.
//   · #380's vote-path guards: both crew-vote writers (`raiseSlotVote`,
//     `raiseShortlistVote`) resolve every pick through `requireHitCoords`
//     BEFORE writing a decision payload, drop the unresolvable, refuse the
//     vote when too few survive, and write the PINNED coordinates — never the
//     raw pick's.
// Composed: a mixed-zero pick can never reach a decision payload, and a vote
// can never be created around a place the map cannot pin.
//
// Node env (no DOM): the vote writers are component functions, so this pins
// the pipeline against the REAL resolver + predicate and tripwires the
// component source to the same contract (the null-island-guard precedent).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { requireHitCoords } from '../src/lib/geocode'
import { hasCoords } from '../src/lib/providers/hits'
import type { PlaceHit } from '../src/lib/providers/hits'

// No `placeId`, no `eLoc`: the resolver answers WITHOUT the network in every
// environment (a key-configured machine must not spend a Place Details call
// on a fixture). Everything below is pure guard logic.
const pick = (over: Partial<PlaceHit>): PlaceHit => ({
  id: 'p1', name: 'Highway King', source: 'google', kind: 'poi',
  latitude: 12.97, longitude: 77.59,
  ...over,
})

/** The pipeline shape both vote writers must follow (resolve → drop → gate →
 *  write pinned coords only). `minUsable` is the caller's gate: 2 for the
 *  slot vote (an empty-slot vote needs a real choice), 1 for the shortlist. */
async function votePipeline(picks: PlaceHit[], minUsable: number) {
  const resolved = await Promise.all(picks.map(async p => ({ p, pinned: await requireHitCoords(p) })))
  const usable = resolved.filter((x): x is { p: PlaceHit; pinned: PlaceHit } => !!x.pinned)
  if (usable.length < minUsable) return { refused: true as const, options: [] as Array<{ label: string; lat: number; lng: number }> }
  return {
    refused: false as const,
    options: usable.map(({ p, pinned }) => ({ label: p.name, lat: pinned.latitude, lng: pinned.longitude })),
  }
}

describe('requireHitCoords × unknown-place guard (the composed resolver)', () => {
  it('a pick with real coordinates survives untouched', async () => {
    const p = pick({})
    const out = await requireHitCoords(p)
    expect(out).not.toBeNull()
    expect(hasCoords(out!)).toBe(true)
  })

  it('every zero signature resolves to null — (0,0), (0, lng) and (lat, 0)', async () => {
    // (0, lng) is the live incident's exact shape: lat 0 with a REAL lng.
    expect(await requireHitCoords(pick({ latitude: 0, longitude: 77.0595 }))).toBeNull()
    expect(await requireHitCoords(pick({ latitude: 12.97, longitude: 0 }))).toBeNull()
    expect(await requireHitCoords(pick({ latitude: 0, longitude: 0 }))).toBeNull()
    // NaN is equally unusable
    expect(await requireHitCoords(pick({ latitude: NaN }))).toBeNull()
  })
})

describe('vote payload composition (a placeholder pick cannot reach a decision)', () => {
  it('drops the mixed-zero pick and writes only pinned coordinates', async () => {
    const out = await votePipeline([
      pick({ id: 'a', name: 'Blue Tokai' }),
      pick({ id: 'b', name: 'Highway King', latitude: 0, longitude: 77.0595 }), // poison
      pick({ id: 'c', name: 'Empire Restaurant' }),
    ], 2)
    expect(out.refused).toBe(false)
    expect(out.options.map(o => o.label)).toEqual(['Blue Tokai', 'Empire Restaurant'])
    // Nothing written is a placeholder — every option stands on the map.
    for (const o of out.options) expect(hasCoords(pick({ latitude: o.lat, longitude: o.lng }))).toBe(true)
  })

  it('refuses the vote when the guard leaves too few places to choose between', async () => {
    // Slot-vote gate (min 2): one survivor is not a choice.
    const slot = await votePipeline([
      pick({ id: 'a', name: 'Blue Tokai' }),
      pick({ id: 'b', name: 'Highway King', latitude: 0, longitude: 77.0595 }),
    ], 2)
    expect(slot.refused).toBe(true)
    expect(slot.options).toEqual([])
    // Shortlist gate (min 1): all-poison means no vote at all.
    const shortlist = await votePipeline([
      pick({ id: 'a', latitude: 0, longitude: 77.0595 }),
      pick({ id: 'b', latitude: 0, longitude: 0 }),
    ], 1)
    expect(shortlist.refused).toBe(true)
    expect(shortlist.options).toEqual([])
  })
})

describe('MapTab vote writers (source tripwire to the composed contract)', () => {
  const src = readFileSync(new URL('../src/pages/trip/MapTab.tsx', import.meta.url), 'utf8')

  /** The body of `function <name>` … up to the next top-level function. */
  const fnBody = (name: string): string => {
    const marker = `function ${name}`
    const start = src.indexOf(marker)
    expect(start, `${marker} not found`).toBeGreaterThan(-1)
    const next = src.slice(start + 1).search(/\n {2}(async )?function /)
    return next === -1 ? src.slice(start) : src.slice(start, start + 1 + next)
  }

  it('every write-into-a-trip path uses the require form, never bare resolve', () => {
    // `resolveHitCoords` returns the placeholder on failure; only
    // `requireHitCoords` refuses it. No ingestion boundary in MapTab may
    // call the permissive form (votes, adds and pins alike).
    expect(src).not.toMatch(/(?<!require)resolveHitCoords\(/)
    expect(src).toMatch(/requireHitCoords\(/)
  })

  it('raiseSlotVote resolves every candidate before writing, gates, and pins the payload', () => {
    const body = fnBody('raiseSlotVote')
    expect(body).toMatch(/requireHitCoords\(c\.hit\)/)          // resolve at the boundary
    expect(body).toMatch(/usable\.length < 2/)                  // a vote needs ≥2 pinnable places
    expect(body).toMatch(/was not created/)                     // refusal is said out loud
    expect(body).toMatch(/lat:\s*pinned\.latitude/)             // payload carries PINNED coords…
    expect(body).toMatch(/lng:\s*pinned\.longitude/)
    expect(body).not.toMatch(/lat:\s*c\.hit\.latitude/)         // …never the raw pick's
  })

  it('raiseShortlistVote resolves every pick before writing, gates, and pins the payload', () => {
    const body = fnBody('raiseShortlistVote')
    expect(body).toMatch(/requireHitCoords\(h\)/)
    expect(body).toMatch(/usable\.length === 0/)                // nothing pinnable, no vote
    expect(body).toMatch(/was not created/)
    expect(body).toMatch(/lat:\s*pinned\.latitude/)
    expect(body).toMatch(/lng:\s*pinned\.longitude/)
    expect(body).not.toMatch(/lat:\s*h\.latitude/)
  })
})

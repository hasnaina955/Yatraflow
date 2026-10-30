// ============ The cover plan — the one order every surface draws ============
// These cases pin the product rule, not an implementation detail:
//
//   the traveller's upload, else the artwork that fits the trip's own places,
//   else their emoji — and the emoji only when every image is gone.
//
// The regression that started this: a trip whose start is "Panaji, Goa" and
// whose stops are the Goan beaches showed the neutral generic scene, because
// the resolver never looked at the start place and the beach names matched no
// table. Its saved 🏖 emoji then painted over that scene as an "accent".
import { describe, expect, it } from 'vitest'
import {
  ART_MANIFEST,
  type ArtManifest,
  type CoverInput,
  coverPlanFor,
} from '../src/lib/regionArt'
import { coverAttemptsFor, coverPlanKey } from '../src/lib/coverAttempts'
import { regionFor } from '../src/lib/tripsPage'

/** The real trip: Panaji start, three Goan beaches, a saved beach emoji. */
const GOA: CoverInput = {
  region: regionFor({ destinations: ['Candolim', 'Colva', 'Palolem'] }),
  seed: '712a0493-678b-4193-a93e-cb479d01e45e',
  placeCount: 3,
  destinations: ['Candolim', 'Colva', 'Palolem'],
  startLocation: 'Panaji, Goa',
  fallbackEmoji: '🏖',
}

function sceneIds(input: CoverInput, manifest?: ArtManifest): string[] {
  return coverPlanFor(input, manifest).candidates
    .map(candidate => (candidate.kind === 'generated' ? candidate.id : `user:${candidate.url}`))
}

const GOA_SCENES = ['goa-1', 'goa-2']

describe('the saved emoji never decides the cover', () => {
  it('resolves the real Goa trip to the Goa family, whatever emoji is saved', () => {
    for (const emoji of ['🏖', '🏖️', '🧭', '', '   ', null, undefined]) {
      const ids = sceneIds({ ...GOA, fallbackEmoji: emoji })
      expect(GOA_SCENES, String(emoji)).toContain(ids[0])
    }
  })

  it('keeps the saved emoji as the last resort, trimmed, for every spelling', () => {
    expect(coverPlanFor({ ...GOA, fallbackEmoji: '🏖' }).fallbackEmoji).toBe('🏖')
    expect(coverPlanFor({ ...GOA, fallbackEmoji: '🏖️' }).fallbackEmoji).toBe('🏖️')
    expect(coverPlanFor({ ...GOA, fallbackEmoji: '  🏖  ' }).fallbackEmoji).toBe('🏖')
  })

  it('falls back to the compass only when no emoji is saved', () => {
    for (const emoji of ['', '   ', null, undefined]) {
      expect(coverPlanFor({ ...GOA, fallbackEmoji: emoji }).fallbackEmoji).toBe('🧭')
    }
  })

  it('never lists an emoji among the candidates', () => {
    for (const candidate of coverPlanFor(GOA).candidates) {
      expect(candidate.kind === 'user' || candidate.kind === 'generated').toBe(true)
    }
  })
})

describe('the start place is evidence, but only when the stops say nothing', () => {
  it('reaches the Goa family from the start when the beaches are unknown to both tables', () => {
    // Candolim, Colva and Palolem are real Goan beaches that neither table
    // names, so the destination list is no evidence at all. The start place is.
    expect(regionFor({ destinations: ['Candolim', 'Colva', 'Palolem'] })).toBe('generic')
    expect(GOA_SCENES).toContain(sceneIds(GOA)[0])
    expect(GOA_SCENES).toContain(sceneIds(GOA)[1])
  })

  it('does not consult the start when a destination is recognised', () => {
    // Rishikesh is a destination scene in Uttarakhand. A Mumbai origin must not
    // turn this into a two-state road trip the traveller never planned, so the
    // road family may only appear after the destination's own scene.
    const ids = sceneIds({
      region: 'generic',
      seed: 's',
      placeCount: 2,
      destinations: ['Rishikesh'],
      startLocation: 'Mumbai',
    })
    expect(ids[0]).toBe('rishikesh-v1')
    expect(ids.indexOf('road-1')).toBeGreaterThan(0)
    expect(ids.indexOf('road-2')).toBeGreaterThan(0)
  })

  it('keeps a real cross-state trip on the road family', () => {
    const ids = sceneIds({
      region: 'generic',
      seed: 'trip',
      placeCount: 2,
      destinations: ['Rishikesh', 'Panaji, Goa'],
      startLocation: 'Panaji, Goa',
    })
    expect(['road-1', 'road-2']).toContain(ids[0])
  })

  // The seven-region matcher is the WIDER table. It knows places the India
  // place layer does not, and a region it names is destination evidence. Before
  // this, a recognised stop plus an unrelated origin let the ORIGIN answer, so
  // a Gulmarg trip out of Mumbai showed the Mumbai scene.
  it.each([
    ['Gulmarg', 'Mumbai', 'kashmir', ['himalaya-1', 'himalaya-2']],
    ['Kochi', 'Mumbai', 'kerala', ['kerala-1']],
    ['Thekkady', 'Mumbai', 'kerala', ['kerala-1']],
    ['Kushalnagar', 'Mumbai', 'coorg', ['coorg-1', 'coorg-2']],
    ['Cherrapunji', 'Mumbai', 'meghalaya', ['meghalaya-1', 'meghalaya-2']],
    ['Dawki', 'Mumbai', 'meghalaya', ['meghalaya-1', 'meghalaya-2']],
  ])('lets %s beat an unrelated %s origin', (destination, origin, region, family) => {
    const ids = sceneIds({
      region: regionFor({ destinations: [destination] }),
      seed: 'trip',
      placeCount: 1,
      destinations: [destination],
      startLocation: origin,
    })
    expect(regionFor({ destinations: [destination] })).toBe(region)
    expect(family).toContain(ids[0])
    // The origin's own scene is never the answer, and the neutral family is not
    // reached while the recognised region still has a bundled scene.
    expect(ids[0]).not.toBe('mumbai-v1')
    expect(ids[0]).not.toBe('generic-1')
  })

  it('keeps the unknown-beach + Panaji start case on the Goa family', () => {
    // The start still answers when the stops name nothing at all.
    const ids = sceneIds({ ...GOA, destinations: ['Candolim', 'Colva', 'Palolem'] })
    expect(GOA_SCENES).toContain(ids[0])
  })

  it('lists every bundled scene of a recognised region before the neutral family', () => {
    // Gulmarg with no origin: himalaya-1 is the seeded pick, but himalaya-2 is
    // bundled too. Both must come before the road or city family, so a refused
    // preferred file costs a step inside Kashmir instead of leaving it.
    const ids = sceneIds({
      region: regionFor({ destinations: ['Gulmarg'] }),
      seed: 'trip',
      placeCount: 1,
      destinations: ['Gulmarg'],
      startLocation: '',
    })
    expect(ids.slice(0, 2).sort()).toEqual(['himalaya-1', 'himalaya-2'])
    expect(ids.indexOf('city-1')).toBe(2)
  })

  it('keeps the whole region family ahead of the road family on a multi-stop trip', () => {
    const ids = sceneIds({
      region: regionFor({ destinations: ['Gulmarg', 'Pahalgam'] }),
      seed: 'trip',
      placeCount: 2,
      destinations: ['Gulmarg', 'Pahalgam'],
      startLocation: '',
    })
    expect(ids.slice(0, 2).sort()).toEqual(['himalaya-1', 'himalaya-2'])
    expect(ids.indexOf('road-1')).toBeGreaterThan(1)
  })

  it('reaches the sibling region scene when the preferred one is refused', () => {
    // The renderer walks the list, so the sibling must be reachable
    // without any neutral scene between it and the preferred one.
    const attempts = coverAttemptsFor({
      candidates: coverPlanFor({
        region: 'kashmir',
        seed: 'trip',
        placeCount: 1,
        destinations: ['Gulmarg'],
        startLocation: '',
      }).candidates.slice(0, 2),
      fallbackEmoji: '🧭',
    })
    const scenes = [...new Set(attempts.map(attempt => (attempt.kind === 'scene' ? attempt.id : 'user')))]
    expect(scenes).toEqual(['himalaya-1', 'himalaya-2'])
  })

  it('never repeats a scene when the region family follows a place-layer match', () => {
    // Munnar is a place-layer destination AND a Kerala region. Both steps add
    // scenes; the list must still hold each id once.
    const ids = sceneIds({
      region: 'kerala',
      seed: 'trip',
      placeCount: 1,
      destinations: ['Munnar'],
      startLocation: '',
    })
    expect(ids[0]).toBe('munnar-v1')
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('kerala-1')
  })

  it('ignores a start that matches nothing, so the neutral scene answers', () => {
    const ids = sceneIds({
      region: 'generic',
      seed: 's',
      placeCount: 1,
      destinations: ['Ziro Valley'],
      startLocation: 'Somewhere Else',
    })
    expect(ids[0]).toBe('generic-1')
  })

  it('matches a start on whole tokens only', () => {
    // "Goainghat" contains "goa" but is not Goa. This is the same rule
    // regionFor and the place layer already use.
    const ids = sceneIds({
      region: 'generic',
      seed: 's',
      placeCount: 1,
      destinations: ['Nowhere'],
      startLocation: 'Goainghat',
    })
    expect(ids[0]).toBe('generic-1')
  })
})

describe('the upload wins, and artwork follows it', () => {
  it('lists the upload first, ahead of every scene', () => {
    const plan = coverPlanFor({ ...GOA, userCover: 'https://example.test/mine.jpg' })
    expect(plan.candidates[0]).toEqual({ kind: 'user', url: 'https://example.test/mine.jpg' })
  })

  it('keeps the artwork behind a failed upload, so a dead photo is not an emoji', () => {
    const ids = sceneIds({ ...GOA, userCover: 'https://example.test/gone.jpg' })
    expect(ids[0]).toBe('user:https://example.test/gone.jpg')
    expect(GOA_SCENES).toContain(ids[1])
  })

  it('treats a blank upload as no upload', () => {
    for (const userCover of ['', '   ', null, undefined]) {
      const ids = sceneIds({ ...GOA, userCover })
      expect(GOA_SCENES, String(userCover)).toContain(ids[0])
    }
  })
})

describe('the plan is finite, deduplicated and stable', () => {
  it('lists no scene twice', () => {
    const ids = sceneIds({ ...GOA, userCover: 'https://example.test/x.jpg' })
    const scenes = ids.filter(id => !id.startsWith('user:'))
    expect(new Set(scenes).size).toBe(scenes.length)
  })

  it('returns the same plan for the same input, 100 times', () => {
    const first = coverPlanFor(GOA)
    for (let index = 0; index < 100; index += 1) expect(coverPlanFor(GOA)).toEqual(first)
  })

  it('keeps the seeded scene first, so a variant does not change on re-render', () => {
    const ids = sceneIds(GOA)
    for (let index = 0; index < 100; index += 1) expect(sceneIds(GOA)[0]).toBe(ids[0])
  })

  it('reaches both Goa scenes across seeds, and only those two first', () => {
    const firsts = new Set<string>()
    for (let index = 0; index < 200; index += 1) {
      const first = sceneIds({ ...GOA, seed: `seed-${index}` })[0]
      expect(GOA_SCENES).toContain(first)
      firsts.add(first)
    }
    expect([...firsts].sort()).toEqual(GOA_SCENES)
  })

  it('does not mutate its input', () => {
    const input: CoverInput = { ...GOA, destinations: ['Candolim', 'Colva', 'Palolem'] }
    const snapshot = JSON.stringify(input)
    coverPlanFor(input)
    expect(JSON.stringify(input)).toBe(snapshot)
  })

  it('answers with no candidates at all for an empty manifest, and keeps the emoji', () => {
    const empty: ArtManifest = {
      ...ART_MANIFEST,
      regions: { kerala: [], goa: [], rajasthan: [], coorg: [], meghalaya: [], kashmir: [], generic: [] },
      fallbacks: { road: [], city: [] },
    }
    const plan = coverPlanFor({ ...GOA, startLocation: '', destinations: [] }, empty)
    expect(plan.candidates).toEqual([])
    expect(plan.fallbackEmoji).toBe('🏖')
  })
})

describe('the attempt chain is what the renderer may try', () => {
  it('offers AVIF then WebP for one scene, as two distinct attempts', () => {
    const attempts = coverAttemptsFor({ candidates: [{ kind: 'generated', id: 'goa-1' }], fallbackEmoji: '🏖' })
    expect(attempts.map(attempt => attempt.kind === 'scene' ? attempt.format : attempt.kind)).toEqual(['avif', 'webp'])
    expect(new Set(attempts.map(attempt => attempt.kind === 'scene' ? attempt.src : attempt.url)).size).toBe(2)
  })

  it('carries the responsive widths in the AVIF srcset', () => {
    const [avif] = coverAttemptsFor({ candidates: [{ kind: 'generated', id: 'goa-1' }], fallbackEmoji: '🧭' })
    expect(avif.kind).toBe('scene')
    if (avif.kind !== 'scene') throw new Error('expected a scene attempt')
    expect(avif.srcSet).toMatch(/320w/)
    expect(avif.srcSet).toMatch(/960w/)
  })

  it('skips a scene with no bundled file instead of attempting a broken URL', () => {
    const attempts = coverAttemptsFor({ candidates: [{ kind: 'generated', id: 'no-such-scene' }], fallbackEmoji: '🧭' })
    expect(attempts).toEqual([])
  })

  it('moves to the next scene after the first one is exhausted', () => {
    const attempts = coverAttemptsFor({
      candidates: [{ kind: 'generated', id: 'goa-1' }, { kind: 'generated', id: 'goa-2' }],
      fallbackEmoji: '🧭',
    })
    const ids = attempts.map(attempt => attempt.kind === 'scene' ? attempt.id : 'user')
    expect(ids).toEqual(['goa-1', 'goa-1', 'goa-2', 'goa-2'])
  })

  it('never repeats a URL, so walking the list cannot loop', () => {
    const attempts = coverAttemptsFor(coverPlanFor(GOA))
    const urls = attempts.map(attempt => attempt.kind === 'scene' ? attempt.src : attempt.url)
    expect(new Set(urls).size).toBe(urls.length)
    expect(attempts.length).toBeLessThanOrEqual(24)
  })

  it('makes the upload a single attempt, with no scene behind it in the same step', () => {
    const attempts = coverAttemptsFor(coverPlanFor({ ...GOA, userCover: 'https://example.test/a.jpg' }))
    expect(attempts[0]).toEqual({ kind: 'user', url: 'https://example.test/a.jpg' })
  })
})

describe('the plan key resets failure memory', () => {
  it('changes when the plan content changes, so a new trip starts clean', () => {
    // Two trips that resolve to the SAME plan share a key by design: there is
    // nothing different for the renderer to remember. The key follows the
    // candidates, so any plan that differs in what it would show gets its own.
    const base = coverPlanKey(coverPlanFor(GOA))
    const other = coverPlanKey({ candidates: [{ kind: 'generated', id: 'goa-1' }], fallbackEmoji: '🏖' })
    expect(other).not.toBe(base)
    // A seed that reaches the other Goa scene also produces a different key.
    const flipped = [...Array(40).keys()]
      .map(index => coverPlanKey(coverPlanFor({ ...GOA, seed: `seed-${index}` })))
      .find(key => key !== base)
    expect(flipped, 'no seed reached the other Goa scene').toBeDefined()
  })

  it('differs when the upload changes, and when it is cleared', () => {
    const bare = coverPlanKey(coverPlanFor(GOA))
    const withUpload = coverPlanKey(coverPlanFor({ ...GOA, userCover: 'https://example.test/a.jpg' }))
    expect(withUpload).not.toBe(bare)
    expect(coverPlanKey(coverPlanFor({ ...GOA, userCover: 'https://example.test/b.jpg' }))).not.toBe(withUpload)
  })

  it('agrees for the same plan', () => {
    expect(coverPlanKey(coverPlanFor(GOA))).toBe(coverPlanKey(coverPlanFor(GOA)))
  })
})

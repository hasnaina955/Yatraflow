// ============ The public surface's promises are pinned (2026-09-17) ============
// Two failures were invisible to tsc, the tests and the build, because nothing
// renders these components in CI:
//   • the page offered "Unlock Premium · ₹199" in two places while no payment
//     rail exists — the click could only toast a notice that payments are off;
//   • a rename left the trip-highlights block on `.pub-highlightsN` while the
//     stylesheet defines `.pub-highlights`, so the section silently lost its
//     spacing (the same shape as a class going dead in any rename).
// Both are one edit away from returning, so pin both here — source invariants,
// the same pattern tests/trip-road.test.ts uses for the road measurement.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')

describe('the public itinerary page sells nothing it cannot deliver', () => {
  it('renders no purchase CTA while the payment rail does not exist', () => {
    const page = read('../src/pages/PublicItinerary.tsx')
    expect(page).not.toMatch(/Unlock Premium/)
    expect(page).not.toMatch(/no payments in this MVP/)
    // The price is real data and stays visible — as a label, not an action.
    expect(page).toMatch(/Full plan · \{formatInr\(price\)\}/)
  })

  it('keeps every section class it styles itself with in the stylesheet', () => {
    const page = read('../src/pages/PublicItinerary.tsx')
    const css = read('../src/styles.css')
    const used = [...page.matchAll(/className="(pub-[a-z-]+)"/g)].map(m => m[1]).sort()
    expect(used.length).toBeGreaterThan(5)
    expect(used.filter(c => !css.includes(`.${c}`))).toEqual([])
  })
})

describe('the gallery explains its own vocabulary', () => {
  it('says what Fork means before the first card that offers it', () => {
    const explore = read('../src/pages/Explore.tsx')
    const gloss = explore.indexOf('Fork any itinerary to copy it into your own trips')
    expect(gloss).toBeGreaterThan(-1)
    expect(gloss).toBeLessThan(explore.indexOf('<PubCard'))
  })
})

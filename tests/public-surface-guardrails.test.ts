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

  it('does not show the featured plan a second time as a grid card', () => {
    const explore = read('../src/pages/Explore.tsx')
    // The featured pick is derived from the unfiltered set, so without this the
    // most-forked plan rendered twice on a three-item shelf.
    expect(explore).toMatch(/pubs\.filter\(p => p\.id !== featured\.id\)/)
    // The grid, its paging and its "Load more" count all read the deduped list…
    expect(explore).not.toMatch(/pubs\.slice\(0, visibleCount\)/)
    expect(explore).toMatch(/gridPubs\.slice\(0, visibleCount\)/)
    expect(explore).toMatch(/gridPubs\.length > visibleCount/)
    // …while the empty state stays keyed on the full match list: a lone match
    // that IS the featured card must not read as "nothing matches".
    expect(explore).toMatch(/\{pubs\.length === 0 \? \(/)
  })

  it('claims "outside your filters" only when the featured pick really is', () => {
    const explore = read('../src/pages/Explore.tsx')
    // It used to key off `filtersActive` alone, so a filtered page labelled the
    // matching card itself as being outside the filters.
    expect(explore).toMatch(/const featuredOutsideFilters = !!featured && !pubs\.some\(p => p\.id === featured\.id\)/)
    expect(explore).toMatch(/Featured itinerary\{featuredOutsideFilters &&/)
  })
})

describe('the catalog is honest about the login wall behind Fork', () => {
  it('labels the shared card button for what it does when nobody is signed in', () => {
    const card = read('../src/components/PubCard.tsx')
    expect(card).toMatch(/needsLogin \? 'Log in to fork' : 'Fork this trip'/)
    // Every surface that renders the card has to opt in, or a signed-out click
    // goes back to being a silent redirect.
    expect(read('../src/pages/Explore.tsx')).toMatch(/needsLogin=\{!me\}/)
    expect(read('../src/pages/CreatorPage.tsx')).toMatch(/needsLogin=\{!me\}/)
  })

  it('says the account requirement before the click, on every fork button', () => {
    // Explore explains it once, above the cards.
    expect(read('../src/pages/Explore.tsx')).toMatch(/You’ll need a free account to fork trips/)
    const page = read('../src/pages/PublicItinerary.tsx')
    const forkButtons = [...page.matchAll(/className="btn fork-btn/g)].length
    const labelled = [...page.matchAll(/\{me \? 'Fork this trip' : 'Log in to fork'\}/g)].length
    expect(forkButtons).toBe(2)
    expect(labelled).toBe(forkButtons)
  })
})

describe('the invite and snapshot gates name no cause they cannot know', () => {
  it('does not declare the link broken when the fetch merely failed', () => {
    const app = read('../src/App.tsx')
    // Both resolvers log the error and return null, so a failed lookup and a
    // dead code are indistinguishable to the caller.
    expect(app).not.toMatch(/This invite link is broken/)
    expect(app).not.toMatch(/This snapshot link is broken/)
    expect(app).toMatch(/This invite didn’t load/)
    expect(app).toMatch(/This snapshot didn’t load/)
    // joinViaInvite reports false for an RLS refusal or a dropped connection
    // just as readily as for a stale code.
    expect(app).not.toMatch(/the link may be old/)
  })

  it('offers a retry, because a dropped connection is one of the real causes', () => {
    const app = read('../src/App.tsx')
    // The resolve effect has to actually re-run when the button bumps the tick…
    expect(app).toMatch(/\}, \[codeOrTripId, retryTick\]\)/)
    // …and the button must drop back to the spinner rather than sit on the failure.
    expect(app).toMatch(/setStatus\('loading'\); setRetryTick\(t => t \+ 1\)/)
  })
})

describe('the public page names no cause it cannot know', () => {
  it('describes a failed load without picking one explanation', () => {
    const page = read('../src/pages/PublicItinerary.tsx')
    // fetchSharedTrip resolves null for a deleted row AND for a failed select,
    // so "unpublished" was a guess dressed as a diagnosis.
    expect(page).not.toMatch(/may have been unpublished/)
    expect(page).toMatch(/we can’t tell which from here/)
  })
})

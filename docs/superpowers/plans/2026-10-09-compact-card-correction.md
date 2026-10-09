# Compact card correction implementation plan

> For agentic workers: Use `superpowers:executing-plans` for inline execution. Use `superpowers:subagent-driven-development` only if you select delegation. Steps use checkboxes.

Goal: Preserve My Trips card sizes and make Explore cards compact, readable, and consistent with the approved reference.

Architecture: The correction uses the existing editorial card option and public discovery derivations.
Page-local styles retain current grid widths.
The fixture browser script proves geometry and behaviour without live writes.

Tech stack: React 18, TypeScript, Vite 8, Lucide, Vitest in node, and `playwright-core`.
These dependencies already exist in `package.json`.
No new package is part of this plan.

Specification: [Approved compact card correction](../specs/2026-10-09-compact-card-correction-design.md).

Written approval: `ask_93fd554f445729375164aa92`, step `written-correction-specification`.

Status: Plan prepared. None of the product tasks below has started.

## Global constraints

- Work only in `C:\Users\hasna\Yatraflow-minimax\.cache\mr10-explore-discovery`.
- Retain `feat/minimax-mr10-explore-discovery` and its existing uncommitted work.
- Preserve the main checkout's `feat/trip-shell-sidebar` work.
- Do not commit, push, merge, rebase, deploy, seed, or write to live accounts.
- Keep `C:\Users\hasna\yatraflow-mockup` read-only and outside build dependencies.
- Retain current My Trips card widths, grid density, and list behaviour.
- Retain current Explore itinerary card widths and grid column counts.
- Do not enlarge cards to make them square.
- Retain Save, Fork, creator links, social links, menus, and next-step actions.
- Retain real date, activity, permission, and saved-cover meanings.
- Retain all five sorts, filters, URL state, pagination, and the global featured-card exception.
- Use live publications only for Places and all four hero facts.
- Do not invent ratings, follower counts, public save counts, travellers, or earnings.
- Retain unknown-write rejection in the bounded synthetic fixture.
- Keep Vitest in node without DOM. Use browser scripts for rendered checks.
- Use spacing `[2, 4, 6, 8, 12, 14, 16, 20, 22, 24]`.
- Use the existing motion tokens and reduced-motion opt-outs.
- Preserve existing line endings when you edit files.
- Do not raise baselines, weaken checks, or increase timeouts to hide failures.
- Keep accepted decision records unchanged.
- Keep backend identifiers, credentials, and auth storage out of deliverables.
- Use explicit PowerShell working directories and check each native exit code.
- Run browser captures serially. Freeze product source and build during each capture set.
- Keep functional checks separate from your visual acceptance.

## Files and responsibilities

| File | Planned responsibility |
|---|---|
| `src/lib/discovery.ts` | Normalize place labels, count live route places, and extend community facts |
| `tests/discovery.test.ts` | Pure place, count, order, and existing discovery regressions |
| `src/components/PubCard.tsx` | Compact editorial card branch, without changing default consumers |
| `src/components/ExploreDiscovery.tsx` | Compact creator identity and public Places tiles |
| `src/pages/Explore.tsx` | Four hero items, annotation, tile search, and existing read guards |
| `src/styles.css` | Update existing page-local card rules and add new annotation and Places rules |
| `index.html` | Add Caveat 600 to the existing hosted-font request |
| `scripts/compactCardChecks.mjs` | Pure comparison of before and after card rectangles |
| `scripts/redesignFixture.mjs` | Synthetic creator social URLs for rendered icon checks |
| `tests/redesign-fixture.test.ts` | Preserve fixture safety with those synthetic social URLs |
| `tests/compact-card-checks.test.ts` | Prove geometry checks reject enlargement and false compactness |
| `scripts/browser-redesign-check.mjs` | Collect rectangles and check new content, focus, states, and motion |
| `tests/editorial-contrast.test.ts` | Keep real token-pair checks for any new solid text backing |
| `.cache/visual-quality-review-2026-10-09/build-review.mjs` | Include fresh correction evidence without stale-source exceptions |
| `.cache/visual-quality-review-2026-10-09/check-review.mjs` | Retain portable comparison control and no-external-request checks |
| `docs/redesign/VISUAL-QUALITY-REVIEW.md` | Record actual checks, limits, and visual-review state |
| `CHANGELOG.md`, `ROADMAP.md`, `docs/README.md` | Describe final product changes and accurate task state |

`TripsList.tsx`, `CoverThumb.tsx`, and `EditorialPhoto.tsx` keep their existing behaviour.
Change these files only if a reproduced card defect cannot be fixed in the scoped presentation.
Do not refactor the store or workspace for this correction.

## Task 1: Record and protect current card geometry

Files:

- Create `scripts/compactCardChecks.mjs`.
- Create `tests/compact-card-checks.test.ts`.
- Modify `scripts/browser-redesign-check.mjs` around options, initial capture, and report output.
- Modify `scripts/redesignFixture.mjs` and `tests/redesign-fixture.test.ts` for synthetic social icon coverage.
- Create evidence under `.cache/compact-card-before-light/` and `.cache/compact-card-before-dark/`.

Interfaces:

- Consume the existing fixture, source fingerprints, production fingerprints, and initial screenshot hash.
- Produce `result.compactGeometry` before acceptance interactions.
- Produce `compareCompactCardGeometry(before, after): string[]`.
- Each geometry group contains `{ key, width, height, top, coverWidth, coverHeight }` rows.
- Groups are `trips`, `catalog`, `trending`, and `creators`.
- Each row key is its trip, publication, or creator URL pathname.

### Step 1: Add failing pure checks

- [ ] Add tests with one unchanged-width trip, one shorter publication, and one shorter creator.

```ts
import { describe, expect, it } from 'vitest'
import { compareCompactCardGeometry } from '../scripts/compactCardChecks.mjs'

const box = (key: string, height: number, width = 260, top = 0) => ({
  key, width, height, top, coverWidth: width, coverHeight: 120,
})
const before = {
  trips: [box('/trip/a', 400)],
  catalog: [box('/pub/a', 500)],
  trending: [box('/pub/b', 500)],
  creators: [box('/creator/a', 300)],
}
const after = {
  trips: [box('/trip/a', 395)],
  catalog: [box('/pub/a', 420)],
  trending: [box('/pub/b', 420)],
  creators: [box('/creator/a', 280)],
}

describe('compact card geometry', () => {
  it('accepts smaller cards at unchanged widths', () => {
    expect(compareCompactCardGeometry(before, after)).toEqual([])
  })
  it('rejects enlargement as a shortcut', () => {
    const changed = { ...after, catalog: [box('/pub/a', 420, 300)] }
    expect(compareCompactCardGeometry(before, changed).join(' ')).toMatch(/width/)
  })
  it('rejects a card that did not become compact', () => {
    const changed = { ...after, catalog: [box('/pub/a', 480)] }
    expect(compareCompactCardGeometry(before, changed).join(' ')).toMatch(/height/)
  })
  it('rejects a missing card instead of calling removal compactness', () => {
    expect(compareCompactCardGeometry(before, { ...after, trending: [] }).join(' ')).toMatch(/keys/)
  })
  it('rejects a changed column count', () => {
    const first = { ...before, trips: [box('/trip/a', 400), box('/trip/b', 400)] }
    const second = { ...after, trips: [box('/trip/a', 395), box('/trip/b', 395, 260, 420)] }
    expect(compareCompactCardGeometry(first, second).join(' ')).toMatch(/columns/)
  })
})
```

- [ ] Run the tests and record the missing-module failure.

```powershell
Set-Location 'C:\Users\hasna\Yatraflow-minimax\.cache\mr10-explore-discovery'
npx vitest run tests/compact-card-checks.test.ts --maxWorkers 1
```

### Step 2: Add the pure geometry comparison

- [ ] Add this comparison without changing product code.

```js
const groups = ['trips', 'catalog', 'trending', 'creators']
const columns = rows => {
  if (!rows.length) return 0
  const firstTop = Math.min(...rows.map(row => row.top))
  return rows.filter(row => Math.abs(row.top - firstTop) <= 2).length
}

export function compareCompactCardGeometry(before, after) {
  const failures = []
  for (const group of groups) {
    const previous = before[group]
    const current = after[group]
    if (!Array.isArray(previous) || !Array.isArray(current)) {
      failures.push(`${group}: missing geometry`)
      continue
    }
    const keys = rows => rows.map(row => row.key).sort().join('\n')
    if (keys(previous) !== keys(current)) {
      failures.push(`${group}: card keys changed`)
      continue
    }
    if (new Set(current.map(row => row.key)).size !== current.length) {
      failures.push(`${group}: duplicate card keys`)
    }
    if (columns(previous) !== columns(current)) failures.push(`${group}: columns changed`)
    for (const oldRow of previous) {
      const row = current.find(item => item.key === oldRow.key)
      if (![row.width, row.height, oldRow.width, oldRow.height].every(value => Number.isFinite(value) && value > 0)) {
        failures.push(`${group}: invalid rectangle for ${row.key}`)
        continue
      }
      if (Math.abs(row.width - oldRow.width) > 2) failures.push(`${group}: width changed for ${row.key}`)
      if (group === 'trips' && row.height > oldRow.height + 2) failures.push(`${group}: height grew for ${row.key}`)
      if (['catalog', 'trending'].includes(group) && row.height > oldRow.height * 0.85) {
        failures.push(`${group}: height did not decrease by 15 percent for ${row.key}`)
      }
      if (group === 'creators' && row.height >= oldRow.height) failures.push(`${group}: height did not decrease for ${row.key}`)
    }
  }
  return failures
}
```

- [ ] Add rejection tests for non-finite rectangles and duplicate keys.
- [ ] Run the focused suite and record its exit code.

### Step 3: Collect real rectangles before interactions

- [ ] Add `--compact-baseline` as an optional report path.
- [ ] Add `--compact-target` as an explicit target-check flag.
- [ ] Reject baseline paths outside this worktree using the existing output-path boundary pattern.
- [ ] Collect rectangles before the initial screenshot and before any Save or Fork interaction.

```js
result.compactGeometry = await page.evaluate(() => {
  const selectors = {
    trips: '.trips-page .explore-grid:not(.as-list) .itin-card',
    catalog: '.explore-catalog .pub-card-editorial .itin-card',
    trending: '.trending-grid .pub-card-editorial .itin-card',
    creators: '.explore-page .creator-card',
  }
  return Object.fromEntries(Object.entries(selectors).map(([group, selector]) => [group,
    [...document.querySelectorAll(selector)].filter(card => {
      const rect = card.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    }).map(card => {
      const link = card.matches('a') ? card : card.querySelector('.trip-card-hit')
      const rect = card.getBoundingClientRect()
      const cover = card.querySelector('.trip-card-media, .itin-cover, .creator-cover')?.getBoundingClientRect()
      return {
        key: new URL(link.href).pathname,
        width: rect.width, height: rect.height, top: rect.top,
        coverWidth: cover?.width ?? 0, coverHeight: cover?.height ?? 0,
      }
    }),
  ]))
})
```

- [ ] Record `fontMode` and `exploreAuth` in each result so comparisons can reject unlike capture conditions.
- [ ] Match baseline results by surface, width, theme, state, scenario, images, auth mode, and motion mode.
- [ ] Require loaded interface and editorial fonts on both sides of a geometry comparison.
- [ ] Keep Caveat outside this before-and-after font match because the baseline has no annotation.
- [ ] Retain baseline-era source hashes as historical evidence. Do not require them to match corrected source.
- [ ] Reject a baseline with failures or source changes during its own capture.
- [ ] Run geometry comparison only for populated mixed fixtures with matching loaded-font conditions.
- [ ] Keep broken-image, sparse, long-text, and alternate-state runs separate from the 15 percent height target.

### Step 4: Capture the unchanged product

- [ ] Give the synthetic owner both social URLs before baseline capture.
- [ ] Keep the other creator without social URLs to cover both layouts.
- [ ] Assert these URLs in `tests/redesign-fixture.test.ts` before changing the fixture.

```ts
it('exposes both synthetic social controls without real account URLs', () => {
  const fixture = buildFixture()
  const owner = fixture.profiles.find(profile => profile.id === OWNER_ID)!
  const other = fixture.profiles.find(profile => profile.id === OTHER_ID)!
  expect(owner.social_links).toEqual({
    youtube: 'https://social.redesign-fixture.invalid/youtube/asha',
    instagram: 'https://social.redesign-fixture.invalid/instagram/asha',
  })
  expect(other.social_links).toEqual({})
})
```

Add this field in the existing profile mapper:

```js
social_links: id === OWNER_ID ? {
  youtube: 'https://social.redesign-fixture.invalid/youtube/asha',
  instagram: 'https://social.redesign-fixture.invalid/instagram/asha',
} : {},
```

- [ ] Run the fixture suite and retain unknown-write rejection.
- [ ] Abort all requests to this synthetic social host, including requests from popup pages.
- [ ] Verify both controls attempt the intended URL without accessing any real social account.
- [ ] Use these same synthetic profiles for all before and after captures.
- [ ] Build the current product once before any product correction.
- [ ] Start or confirm the isolated production preview on port 5189.
- [ ] Confirm its process root, built entry, assets, and compiled backend binding before capture.
- [ ] Keep backend identifiers out of logs and delivery text.

```powershell
Set-Location 'C:\Users\hasna\Yatraflow-minimax\.cache\mr10-explore-discovery'
npm run build
npx vite preview --host localhost --port 5189 --strictPort
```

Run the preview as a managed background process with the existing one-hour limit.
Do not restart an unfinished background command.
Do not kill another clone's process if port 5189 has a different owner.

- [ ] Run each baseline command serially and check its exit code.

```powershell
node scripts/browser-redesign-check.mjs --base-url http://localhost:5189 --production-build --surfaces my-trips,explore --widths 1440,1024,768,390 --images reference --explore-auth signed-in --theme light --out .cache/compact-card-before-light
node scripts/browser-redesign-check.mjs --base-url http://localhost:5189 --production-build --surfaces my-trips,explore --widths 1440,1024,768,390 --images reference --explore-auth signed-in --theme dark --out .cache/compact-card-before-dark
```

- [ ] Run `--compact-target` against the unchanged product and record the expected geometry failure.
- [ ] Preserve baseline files and their hashes throughout this correction.

Acceptance: Baseline images survive interactions. The geometry checker rejects wider cards and unchanged tall cards.
No product source changes occur in this task.

## Task 2: Derive Places and four truthful hero facts

Files:

- Modify `src/lib/discovery.ts:133-146`.
- Modify `tests/discovery.test.ts:287-308` and add place tests.

Interfaces:

```ts
export interface CommunityPlace {
  key: string
  name: string
  pubCount: number
}
export function communityPlaces(pubs: PublishedItinerary[], limit?: number): CommunityPlace[]
export function communityCounts(pubs: PublishedItinerary[]): {
  pubCount: number
  creatorCount: number
  placeCount: number
  forks: number
}
```

`communityPlaces` defaults to six tiles.
`communityCounts` uses all places, not only the first six.
The existing `pubCount` and `creatorCount` keep their meanings.

### Step 1: Add failing pure tests

- [ ] Import `communityPlaces` into the existing test file.
- [ ] Add these cases using its existing `pub` helper.

```ts
it('counts each publication once per normalized place', () => {
  const rows = [
    { ...pub('a', 'one', { copies: 3 }), routeSummary: [' Goa ', 'GOA', 'New   Delhi', ''] },
    { ...pub('b', 'two', { copies: 2 }), routeSummary: ['Goa', 'New Delhi'] },
    { ...pub('hidden', 'three', { copies: 100, unpublishedAt: 1 }), routeSummary: ['Hidden'] },
  ]
  expect(communityPlaces(rows)).toEqual([
    { key: 'goa', name: 'GOA', pubCount: 2 },
    { key: 'new delhi', name: 'New Delhi', pubCount: 2 },
  ])
  expect(communityCounts(rows)).toEqual({ pubCount: 2, creatorCount: 2, placeCount: 2, forks: 5 })
  expect(communityPlaces([...rows].reverse())).toEqual(communityPlaces(rows))
})

it('does not turn a town label into a regional claim', () => {
  const rows = [{ ...pub('a', 'one'), routeSummary: ['Kochi', 'Kerala'] }]
  expect(communityPlaces(rows).map(place => place.key)).toEqual(['kerala', 'kochi'])
})

it('caps tiles without capping the hero place count', () => {
  const rows = [{ ...pub('a', 'one'), routeSummary: Array.from({ length: 8 }, (_, i) => `Place ${i}`) }]
  expect(communityPlaces(rows)).toHaveLength(6)
  expect(communityCounts(rows).placeCount).toBe(8)
})
```

The stable raw-label tie chooses `GOA` before `Goa` for that synthetic test.
The real label stays source-derived rather than title-cased by guesswork.

- [ ] Add empty, all-blank, all-unpublished, zero-fork, equal-count, and input-immutability cases.
- [ ] Update the three existing exact `communityCounts` expectations with `placeCount` and `forks`.
- [ ] Run `npx vitest run tests/discovery.test.ts --maxWorkers 1` and record RED.

### Step 2: Add the derivation

- [ ] Add the following functions without changing ranking or feature selection.

```ts
export interface CommunityPlace {
  key: string
  name: string
  pubCount: number
}

function comparePlaceText(a: string, b: string): number {
  return a.localeCompare(b, 'en') || (a < b ? -1 : a > b ? 1 : 0)
}

export function communityPlaces(pubs: PublishedItinerary[], limit = 6): CommunityPlace[] {
  const places = new Map<string, CommunityPlace>()
  for (const publication of livePubs(pubs)) {
    const counted = new Set<string>()
    for (const rawName of publication.routeSummary) {
      const name = rawName.trim().replace(/\s+/g, ' ')
      if (!name) continue
      const key = name.toLocaleLowerCase('en')
      const place = places.get(key) ?? { key, name, pubCount: 0 }
      if (name < place.name) place.name = name
      if (!counted.has(key)) place.pubCount += 1
      counted.add(key)
      places.set(key, place)
    }
  }
  return [...places.values()]
    .sort((a, b) => b.pubCount - a.pubCount || comparePlaceText(a.name, b.name) || comparePlaceText(a.key, b.key))
    .slice(0, limit)
}

export function communityCounts(pubs: PublishedItinerary[]): {
  pubCount: number
  creatorCount: number
  placeCount: number
  forks: number
} {
  const live = livePubs(pubs)
  return {
    pubCount: live.length,
    creatorCount: new Set(live.map(publication => publication.creatorId)).size,
    placeCount: communityPlaces(live, Infinity).length,
    forks: live.reduce((total, publication) => total + publication.copies, 0),
  }
}
```

- [ ] Run discovery, soft-unpublish, editorial-assets, and fixture tests.

```powershell
npx vitest run tests/discovery.test.ts tests/soft-unpublish.test.ts tests/editorial-assets.test.ts tests/redesign-fixture.test.ts --maxWorkers 1
```

Acceptance: Live route data supplies every fact. Duplicate route stops do not inflate counts.
No new backend read or write exists.

## Task 3: Replace only the editorial publication card layout

Files:

- Modify `src/components/PubCard.tsx:5-90`.
- Modify existing Explore card rules in `src/styles.css:4093-4196`.
- Modify editorial anatomy checks in `scripts/browser-redesign-check.mjs`.

Interfaces:

- Retain the existing `PubCard` props and callbacks.
- Retain `.card.itin-card`, `.trip-card-hit`, `.card-title`, and `.save-heart` for current checks.
- Add `.save-bookmark` only to the editorial Save control.
- Add `.pub-card-media`, `.pub-card-cover-link`, and `.pub-card-creator` for the compact layout.
- The default non-editorial branch remains unchanged.

### Step 1: Add rendered checks before restyling

- [ ] Assert one duration label and one fork-evidence label per editorial card.
- [ ] Assert that editorial Save contains the Lucide bookmark glyph, not the heart glyph.
- [ ] Assert that `.itin-cover-route` does not exist inside editorial cards.
- [ ] Assert that editorial titles use Plus Jakarta Sans.
- [ ] Assert that the creator identity, social links, and Fork button remain visible.
- [ ] Check the old pseudo-element divider with computed styles and require its removal in the target run.

```js
const anatomy = await page.locator('.pub-card-editorial .itin-card').evaluateAll(cards => cards.map(card => ({
  routeOverPhoto: card.querySelectorAll('.itin-cover-route').length,
  bookmark: Boolean(card.querySelector('.save-bookmark .lucide-bookmark')),
  titleFamily: getComputedStyle(card.querySelector('.card-title')).fontFamily,
  divider: getComputedStyle(card.querySelector('.itin-meta'), '::before').borderTopWidth,
  bioFooter: card.querySelectorAll('.itin-foot').length,
})))
for (const card of anatomy) {
  assert.equal(card.routeOverPhoto, 0)
  assert.equal(card.bookmark, true)
  assert(card.titleFamily.includes('Plus Jakarta Sans'))
  assert.equal(Number.parseFloat(card.divider) || 0, 0)
  assert.equal(card.bioFooter, 0)
}
```

- [ ] Record the old-product failure before changing the card.
- [ ] Keep these checks behind `--compact-target` until the whole correction is ready.

### Step 2: Add an editorial branch without changing default behaviour

- [ ] Name the existing inline prop type `PubCardProps`.
- [ ] Add `Bookmark` and `Eye` to the existing Lucide import.
- [ ] Return a private `EditorialPubCard` when `editorial` is true.
- [ ] Keep the current default card return for every other caller.
- [ ] Use this editorial structure.

```tsx
function EditorialPubCard({ pub, creator, saved, onFork, onToggleSave, enterIndex, needsLogin }: PubCardProps) {
  return (
    <div className={`pub-card-editorial${enterIndex != null ? ' trip-enter' : ''}`}
      style={enterIndex != null ? { animationDelay: `calc(var(--stagger-step) * ${Math.min(enterIndex, 8)})` } : undefined}>
      <div className="card itin-card">
        <div className="pub-card-media">
          <a className="pub-card-cover-link" {...appLink(`/pub/${pub.id}`)} aria-label={`Open ${pub.title}`}>
            <CoverThumb trip={{ name: pub.title, destinations: pub.routeSummary }}
              explicitUrl={pub.coverImageUrl} emoji="🧭" editorial
              fallbackUrl={editorialRouteCover(pub.routeSummary)} />
          </a>
          <span className="pub-card-duration num">{pub.durationDays} {pub.durationDays === 1 ? 'day' : 'days'}</span>
          <button type="button" className="save-heart save-bookmark" aria-pressed={saved}
            aria-label={saved ? 'Remove from saved' : 'Save itinerary'} onClick={onToggleSave}>
            <Bookmark size={16} aria-hidden fill={saved ? 'currentColor' : 'none'} />
          </button>
        </div>
        <a className="trip-card-hit" {...appLink(`/pub/${pub.id}`)}>
          <div className="itin-body">
            <h2 className="card-title">{pub.title}</h2>
            <p className="small muted itin-tagline">{pub.tagline}</p>
            <div className="pub-card-tags"><Chip tone="teal">{cap(pub.travelStyle)}</Chip></div>
            <div className="stop-meta num">
              <span><MetaIcon icon={Wallet} tone="money" />~{formatInr(pub.estimatedBudgetPerPersonInr)}/person</span>
              <span><MetaIcon icon={MapPin} tone="place" />{pub.routeSummary.length} places</span>
            </div>
          </div>
        </a>
        <div className="pub-card-creator">
          <a className="creator-line" {...appLink(`/creator/${pub.creatorId}`)}
            aria-label={`View ${creator?.profile.name ?? 'creator'}'s page`}>
            <Avatar user={creator} />
            <span>{creator?.profile.name ?? 'Creator'}</span>
            {creator?.profile.isCreator && <Sparkles size={12} aria-hidden />}
          </a>
          <div className="pub-card-socials">
            {creator?.profile.isCreator && creator.profile.socialLinks?.youtube && (
              <a href={creator.profile.socialLinks.youtube} target="_blank" rel="noreferrer noopener"
                aria-label={`${creator.profile.name} on YouTube`} className="icon-link"
                onClick={event => { event.preventDefault(); openExternal(creator.profile.socialLinks!.youtube!) }}>
                <TvMinimalPlay size={14} aria-hidden />
              </a>
            )}
            {creator?.profile.isCreator && creator.profile.socialLinks?.instagram && (
              <a href={creator.profile.socialLinks.instagram} target="_blank" rel="noreferrer noopener"
                aria-label={`${creator.profile.name} on Instagram`} className="icon-link"
                onClick={event => { event.preventDefault(); openExternal(creator.profile.socialLinks!.instagram!) }}>
                <Camera size={14} aria-hidden />
              </a>
            )}
          </div>
        </div>
        <div className="row-between itin-meta">
          <span className="itin-public-evidence num">
            <span><InlineIcon icon={Eye} size={12} />{pub.views} views</span>
            <span><InlineIcon icon={GitFork} size={12} />{pub.copies} {pub.copies === 1 ? 'fork' : 'forks'}</span>
          </span>
          <button type="button" className="btn btn-primary btn-sm" onClick={onFork}>
            {needsLogin ? 'Log in to fork' : 'Fork this trip'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

This structure leaves complete route details on the publication page.
It removes the photo caption rather than replacing it with another unreadable overlay.
Use the current saved-cover precedence inside `CoverThumb`.
Do not add an empty `routeLabel` element.

### Step 3: Update existing scoped rules

- [ ] Fold these values into the existing Explore editorial rules.
- [ ] Add only genuinely new selector names as new rules.

```css
.explore-page .pub-card-editorial .card.itin-card {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0;
}
.explore-page .pub-card-editorial .itin-cover {
  aspect-ratio: 16 / 7.2;
  padding: 0;
}
.explore-page .pub-card-editorial .trip-card-hit {
  display: block;
  transition: none;
}
.explore-page .pub-card-editorial .trip-card-hit:hover {
  transform: none;
  box-shadow: none;
}
.explore-page .pub-card-editorial .itin-body {
  padding: 12px 14px 0;
  gap: 8px;
}
.explore-page .pub-card-editorial .card-title {
  font-family: var(--font-body);
  font-size: 16px;
  line-height: 1.3;
}
.explore-page .pub-card-editorial .itin-tagline {
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.explore-page .pub-card-editorial .row-between.itin-meta {
  padding: 8px 14px 14px;
  margin: 0;
  gap: 8px;
}
.explore-page .pub-card-editorial .itin-meta::before {
  content: none;
  border: 0;
}
.explore-page .pub-card-editorial .itin-public-evidence {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  font-size: 11px;
}
.pub-card-media { position: relative; }
.pub-card-cover-link { display: block; }
.pub-card-duration {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: var(--z-content);
  padding: 4px 12px;
  border-radius: 999px;
  background: var(--color-editorial-surface);
  color: var(--color-editorial-ink);
  font-size: 12px;
  font-weight: 700;
}
.pub-card-creator {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  padding: 8px 14px 0;
}
.pub-card-socials { display: flex; gap: 6px; }
```

`src/styles.css:221` defines `--font-body` as Plus Jakarta Sans with system fallbacks.
Use that existing token without a global font change.

- [ ] Give Save and social controls at least their existing hit area.
- [ ] Give both publication links a visible keyboard focus ring.
- [ ] Position trending rank above the card, outside duration and bookmark controls.

```css
.explore-page .trend-row { padding-top: 24px; }
.explore-page .trend-rank {
  top: 0;
  left: 0;
  background: var(--color-editorial-surface);
  color: var(--color-editorial-accent-ink);
}
```

Fold those properties into their existing rules.
The rank space belongs to the wrapper, not the publication card's measured height.

- [ ] Retain the existing itinerary grid and its three, two, and one-column rules.

### Step 4: Prove card behaviour

- [ ] Run typecheck, design-system, contrast, cover-sizing, and fixture tests.

```powershell
npm run verify:typecheck
npx vitest run tests/design-system.test.ts tests/editorial-contrast.test.ts tests/cover-sizing.test.ts tests/redesign-fixture.test.ts --maxWorkers 1
```

- [ ] Build and run a populated Explore target check against its matching baseline.
- [ ] Check signed-out Fork reaches Auth and signed-in free Fork retains bounded synthetic persistence.
- [ ] Check Save twice, reload, creator navigation, both social links, and publication navigation.
- [ ] Keep social-link requests blocked in browser tests.

Acceptance: Real controls remain reachable. Cards are at least 15 percent shorter without increased widths.
The geometry target must pass through layout correction, not smaller fonts below the existing floor.

## Task 4: Compact creator identity and clean My Trips spacing

Files:

- Modify `src/components/ExploreDiscovery.tsx:27-54`.
- Modify creator rules in `src/styles.css:4110-4115`.
- Modify My Trips footer and body rules in `src/styles.css:9213-9245`.
- Modify rendered checks in `scripts/browser-redesign-check.mjs`.

Interfaces:

- Retain `FeaturedCreators({ creators: CreatorRank[] })`.
- Add `.creator-identity` inside the existing `.creator-card-body`.
- Retain the existing creator label, cover source, bio, evidence, and rank.
- Retain all My Trips handlers and domain derivations.

### Step 1: Add failing rendered checks

- [ ] Require the avatar and creator name to share a row.
- [ ] Require creator covers to reach the card's content edges without an inner frame.
- [ ] Require zero My Trips footer border width.
- [ ] Compare card widths, column counts, and creator heights against Task 1.
- [ ] Record the unchanged-product failure for the new spacing checks.

```js
const creator = page.locator('.creator-card').first()
const avatarBox = await creator.locator('.avatar').boundingBox()
const nameBox = await creator.locator('.creator-name').boundingBox()
assert(avatarBox && nameBox)
assert(Math.min(avatarBox.y + avatarBox.height, nameBox.y + nameBox.height) > Math.max(avatarBox.y, nameBox.y))
const borders = await page.locator('.trip-card-foot').evaluateAll(rows => rows.map(row => getComputedStyle(row).borderTopWidth))
assert(borders.every(value => Number.parseFloat(value) === 0))
```

`Avatar` declares `.avatar` in `src/components/ui.tsx:10`.
Its large size is 44px, including the initials fallback.

### Step 2: Put identity in one row

- [ ] Replace the avatar and name siblings with this identity group.

```tsx
<div className="creator-identity">
  <Avatar user={user} size="lg" />
  <span className="creator-name">
    <span className="creator-name-text">{user.profile.name}</span>
    <InlineIcon icon={Sparkles} size={12} gap={0} vAlign="-1px" />
  </span>
  <span className="creator-rank num" aria-hidden="true">#{index + 1}</span>
</div>
```

- [ ] Keep the existing bio and evidence after the identity group.
- [ ] Keep `creatorCardLabel(rank, index + 1)` on the outer link.
- [ ] Fold the compact values into the existing scoped creator rules.

```css
.explore-page .creator-card { padding: 0; gap: 0; overflow: hidden; }
.explore-page .creator-cover { height: 112px; border-radius: 0; }
.explore-page .creator-card-body { padding: 12px 14px 14px; gap: 8px; }
.creator-identity { display: flex; align-items: center; gap: 8px; min-width: 0; }
.creator-identity .creator-name { flex: 1; min-width: 0; }
.creator-identity .creator-rank { flex: none; }
```

The 112px cover is below the approved 132px ceiling.
It does not change creator grid widths or add another column.
The bio remains clamped to two visible lines.
The creator page still exposes the full bio.

### Step 3: Remove My Trips internal dividers without changing geometry

- [ ] Set the existing `.trips-page .trip-card-foot` border to zero.
- [ ] Keep its current left and right padding.
- [ ] Keep the existing `16 / 8.4` cover ratio and grid widths.
- [ ] Align metadata with inline-flex and existing icon sizes.
- [ ] Allow crew and action labels to wrap without covering the card menu.

```css
.trips-page .trip-card-foot {
  border-top: 0;
  flex-wrap: wrap;
}
.trips-page .trip-card-foot .member-stack { flex: none; }
.trips-page .trip-card-foot .trip-task-row { min-width: 0; }
.trips-page .trip-card-meta li { align-items: center; }
```

Fold these properties into the existing selectors instead of appending duplicates.
Do not change `.container`, `.trips-page` width, or `.explore-grid` column definitions.

### Step 4: Run geometry and action checks

- [ ] Run discovery, trip-next-step, featured-trip, cover-sizing, and design-system tests.
- [ ] Run My Trips grid and list checks with long names, no days, missing covers, and mixed statuses.
- [ ] Check trash, cover actions, crew facts, next-step routes, and the eight workspace routes.
- [ ] Keep editor membership as an explicit evidence gap unless the fixture proves actual editor membership.
- [ ] Record the before and after creator height difference.

Acceptance: Creator cards become shorter. My Trips widths and column counts remain unchanged.
No permission, route, or planning fact changes.

## Task 5: Restore Places, hero composition, and motion

Files:

- Modify `src/components/ExploreDiscovery.tsx` to add `CommunityPlaces`.
- Modify `src/pages/Explore.tsx:164-169`, hero markup, and the right rail.
- Modify existing hero and motion rules in `src/styles.css`.
- Modify `index.html:38` for Caveat 600.
- Modify `scripts/browser-redesign-check.mjs` for content, tile actions, font use, focus, and sampled motion.
- Modify `tests/editorial-contrast.test.ts` if you add a solid annotation-backing token.

Interfaces:

```ts
export function CommunityPlaces(props: {
  places: CommunityPlace[]
  onSelect: (place: string) => void
}): JSX.Element | null
```

`CommunityPlace` comes from Task 2.
`selectCommunityPlace(place: string): void` remains local to `ExplorePage`.
The handler keeps existing `syncUrl`, sort state, `PAGE_SIZE`, and `showExploreSection`.

### Step 1: Add failing content and interaction checks

- [ ] Require four hero items after a successful read.
- [ ] Require zero hero facts during loading or failure.
- [ ] Require the annotation's three text lines.
- [ ] Require Places tile counts to match the live fixture routes.
- [ ] Require one to six tiles without padding a sparse catalog.
- [ ] Click a place after changing sort and clearing previous search state.
- [ ] Assert `q`, cleared narrowing filters, retained sort, pagination reset, and hidden discovery.

```js
await page.getByRole('heading', { name: 'Places in the community', exact: true }).waitFor()
assert.equal(await page.locator('.explore-live-counts > li').count(), 4)
const place = page.locator('.community-place').filter({ hasText: 'Goa' }).first()
await place.click()
const query = new URL(currentRoute(page), 'http://fixture.test').searchParams
assert.equal(query.get('q'), 'Goa')
assert.equal(query.has('style'), false)
assert.equal(query.has('max'), false)
assert.equal(query.has('dur'), false)
assert.equal(await page.locator('.community-places').count(), 0)
await page.reload()
assert.equal(new URL(currentRoute(page), 'http://fixture.test').searchParams.get('q'), 'Goa')
```

Use the actual source-derived fixture place label if normalization selects another letter case.
The tile count describes route occurrences, not every match from the broader search.
Keep the global feature exception check after this search.

### Step 2: Add the Places component

- [ ] Import `MapPin` and the `CommunityPlace` type.
- [ ] Add this bounded component.

```tsx
export function CommunityPlaces({ places, onSelect }: {
  places: CommunityPlace[]
  onSelect: (place: string) => void
}) {
  if (!places.length) return null
  return (
    <section className="community-places" aria-labelledby="community-places-heading">
      <h2 id="community-places-heading">Places in the community</h2>
      <div className="community-place-grid">
        {places.map(place => (
          <button key={place.key} type="button" className="community-place"
            aria-label={`Explore ${place.name}: ${place.pubCount} public ${place.pubCount === 1 ? 'itinerary' : 'itineraries'}`}
            onClick={() => onSelect(place.name)}>
            <EditorialPhoto src={editorialRouteCover([place.name])} className="community-place-photo">
              <span className="editorial-cover-fallback" aria-hidden="true"><MapPin size={20} /></span>
            </EditorialPhoto>
            <span className="community-place-name">{place.name}</span>
            <span className="community-place-count num">{place.pubCount} {place.pubCount === 1 ? 'itinerary' : 'itineraries'}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
```

- [ ] Derive `places` with `useMemo(() => communityPlaces(published), [published])`.
- [ ] Mount Places after `ShareStoriesCta` and before `.explore-fork-note`.
- [ ] Guard it with `discoveryVisible`, not only the presence of old cached rows.
- [ ] Add this page-local handler.

```ts
function selectCommunityPlace(place: string) {
  setQ(place)
  setStyle('all')
  setMaxBudget('')
  setDuration('all')
  setSavedOnly(false)
  setVisibleCount(PAGE_SIZE)
  syncUrl({ q: place, style: 'all', max: '', dur: 'all' })
  showExploreSection('explore-catalog')
}
```

`syncUrl` keeps the current sort because this patch does not replace it.
Saved remains browser-local and does not enter the URL.

### Step 3: Add four hero items and the annotation

- [ ] Add `Users` to the existing Lucide import.
- [ ] Replace only the two-item hero count paragraph with this list.

```tsx
{pubsRead === 'ready' && (
  <ul className="explore-live-counts num" aria-label="Public catalog facts">
    <li><Calendar size={17} aria-hidden /><span><strong>{community.pubCount}</strong>live {community.pubCount === 1 ? 'itinerary' : 'itineraries'}</span></li>
    <li><Users size={17} aria-hidden /><span><strong>{community.creatorCount}</strong>{community.creatorCount === 1 ? 'creator' : 'creators'}</span></li>
    <li><MapPin size={17} aria-hidden /><span><strong>{community.placeCount}</strong>route {community.placeCount === 1 ? 'place' : 'places'}</span></li>
    <li><GitFork size={17} aria-hidden /><span><strong>{community.forks}</strong>{community.forks === 1 ? 'fork' : 'forks'}</span></li>
  </ul>
)}
```

- [ ] Add the annotation as a sibling of `.explore-photo-hero-content` inside `EditorialPhoto`.

```tsx
<div className="explore-hero-annotation">
  <p>Real travellers<br />Real stories<br />Better trips</p>
  <svg viewBox="0 0 64 48" aria-hidden="true" focusable="false">
    <path d="M9 6c25 1 39 10 43 31M41 30l11 7 4-13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
</div>
```

- [ ] Add `family=Caveat:wght@600` to the existing hosted-font request.
- [ ] Record actual Caveat use and load in the browser font report.
- [ ] Check failed-font geometry without claiming a loaded handwritten font.

### Step 4: Add compact styles and stronger image treatment

- [ ] Replace the hero's existing `::before` background with a page-local scrim.
- [ ] Do not change the shared editorial scrim token used by unrelated pages.
- [ ] Fold this light scrim into the existing hero rule.

```css
.explore-photo-hero::before {
  background: linear-gradient(100deg,
    rgba(255, 252, 246, .82) 0%,
    rgba(255, 252, 246, .52) 42%,
    rgba(255, 252, 246, .12) 66%,
    rgba(255, 252, 246, 0) 78%);
}
```

- [ ] Add a dark-theme directional scrim using the dark editorial paper colour.
- [ ] Give text a local opaque backing where composited contrast fails.
- [ ] Retain the current hero height instead of adding empty space for metrics.
- [ ] Update the existing count list to four compact columns.
- [ ] Use two columns when the main column cannot fit four readable items.

```css
.explore-live-counts {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px 12px;
  padding: 0;
  margin: 0 0 16px;
  list-style: none;
}
.explore-live-counts li { display: flex; align-items: center; gap: 8px; min-width: 0; }
.explore-live-counts li > svg { flex: none; }
.explore-live-counts strong { font-size: 16px; }
.explore-photo-hero > .explore-hero-annotation {
  position: absolute;
  right: 20px;
  top: 20px;
  pointer-events: none;
  transform: rotate(-5deg);
  color: var(--color-editorial-ink);
}
.explore-hero-annotation p { font-family: 'Caveat', cursive; font-size: 24px; line-height: 1.2; margin: 0; }
.explore-hero-annotation svg { width: 54px; height: 44px; margin: 4px auto 0; }
.community-places {
  padding: 20px;
  border: 1px solid var(--color-editorial-border);
  border-radius: var(--radius);
  background: var(--color-editorial-surface);
}
.community-places h2 { font-size: 16px; margin: 0 0 14px; }
.community-place-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px 12px; }
.community-place { padding: 0; min-width: 0; border: 0; background: transparent; color: var(--color-editorial-ink); text-align: left; cursor: pointer; }
.community-place-photo { aspect-ratio: 4 / 3; border-radius: var(--radius-sm); }
.community-place-name { display: block; margin-top: 6px; font-size: 12px; font-weight: 700; overflow-wrap: anywhere; }
.community-place-count { display: block; font-size: 11px; color: var(--text-2); }
```

`EditorialPhoto` has a more-specific rule for direct children's positioning.
Use `.explore-photo-hero > .explore-hero-annotation` for the final positioned rule so that generic rule cannot override it.
At phone widths, put the annotation in normal flow after the hero action.
Use the same selector specificity in that media rule.
The annotation must not cover controls or disappear on phone.

### Step 5: Add and sample token-based motion

- [ ] Use the existing page entrance pattern on `.explore-main > *` and `.explore-aside > *`.
- [ ] Keep `.trip-enter` on each actual card or its outer wrapper, not both layers.
- [ ] Give the outer card one lift and give its image a gentle scale change.
- [ ] Give bookmark pressed state a small scale response without changing hit-area geometry.

```css
@media (prefers-reduced-motion: no-preference) {
  .explore-main > *, .explore-aside > * {
    animation: cardIn var(--motion-slow) var(--ease-out) backwards;
  }
  .explore-main > *:nth-child(2), .explore-aside > *:nth-child(2) {
    animation-delay: var(--stagger-step);
  }
  .explore-main > *:nth-child(3), .explore-aside > *:nth-child(3) {
    animation-delay: calc(var(--stagger-step) * 2);
  }
}
.explore-page .pub-card-editorial .editorial-photo-image,
.explore-page .community-place .editorial-photo-image {
  transition: transform var(--motion-slow) var(--ease-out);
}
@media (hover: hover) and (pointer: fine) {
  .explore-page .pub-card-editorial .itin-card:hover .editorial-photo-image,
  .explore-page .community-place:hover .editorial-photo-image { transform: scale(1.04); }
}
.save-bookmark { transition: transform var(--motion-fast) var(--ease-out), background var(--motion-fast) var(--ease-out); }
.save-bookmark:active { transform: scale(.96); }
@media (prefers-reduced-motion: reduce) {
  .explore-main > *, .explore-aside > * { animation: none; }
  .explore-page .pub-card-editorial .editorial-photo-image,
  .explore-page .community-place .editorial-photo-image,
  .save-bookmark { transition: none; }
  .explore-page .itin-card:hover,
  .explore-page .creator-card:hover,
  .explore-page .pub-card-editorial .itin-card:hover .editorial-photo-image,
  .explore-page .community-place:hover .editorial-photo-image,
  .save-bookmark:active { transform: none; }
}
```

Fold reduced-motion changes into existing relevant blocks where their selectors already exist.
Do not leave a later hover rule that restores movement under reduced motion.

- [ ] Sample hover with animation frames rather than screenshots with disabled animation.

```js
await card.scrollIntoViewIfNeeded()
await page.mouse.move(0, 0)
const samplesPromise = card.evaluate(element => new Promise(resolveSamples => {
  const rows = []
  const start = performance.now()
  function sample(time) {
    const image = element.querySelector('.editorial-photo-image')
    rows.push({ time: time - start, y: element.getBoundingClientRect().y, imageTransform: image ? getComputedStyle(image).transform : 'none' })
    if (time - start < 600) requestAnimationFrame(sample)
    else resolveSamples(rows)
  }
  requestAnimationFrame(sample)
}))
await card.hover()
const samples = await samplesPromise
result.cardHoverSamples = samples
```

- [ ] Require a settled negative lift and a non-identity image transform under normal motion.
- [ ] Require unchanged position and no image transform under reduced motion.
- [ ] Capture page entrance frames before the script's existing two-second stabilization wait.
- [ ] Capture bookmark pointer-down and pointer-up feedback in a separate interaction sequence.
- [ ] Record duration, frame intervals, and final state rather than claiming smoothness from a CSS declaration.

### Step 6: Check content, facts, and interaction states

- [ ] Run discovery, design-system, contrast, and fixture tests.
- [ ] Check loaded Caveat and blocked-font fallback in both themes.
- [ ] Check Places with one, six, and more than six source places.
- [ ] Check missing and broken place images without changing tile geometry.
- [ ] Check successful-empty hero facts, failed-read hiding, and Try again recovery.
- [ ] Check focus on place buttons, both publication links, Save, Fork, and creator links.
- [ ] Check annotation and hero text against the composited photograph at all four widths.
- [ ] Record any contrast failure as a blocker, not as a decorative hairline result.

Acceptance: All four facts and Places come from live data. The annotation stays readable in both themes.
Motion has sampled evidence and a proved reduced-motion opt-out.

## Task 6: Run complete checks and refresh the comparison

Files:

- Modify `CHANGELOG.md`, `ROADMAP.md`, and `docs/redesign/VISUAL-QUALITY-REVIEW.md`.
- Modify the local review generator and its gate summary.
- Create current evidence under `.cache/compact-card-after-light/` and `.cache/compact-card-after-dark/`.
- Refresh the existing production matrix directories used by the review generator.
- Refresh `YatraFlow-rendered-product-review.html` and its manifest after all checks finish.

Interfaces:

- Consume Task 1 baseline reports and Tasks 2 through 5 product changes.
- Consume explicit full-check exit codes and fresh test counts.
- Produce a portable reference comparison, honest check records, and a visual-review request.
- Produce no commit, public URL, live-account change, or complete-goal claim before your visual approval.

### Step 1: Check source and update product records

- [ ] Inspect the complete diff and preserve all unrelated work.
- [ ] Update the existing Unreleased redesign entry instead of adding another contradictory history entry.
- [ ] Record compact cards, restored Places, four hero facts, the annotation, and motion only after they exist.
- [ ] Keep ROADMAP's visual acceptance open.
- [ ] Index any new document in `docs/README.md`.
- [ ] Record any newly discovered reusable pitfall in the relevant existing standards file.

```powershell
$ErrorActionPreference = 'Stop'
Set-Location 'C:\Users\hasna\Yatraflow-minimax\.cache\mr10-explore-discovery'
git status -sb
if ($LASTEXITCODE -ne 0) { throw 'Git status failed' }
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Whitespace check failed' }
node --check scripts/browser-redesign-check.mjs
if ($LASTEXITCODE -ne 0) { throw 'Browser script syntax failed' }
node --check scripts/compactCardChecks.mjs
if ($LASTEXITCODE -ne 0) { throw 'Geometry script syntax failed' }
```

### Step 2: Run the full product check

- [ ] Run the unchanged verification command with one Vitest worker.

```powershell
$ErrorActionPreference = 'Stop'
Set-Location 'C:\Users\hasna\Yatraflow-minimax\.cache\mr10-explore-discovery'
$env:VITEST_MAX_WORKERS = '1'
npm run verify
if ($LASTEXITCODE -ne 0) { throw 'Product verification failed' }
```

- [ ] Record the actual test counts, skips, duration, build hashes, and warnings.
- [ ] Do not copy earlier counts into the new gate summary.
- [ ] Freeze product source and `dist` after this build.
- [ ] Confirm preview ownership and compiled backend binding again before sharing or capture.

### Step 3: Run geometry checks at four widths and both themes

- [ ] Run these captures serially with strict child exit checks.

```powershell
$ErrorActionPreference = 'Stop'
Set-Location 'C:\Users\hasna\Yatraflow-minimax\.cache\mr10-explore-discovery'
foreach ($theme in @('light', 'dark')) {
  node scripts/browser-redesign-check.mjs --base-url http://localhost:5189 --production-build --surfaces my-trips,explore --widths 1440,1024,768,390 --images reference --explore-auth signed-in --theme $theme --compact-target --compact-baseline ".cache/compact-card-before-$theme/results.json" --out ".cache/compact-card-after-$theme"
  if ($LASTEXITCODE -ne 0) { throw "Compact capture failed: $theme" }
}
```

- [ ] Inspect full-page and first-view evidence against the reference.
- [ ] Read the measured width, height, column, and crop differences.
- [ ] Do not accept shorter cards if creator names, social links, tags, or action labels overlap.

### Step 4: Refresh existing production behaviour evidence

- [ ] Keep the old evidence naming expected by the portable generator.
- [ ] Run the four-surface matrix, larger catalog, and blocked-font matrix serially.

```powershell
$ErrorActionPreference = 'Stop'
Set-Location 'C:\Users\hasna\Yatraflow-minimax\.cache\mr10-explore-discovery'
foreach ($theme in @('light', 'dark')) {
  node scripts/browser-redesign-check.mjs --base-url http://localhost:5189 --production-build --images reference --explore-auth signed-in --workspace-routes --theme $theme --out ".cache/visual-quality-production-$theme-final"
  if ($LASTEXITCODE -ne 0) { throw "Production matrix failed: $theme" }
  node scripts/browser-redesign-check.mjs --base-url http://localhost:5189 --production-build --surfaces my-trips,explore --images reference --explore-auth signed-in --fonts blocked --widths 1440,768,390 --theme $theme --out ".cache/visual-quality-production-fallback-$theme"
  if ($LASTEXITCODE -ne 0) { throw "Font fallback failed: $theme" }
  node scripts/browser-redesign-check.mjs --base-url http://localhost:5189 --production-build --surfaces my-trips,explore --images reference --explore-auth signed-in --fonts blocked --widths 1024 --theme $theme --out ".cache/compact-card-font-1024-$theme"
  if ($LASTEXITCODE -ne 0) { throw "1024px font fallback failed: $theme" }
}
node scripts/browser-redesign-check.mjs --base-url http://localhost:5189 --production-build --surfaces explore --images reference --scenario many-publications --explore-auth signed-in --out .cache/visual-quality-production-pagination
if ($LASTEXITCODE -ne 0) { throw 'Pagination and sort checks failed' }
```

- [ ] Run signed-out Explore, error/retry, loading, empty, sparse, duplicate names, and broken images.
- [ ] Give each alternate state its own output directory.
- [ ] Use existing `--state`, `--scenario`, `--images`, `--explore-auth`, and `--theme` flags.
- [ ] Run normal-motion and reduced-motion evidence separately with `--motion no-preference` and `--motion reduce`.
- [ ] Preserve initial screenshot hashes after every interaction sequence.

### Step 5: Check unproved access and accessibility limits honestly

- [ ] Check actual browser zoom at 200 percent if the active browser path supports it.
- [ ] If only viewport scaling is available, retain the actual-zoom gap.
- [ ] Retain native-device, premium-Fork, and live-persistence gaps unless their distinct checks run with approval.
- [ ] Do not reinterpret fixture success as live access enforcement.
- [ ] Record composited text contrast and control focus independently from token tests.
- [ ] Do not claim complete contrast from decorative border checks.
- [ ] Do not retry quota-failed review models without checking availability.
- [ ] Do not substitute a paid model or change model lanes silently.

### Step 6: Rebuild the portable comparison

- [ ] Extend the generator to read both `.cache/compact-card-after-{theme}/results.json` reports.
- [ ] Include the separate two-result `.cache/compact-card-font-1024-{theme}/results.json` reports.
- [ ] Require eight results in each normal correction report, matching baseline keys, and no capture-time source or build change.
- [ ] Include geometry differences, the new content checks, and motion evidence in the manifest.
- [ ] Apply `assertCurrentCapture` and the existing same-build check to all new reports.
- [ ] Add Caveat to the font evidence when the annotation appears.
- [ ] Retain all initial screenshot-hash checks and private-state exclusions.
- [ ] Update the narrative from actual results without claiming user visual acceptance.

```powershell
node .cache/visual-quality-review-2026-10-09/build-review.mjs
if ($LASTEXITCODE -ne 0) { throw 'Portable comparison generation failed' }
node .cache/visual-quality-review-2026-10-09/check-review.mjs
if ($LASTEXITCODE -ne 0) { throw 'Portable comparison controls failed' }
node scripts/lint-ste.mjs --file docs/redesign/VISUAL-QUALITY-REVIEW.md
if ($LASTEXITCODE -ne 0) { throw 'Review record prose failed' }
node scripts/lint-ste.mjs
if ($LASTEXITCODE -ne 0) { throw 'Changed-line prose failed' }
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Final whitespace check failed' }
```

- [ ] Confirm every delivery file exists and contains the current results.
- [ ] Deliver the portable comparison and the updated check record using absolute-path media tags.
- [ ] Share a localhost link only after a fresh liveness, ownership, build, and backend-binding check.
- [ ] Ask for rendered visual acceptance and state all remaining gaps.

Acceptance: Current source, build, images, measured geometry, controls, and check records agree.
Your visual decision remains the final quality decision.

## Plan self-review

The coverage map is:

| Specification section | Plan tasks |
|---|---|
| Scope, size decision, and reference gaps | Global constraints and Tasks 1, 3, and 4 |
| My Trips cards | Tasks 1 and 4 |
| Explore itinerary cards | Tasks 1 and 3 |
| Featured creator cards | Tasks 1 and 4 |
| Places in the community | Tasks 2 and 5 |
| Four hero items and annotation | Tasks 2 and 5 |
| Photography, spacing, and motion | Tasks 3, 4, and 5 |
| Component boundaries and product rules | Global constraints and all tasks |
| Acceptance and evidence | Tasks 1 and 6 |
| Written review and local-only state | Approval record and global constraints |

The plan names every new interface before a later task uses it.
The existing discovery, route, save, and Fork identifiers remain unchanged.
No commit step overrides your no-commit instruction.
No product code changed while this plan was prepared.

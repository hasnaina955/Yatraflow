# Mockup Visual Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to execute this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Build the approved My Trips and Explore direction without removing working controls or changing real product facts.

**Architecture:** Keep page state, store reads, routes, and permissions in their current owners. Add a small image helper and a resilient photo component. Scope new styles to these two pages and opt shared cards into the new presentation.

**Tech Stack:** React 18, Vite 8, TypeScript, Supabase, Vitest in node, and the existing Playwright browser scripts.

**Status:** Earlier product checks passed. User visual acceptance remains open.
The approved compact-card correction remains pending and transfers to OpenCode.

**Approved contract:** [Design specification](../specs/2026-10-08-mockup-visual-quality-design.md)

**Decision:** [ADR 0004](../../adr/0004-mockup-visual-direction-and-image-reuse.md)

**Progress owner:** [ROADMAP.md](../../../ROADMAP.md)

**Resume checkpoint (2026-10-08):** The phone catalog and inner card tracks now fit their controls and text.
Creator ranks and bio/social footers remain visible. The Fork explanation appears before the cards.
The fixture rejects general trip patches. Only the known owner invite code and exact live-publication view events persist in memory.
Reference captures now use distinct publication cover URLs and route-matched photos.
Read-state checks distinguish initial application loading, a successful empty catalog, and an error with Try again recovery.
Dark sparse, failed-photo, and equal-creator cases pass at desktop and phone widths.
Workspace checks record all eight exact routes, selected tabs, and per-tab screenshots.
Keyboard checks need a rendered focus ring.
The scale option simulates a smaller viewport. It does not prove actual browser zoom.
Signed-in free Fork persistence, pagination, and production fixture checks passed. User visual acceptance remains open.

## Global Constraints

- Work must stay in `C:\Users\hasna\Yatraflow-minimax\.cache\mr10-explore-discovery`.
- The branch is `feat/minimax-mr10-explore-discovery`.
- Preserve `feat/trip-shell-sidebar` in the separate main MiniMax checkout.
- Do not merge, rebase, or copy that work without approval.
- MR12's mobile bottom bar stays parked.
- Do not commit or push without explicit permission.
- Keep the mockup folder read-only and outside the build.
- Image reuse rests on the user's permission statement, not an independent legal review.
- Keep real counts, routes, permissions, filters, Save/Fork, account actions, and the complete catalog.
- Scope Plus Jakarta Sans and Playfair Display changes to these two pages first.
- Light direction: canvas `#F4EDE3`, sand `#FBF5ED`, mint `#E8F5F1`, teal `#0EA5A0`, navy `#0F2D46`.
- Define new colour tokens in both themes and check rendered contrast.
- Keep status meaning, motion tokens, reduced motion, type floors, and the spacing ladder `[2,4,6,8,12,14,16,20,22,24]`.
- Explore: three columns above 1150px; two columns from 721px through 1150px; one column at 720px or less.
- Do not add database migrations, live seeds, or new backend APIs.
- Keep unknown writes rejected in browser fixtures. Never forward them to live services.
- Do not deliver environment files, credentials, or the visual companion's private access key.
- Run pure logic tests in node. Use browser scripts for rendered checks.
- Product visual acceptance remains open until the user reviews the rendered result.
- This batch does not close publication polish, workspace integration, or the whole redesign goal.

---

## Starting state and preflight

This worktree contains earlier uncommitted product changes.
Its base is `3c50732d3227f205409db7c2a2a2f909823099d4`.
Do not reset it to that base.
Do not create another worktree from the base and lose the accumulated work.
Read `AGENTS.md`, `CODING_STANDARDS.md`, and `docs/AGENTS-VERIFICATION.md` before execution.

The most recent full product gate predates this plan.
It reported 3779 tests, one skipped, and a successful build.
That result is not evidence for changes made during execution.
The old browser harness checks geometry and selected interactions.
It blocks external fonts and substitutes synthetic cover artwork.
It cannot establish visual quality against the reference.

- [ ] Run the branch and scope preflight from this worktree:

```powershell
$ErrorActionPreference = 'Stop'
Set-Location 'C:\Users\hasna\Yatraflow-minimax\.cache\mr10-explore-discovery'
git status -sb
git log -1 --oneline
git diff --check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
```

- [ ] Record the start revision and local file hashes in `.cache/visual-quality-start/`.
- [ ] Confirm that port 5188 is free. Do not stop another tree's server.
- [ ] Start `npm run dev -- --port 5188 --strictPort` in this tree.
- [ ] Confirm this tree serves the page and compiled Supabase project ref before sharing its URL.
- [ ] Keep the ref private. Report only whether the binding is present and matches this tree.
- [ ] Capture a new before set with the isolated fixture before changing product source.

The review starts from `.cache/visual-reference-audit/YatraFlow-visual-review.html`.
Use its approved study, not the older full-width featured hero, as the target.
Reuse its images for the fixture without changing real cover records.
Do not run the reference application scripts inside the product.

## File responsibilities

| File | Responsibility |
|---|---|
| `src/lib/editorialAssets.ts` (new) | Approved local hero paths and destination-photo lookup |
| `src/components/EditorialPhoto.tsx` (new) | Stable photo geometry and failed-image fallback |
| `public/img/mockup-adopted/` (new) | Selected approved photos; no reference-folder dependency |
| `src/pages/TripsList.tsx` | My Trips banner, grouped controls, featured split, complete list |
| `src/pages/Explore.tsx` | Discovery columns, hero, filters, featured exception, full catalog |
| `src/components/ExploreDiscovery.tsx` | Image-led public creator cards and trending publication cards |
| `src/lib/discovery.ts` | Public-cover selection, deterministic ranking, creator link context |
| `src/components/CoverThumb.tsx` | Opt-in editorial image presentation; old consumers stay unchanged |
| `src/components/PubCard.tsx` | Opt-in compact card layout; existing handlers remain intact |
| `src/styles.css` | Scoped page styles and both-theme token mappings |
| `index.html` | Add Playfair Display faces without removing current fonts |
| `scripts/browser-redesign-check.mjs` | Extend the current safety harness with a visual matrix |
| `scripts/redesignFixture.mjs` | Pure synthetic scenarios and narrowly validated fixture operations |
| `tests/editorial-assets.test.ts` (new) | Asset lookup and copied-file contracts |
| `tests/discovery.test.ts` | Ranking ties and public creator-cover rules |
| `tests/redesign-fixture.test.ts` | Scenario and mutation-isolation contracts |
| `docs/ASSET-SOURCES.md` (new during execution) | Asset source, purpose, and permission basis |

Only one writer may own `styles.css` at a time.
Tasks 2, 3, and 4 must run serially if they use separate workers.
A worker may not alter the store, publication dashboard, or Timeline for this batch.
A shared-component change must retain its default behaviour on other routes.

### Task 1: Approved assets, type, and resilient photos

**Files:**
- Create: `src/lib/editorialAssets.ts`, `src/components/EditorialPhoto.tsx`, `tests/editorial-assets.test.ts`.
- Create during execution: seven selected files under `public/img/mockup-adopted/` and `docs/ASSET-SOURCES.md`.
- Modify: `index.html`, `src/styles.css`, `tests/design-system.test.ts`, `docs/README.md`.

**Interfaces:**
- Produces: `MY_TRIPS_BANNER: string`, `EXPLORE_HERO: string`.
- Produces: `editorialRouteCover(destinations: readonly string[]): string | undefined`.
- Produces: `EditorialPhoto({ src, alt, className, children }: EditorialPhotoProps)`.
- `src` is optional. `children` contains an overlay or fallback label, not a second photo.
- The component never changes a persisted cover or claims a photo is user-uploaded.

- [ ] Add these red tests in `tests/editorial-assets.test.ts`:

```ts
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { editorialRouteCover, EXPLORE_HERO, MY_TRIPS_BANNER } from '../src/lib/editorialAssets'

describe('approved editorial assets', () => {
  it('maps known destinations and keeps unknown routes neutral', () => {
    expect(editorialRouteCover(['Kochi', 'Alleppey'])).toBe('/img/mockup-adopted/kerala-backwaters.jpg')
    expect(editorialRouteCover(['Panjim'])).toBe('/img/mockup-adopted/goa-panjim.jpg')
    expect(editorialRouteCover(['Jaipur'])).toBe('/img/mockup-adopted/rajasthan-forts.jpg')
    expect(editorialRouteCover(['Kaza'])).toBe('/img/mockup-adopted/spit-valley.jpg')
    expect(editorialRouteCover(['Shimla'])).toBe('/img/mockup-adopted/himalayan-loop.jpg')
    expect(editorialRouteCover(['Unknown destination'])).toBeUndefined()
    expect(editorialRouteCover([])).toBeUndefined()
  })

  it('serves every selected asset from this project', () => {
    const paths = [MY_TRIPS_BANNER, EXPLORE_HERO,
      editorialRouteCover(['Kochi']), editorialRouteCover(['Panjim']),
      editorialRouteCover(['Jaipur']), editorialRouteCover(['Kaza']), editorialRouteCover(['Shimla'])]
    for (const asset of paths) {
      expect(asset).toBeDefined()
      expect(existsSync(resolve('public', asset!.slice(1))), asset).toBe(true)
    }
  })
})
```

- [ ] Run `npx vitest run tests/editorial-assets.test.ts`. Expect failure for the missing module.
- [ ] Create the asset helper with these paths and bounded destination matches:

```ts
const ROOT = '/img/mockup-adopted/'
export const MY_TRIPS_BANNER = `${ROOT}hero-banner.jpg`
export const EXPLORE_HERO = `${ROOT}ch-hero.jpg`

const ROUTE_PHOTOS = [
  { places: ['kerala', 'kochi', 'alleppey', 'alappuzha', 'munnar', 'varkala'], file: 'kerala-backwaters.jpg' },
  { places: ['goa', 'panjim', 'panaji'], file: 'goa-panjim.jpg' },
  { places: ['rajasthan', 'jaipur', 'jodhpur', 'udaipur', 'jaisalmer'], file: 'rajasthan-forts.jpg' },
  { places: ['spiti', 'kaza', 'tabo'], file: 'spit-valley.jpg' },
  { places: ['shimla', 'manali', 'himachal'], file: 'himalayan-loop.jpg' },
] as const

export function editorialRouteCover(destinations: readonly string[]): string | undefined {
  for (const destination of destinations) {
    const words = destination.toLowerCase().split(/[^a-z]+/).filter(Boolean)
    const photo = ROUTE_PHOTOS.find(candidate => candidate.places.some(place => words.includes(place)))
    if (photo) return ROOT + photo.file
  }
  return undefined
}
```

- [ ] Copy only these seven image files from the authorised reference assets directory.
- [ ] Preserve the source images. Verify destination file hashes against their sources.
- [ ] Add each copied source filename, product purpose, and user-permission basis to `docs/ASSET-SOURCES.md`.
- [ ] Add that document to `docs/README.md`.
- [ ] Create the resilient component:

```tsx
import { useState, type ReactNode } from 'react'

export interface EditorialPhotoProps {
  src?: string
  alt?: string
  className?: string
  children?: ReactNode
}

export function EditorialPhoto({ src, alt = '', className = '', children }: EditorialPhotoProps) {
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const source = src?.trim()
  const usable = Boolean(source && source !== failedSource)
  return (
    <div className={`editorial-photo ${className}`} data-photo-state={usable ? 'image' : 'fallback'}>
      {usable && <img className="editorial-photo-image" src={source} alt={alt}
        onError={() => setFailedSource(source!)} />}
      {children}
    </div>
  )
}
```

- [ ] Add stable geometry, both-theme surface tokens, and scoped type rules:

```css
:root {
  --editorial-canvas: #F4EDE3;
  --editorial-paper: #FBF5ED;
  --editorial-mint: #E8F5F1;
  --editorial-ink: #0F2D46;
  --editorial-accent: #0EA5A0;
  --editorial-border: #DED3C4;
  --editorial-scrim: linear-gradient(90deg, #FBF5ED 0%, #FBF5EDEB 36%, #FBF5ED14 100%);
}
:root[data-theme='dark'] {
  --editorial-canvas: #121919;
  --editorial-paper: #182222;
  --editorial-mint: #18312E;
  --editorial-ink: #ECF4F1;
  --editorial-accent: #43C7BE;
  --editorial-border: #344644;
  --editorial-scrim: linear-gradient(90deg, #182222 0%, #182222EB 36%, #18222214 100%);
}
.trips-page, .explore-page {
  --font-display: 'Plus Jakarta Sans', sans-serif;
  --font-editorial: 'Playfair Display', Georgia, serif;
  color: var(--editorial-ink);
}
.editorial-photo {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  background: var(--editorial-mint);
}
.editorial-photo-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 0;
}
.editorial-photo > :not(.editorial-photo-image) {
  position: relative;
  z-index: 2;
}
.editorial-photo[data-photo-state='fallback'] {
  background: var(--editorial-mint);
}
```

These dark values are a starting mapping, not a contrast verdict.
Check text and focus contrast after composition is in place.
Use the accent for decoration unless its action foreground passes the contrast check.
Keep global `--font-display` on Sora for unchanged routes.

- [ ] Add `family=Playfair+Display:wght@600;700` to the existing Google Fonts URL in `index.html`.
- [ ] Keep Plus Jakarta Sans 400–800 and Sora 600–800 loaded.
- [ ] Add font-family assertions for the editorial token without removing existing family gates.
- [ ] Run `npx vitest run tests/editorial-assets.test.ts tests/design-system.test.ts`.
- [ ] Check a valid image, broken image, empty source, and changed source in the browser.
- [ ] Confirm the image box does not collapse and the fallback shows no false photo claim.
- [ ] Review this unit and record results in the roadmap. Do not commit without permission.

### Task 2: My Trips banner, controls, and featured split

**Files:**
- Modify: `src/pages/TripsList.tsx:237-421,591-765`, `src/styles.css:8536-8902`.
- Test: `tests/featured-trip.test.ts`, `tests/trip-next-step.test.ts`, browser harness.
- Do not alter selection rules in `src/lib/featuredTrip.ts` or `src/lib/tripNextStep.ts` unless a new regression proves a defect.

**Interfaces:**
- Consumes: `MY_TRIPS_BANNER`, `editorialRouteCover`, `EditorialPhoto`, existing `featuredTripPresentation(trip, today)`.
- Keeps: `FeaturedTripLead({ trip, users, meId, today, onNavigate })` and its current prop types.
- Produces DOM: `.trips-page-banner`, `.trips-page-title`, `.trips-controls`, `.trip-featured-card`, `.trip-featured-photo`, `.trip-featured-body`.
- Produces: one visible featured title in `.trip-featured-title` on the content side.

- [ ] Add a browser red check at a populated desktop viewport:

```js
const banner = page.locator('.trips-page-banner')
assert.equal(await banner.count(), 1, 'My Trips needs the panoramic banner')
const photo = await page.locator('.trip-featured-photo').boundingBox()
const body = await page.locator('.trip-featured-body').boundingBox()
assert(photo && body, 'The featured photo and content must render')
assert(Math.abs(photo.y - body.y) < 2, 'Desktop featured content must sit beside the photo')
assert(body.x >= photo.x + photo.width - 2, 'The featured card must use a split layout')
assert.equal(await page.locator('.trip-featured-title').count(), 1, 'Keep one featured title')
```

- [ ] Run the populated desktop case. Record the real failure before changing the card.
- [ ] Replace the plain header area with the banner/title structure:

```tsx
<EditorialPhoto src={MY_TRIPS_BANNER} className="trips-page-banner" />
<header className="trips-page-title">
  <div>
    <div className="kicker">Your crew, your route, your pace</div>
    <h1>My Trips</h1>
  </div>
</header>
```

- [ ] Move the existing header actions into `.trips-controls`; retain their handlers and visibility conditions.
- [ ] Keep New trip adjacent to search, filter chips, sort, and view toggle.
- [ ] Place Import trip, purchases, creator/account actions, trash, and demo in a labelled secondary action row.
- [ ] Use wrapping controls rather than hide secondary actions with a phone media rule.
- [ ] Do not copy sample study filters into the product.
- [ ] Keep `q`, `style`, `when`, `sortKey`, `status`, `layout`, `trips`, `statusCounts`, and `styleCounts` in the page.
- [ ] Preserve trash confirmation, edit, import, demo, purchases, and card menus below the redesigned header.

The current featured cover uses an inline background image and a runtime fallback.
Replace only its presentation with `EditorialPhoto`.
Keep `canEdit(roleOf(trip, meId)) && !hasSavedCoverPhoto(trip)` separate from the displayed source.
Remove the unrelated `/img/landing-open-road.jpg` fallback from this featured card.
Use a matching local route image when available; otherwise keep the token-based fallback.

```tsx
const coverUrl = sizedCoverUrl(trip.coverImageUrl ?? '') ||
  editorialRouteCover(trip.destinations) || autoThumb || undefined
```

```tsx
<EditorialPhoto src={coverUrl} className="trip-featured-photo">
  <div className="trip-featured-photo-top">
    <span className="trip-featured-photo-badge">{presentation.badge}</span>
    <span className="trip-featured-photo-date">{dateRangeStr}</span>
  </div>
</EditorialPhoto>
```

- [ ] Move `trip.name` into the existing `.trip-featured-body` as its single `.trip-featured-title` heading.
- [ ] Keep date range, route, crew facts, real budget, activity coverage, and current next-step handlers.
- [ ] Remove the unconditional `Cover photo for` accessible claim from runtime fallback imagery.
- [ ] Keep decorative route photos at `alt=""`; the trip title already names their context.
- [ ] Retain the existing footer Add cover photo action and its owner/editor guard. Do not duplicate it on the photo.
- [ ] Use the actual member count rather than `(trip.members ?? []).length || 1`.
- [ ] Retain the Settings cover route and the no-day Timeline route.
- [ ] Keep the empty-image fallback free of inline `backgroundImage` overrides.
- [ ] Replace the existing featured-card rules in place with this geometry:

```css
.trips-page-banner { min-height: 220px; border-radius: var(--radius-lg); }
.trips-page-title { position: relative; margin-top: -24px; padding: 20px 24px; }
.trips-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.trip-featured-card {
  display: grid;
  grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
  overflow: hidden;
  background: var(--editorial-paper);
  border: 1px solid var(--editorial-border);
}
.trip-featured-photo { min-height: 300px; padding: 24px; }
.trip-featured-body { min-width: 0; padding: 24px; }
.trip-featured-title { overflow-wrap: anywhere; }
@media (max-width: 720px) {
  .trips-page-banner { min-height: 160px; }
  .trips-page-title { padding: 16px; }
  .trip-featured-card { grid-template-columns: 1fr; }
  .trip-featured-photo { min-height: 190px; padding: 16px; }
  .trip-featured-body { padding: 20px; }
}
```

- [ ] Remove the old 850px `38% 1fr` rule and conflicting 640px split overrides.
- [ ] Use the existing semantic scrim tokens for status and cover-action contrast; do not add hardcoded RGBA overlays.
- [ ] Tune crop, title position, body density, borders, and shadow against the approved study at both capture sizes.
- [ ] Add phone checks proving photo/content stacking and visible secondary actions.
- [ ] Run `npx vitest run tests/featured-trip.test.ts tests/trip-next-step.test.ts tests/design-system.test.ts`.
- [ ] Run the populated and `past-only` browser scenarios in separate evidence directories.
- [ ] Check search finds the featured trip, filters cover all trips, and grid/list both remain complete.
- [ ] Check owner/editor cover actions and the viewer negative control by interaction.
- [ ] Review the My Trips first-view and full-page captures before moving to Explore.
- [ ] Record gaps against all six visual dimensions. Do not claim acceptance or commit without permission.

### Task 3: Explore discovery shell and editorial hero

**Files:**
- Modify: `src/pages/Explore.tsx:23-371`, `src/styles.css` existing Explore rules.
- Test: browser harness and `tests/design-system.test.ts`.
- Keep the store and public read-state paths unchanged.

**Interfaces:**
- Consumes: `EXPLORE_HERO`, `EditorialPhoto`, existing `scrollBehavior()` from `src/lib/motion.ts`.
- Produces DOM: `.explore-page`, `.explore-discovery-layout`, `.explore-discovery-nav`, `.explore-main`, `.explore-aside`, `.explore-photo-hero`.
- Section IDs: `explore-creators`, `explore-trending`, `explore-catalog`.
- Keep catalog state and `onFork`/`onToggleSave` handlers in `Explore.tsx`.

- [ ] Add a browser red check for column geometry:

```js
const navigation = await page.locator('.explore-discovery-nav').boundingBox()
const main = await page.locator('.explore-main').boundingBox()
const aside = await page.locator('.explore-aside').boundingBox()
assert(navigation && main && aside, 'All discovery regions must exist')
assert(navigation.x < main.x && main.x < aside.x, 'Wide desktop needs three discovery columns')
assert.equal(await page.locator('.explore-photo-hero').count(), 1, 'Explore needs the approved photo hero')
```

- [ ] Record its failure on the current product.
- [ ] Wrap the existing sections in the named navigation, main, and aside regions.
- [ ] Move the existing creator invite into the aside instead of inventing a new metric card.
- [ ] Move the existing fork explanation into the aside with concise copy and the actual account route.
- [ ] Keep the main region's existing search, filters, Saved, sort, count, complete grid, and pagination.
- [ ] Use section-scroll buttons instead of fragment links that conflict with hash routing:

```tsx
function showExploreSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: scrollBehavior() })
}
```

- [ ] Render labelled navigation buttons for creators, trending, and all itineraries.
- [ ] Disable a section button when filtering or sparse data removes its target.
- [ ] Use `setSavedOnly` for Saved navigation and keep the current Saved button state synchronised.
- [ ] Keep the catalog section mounted with an honest empty or error state when it has no rows.
- [ ] Build the hero with real counts only:

```tsx
<EditorialPhoto src={EXPLORE_HERO} className="explore-photo-hero">
  <div className="explore-photo-hero-content">
    <div className="kicker">Made for the way you travel</div>
    <h1>Find your next<br />great journey.</h1>
    <p>Discover routes from real travellers. Make one your own.</p>
    {pubsRead === 'ready' && <p className="explore-live-counts">
      {community.pubCount} live {community.pubCount === 1 ? 'itinerary' : 'itineraries'} · {community.creatorCount} {community.creatorCount === 1 ? 'creator' : 'creators'}
    </p>}
  </div>
</EditorialPhoto>
```

- [ ] Reuse the existing `communityCounts(published)` result and its live-publication predicate.
- [ ] Do not use a featured-rail length as the total creator count.
- [ ] Do not show zero as a loaded count while reads are pending or failed.
- [ ] Keep `pubsRead`, Retry, loading, empty success, filtered-empty, and featured-outside-filter labels distinct.
- [ ] Apply the approved responsive structure:

```css
.explore-page .explore-discovery-layout {
  width: 100%;
  max-width: 1440px;
  margin: 0 auto;
  padding: 0 24px 24px;
  display: grid;
  grid-template-columns: 206px minmax(0, 1fr) 300px;
  gap: 20px;
  align-items: start;
}
.explore-main, .explore-aside { min-width: 0; }
.explore-photo-hero { min-height: 270px; padding: 24px; }
.explore-photo-hero::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--editorial-scrim);
  z-index: 1;
}
.explore-photo-hero-content { max-width: 34ch; }
.explore-photo-hero h1 { font-family: var(--font-editorial); font-weight: 600; }
@media (max-width: 1150px) {
  .explore-page .explore-discovery-layout { grid-template-columns: 180px minmax(0, 1fr); }
  .explore-aside { grid-column: 2; }
}
@media (max-width: 720px) {
  .explore-page .explore-discovery-layout { grid-template-columns: 1fr; gap: 16px; }
  .explore-discovery-nav { display: flex; flex-wrap: wrap; gap: 8px; }
  .explore-aside { grid-column: 1; }
  .explore-photo-hero { min-height: 240px; padding: 20px; }
}
```

- [ ] Keep the global app navigation intact. The discovery nav is page-local, not a replacement workspace shell.
- [ ] Tune the hero crop and editorial line breaks against the approved Explore study.
- [ ] Run the current Explore browser interactions, including Saved and all query filters.
- [ ] Check 1440px, 1024px, 768px, and 390px widths.
- [ ] Check right-rail content moves below the centre rather than disappear on phone.
- [ ] Run `npx vitest run tests/discovery.test.ts tests/design-system.test.ts`.
- [ ] Review this shell before changing the discovery cards. Do not commit without permission.

### Task 4: Public image-led cards and deterministic evidence

**Files:**
- Modify: `src/lib/discovery.ts`, `src/components/ExploreDiscovery.tsx`, `src/pages/Explore.tsx`.
- Modify: `src/components/PubCard.tsx`, `src/components/CoverThumb.tsx`, scoped rules in `src/styles.css`.
- Test: `tests/discovery.test.ts`, browser harness.

**Interfaces:**
- Add: `selectFeaturedPublication(pubs: readonly PublishedItinerary[]): PublishedItinerary | undefined`.
- Add: `creatorCoverPublication(pubs: readonly PublishedItinerary[], creatorId: string): PublishedItinerary | undefined`.
- Extend `CreatorRank` with `coverPublication?: PublishedItinerary`.
- Add: `creatorCardLabel(rank: CreatorRank, position: number): string`; `position` is one-based.
- Extend `PubCard` with `editorial?: boolean`; default remains false.
- Extend `CoverThumb` with `editorial?: boolean` and `fallbackUrl?: string`; defaults preserve existing consumers.
- Extend `TrendingShelf` props with existing `onFork(id: string)`, `onToggleSave(id: string)`, `savedIds: string[]`, and `needsLogin: boolean`.

- [ ] Add these deterministic red cases to `tests/discovery.test.ts`, using its existing `pub` and `user` factories:

```ts
it('breaks featured and trending publication ties by ID', () => {
  const rows = [pub('z', 'a', { copies: 10, views: 10, publishedAt: 100 }),
    pub('a', 'a', { copies: 10, views: 10, publishedAt: 100 })]
  expect(selectFeaturedPublication(rows)?.id).toBe('a')
  expect(trendingPubs(rows).map(row => row.id)).toEqual(['a', 'z'])
})

it('uses only a creator public publication for their cover', () => {
  const rows = [{ ...pub('hidden', 'a', { unpublishedAt: 1 }), coverImageUrl: '/private.jpg' },
    { ...pub('other', 'b'), coverImageUrl: '/other.jpg' },
    { ...pub('live', 'a'), coverImageUrl: '/public.jpg' }]
  expect(creatorCoverPublication(rows, 'a')?.id).toBe('live')
  expect(creatorCoverPublication(rows, 'missing')).toBeUndefined()
})

it('keeps equal creator names and evidence distinct in link context', () => {
  const rows = featuredCreators([user('a', 'Same'), user('b', 'Same')],
    [pub('pa', 'a'), pub('pb', 'b')])
  const labels = rows.map((rank, index) => creatorCardLabel(rank, index + 1))
  expect(new Set(labels).size).toBe(rows.length)
  expect(labels.every(label => label.includes('Same'))).toBe(true)
})
```

- [ ] Run `npx vitest run tests/discovery.test.ts`. Expect the new helper imports to fail.
- [ ] Add the pure selectors and final ties:

```ts
export function selectFeaturedPublication(pubs: readonly PublishedItinerary[]): PublishedItinerary | undefined {
  return livePubs([...pubs]).filter(pub => pub.copies >= 1 || pub.views >= FEATURED_MIN_VIEWS)
    .sort((a, b) => b.copies - a.copies || b.views - a.views ||
      b.publishedAt - a.publishedAt || a.id.localeCompare(b.id))[0]
}

export function creatorCoverPublication(pubs: readonly PublishedItinerary[], creatorId: string): PublishedItinerary | undefined {
  const rows = livePubs([...pubs]).filter(pub => pub.creatorId === creatorId)
    .sort((a, b) => popularity(b) - popularity(a) ||
      b.publishedAt - a.publishedAt || a.id.localeCompare(b.id))
  return rows.find(pub => Boolean(pub.coverImageUrl?.trim())) ?? rows.find(pub => pub.routeSummary.length > 0)
}

export function creatorCardLabel(rank: CreatorRank, position: number): string {
  const name = rank.user.profile.name || 'Creator'
  const publicationWord = rank.pubCount === 1 ? 'itinerary' : 'itineraries'
  const forkWord = rank.forks === 1 ? 'fork' : 'forks'
  return `View ${name}'s creator page: ${rank.pubCount} public ${publicationWord}, ${rank.forks} ${forkWord}. Featured creator ${position}.`
}
```

- [ ] Keep `trendingPubs`' existing final ID tie. Its new tie case is a regression guard, not a missing implementation.
- [ ] Set `coverPublication` through `creatorCoverPublication` inside `featuredCreators`.
- [ ] Replace Explore's inline featured sort with `selectFeaturedPublication(published)`.
- [ ] Preserve the one-fork or `FEATURED_MIN_VIEWS` evidence bar in the new featured selector.
- [ ] Add a zero-evidence test that expects no featured publication.
- [ ] Keep the outside-filter featured-card exception and its explanatory label.
- [ ] Add stable ID ties to all five catalog sorts without changing their primary meaning.
- [ ] Use `creatorCardLabel(rank, index + 1)` for each `.creator-card` link.
- [ ] Show a visible Featured creator position when needed to distinguish equal names and evidence.
- [ ] Put a public-route photo above each creator's existing avatar, name, publication count, and fork evidence:

```tsx
const publication = rank.coverPublication
const cover = publication?.coverImageUrl?.trim() ||
  editorialRouteCover(publication?.routeSummary ?? [])
```

- [ ] Use `EditorialPhoto` for that cover and retain a neutral fallback for unknown routes.
- [ ] Keep creator links as `appLink('/creator/' + rank.user.id)`.
- [ ] Keep public-card destinations and creator context readable; allow long text to wrap.
- [ ] Add the editorial opt-in to `PubCard` without changing its callback signature or default markup behaviour:

```tsx
<CoverThumb
  trip={{ name: pub.title, destinations: pub.routeSummary }}
  explicitUrl={pub.coverImageUrl}
  emoji="🧭"
  editorial={editorial}
  fallbackUrl={editorial ? editorialRouteCover(pub.routeSummary) : undefined}
  routeLabel={`${pub.routeSummary[0]} → ${pub.routeSummary[pub.routeSummary.length - 1]}`}
/>
```

- [ ] In `CoverThumb`, choose explicit cover, then matching local `fallbackUrl`, then its current destination-image result.
- [ ] Use `EditorialPhoto` only in editorial mode; keep old consumers' output unchanged.
- [ ] Do not use a generic unrelated landscape when an editorial card's route has no matching image.
- [ ] Keep route labels on opaque or contrast-checked surfaces. Preserve emoji fallback and meaningful link names.
- [ ] Opt Explore's catalog `PubCard` into editorial mode.
- [ ] Add `EditorialPhoto` to the separate featured-card markup; keep its credibility, status, Save/Fork, and outside-filter label.
- [ ] Use its explicit cover or `editorialRouteCover(featured.routeSummary)`, with a neutral fallback if neither works.
- [ ] Keep `forkTrip`, `toggleHeart`, `isSaved`, `saved`, and `me` as the actual page handlers and state.
- [ ] Pass `forkTrip`, `toggleHeart`, `saved`, and `!me` into the new `TrendingShelf` props.
- [ ] Use three compact catalog columns when the centre region has space, two at intermediate widths, and one on phone.
- [ ] Replace the old 290px catalog minimum inside `.explore-page`; do not change other page grids.
- [ ] Render trending publications through the same opt-in `PubCard`, with the current Save/Fork callbacks.
- [ ] Keep `.trend-row` as the shelf item wrapper so filter and navigation checks can still address it.
- [ ] Keep all catalog results below the discovery shelf; do not replace the catalog with the top six.
- [ ] Scope border, crop, shadow, type, and spacing changes below `.explore-page` and `.trips-page`.
- [ ] Keep the default double-bezel presentation on unchanged creator/public routes.
- [ ] Run `npx vitest run tests/discovery.test.ts tests/editorial-assets.test.ts tests/design-system.test.ts tests/forkPersist.test.ts tests/public-trip-fail-closed.test.ts`.
- [ ] Run `duplicate-names` with equal publication/fork evidence and distinct links in the browser.
- [ ] Check signed-out Fork opens Auth, Save toggles locally, and public-card navigation still works.
- [ ] Check the paid and subscription cards keep their current entitlement paths.
- [ ] Review compact creator and itinerary crops against the approved study. Do not commit without permission.

### Task 5: Isolated visual and behaviour matrix

**Files:**
- Modify: `scripts/browser-redesign-check.mjs`, `scripts/redesignFixture.mjs`, `tests/redesign-fixture.test.ts`.
- Store results only under distinct `.cache/visual-quality-*` directories.
- Do not add DOM tests to Vitest or relax mutation rejection.

**Interfaces:**
- Preserve the existing default CLI and `results.json` format.
- Add `--theme light|dark`, `--widths '1440,1024,768,390'`, `--images synthetic|reference|broken`, and `--explore-auth anonymous|signed-in`.
- Add scenarios `sparse`, `many-publications`, `equal-creators`, `editor-cover`, `missing-cover`, and `broken-cover`.
- Existing `mixed`, `past-only`, `duplicate-names`, loading, empty, and error inputs keep their meanings.
- Extend each result with `theme`, `imageMode`, loaded-font evidence, image failures, and first-view screenshot path.

- [ ] Add pure fixture red checks for one live publication, at least 13 publications, equal creator evidence, and editor permission.
- [ ] Keep all IDs, emails, sessions, and writes explicitly synthetic.
- [ ] Use this pattern for scenario checks:

```ts
it('offers a real pagination case without duplicate publication IDs', () => {
  const rows = buildFixture('many-publications').published_itineraries
  expect(rows.length).toBeGreaterThan(12)
  expect(new Set(rows.map((row: { id: string }) => row.id)).size).toBe(rows.length)
})

it('makes missing and broken persisted covers different cases', () => {
  expect(buildFixture('missing-cover').trips[0].cover_image_url).toBe('')
  expect(buildFixture('broken-cover').trips[0].cover_image_url).toContain('broken-cover')
})
```

- [ ] Run `npx vitest run tests/redesign-fixture.test.ts` and record the red failures.
- [ ] Add deterministic scenario data in `buildFixture(scenario)` without changing production rows.
- [ ] Keep unknown mutations and unknown reads rejected. Do not fake live enforcement.
- [ ] For signed-in Fork, use the existing pure persistence tests plus a bounded synthetic persistence check.
- [ ] If the browser reaches a real write path, add a synthetic-only allow rule for that exact operation.
- [ ] Require the known synthetic current user, generated fixture-owned trip ID, expected request schema, and all referenced fixture-owned records.
- [ ] Update only fixture memory. Add positive and foreign-user/foreign-ID/malformed-body negative tests for that rule.
- [ ] Never enable a generic POST/PATCH/DELETE responder just to make Fork pass.
- [ ] If the signed-in browser flow cannot be modelled safely, report it as untested and keep completion open.

The current visual harness blocks fonts.
For reference-image mode, permit only Google Fonts CSS and font files with GET/HEAD.
Keep every other external service blocked.
Do not add a broad external-host allowlist.

```js
const isFontRequest = ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)
if (imageMode === 'reference' && isFontRequest && ['GET', 'HEAD'].includes(request.method())) {
  await route.continue()
  return
}
```

- [ ] Map each synthetic cover request to an appropriate copied local image in reference mode.
- [ ] Return an actual failure for broken mode and test the fallback after the image error fires.
- [ ] Set `yatraflow_theme` in the context init script before navigation.
- [ ] Keep the fixed date, backend interception, service-worker block, and remote realtime block.
- [ ] Confirm both requested theme and rendered `documentElement.dataset.theme` match.
- [ ] Wait for `document.fonts.ready` and record family availability:

```js
await page.evaluate(() => document.fonts.ready)
const fonts = await page.evaluate(() => {
  const loadedFamily = family => [...document.fonts].some(face =>
    face.family.replace(/^['"]|['"]$/g, '') === family && face.status === 'loaded')
  return {
    interface: loadedFamily('Plus Jakarta Sans') && document.fonts.check('500 16px "Plus Jakarta Sans"'),
    editorial: loadedFamily('Playfair Display') && document.fonts.check('600 32px "Playfair Display"'),
  }
})
assert(fonts.interface, 'Interface font must load before visual review')
if (surface.name === 'explore') assert(fonts.editorial, 'Explore editorial font must load')
```

- [ ] Capture first-view and full-page images before interaction tests change page state.
- [ ] Fail populated acceptance on browser exceptions, clipped controls, unexpected writes, or horizontal overflow.
- [ ] Keep failed-image and fallback-font tests distinct from normal loaded-font comparisons.
- [ ] Upgrade loading, empty, and error runs from screenshot diagnostics to explicit state assertions.
- [ ] For error, use Retry with a synthetic transition back to healthy reads; keep live requests blocked.
- [ ] Check My Trips query, status chips, sort, grid/list, import entry, purchases, trash, demo, and create entry.
- [ ] Check featured next-step destinations and owner/editor/viewer cover actions.
- [ ] Check Explore style, budget, duration, query, Saved, sort, pagination, Save/Fork, and featured exception.
- [ ] Check discovery rails hide under filters and never repeat data to fill empty rows.
- [ ] Check the section-navigation buttons, disabled targets, and responsive right rail by interaction.
- [ ] Check tab navigation, visible focus, keyboard-activated buttons, and card link reachability.
- [ ] Check reduced motion and 200% browser zoom; do not substitute CSS zoom as proof of browser zoom.
- [ ] Check long text and sparse data at intermediate widths in both themes.
- [ ] Add smoke navigation for all eight workspace routes when shared styles change.
- [ ] Use `overview`, `timeline`, `board`, `map`, `group`, `budget`, `share`, and `settings` from this tree's `TripWorkspace.tsx`.
- [ ] Overview uses `/trip/<id>`; the other tabs use `/trip/<id>/<tab>`.
- [ ] Keep existing workspace permissions and publication-status checks as regression checks, not redesign acceptance.
- [ ] Record any browser zoom or live-enforcement check that requires manual inspection as open, not passed.

Run the matrix after these CLI options exist:

```powershell
$ErrorActionPreference = 'Stop'
Set-Location 'C:\Users\hasna\Yatraflow-minimax\.cache\mr10-explore-discovery'
npx vitest run tests/redesign-fixture.test.ts
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
foreach ($theme in @('light', 'dark')) {
  node scripts/browser-redesign-check.mjs --base-url http://localhost:5188 --out ".cache/visual-quality-$theme-reference" --theme $theme --widths '1440,1024,768,390' --images reference
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
foreach ($scenario in @('past-only', 'equal-creators', 'sparse', 'many-publications', 'editor-cover', 'missing-cover', 'broken-cover')) {
  node scripts/browser-redesign-check.mjs --base-url http://localhost:5188 --out ".cache/visual-quality-$scenario" --scenario $scenario --theme light --images reference
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
foreach ($state in @('loading', 'empty', 'error')) {
  node scripts/browser-redesign-check.mjs --base-url http://localhost:5188 --out ".cache/visual-quality-$state" --state $state --images reference
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
node scripts/browser-redesign-check.mjs --base-url http://localhost:5188 --out .cache/visual-quality-signed-in --explore-auth signed-in --images reference
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
```

- [ ] Add dark sparse and dark broken-image captures in distinct directories.
- [ ] Run a separate blocked-font capture to confirm readable fallbacks.
- [ ] Review the test report for uncovered checks before marking this task complete.
- [ ] Do not commit without permission.

### Task 6: Full checks, matched review, and honest handoff

**Files:**
- Modify: `ROADMAP.md`, `CHANGELOG.md`, `docs/AGENTS-VERIFICATION.md`, `docs/README.md` as required by actual results.
- Create during execution: `docs/redesign/VISUAL-QUALITY-REVIEW.md` as a reference to observed gaps and capture conditions.
- Refresh the portable comparison under `.cache/visual-reference-audit/` without copying companion state.
- No source changes belong to this task unless a failed check sends work back to its owning task.

**Interfaces:**
- Consumes: all task results, original renders, approved studies, current product captures.
- Produces: a portable comparison file and an explicit visual-gap record.
- Produces: user review request for the actual rendered product, not another static study.

- [x] Run `npm run verify` from the isolated worktree and preserve its output.
- [x] Record current test counts and build results. Do not reuse the earlier 3779-test result.
- [x] Run `node scripts/lint-ste.mjs --file` for every new untracked prose document.
- [x] Run `git diff --check` and inspect the final diff for secrets and scope drift.
- [x] Confirm assets work from the production build without the reference folder.
- [x] Serve the production build on a verified free local port and run the populated fixture checks against it.
- [x] Use the same blocked-backend setup for production preview checks.
- [x] Record the exact source revision, dirty-file hashes, viewport, theme, fixture, fonts, and capture time for each review image.
- [x] Compare each page against its original reference and approved study at the same viewport.
- [x] Explain My Trips' smaller embedded artboard rather than report a false matched pixel difference.
- [ ] Evaluate composition, type, photography, density, surfaces, and responsive adaptation for each page.
- [ ] Fix weak crops, poorly balanced columns, oversized gaps, and crowded controls in their owning tasks.
- [ ] Re-run the relevant checks after every visual repair.
- [ ] Check Landing, creator/public pages, owner publications, account actions, and all eight workspace tabs for shared-style regressions.
- [x] Do not alter the separate sidebar branch during those checks.
- [ ] Request an independent read-only review if an approved model is available.
- [ ] Read `C:\Users\hasna\.minimax\ROUTING.md` before model selection or delegation.
- [ ] Do not retry quota-exhausted Astra/Sol models without checking availability.
- [ ] Do not silently pick another paid model when a requested model is unavailable.
- [ ] State when independent review is unavailable; parent review is not independent.
- [x] Build a fresh portable comparison with full-page and first-view captures.
- [x] Verify the comparison opens, images load, tabs work, and no private companion key is embedded.
- [ ] Deliver the comparison file and the observed-gap record. Do not attach environment or auth files.
- [ ] Ask the user whether the actual My Trips and Explore result meets the visual-quality goal.
- [x] Keep visual acceptance open until that answer arrives.
- [x] Keep publication and workspace work open even if this batch is accepted.
- [ ] Update functional, visual, and untested outcomes separately in the roadmap.
- [ ] Stop only this tree's verified preview process when its evidence work is done.
- [x] Do not commit, push, open a PR, merge, or deploy publicly without the required permission.

## Plan coverage and execution order

| Specification section | Tasks |
|---|---|
| Goal, scope, reference meaning | Preflight, all global constraints, Task 6 |
| Type, colour, assets, theme contrast | Tasks 1–4, 5–6 |
| My Trips banner, controls, featured split, real facts | Task 2, scenarios in Task 5 |
| Explore columns, hero, counts, catalog and filters | Tasks 3–4, matrix in Task 5 |
| Public cover selection and image fallback | Tasks 1, 2, 4–5 |
| Save/Fork, account actions, routes and permissions | Tasks 2, 4–6 |
| Sparse, loading, empty, error, retry, and long text | Task 5 |
| Keyboard, focus, reduced motion, zoom, both themes | Task 5 |
| Shared consumers and eight workspace routes | Tasks 1, 4–6 |
| Actual rendered comparison and user visual decision | Task 6 |

Execute Task 1 through Task 6 in sequence.
Each task must produce a checked unit before the next one starts.
Do not parallelise writers to shared CSS, card components, or the fixture harness.
Do not use automated green results as permission to skip the final visual review.

# Mockup visual quality: My Trips and Explore

**Date:** 2026-10-08

**Status:** Direction and written specification approved by the user on 2026-10-08. Product visual acceptance remains open.

**Type:** Design reference, not a delivery claim.

**Decision record:** [ADR 0004](../../adr/0004-mockup-visual-direction-and-image-reuse.md)

**Progress owner:** [ROADMAP.md](../../../ROADMAP.md)

## 1. Goal and scope

You asked for the same, equally good, or better appearance than the mockup files.
Feature coverage and passing tests do not meet this goal alone.
The design must reconstruct the reference composition, type, photography, density, and surface treatment.
It must adapt these choices to real product data and working controls.

This specification covers My Trips and Explore first.
Publication polish follows later, with its own design review.
Workspace-shell integration needs a separate decision.
This first batch cannot close the whole redesign goal.

Work must stay in `C:\Users\hasna\Yatraflow-minimax\.cache\mr10-explore-discovery`.
The branch is `feat/minimax-mr10-explore-discovery`.
You must preserve the separate `feat/trip-shell-sidebar` work in the main MiniMax checkout.
You must not merge, rebase, or copy that work without approval.
MR12's mobile bottom bar stays parked.
You must not commit or push without explicit permission.

## 2. Approved evidence and reference mapping

The user approved the My Trips and Explore studies as the design direction.
The user did not approve the rendered product as complete.
The studies have sample data and inactive controls.
Their missing controls do not authorise product removals.

The read-only reference root is `C:\Users\hasna\yatraflow-mockup`.

| Reference | Product meaning | Use in this batch |
|---|---|---|
| `index.html` | My Trips artboard, design notes, and a phone example | Banner, title transition, card hierarchy, photo/content balance |
| `hub.html` | Public discovery, despite its Creator hub title | Explore shell, photo hero, editorial type, compact cards |
| `creator-hub.html` | Publication component states | Later publication review only |
| `trip.html` | Trip workspace overview | Later workspace review only |

The comparison renders the references at 1440×900 and 390×844.
My Trips has a smaller embedded reference artboard.
You must compare its composition, not claim a matched full-page pixel difference.

Local review evidence sits under `.cache/visual-reference-audit/`:

| Artifact | Meaning |
|---|---|
| `YatraFlow-visual-review.html` | Portable comparison of references, current app, and approved studies |
| `target-my-trips-{desktop,phone}.png` | Approved My Trips study |
| `target-explore-{desktop,phone}.png` | Approved Explore study |
| `current-{my-trips,explore}-{desktop,phone}.png` | Before captures, with synthetic data and reference cover photos |
| `capture-review-results.json` | Capture checks and fixture limits |
| `check-review-results.json` | Portable page and companion checks |

These files are local evidence, not build dependencies.
A private companion access key must not enter documents, source control, or delivered files.

## 3. Design system

### Type

Use Plus Jakarta Sans for controls, body text, metadata, and My Trips headings.
Use Playfair Display for Explore's editorial hero heading.
Do not add Caveat in this batch.
The approved studies did not establish its role.

Scope font changes to these pages first.
Any shared font-token change must include checks on other routes.
Use tabular numerals for comparable budgets and counts.
Retain readable fallbacks while fonts load or fail.

### Colour and surfaces

Use the reference values as the light-theme visual direction.
They are not proof of accessible foreground/background pairs.

| Role | Light reference |
|---|---|
| Canvas | `#F4EDE3` |
| Sand surface | `#FBF5ED` |
| Mint surface | `#E8F5F1` |
| Teal accent | `#0EA5A0` |
| Navy ink | `#0F2D46` |

Use semantic app tokens for text, actions, statuses, borders, and scrims.
Define each new token in both themes.
Dark theme must preserve the hierarchy without copying light surfaces unchanged.
Use thin warm borders and restrained shadows.
Keep content surfaces mostly opaque.
Use directional scrims where text overlaps photos.
Check contrast after all overlays and theme rules apply.
Do not assume white text works on the reference teal.

Keep warning, success, and destructive meanings distinct.
Never communicate status through colour alone.
Keep the existing spacing, type-floor, and motion rules.
A token change must not weaken a gate or hide a new defect.
Use existing motion patterns and reduced-motion support.

## 4. My Trips composition

### Banner and controls

Use a panoramic page banner from the approved reference imagery.
Place the page title at the image-to-paper transition.
The banner establishes travel atmosphere; it does not claim a user's trip has a cover.
Keep the page content on a warm paper surface.

Group search, filters, sort, and New trip in one clear control area.
Keep all existing actions reachable, including purchases, import, trash, and demo.
Use labelled secondary controls or an accessible menu where the control area becomes crowded.
The phone layout must not hide those actions.
Search must still include every trip, including the featured trip.
Keep the existing filters, counts, grid/list choice, and sorting behaviour.

### Featured journey

Replace the oversized stacked photo hero with a balanced photo/content split on desktop.
The photo must support the content rather than push the trip list far below the fold.
Show title, route, dates, useful metadata, activity coverage, and the next action on the content side.
Use one primary planning action.
Stack photo and content on phone.
Allow text and controls to wrap without clipping.

Keep the selection rules from `src/lib/featuredTrip.ts`.
Prefer future departure, then an underway trip, then the most recently updated trip.
Keep input order for tied selections.
Use honest upcoming, underway, completed, and undated labels.
Do not call a completed journey an upcoming trip.

Activity coverage must describe days with activities.
It must not claim overall readiness to travel.
Keep real next-step behaviour and the existing `tripNextStep` rules.
The no-day planning action must open Timeline.
Cover actions must open Settings.
Only owners and editors may receive editable cover actions.

A saved cover means a nonblank persisted `Trip.coverImageUrl`.
A chosen emoji remains separate from a saved photo.
Runtime destination imagery must not change the saved-cover verdict.
Use a deliberate token-based fallback for missing or broken covers.
A fallback must not show a false Cover photo claim.

### Remaining trips

Use compact photographic cards with consistent crop, border, and text hierarchy.
Keep trip names, dates, statuses, crew facts, and existing card actions.
Use the current product filter vocabulary, not sample study buckets.
Adapt the grid to the number of real trips.
Do not duplicate content to fill the page.
List view must remain useful and complete.

## 5. Explore composition

### Shell and hero

Use a compact three-column discovery layout on wide desktop.
The left column carries discovery navigation.
The centre carries the hero, filters, discovery sections, and complete catalog.
The right column carries existing useful guidance and the creator invitation.
Do not add fake community metrics or new promises to fill the rail.

The study uses a 300px right rail on wide desktop.
The original reference uses 206px left and 332px right columns.
These proportions guide the balance; they are not fixed widths for every viewport.
Above 1150px, use three columns.
From 721px through 1150px, move right-rail content below the centre content.
At 720px or less, use one content column with compact discovery links.
Keep every destination reachable through navigation or the existing mobile menu.
Do not add a fixed bottom bar.

Use a photographic hero with a light directional scrim.
Use Playfair Display for its editorial headline.
Keep the hero short enough to expose discovery content in the desktop first view.
Use only actual live-publication and creator counts.
Do not display invented followers, ratings, earnings, or community totals.

### Creators and itineraries

Use image-led creator cards.
Derive creator covers from their public routes.
Never derive these images from private trips.
Retain identity fallbacks when a creator has no usable cover or avatar.
Show real publication and fork evidence.
Keep long names readable.
Give same-named creators distinct link context when their displayed evidence also matches.

Use compact photographic itinerary cards with clear title, route facts, and creator context.
Keep Save, Fork, and public itinerary links working.
Keep paid-plan and entitlement behaviour unchanged.
Keep popularity copy honest about views and forks.
Use deterministic ordering with stable final ID ties.

### Catalog and sparse states

Keep the complete catalog below the discovery sections.
Keep pagination, search, style, budget, duration, Saved, and existing sort controls.
Discovery rails must hide while those filters are active, as they do now.
The global featured-card exception must remain visible with its explanatory label.
It must not become part of the filtered result count.

A small catalog must form a balanced layout with fewer cards.
Hide empty discovery sections rather than fill them with repeated or invented records.
Keep a clear route to all available results.
Give loading, empty success, and read failure different presentations.
Read failure must preserve the retry path.

## 6. Assets and implementation boundaries

The user confirmed permission to reuse the mockup images.
This records the user's permission statement, not an independent legal review.
Keep the mockup folder read-only and outside the build.
Copy only selected images into the isolated project's asset tree after specification approval.
Do not copy the entire mockup app or its scripts.
Record source filenames and purpose for copied assets.

Use `hero-banner.jpg` for the My Trips page banner.
Use `ch-hero.jpg` for Explore's hero.
Other approved study images include Kerala, Goa, Rajasthan, Spiti, and Himalayan route photos.
Use route photos only where the destination context matches.
Do not present them as user-uploaded covers.
Reserve image geometry during load.
Keep meaningful alternative text or mark decorative images as decorative.

Use the existing store, routes, and domain helpers.
This batch needs no database migration, live seed, or new backend API.

| Unit | Responsibility | Boundary |
|---|---|---|
| `TripsList.tsx` | Banner, grouped controls, featured journey, complete trip collection | Keep existing state and handlers |
| `featuredTrip.ts` / `tripNextStep.ts` | Selection, dates, next-step facts | Keep pure logic and permission meaning |
| `Explore.tsx` | Discovery layout, filter state, featured exception, complete catalog | Keep public read and pagination paths |
| `ExploreDiscovery.tsx` / `discovery.ts` | Creator and trending cards, public image choice, ranking | Read public records only |
| `PubCard.tsx` / `CoverThumb.tsx` | Existing card and cover behaviour | Limit changes and check other consumers |
| `styles.css` | Page geometry and semantic token mappings | Fold changes into existing rules; avoid duplicate overrides |
| Local assets | Selected approved photos | No dependency on an external local folder |

Extract a focused presentation component only where it makes the page easier to understand.
Do not introduce a new global shell framework for this batch.
Do not redesign Landing, purchases, profiles, or the eight workspace tabs here.
Check these routes for regressions if shared styles change.

## 7. Acceptance contract

### Product and safety checks

Run `npm run verify` after product changes.
Run pure logic tests in the existing node environment.
Use browser scripts for rendered behaviour.
Use the local fixture harness with live services and realtime blocked.
Unknown writes must fail instead of reaching live accounts.
Synthetic checks do not prove live access enforcement.
Do not expose environment files or authentication data in evidence.

Check My Trips with mixed dates, past-only trips, undated trips, and no days.
Check owners, editors, and viewers.
Check Explore signed out and signed in.
Check filters, pagination, Saved, Save/Fork, duplicate creator names, and the featured exception.
Check loading, empty, failure/retry, sparse catalogs, long titles, and missing or broken images.

### Rendered checks

Capture both pages at 1440×900 and 390×844 in light and dark themes.
Also check 768px and 1024px widths for layout changes and control reachability.
Check keyboard navigation, visible focus, reduced motion, and 200% zoom.
Check horizontal overflow and cropped text or controls.
Check menu options by interaction, not screenshots alone.
Confirm fonts and images loaded before visual comparison.
Keep fallback-font and failed-image checks separate from those comparisons.

Check other routes affected by shared styles.
The eight routed workspace tabs and their permissions must still work.
Keep the separate sidebar work untouched.

### Visual decision

Compare the rendered product against both the original reference and the approved study.
Use the same viewport, stable fixture data, loaded fonts, and matching destination imagery where practical.
Keep full-page and first-view captures.
Explain any reference-artboard size mismatch.
Do not treat a synthetic sample as proof of a complete live catalog.

Review these six dimensions for each page:

1. Composition: banner, hero, columns, and content balance follow the approved direction.
2. Type: headline character, size, weight, and line breaks support the reference hierarchy.
3. Photography: crop, contrast, scrims, and card images create comparable travel atmosphere.
4. Density: useful content appears without oversized empty areas or crowded controls.
5. Surfaces: paper, borders, radii, and shadows create clear and restrained depth.
6. Adaptation: phone, sparse data, and dark theme preserve the same level of care.

List remaining gaps against those dimensions before asking for visual acceptance.
Structural test success must not close visual acceptance.
You must approve the rendered product's visual quality before this batch claims completion.
An independent review can support that decision but cannot replace it.
If a review model is unavailable, state that limit instead of claiming independent review.

## 8. Gates and next step

The direction, image permission, and written specification are approved.
The user approved this specification through the written-review questionnaire on 2026-10-08.
Prepare the detailed implementation plan next.
Then build and review My Trips and Explore as one bounded batch.
Keep publication and workspace design decisions separate.
No app source changed while this specification was prepared.

# Compact cards and Explore discovery correction

Date: 2026-10-09

Status: You approved the revised direction and this written specification.

Written approval: `ask_93fd554f445729375164aa92`, step `written-correction-specification`.

Type: Design specification. This document does not claim product completion.

Direction approval: `ask_871d53019080c806e19720b0`, step `revised-correction-design`.

Related specification: [Mockup visual quality](2026-10-08-mockup-visual-quality-design.md).

Decision record: [ADR 0004](../../adr/0004-mockup-visual-direction-and-image-reuse.md).

## 1. Scope and size decision

You want compact, clean cards that follow the mockup's visual hierarchy.
The existing My Trips card size is acceptable.
Featured creator cards on Explore need a smaller vertical stack.
Explore itinerary cards need less repeated information and less height.

This document replaces conflicting card, hero, and discovery choices in the earlier specification.
The earlier specification's safety and product rules remain in force.
Accepted decision records remain unchanged.

The correction must not enlarge cards to make them look square.
There is no fixed square aspect ratio for a complete card.
The correction must reduce excess card height instead.
Text, controls, and keyboard focus must remain visible.

The correction does not widen the My Trips page or change its grid density.
It must retain the current card widths at equal viewport sizes.
The correction may remove redundant vertical spacing inside cards.
The featured journey keeps its existing photo and content layout.

The work covers My Trips and Explore only.
Publication page design and workspace design remain separate.
MR12's mobile bottom bar remains outside this work.

The worktree is `C:\Users\hasna\Yatraflow-minimax\.cache\mr10-explore-discovery`.
The branch is `feat/minimax-mr10-explore-discovery`.
The correction must preserve the main checkout's `feat/trip-shell-sidebar` work.
No commit, push, merge, rebase, public deployment, or live account write is approved.

## 2. Reference and confirmed gaps

The read-only reference root is `C:\Users\hasna\yatraflow-mockup`.
The correction uses `hub.html`, `hub.css`, and `hub.js` for Explore's card hierarchy.
The correction uses the My Trips artboard and `styles.css` for My Trips.
Reference files must not become build dependencies.

The existing Explore cards repeat fork evidence.
They place creator identity, the Fork button, and the creator bio in separate vertical rows.
They inherit a full-width footer divider from the shared card.
Their photo route captions use the hero's fading scrim.
Their 19px serif titles differ from the reference's compact sans-serif titles.

The existing creator cards stack the avatar above the creator name.
They inset the cover inside another card border.
Explore lacks Places in the community and the handwritten hero annotation.
The hero has two count items instead of four.
Its scrim starts fully opaque, unlike the reference's partly transparent wash.

The original Explore cards have no internal divider.
The original My Trips cards do have a footer divider.
Your requested clean treatment overrides that My Trips reference detail.
The correction removes internal dividers from both card sets.
Outer card borders and useful control boundaries remain.

## 3. My Trips cards

The correction keeps the existing grid and list modes.
Grid card widths and column counts must match the current product at equal viewport sizes.
List mode remains a horizontal row where space permits.
Phone layouts retain their existing stacked structure.

The cover keeps its `16 / 8.4` ratio.
The status pill remains at the cover's top-left.
The existing card menu remains reachable without covering the status pill.
The card retains its current compact sans-serif title.

The body retains the title, route, trip facts, tags, departure text, and activity coverage.
Related facts share a row where space permits.
Metadata icons use one consistent size and baseline.
Pills retain clear text, rounded ends, and consistent internal spacing.

The footer uses spacing instead of a divider.
Crew information and the next action retain their existing meaning.
Trash, cover, and next-step actions remain separate from the trip link.
Controls must not overlap or become nested interactive elements.
Long action labels may wrap rather than disappear.

The correction keeps date, status, activity coverage, and next-step derivations unchanged.
It must not describe activity coverage as readiness to travel.
Owners, editors, and viewers retain their existing action permissions.
Cover actions still open Settings.
The no-day planning action still opens Timeline.

## 4. Explore itinerary cards

The correction uses the existing opt-in `editorial` presentation in `PubCard`.
Other `PubCard` consumers retain their default design.
The featured publication remains a separate article.

The correction keeps the current itinerary grid widths and responsive column counts.
It must not enlarge a card or reduce grid density to hide excess height.
The normal fixture cards must become shorter through simpler content and spacing.
Long content must not force a new fixed height across unrelated rows.

The photo uses the reference's compact `16 / 7.2` landscape crop.
A duration pill sits at the photo's top-left.
A bookmark button sits at the top-right.
Both controls use opaque backgrounds with readable theme colours.
The bookmark retains the existing Save behaviour, label, and pressed state.
The correction does not add a public save count.

The trending rank must remain distinct from the duration pill.
The rank sits in the section's card wrapper, outside the photo controls.
Its position must not obscure the photo, title, or keyboard focus.

The content order is:

1. The title uses compact Plus Jakarta Sans text.
2. The description uses at most two visible lines.
3. Travel style uses a clean pill.
4. Budget and place facts use a compact row.
5. Creator identity uses an avatar, name, and the existing creator mark.
6. One evidence row states real views and forks.
7. The Fork action remains reachable without a divider.

Duration appears once, on the photo.
Fork evidence appears once, in the evidence row.
The evidence row must not present views or forks as ratings.
`PublishedItinerary` has no itinerary rating field.
The correction must not copy sample stars, review counts, or likes from `hub.js`.

Creator social links stay beside creator context when space permits.
The full creator bio remains available through the existing creator page.
The editorial itinerary card does not repeat that bio as a separate footer paragraph.
Featured creator cards retain their bio.

The correction removes the route caption from the photograph.
Useful route text may appear in the card body on a solid background.
It must not use a fading background or white text over an unknown photograph.
The publication page retains the complete route and description.

The body, creator links, social links, Save, and Fork keep separate interactive targets.
Only the outer card performs the hover lift.
The inner publication link must not perform a second lift.
Absent creator profiles retain the current identity fallback.

## 5. Featured creator cards

The correction retains the existing creator selection and ranking rules.
`CreatorRank.pubCount`, `CreatorRank.forks`, and visible rank retain their current meanings.
Same-named creators retain distinct accessible link context.
Creator covers still come from their own live publications.

The existing responsive creator grid remains.
The cover reaches the card edges instead of sitting inside another inset frame.
Its height must not exceed the current 132px desktop cover.
The avatar and creator name share one identity row.
The creator mark sits next to the name.
The rank stays visible without joining the creator's name text.

The bio uses at most two visible lines.
One compact evidence row shows public itineraries and forks.
The card retains the creator-page link.
The correction must not add unsupported Follow buttons, handles, or follower counts.

## 6. Places in the community

Explore gains a right-rail block titled Places in the community.
The block follows the creator invitation and precedes the Fork guidance.
It moves with the existing right rail at tablet and phone widths.
It does not add another narrow main-page column.

The block reads `livePubs(published)` only.
It must not read private trips or query another backend service.
Each tile states a route place and its live-publication count.
A publication counts once for each distinct place in its `routeSummary`.

Place identity uses trimmed text, collapsed spaces, and case-insensitive comparison.
Blank names do not produce tiles.
The display label comes from an actual route label.
Label selection must remain stable when publication input order changes.
Place aliases must not merge different route labels or infer larger geographic regions.

Tiles sort by descending publication count.
Equal counts use a stable label and place-key order.
The block shows at most six tiles.
One to six actual places produce that many tiles.
The block must not repeat tiles to fill its layout.

A tile uses `editorialRouteCover` for its own place label.
A place without matching imagery uses a neutral photo fallback with a place icon.
A failed image retains the tile's geometry and label.
Images remain decorative route imagery, not uploaded-cover facts.

A tile click uses the existing `q` search with the place label.
It clears style, budget, duration, and Saved restrictions.
It retains the selected sort and resets pagination.
It writes the existing search URL state and scrolls to the catalog.
Search continues to match titles, routes, and creator names as it does now.
Tile counts describe route occurrences, not every result of that broader search.

The tile's accessible name includes its place and publication count.
The block appears only when `pubsRead === 'ready'` and discovery is visible.
It hides with other discovery sections when filters are active.
An empty live catalog does not produce a Places block.
A failed read does not show a false zero count.

## 7. Four hero items and annotation

The hero gains four compact icon-led items.
All items describe the live public catalog loaded by this page.
They must not claim platform-wide users, unique travellers, or revenue.

| Item | Data basis | Visible meaning |
|---|---|---|
| Live itineraries | Existing `community.pubCount` | Number of live publications |
| Creators | Existing `community.creatorCount` | Distinct creator IDs in those publications |
| Route places | Distinct normalized route place keys | Places named in those public routes |
| Forks | Sum of live publication `copies` | Recorded forks, not distinct people |

The four items share one desktop row where space permits.
They wrap into a balanced two-column arrangement on smaller widths.
Counts use tabular numerals and correct singular labels.
Zero counts appear only after a successful empty read.
All four facts remain hidden until `pubsRead === 'ready'`.

The hero retains its existing title and Explore action.
The correction does not copy the sample earnings headline.
The hero remains compact and must not gain a large empty area for the metrics.

The annotation uses the reference's three lines:

> Real travellers
>
> Real stories
>
> Better trips

The annotation sits in the photograph's open space beside a drawn arrow.
It is editorial copy, not an attributed traveller testimonial.
The arrow is decorative and does not accept pointer input.
The text remains readable in the page's reading order.
At narrow widths, the annotation moves within the hero rather than covering controls.

Caveat 600 supplies the handwritten style through the existing font-loading path.
Its use stays scoped to the annotation.
A cursive fallback keeps the text visible when hosted fonts fail.
This choice replaces the earlier specification's exclusion of Caveat for this page.
The correction must not change body or workspace fonts.

## 8. Photography, spacing, and motion

The hero uses a dedicated text scrim instead of the shared broad opaque wash.
The scrim protects the text area and clears toward the open photograph.
The correction preserves the photograph's colour and detail outside that area.
It must not desaturate, blur, or lower the whole image's opacity.
The annotation may use a small solid backing when the photograph prevents readable contrast.
Both themes need their own readable text and backing colours.

Saved-cover precedence remains unchanged.
The order remains saved URL, matching local route photo, runtime destination photo, then neutral fallback.
Decorative imagery must not create a saved-cover claim.
The correction reuses the adopted photos before adding more assets.
Any new asset needs its source record and the same permission limits.

Internal spacing uses the existing ladder:

`[2, 4, 6, 8, 12, 14, 16, 20, 22, 24]`

The correction removes duplicate insets and oversized gaps inside cards.
It must not create another padded container around card grids.
The existing page widths remain because you accepted the current trip card size.

Sections use the existing token-based entrance pattern.
Cards use one lift and a gentle photo zoom on pointer hover.
Bookmarks and buttons give visible pressed and saved-state feedback.
Keyboard focus remains visible without relying on hover movement.
Touch input must not retain a false hover state.

Durations and easings come from `docs/MOTION-TOKENS.md`.
Entrance animations must not hold a transform that disables later hover movement.
The correction adds no constant floating, parallax, or count-up animation.
Reduced-motion mode disables entrance movement, lift, zoom, and animated state transitions.

## 9. Component boundaries and product rules

`discovery.ts` owns pure place counts and the extended community counts.
The module retains `popularity`, `trendingPubs`, `featuredCreators`, and the existing feature threshold.
`ExploreDiscovery.tsx` owns compact creator cards and the Places block.
`Explore.tsx` owns hero composition, search changes, read guards, and pagination reset.
`PubCard.tsx` owns the opt-in editorial card presentation.
`CoverThumb.tsx` retains its existing default presentation and photo fallback rules.
`TripsList.tsx` retains its state, handlers, and domain derivations.

CSS changes stay scoped to `.trips-page` and `.explore-page` where possible.
The correction updates existing rules instead of adding another conflicting override layer.
The annotation font uses a page-local style.
No new animation library, global shell, migration, or backend API is part of this correction.

All five catalog sorts remain available.
The complete catalog, filter URL state, pagination, Saved, and retry behaviour remain.
The featured publication keeps its global filter exception and explanatory label.
The correction must not hide catalog entries to make a screenshot shorter.
Synthetic Fork persistence remains confined to the bounded fixture.
Unknown fixture writes must still fail closed.

The workspace routes remain overview, timeline, board, map, group, budget, share, and settings.
Overview remains `/trip/<id>`.
The other tabs remain `/trip/<id>/<tab>`.
Shared consumers need regression checks if a shared component or selector changes.

## 10. Acceptance and evidence

Before product edits, capture the current layout with the same fixture and viewport settings.
Record card rectangles, cover rectangles, and screenshot hashes as the correction baseline.
The existing production captures remain reference evidence, not approval of the current appearance.

At equal viewports, My Trips card widths must stay within two CSS pixels of the correction baseline.
Its grid column counts and list behaviour must remain unchanged.
The correction must not increase ordinary My Trips card height through added padding or repeated rows.
Explore itinerary widths and grid column counts must also remain unchanged.
Normal fixture itinerary cards must be at least 15 percent shorter than their correction baseline.
Featured creator cards must be shorter without cutting off identity or evidence.

The height target applies to normal fixture text, not arbitrary long text or browser zoom.
Content must remain readable when text wraps beyond that target.
The target must not depend on hiding Save, Fork, creator links, or social actions.
Full descriptions and creator bios remain reachable through their existing links.

Pure node tests cover place identity, per-publication deduplication, rank ties, empty routes, and soft-unpublished exclusions.
They also cover all four hero facts and existing discovery rules.
No DOM tests enter the node-only Vitest environment.

Rendered checks cover these widths:

- 1440px desktop.
- 1024px tablet.
- 768px tablet.
- 390px phone.

Both themes need loaded-font and failed-font checks.
Images need loaded, missing, and broken checks.
Catalog states need loading, empty success, failure, retry, sparse, and many-publication checks.
Rendered checks retain the existing fixture service blocking.
Unknown writes must not reach live services.

Check keyboard focus, control boundaries, text over photos, and annotation contrast after compositing.
Check long titles, creator names, social icons, menus, and Fork buttons for overlap.
Check all five sorts, filter resets, pagination, Saved, Save, and the bounded free Fork.
Check place tiles through actual clicks and URL state.
Check the global featured-card exception after a place search.

Motion checks sample entrance, hover, photo zoom, and bookmark feedback.
Reduced-motion checks prove the absence of those movements.
A motion declaration alone does not prove animation quality.

Actual 200 percent browser zoom needs an actual browser-zoom check.
Viewport scaling must not claim that result.
Any unavailable zoom or native device check remains an explicit gap.

Run `npm run verify` after product edits.
Run the production browser matrix with a frozen source tree and build.
Initial review screenshots must retain their hashes after interaction captures.
The comparison generator must reject stale source or build fingerprints.
Do not raise baselines, relax checks, or increase timeouts to hide a defect.

The final comparison must include the original reference and fresh rendered product images.
It must identify deliberate adaptations, including real evidence instead of sample ratings.
Functional checks and your visual acceptance remain separate.
Only your rendered-product approval closes this correction's visual review.

## 11. Review state and next step

You approved the revised direction and written specification on 2026-10-09.
The detailed plan is [Compact card correction](../plans/2026-10-09-compact-card-correction.md).
No product source changed while this specification and plan were prepared.
The earlier product build does not include this correction.
Product execution remains the next step.
All files remain local and uncommitted.

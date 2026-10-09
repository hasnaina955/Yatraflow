# Visual quality review and observed gaps

Date: 09 October 2026
Scope: My Trips and Explore only. Publication and workspace design work stays separate.

## What this record is

This file records what the isolated rendered checks proved, what they did not prove,
and the gaps a reader must see before judging the visual result. It does not replace
the user's visual decision.

## Evidence produced

| Item | Result |
|---|---|
| Full gate | 3,845 tests passed, 1 skipped. Typecheck, lint ratchet, STE, and production build passed. |
| Ratchet | 140 errors, 29 warnings against a 142-error, 29-warning baseline. Not raw ESLint cleanliness. |
| Production fixtures | Four surfaces, two widths, both themes. Every result passed. |
| Workspace routes | All eight tabs checked with exact routes, `aria-selected`, and a visible panel. |
| Signed-in free Fork | Trip row, owner membership, and attributed copy counter persist in fixture memory. The copy survives reload and appears in My Trips. |
| Pagination and sorting | All five sorts, tied rows, `Load more` order, and five filter resets passed at desktop and phone widths. |
| Card surfaces | Editorial cards use one frame. Photos meet the card edge. |
| Solid-token contrast | 27 checks passed. Accent text and decorative-border floors are separate. This is not a full-page accessibility result. |
| Blocked fonts | My Trips and Explore geometry and tested controls passed at 1440px, 768px, and 390px in both themes. |
| Capture preservation | Initial page-image hashes remain unchanged after interactions, including all workspace tabs in both themes. |
| Production assets | The built entry and its seven adopted photos load byte-exact from `dist`. |
| Comparison page | 64 control combinations render at 1440px and 390px with no external request and no page error. |

Source revision, dirty-file hashes, viewport, theme, fixture, fonts, and capture time
for each review image are in `.cache/visual-quality-review-2026-10-09/review-manifest.json`.

## Observed gaps

1. **User visual acceptance is open.** Automated checks cannot close the goal.
2. **Native and Capacitor smoke is unrecorded.** The rooted build base makes the
   local shell origin load its own assets, but no device run happened.
3. **Actual 200 percent browser zoom is untested.** Viewport scaling is not zoom.
4. **A complete rendered contrast verdict is missing.** The 27 token checks cover solid text and decorative-border pairs.
   They do not cover image overlays, gradients, browser compositing, focus rings, or every control boundary.
   The border floor uses the app's existing hairline strength, not WCAG's 3:1 control-boundary requirement.
   That measured floor replaces the initial 1.4:1 test floor. It is not an unchanged acceptance threshold.
5. **Landing, owner publications, and account actions were not re-checked** in this
   batch. Creator hub was.
6. **Independent review is unrecorded for the current source.** Earlier subagents reached their quota limits.
   No retry occurred in this resume. Parent review is not independent.
7. **Premium Fork and live Supabase persistence are untested.** Only one reserved free
   publication was exercised against fixture memory.
8. **Publication and workspace integration stays separate**, including the parked
   mobile bottom bar.
9. **Editor cover permissions remain unproved.** The editor-cover fixture does not establish editor membership.
   Owner and viewer checks do not prove the editor path.

## Reference meaning

The original mockup and the approved study are read-only references. Their sample
counts, followers, ratings, and placeholder actions are not product requirements.
My Trips' original is an extracted embedded artboard, not a viewport-matched screen,
so its desktop and phone samples keep their own dimensions.

## Repairs this batch

- Production history routes now load entry assets from the app origin. A relative
  build base requested scripts from `/trip/<id>/assets` after refresh.
- Explore cards use one photo-led frame. Trending no longer adds a second border,
  shadow, or padded surface.
- Signed-in Fork and pagination gained bounded synthetic checks. Unknown, foreign,
  repeated, and malformed writes remain rejected. The acceptance fixture never forwards writes to live services.
- Light accent labels now use a separate text token, `#0F766E`.
  Solid-token measurements are 5.47:1 on the white surface and 4.89:1 on mint.
  The decorative accent stays `#0EA5A0`. Dark accent text stays `#43C7BE`.
- Light decorative borders now use `#D7C9B6`. They meet the app's existing decorative-hairline floor.
  This result does not establish WCAG compliance for control boundaries.
- Workspace screenshots now use separate paths in every theme.
  The old dark filename rule replaced the initial My Trips image with Settings.
  The browser harness now fails if interactions change an initial screenshot's hash.
  Earlier dark My Trips comparison images must not serve as visual acceptance evidence.

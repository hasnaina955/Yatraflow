# Visual quality review and observed gaps

Date: 10 October 2026
Scope: My Trips and Explore only. Publication and workspace design work stays separate.

## What this record is

This file records what the isolated rendered checks proved, what they did not prove,
and the gaps a reader must see before judging the visual result. It does not replace
the user's visual decision.

## Evidence produced

| Item | Result |
|---|---|
| Full gate | 3,890 tests passed, 1 skipped. Typecheck, lint ratchet, STE, and production build passed. |
| Ratchet | 140 errors, 29 warnings against a 140-error, 29-warning baseline. Not raw ESLint cleanliness. |
| Correction captures | My Trips and Explore at 1440px, 1024px, 768px, and 390px in both themes. Every result passed. Itinerary cards measure 15.18 to 25.32 percent shorter. Creator cards measure 21.72 to 22.94 percent shorter. Widths remain unchanged. |
| Production fixtures | Four surfaces, two widths, both themes. Every result passed. |
| Workspace routes | All eight tabs checked with exact routes, `aria-selected`, and a visible panel. |
| Signed-in free Fork | One flight mints one copy under rapid double click. Trip row, owner membership, and attributed copy counter persist in fixture memory. The copy opens on success, survives reload, and appears in My Trips. |
| Fork honesty | Priced copies name locked days. Failed entitlement reads fork conservatively and say so. Catalog counts name rendered cards. Trip feet carry one cover control. |
| Pagination and sorting | All five sorts, tied rows, `Load more` order, and five filter resets passed at desktop and phone widths. Small pools suppress the mirroring trending shelf. |
| Places and hero facts | One to six tiles with counts from live routes. Tile search writes URL state, keeps sort, resets pagination, and survives reload. Four live hero facts render after a successful read only. The margin-note annotation sits below the photo in both themes. |
| Motion evidence | Current reduced-motion samples hold still. A separate normal-motion run passes behavior checks. Its frame samples are unavailable; earlier samples are historical. |
| Card surfaces | Editorial cards use one frame. Photos meet the card edge. Row bottoms match within each grid row. |
| Solid-token contrast | Token pairs, fork-button fill, and opaque photo-control backings measured in both themes. This is not a full-page accessibility result. |
| Blocked fonts | My Trips and Explore geometry and tested controls passed at 1440px, 1024px, 768px, and 390px in both themes. Caveat falls back to cursive with text intact. |
| Touch targets | Tested Fork, clear, and social controls pass center hit tests. Small controls answer one extended hit point. Complete hit-area and separation coverage remains open. |
| Focus | Keyboard focus lands visibly on place, cover, bookmark, fork, creator, foot, and section-heading controls with a changed ring. |
| Capture preservation | Initial page-image hashes remain unchanged after interactions, including all workspace tabs in both themes. |
| Production assets | The built entry and its seven adopted photos load byte-exact from `dist`. |
| Comparison page | 64 control combinations render at 1440px and 390px with no external request and no page error. The manifest carries geometry differences, content checks, and motion evidence. |

Source revision, dirty-file hashes, viewport, theme, fixture, fonts, and capture time
for each review image are in `.cache/visual-quality-review-2026-10-09/review-manifest.json`.

## Observed gaps

1. **The user approved both rendered pages on 10 October 2026.** Automated checks do not replace that decision.
2. **Native and Capacitor smoke is unrecorded.** The rooted build base makes the
   local shell origin load its own assets, but no device run happened.
3. **Actual 200 percent browser zoom is untested.** Viewport scaling is not zoom.
4. **A complete rendered contrast verdict is missing.** Token checks cover solid text,
   the fork fill, and opaque backings. They do not cover every composited overlay,
   gradient, focus ring, or control boundary.
5. **Landing, owner publications, and account actions were not re-checked** in this
   batch. Creator hub was.
6. **Subagent reviews ran but parent synthesis is not independent.** Adversarial
   reviews covered wiring, cards, motion, and both audits before each commit. The
   final synthesis and this record are the parent lane's own work.
7. **Premium Fork and live Supabase persistence are untested.** Only one reserved free
   publication was exercised against fixture memory.
8. **Publication and workspace integration stays separate**, including the parked
   mobile bottom bar.
9. **Editor cover permissions remain unproved.** The editor-cover fixture does not establish editor membership.
   Owner and viewer checks do not prove the editor path.
10. **Signed-in empty-account seeding remains a gap.** The app tries to write demo trips.
    The fixture rejects these writes and keeps the original rejection record.
    Successful-empty Explore is checked signed out, without seed writes.
11. **Empty-route cards are unrendered.** The route line omits itself without labels,
    but no fixture publication ships an empty route, so no capture proves that branch.
12. **Normal-motion frame sampling remains incomplete.** The current normal-motion run has no frame samples.
    Reduced-motion captures contain current samples. Earlier normal-motion samples are historical.

## Reference meaning

The original mockup and the approved study are read-only references. Their sample
counts, followers, ratings, and placeholder actions are not product requirements.
My Trips' original is an extracted embedded artboard, not a viewport-matched screen,
so its desktop and phone samples keep their own dimensions.

## Repairs this batch

- Itinerary cards pair a duration pill with a bookmark save, an endpoint route line,
  and one evidence row. Creator cards use a one-row identity under edge-to-edge covers.
- The trending shelf yields when the remaining pool fits it. The catalog leads.
- Trip feet carry one cover action with wrapping labels. Foot padding, gaps, controls,
  labels, and overlap stay pinned.
- Fork refuses double flights, names locked days, and opens its copy. Catalog counts
  name rendered cards. Featured evidence names its most-forked or most-viewed basis.
- Places tiles carry pin and initial art with intact geometry. Failed photos carry
  route initials. Trip emoji covers stay untouched.
- The hero annotation lives in a margin band below the photo. Fork labels sit on
  deep teal in both themes. Small controls prove 44px hit zones.
- The empty-state harness expects the correct copy for each authentication state.
  Refused mutations remain failures. Successful-empty Explore is checked signed out.
- Earlier dark My Trips comparison images must not serve as visual acceptance evidence.

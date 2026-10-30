# P2/P12 Overview evidence, 28 October 2026

## Current final-state evidence

The current fixture uses three health checks and no daylight check.
The route curve joins public height estimates at trip places.
The curve is illustrative. It does not measure the road between places.
The Data sources disclosure holds the full terrain credits.
The fixture uses synthetic heights and does not prove live terrain reads.
The four current theme and width captures are in `.verify-evidence/overview-fixture/`.
The source capture and `records.json` are in that folder too.
`states.json` records both retries and the simultaneous failure alert.
`../verify-final-20261028.log` records the latest full gate.
The source and fixture differ in trip data, cover and counts.
The screenshots show the requested layout, not pixel parity.
The signed-in acceptance remains open. The shared tab was not changed.

## Earlier evidence record

The sections below describe earlier captures and checks.
Their road sampling, daylight, tile counts and credit placement are superseded.

This folder holds the evidence for the workspace header and the Overview port.
The code is uncommitted on branch `feat/p2-p12-combined-mockup` at `69094cd7`.

## How to read the files

- `overview-1440-light-signedin.png` shows the real signed-in trip at 1440 by 900.
- `overview-1440-light.png`, `overview-1440-dark.png`, `overview-390-light.png` and
  `overview-390-dark.png` are the fixture at both widths and themes.
- `mockup-p12warm2-1440.png` is the source design, captured for the side-by-side.
- `card-route-light.png` and `card-brief-light.png` are the two cards alone.
- `state-elevation-failed.png`, `state-weather-partial-retained.png`,
  `state-cover-broken.png` and `state-mode-train.png` record the failure and
  fallback states.
- `../verify-gate-20261028.log` holds the clean full gate output.
- `../check-motion-20261028.log` holds the motion check output.
- `../impeccable-*.json` holds the detector output.
- `.verify-evidence/overview-fixture/records.json` holds the computed geometry.

## Server proof

The dev server listens on port 5178 and serves this worktree.

- `GET /src/styles.css` returns 200 and contains the Overview classes.
- `GET /src/lib/supabase.ts` contains the Supabase project ref.
- The backend is compiled in, so the data surfaces are live.
- The server predates this verification run. The harness ownership check fails.

## Layout measurements, signed-in trip

I measured the real trip `712a0493` in the browser.

| Width | Cover | Tab pill | Briefing | Metrics | Body | Overflow |
| --- | --- | --- | --- | --- | --- | --- |
| 1440 | 1140 x 260 | 671 wide, inside the cover | 600 + 522 | 2 x 2, 255 each | 600 + 522 | none |
| 390 | 343 x 296 | 311 wide, scrolls sideways | 343, one column | 2 x 2, 165.5 each | 343, one column | none |

The cover media matches the cover box at both widths.
The veil, the title, the trip facts and the member avatars sit over the cover.
The tab pill sits inside the cover at the bottom edge.

## Parent live reads

The parent read these values in the shared browser. I did not take these reads.

| Surface | Width and theme | Fold | Cover | Extra | Tabs | Overflow |
| --- | --- | --- | --- | --- | --- | --- |
| Board | 1440 dark | compact true | 180px | inert | 44px | none |
| Map | 1440 dark | compact true | 180px | inert | 44px | none |
| Map | 390 light | compact true | 188px | inert | 44px | none |
| Board | 390 light | compact true | 188px | inert | 44px | none |

Both Map reads show one MapLibre canvas. The parent returned to the Overview after the reads.

The Overview then restores the open header. It reads compact false and cover 296px at 390.
It reads cover 260px at 1440. The member row is no longer inert.

The parent also checked the focus handoff at 1440. The parent focused a member avatar, then clicked Board.
The next read shows the Board tab as the active element. Its role is tab and its state is selected.
The member row is inert at that point.

The parent restored the first-load theme state. Only the `yatraflow_theme` key was removed.
The app now opens on the Overview in light mode at desktop width.

## Route geometry

The route plate paints a 1px border on each side. The SVG fills the content box.
The plate size now measures that content box, so one SVG unit is one CSS pixel.
The fixture check asserts both facts on every case.

| Width | Plate | Border | SVG | viewBox | Hit circle |
| --- | --- | --- | --- | --- | --- |
| 1440 | 479.859 | 2 | 477.859 | 477.859 | 44px |
| 390 | 313 | 2 | 311 | 311 | 44px |

Before the fix the phone viewBox read 313 over a 311px SVG, so a 44-unit circle rendered 43.72px.

The parent then measured the live pins on the signed-in trip. Each pin hit area reads exactly 44px at 390 light and at 1440 light.

## Elevation source

The card samples the measured road against the AWS Terrain Tiles bucket.
It is the same keyless source the Map tab already uses for terrain.
The bucket answered `200 image/png` with `Access-Control-Allow-Origin: *` from this origin.
The credit "Terrain: AWS Terrain Tiles / ETOPO1" sits under the profile.

The signed-in trip measured 233 m at its highest sample.
The fixture measures 406 m on its synthetic ridge.

The fixture check records both plate kinds:

| Case | Plate | SVG | viewBox | Hit circle | Tiles |
| --- | --- | --- | --- | --- | --- |
| 1440, elevation | 479.859 | 477.859 | 477.859 | — | 4 |
| 390, elevation | 313 | 311 | 311 | — | 4 |
| 1440, schematic | 479.859 | 477.859 | 477.859 | 44 | 4 |
| 390, schematic | 313 | 311 | 311 | 44 | 4 |

## Browser acceptance

These states ran in headless Chrome against the dev fixture.

| State | Result |
| --- | --- |
| Weather partial | One notice, one Try again, alert role |
| Weather retry, then failure | One combined notice naming 2 missing days and 2 retained days, one retry |
| Elevation failed | Schematic route, alert role, "Highest point: Unavailable", one Try again |
| Elevation retry | Profile returns, peak 406 m, no alert |
| Weather and elevation both fail | One alert only: elevation owns it, weather becomes status |
| Cover emoji | `.yf-cover-emoji` fills the cover |
| Cover art | RegionArt SVG fills the cover |
| Cover broken URL | Photo span keeps the cover box, base colour and veil stay readable, no alert |
| Train mode | Schematic route, "Travel load" label, "Planned stops" metric |

## Hit targets and keyboard

- Every tab, the back button, the invite button and each matrix cell is 44 CSS px high.
- The compact day list row is 44 CSS px high on a phone.
- The matrix keeps one `tabindex="0"` cell. Arrow Right and Arrow Down move the focus.
- The focused cell shows a 3px inset teal ring.
- The "Fix Day 5" warning button opens the Timeline at Day 5.
- A pin that cannot open the Map names the route list instead of promising an action.

## Detector

`npx impeccable detect` ran on the dev fixture at 1440, light, after the elevation card.
It found one contrast problem and two small labels. I fixed all three.

1. An unselected tab label on the glass pill read 3.8:1. It now uses the full ink colour.
2. The peak callout title was 11px. It is now 12px.
3. The terrain note was 11px. It is now 12px.

The remaining findings are not defects.

- `overused-font` names Plus Jakarta Sans. The approved design world uses it.
- `nested-cards` names the matrix, the "next up" row and the four weather cells.
  The source design nests them on purpose.
- `ai-color-palette` names the emoji cover fallback. Its gradient uses the app's own palette.

The earlier run also measured the cover title in dark mode. The veil keeps it at 14.3:1 on the left and 7.5:1 at the right.
The detector does not sample the veil layer, so it reports the bare colour.

## Gates

- `npm run verify` is green: 6788 passed, 1 skipped, build ok.
- Three CSS values changed after that run. The CSS-reading tests passed again: 137 tests.
- A later full run under heavy machine load timed out once in `tests/lint-ste.test.ts`.
  That test has a 20 s budget and passes alone: 56 tests.
- `npm run check:ui` found 0 problems.
- `npm run check:motion` passed before the elevation card. The card adds no motion.

## Limits

The parent owns the shared browser tab and the final acceptance.
I did not use the parent tab. I opened a separate tab in the same profile.
The four captures we need come from the dev fixture, not from the signed-in trip.
The preview snapshot tool still times out, so the captures use headless Chrome.
The signed-in trip was read through the DOM. It shows the real profile and a 233 m peak.
No fresh signed-in screenshot exists for the elevation card.
Each cover source renders. A cover change through trip settings is not exercised.
The Daylight check is unavailable. A trip stores no time zone and the arrival clock wraps.
The "Planned stops" metric returns for a flown or railed trip.

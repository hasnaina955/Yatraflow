Issue #809, the Android layout half. Measured in the real `TripWorkspace` fixture at 320, 360, 390 and 411px.

## What changed

- **New `src/styles/pages/phone.css`**, imported last in `src/styles.css` and registered as the phone owner in `docs/css-ownership.json`. It owns the <=560px tab type/padding (more of Group input shows before the cut), the <=720px fold control at the header's inline end with a 52px reserve, the <=560px two-line day name, the <=380px thumbnail hide, and the <=900px day-rail scrollbar hide.
- **Stop cards on a phone**: below 561px the arrival time and the stop ring move to a header row above each card, and the travel leg sits between the cards. The card takes the full width with a 38px kind tile and a full-width meta row. One stop measures 321x213 at 390px and 251x248 at 320px, where the old side rail left 216x355. The rules are scoped to `.tl-row`, so Board and the public itinerary keep their own stop-card layout.
- **FAB clearance** on the new `.tl-tab-root` wrapper in `TimelineTab.tsx`: 144px at the end of the list, and only when the floating Add pill renders. Measured gap 16px at 320-411px.
- **`railScrollToReveal`** now clears the rail's edge fades (20px start, 28px end) when it reveals the active tab, so the active label is not half faded. Its tests pin the insets.
- **Page top insets are reverted.** `13-phone-polish-and-guided-create.css` already folds the safe-area inset once on `main` in the native shell, so the three page-level rules added a second band.
- No legacy rules were removed.

## Verification

- `npm run verify` passes: 7369 tests, 0 failed; tsc clean; lint ratchet 134/27 unchanged; `lint:ste` OK; `check:css` OK (41 files, 6290 records); vite build OK. The SHA-bound verifier tests in `release-tooling.test.ts` can flake under full-suite load; they pass on their own.
- At 320/360/390/411px: no heart wrap, no fold/chip overlap, day cards 132/162px, FAB gap 16px.
- Rail at 390px: 551px of tabs in a 309px box; the active tab keeps 30px clear of the end fade.
- Screenshots: `dev/_phone-before-after.png` (rail, day header, list end) and `dev/_stop-before-after.png` (stop card).

## Notes

- No prior-art port. The CSS is authored in this repo.
- `test` was 2 commits behind `main` (the v0.83.0 release cut). It is fast-forwarded to `main` first, and this branch is rebased on that tip.
- The rail still scrolls, because an owner's workspace carries eight tabs.
- The side time rail is unchanged above 560px; the phone takes the stacked header instead.
- Remaining #809 scope (Creator Hub navigation, map gestures, APK update notices) is not in this PR.
- Follow-ups found during review but out of scope: the ribbon's place names truncate to 4-5 glyphs on phones, several secondary controls sit under 44px (`board-fit`, `slots-daychip`, `role-select`, `tset-nav-item`).

## Summary

An `impeccable polish` pass over the two public surfaces — the **Explore gallery** and the **published-itinerary page** — driven by measurement on the running app rather than by reading CSS, plus the app-shell defect the sweep turned up on the way. 16 work commits, 20 files, `+1106 / −141`.

The cards were genuinely broken: four independent layout defects, each confirmed on rendered pixels before being touched.

| # | Sev | Finding | Class | Measured before → after |
|---|---|---|---|---|
| 1 | **P1** | `.card + .card { margin-top: 14px }` — the beat between two stacked cards — also matched **grid items**, so every card after the first in a row sat lower *and* shorter than its row-mate | local defect, app-wide reach | tops 839/853, heights 477/463, 26px gap where the grid declared 12 → **846/846, 463/463, 12** |
| 2 | **P1** | The itinerary page's Travel-tips / Warnings row is a `.two-col` nested in the 782px content column, so it kept a **340px sidebar width it has no sidebar for** | conceptual mismatch | cards 424 / 340 → **382 / 382 at the same top** |
| 3 | **P1** | `.pub-hero` clips its children and the "practical bit" card hung **66px past the hero's edge** — those pixels were never painted and the last two rows hit-tested through to the Save/Fork buttons underneath | local defect | 507→720 against a clip at 654, 2 of 4 rows painted → **fully inside, 16px clear, all 4 rows** |
| 4 | **P1** | `.trip-enter`'s entrance ran `fill-mode: both`, pinning `transform: none` **over** `:hover` — a shelf card answered a pointer with a shadow change and no movement | motion drift | identity → **`matrix(1,0,0,1,0,-2)`** |
| 5 | **P2** | A grid item's automatic minimum is its min-content, so the nowrap share link gave its column a **451px floor inside a 362px column** and the page scrolled **75px sideways** at 390px — the `ellipsis` already declared could never apply | local defect | 75px document scroll → **0** |
| 6 | **P2** | The signed-out nav reached **38px past the pill / 28px past the viewport** at 390px, and `html { overflow-x: clip }` *cut* "Sign up free" mid-label — every route carried it | local defect, shell | 38px over → **0 overflow at 320/360/375/390/414/480** |
| 7 | **P2** | `--s-1…--s-8` were deleted in SYS-2 as unused, leaving **no enforceable rhythm**: 10px ×106 and 9px ×54 were the de-facto beat, with four different gaps in one column (10/14/20/22) and off-ladder card interiors | missing token | four gaps → **12 intra-group, 22 section**; **76 pairs now frozen** by a shrink-only gate |
| 8 | **P2** | Six uppercase micro-labels rendered **two different recipes**; five were one-off declarations beside a documented single recipe | one-off implementation | 5 recipes → **1** (10.5px / 700 / .06em) |
| 9 | **P2** | The card's three cover overlays used **three different insets** (11 / 10 / 12) | missing token | → **one 12px inset** |
| 10 | **P2** | `.paper-sheet` radius **30px** — unique in the stylesheet, off the documented 12/18/24 ladder | missing token | → ladder |
| 11 | **P2** | A grid card's save heart was **34px at every width**, under the 40px floor the rest of that block holds | local defect | → **40px under 720px** |
| 12 | **P2** | `.pub-hero-photo` renders a creator cover at 42 % opacity **with nothing bounding its brightness**, pulling the kicker/title/byline toward ~3:1 over a light cover | local defect | flat scrim over the text zone + a **pin proven against a pure-white photo** (min 5.43:1) |

Three of these were **not on the two pages named in scope** — the grid trap is app-wide (found by sweeping every route reachable signed out; the landing page's feature strip was a fourth instance) and the nav defect is in the shell.

## Labels that stop promising what they cannot do

- **"Fork" navigated straight to sign-up while its label promised an in-place copy**, and the toast explaining it was swallowed by the redirect. Signed out it now reads **"Log in to fork"**, and Explore states the requirement once above the cards.
- **"Unlock Premium" led to a notice that payments are not live.** No rail exists, so the price stays a label and the copy says preview-only.
- **The "not found" view asserted a cause it cannot know.** A removed itinerary and a failed fetch both arrive as `null`; listing *and* connection failure were equally likely and only the first was named. Same fix in the invite and snapshot gates, which also gained a **Try again** (the only remedy that costs nothing when the cause is a dropped connection).
- **The premium line's withheld-days claim is now derived, not assumed.** It promised the *tail* was withheld; on a live ₹500 publication the withheld days were 5–8 while 9–10 stayed readable. `lib/previewSplit.ts` reads `freeDayIndexes` — lock pattern measured `FFFFLLLLFF` — and now says "days 5–8 stay preview-only (6 of 10 days free)". Kerala's copy is unchanged because its data does match the tail.
- **The featured plan no longer reappears as an ordinary card** in the grid below it (a third of a three-itinerary shelf spent repeating itself), and the grid is skipped outright when the featured card was the whole result.
- **A cover the owner set is sized like one the app picks**: one live hero served 1,305 KB (2496×1664) where the same page requested its auto-picked covers at the supported width — now **147 KB, a 9× reduction**, owner-pasted URLs untouched.
- **The public page stopped saying the same thing twice** (tagline in two places, tips in two places, day count/distance/road time three times), and the dead `.pub-highlightsN` class went back to `.pub-highlights`.

## Verification

`npm run verify` green on the merged HEAD — **tsc clean · 1252 tests passed (1 skipped) across 110 files (109 passed, 1 skipped) · production build**, no minify warnings. The skipped item is the pre-existing `scripts/jev-router-audit.test.ts`.

Every layout claim above is a **DOM/geometry assertion from the running app**, plus screenshots in `.impeccable/polish/evidence/` (before/after, 1440 / 1024 / 900 / 390, both themes). I can't view images, so the numbers are measurements — not pixel judgements.

New guards, each teeth-tested by breaking it on purpose and restoring byte-exact:

- `tests/hero-contrast.test.ts` — parses the scrim and the text colours out of the stylesheet, so lightening the scrim fails the build. It caught its own author's parser swallowing the radial gradients' stops.
- `tests/design-system.test.ts` — the spacing ratchet, keyed `property: value` rather than by line, so a CSS edit that only moves lines cannot force a re-baseline the way the contrast and duration gates can. **76 pairs, shrink-only.**
- `tests/public-surface-guardrails.test.ts` — pins the one micro-label recipe, the grid card margins, and the hero-card bounds.
- `tests/preview-split.test.ts` — eight shapes of the withheld-day claim (non-tail, tail, single day, merged ranges, nothing withheld, all withheld, out-of-range, zero-day).

The line-number-keyed design-system baseline needed re-baselining after the CSS insertions, as AGENTS documents. Done, then **proven** by diffing with line numbers stripped that every edited entry differed by its line number alone: the violation counts are unchanged at the shipped baseline — `contrastLight 9, contrastDark 11, duplicateSelectors 32, rawDurations 30, hueCollisions 1`, plus the new `offLadderSpacing 76`. **No new violation was accepted.**

## Two caveats about this work

1. **One P1's original attribution was wrong and is corrected here.** The overlay that reported the hero contrast reads an element's **declared `background`**, not composited pixels — proven by replacing the hero's own background (all findings vanished) and by the scrim changing the numbers *not at all*. So the "2.6:1 over sampled cover pixels" figure did not hold; what is real is that the photo is an unbounded creator upload, which is what the fix and the pin address. AGENTS now carries the correction.
2. **The `min-width: 0` fix also changes the Share tab** — a surface outside the named scope. It is a strict repair (the declared ellipsis now actually applies), but it is scope the request did not name.

## Not in scope — untouched, and worth saying plainly

- **The signed-in workspace** (Timeline / Map / Board / Budget / Group / Share, Trip settings), **Creator hub** and **Admin console** have had **no visual pass** — all of it needs a signed-in trip. The new spacing ratchet freezes their drift going forward, but nothing was reviewed.
- **Verified signed-out only.** The `needsLogin` labels are correct by construction, not browser-checked.
- **Three deliberate exceptions** stay off the ladder: `.pub-hero-title`'s own ramp, `.two-col`'s 18px gap, `.pub-hero-stats`' 15/18px padding.

## Merges

`origin/test` moved twice while this branch was open; both are merged in and `test` is now an **ancestor** of this branch, so the merge is linear with nothing left to resolve.

- `b1b35c5` (+21 commits) — conflicts in `CHANGELOG.md` and `AGENTS.md`
- `4c95df7` — "pin a day's synthesized journey endpoints" — one `CHANGELOG.md` conflict

Both `CHANGELOG.md` conflicts were purely additive (each side only added to `[Unreleased]`), so both sides were kept rather than one chosen. Files that auto-merged were **checked by grep rather than assumed** — that check is what caught `4c95df7`'s new AGENTS rule and this branch's four new rules coexisting correctly.

> **Reviewer note:** a PR into `test` triggers no CI job — `ci.yml`'s `pull_request` trigger lists only `main` (AGENTS §3.1). The green above is a local gate run; the merge into `test` is what will fire it.

# CSS-1 evidence: mechanical extraction

Date: 2026-10-29. Stage CSS-1 of the CSS system migration.

Branch `chore/css-1-extract`, based on checkpoint
`f6a549f1a94098f52de1081f83e2b6902388271c`.

## Stage state

| State | Result |
|---|---|
| Implemented | Yes. The sheet is now an entry with 17 ordered modules. |
| Focused checks passed | Yes. |
| Browser acceptance | Not applicable. The production stylesheet is byte-identical. |
| Full gate passed | Typecheck, ratchet, tests and build pass. `lint:ste` passes on this stage's own diff. See the gate note below. |

## Input

| Fact | Value |
|---|---|
| Checkpoint | `f6a549f1a94098f52de1081f83e2b6902388271c` |
| Sheet | 16,962 lines, 816,192 bytes, CRLF, no `@import`, no `@charset` |
| Source graph | One file, fingerprint `18dc404ee4e4b47d3ad2c4bed958d840c4db70df7f19f33f808029ff8479a93b` |
| Source hash | `338e9ea33b05…` for the working file, git blob `ad144937c4bf…` |
| Stability | Two graph runs gave the same fingerprint. The working file matched the commit. |

## Method

Every module is a verbatim contiguous line range of the input sheet. Each
boundary sits on a column-0 section comment, so no rule splits. The entry keeps
the ordered imports and one comment that names the rule.

| Module | Lines | Bytes |
|---|---|---|
| `01-foundations.css` | 1–826 | 46,414 |
| `02-select-and-print.css` | 827–3002 | 134,279 |
| `03-maplibre.css` | 3003–3255 | 10,806 |
| `04-mobile-usability.css` | 3256–5494 | 129,569 |
| `05-share-and-trip-ticket.css` | 5495–5993 | 32,301 |
| `06-shell-and-consistency.css` | 5994–6483 | 31,050 |
| `07-workspace-and-unlock.css` | 6484–6834 | 21,983 |
| `08-map-review.css` | 6835–8200 | 88,113 |
| `09-trips-list.css` | 8201–8428 | 15,637 |
| `10-explore.css` | 8429–8967 | 36,146 |
| `11-shared-page.css` | 8968–10163 | 57,233 |
| `12-pages.css` | 10164–10679 | 30,210 |
| `13-phone-polish-and-guided-create.css` | 10680–12233 | 66,970 |
| `14-art-and-workspace-header.css` | 12234–12594 | 11,327 |
| `15-overview.css` | 12595–14622 | 43,984 |
| `16-motion-and-cover-v2.css` | 14623–16321 | 40,577 |
| `17-overview-tiles-and-cover.css` | 16322–16962 | 19,593 |

The modules hold 16,962 lines in total, which is the input count. The output
graph has 18 files and fingerprint
`9d379791fec50fac04371032919b2528d8aebb3d69b71e8033ec0638934f1f3a`.

## Equivalence

| Check | Result |
|---|---|
| Rules and declarations | 5,388 records before and after. Same order, selector, conditional context and declarations. |
| Assets | 10 before and after. Same url, resolution and existence for each. |
| Normalized source text | Equal at 775,577 characters. |
| Built CSS | Byte-identical. `index-DOMFeFQt.css` is `7778787239…` and `TripMap-CKRTiAqP.css` is `a44e9c8519…` in both runs. |

The compiled comparison is the strongest statement available here. Vite's
production output did not change by one byte. A screenshot comparison cannot
add information to a byte-identical stylesheet.

Two intended differences exist. The entry adds a 3-line comment. Each of the
16 seams adds one newline, so the flattened source carries 16 blank lines that
the single file did not carry. Neither can change the cascade.

## Commands and results

All commands ran from the repository root. The extraction ran once, from the
frozen input.

| Command | Exit | Result |
|---|---|---|
| `node scripts/css-source-graph.mjs --text … --records …` | 0 | Captured the input graph, ordered CSS and asset targets |
| `npx vite build` | 0 | Captured the input built CSS, then the output built CSS |
| `npx vitest run --maxWorkers=2` | 0 | 450 files passed, 1 skipped; 450 before the split too |
| `npm run check:ui` | 0 | 3 rules, 0 findings |
| `node scripts/lint-ste.mjs --base f6a549f1` | 0 | 522 prose lines changed by this stage, no problem |
| `npm run lint:ste` | 1 | 41 problems in 14 checkpoint files; none in a file this stage changed |
| `npx vitest run tests/lint-ste.test.ts` | 0 | Includes the new exemption test |
| probe: bad rule appended to module 03, then reverted | 1 | Reports `src/styles/legacy/03-maplibre.css:255` for U1 and U2, and the module hash returns to its committed value |

`lint:ste` was red before this stage on the same checkpoint. It scans the whole
merge-base diff, and the checkpoint carries prose that breaks the rules. The
list includes a vendored `react-dom.js` under `docs/redesign/`. This stage adds
no new problem and touches none of those files.

### Gate note: a move is not new prose

The split reported 22 comment lines to `lint:ste`. Each one was written and
accepted before this stage; the move put it on a new line. Rewording them would
break the verbatim slices that make the extraction auditable, so the fix is in
the gate. `src/styles/legacy/` is now exempt from the diff runs, with its reason
beside the entry. No new prose goes in those files: CSS-2 and CSS-3 write owned
modules, and the legacy split is deleted when the migration ends. `--file` still
checks a named module. `tests/lint-ste.test.ts` pins both halves, plus a sibling
path that must still fail.

With the exemption in place, `node scripts/lint-ste.mjs --base f6a549f1` passes.
The default run still exits 1 on the checkpoint's own prose.

## Live probe on the split sheet

`check:ui` reads the flattened cascade, so a finding's line is a line of the
entry. A probe appended `transition: all` and `z-index: 1000` to module 03.
Both rules fired. Each one named `src/styles/legacy/03-maplibre.css:255`, and
the JSON carried the flat line as `src/styles.css:3258` beside it. The probe
reverted the file and the module hash matched its committed value again.
`withSources` now holds that mapping, and `tests/css-source-graph.test.ts`
checks the module path on a fixture.

## Known limits

- The 17 modules are temporary. Each one is a cascade range, not an owner.
  CSS-2 and CSS-3 move ownership out of them.
- `DESIGN_TOKENS.md` still cites line numbers from the single-file era. Those
  citations were already drifting. CSS-3 owns that reconciliation.
- The entry comment is new source text that the single file did not have.

## Rollback

Restore `src/styles.css` from the checkpoint and delete `src/styles/legacy/`.
No test, source component or asset changes in this stage, so that one step
returns the exact checkpoint stylesheet.

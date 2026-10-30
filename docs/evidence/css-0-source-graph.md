# CSS-0 evidence: one CSS source graph

Date: 2026-10-29. Stage CSS-0 of the CSS system migration.

## Stage state

| State | Result |
|---|---|
| Implemented | Yes. `scripts/css-source-graph.mjs`, 47 test files, `scripts/uiAntipatterns.mjs`. |
| Focused checks passed | Yes. |
| Browser acceptance | Not applicable. CSS-0 does not change runtime CSS. |
| Full gate passed | Yes, as a recorded manual sequence with 2 test workers. The unmodified gate is red on this machine (see below). |

## Why this stage exists

`src/styles.css` is one file of 12,275 lines. It holds tokens, themes, shared
controls, layout, pages, motion and repair overrides. Check design documents
state intent. They do not decide runtime precedence.

Many checks read that file as text. A check that still reads one file stops
seeing a rule moved into a module. It then stays green while the rule is
unguarded. CSS-0 makes every check read one resolved source graph instead.

## The reader

`scripts/css-source-graph.mjs` resolves the graph with PostCSS 8.5.32 (MIT).
PostCSS was already installed through Vite. It is now a direct dev dependency.

It exposes three views:

- `text`: the flattened cascade, with LF line endings. This is the
  compatibility view that the existing checks read.
- `rawText`: the same cascade with the original line endings. It equals
  `src/styles.css` byte for byte while the sheet is one file.
- `records` and `origins`: each rule with its file, line, selector,
  declarations and conditional context. `sourceAt(line)` maps a flattened line
  back to its source line.

`fingerprint` is a SHA-256 over the path and content hash of every file in the
graph. A moved rule cannot hide from it.

## Reader inventory

| Class | Files | Behaviour after CSS-0 |
|---|---|---|
| Live text checks | 47 files in `tests/`, plus `scripts/uiAntipatterns.mjs` | Read the flattened graph. `check:ui` reports the source `file:line` for each finding. |
| Historical snapshot reader | `tests/health-band.test.ts` (`git show v0.70.0:src/styles.css`) | Unchanged. That tag holds one file with no imports, so its blob is its whole graph. |
| Synthetic parser fixtures | `tests/ui-antipatterns.test.ts`, `tests/fixtures/css-graph/` | Load fixture text only. They never read the application sheet. |
| Browser consumers | `src/main.tsx` imports `./styles.css` | Unchanged. Vite resolves the same entry. |

A count of remaining raw reads of `src/styles.css` under `tests/` and
`scripts/` returns one line. It is the identity assertion in
`tests/css-source-graph.test.ts` that compares the graph text with the file
bytes.

## What the reader refuses

| Code | Cause |
|---|---|
| `MISSING_IMPORT` | The target file is absent. The message names the path. |
| `IMPORT_CYCLE` | The import chain returns to a file. The message prints the cycle. |
| `REMOTE_IMPORT` | The target is a URL. A source check never fetches it. |
| `UNSUPPORTED_IMPORT` | The form cannot resolve, or the import follows another rule. |
| `UNSUPPORTED_FORM` | An unsupported construct, such as `@charset` in an imported file. |
| `PARSE_ERROR` | PostCSS cannot parse a file. |

No form drops content silently.

## Fingerprint

| Run | Fingerprint |
|---|---|
| Before CSS-0 | `c43f1eb81e008d1f52a4d1e3fb474b3f71cdad275731fcb28b845eebaa7a1dda` |
| After CSS-0 | `c43f1eb81e008d1f52a4d1e3fb474b3f71cdad275731fcb28b845eebaa7a1dda` |

The sheet did not change. CSS-0 owns checks and tooling, not application CSS.

## Commands and results

All commands ran from the repository root.

| Command | Exit | Result |
|---|---|---|
| `node scripts/css-source-graph.mjs` | 0 | 1 file, 4,700 records, 10 assets, fingerprint above |
| `npx vitest run tests/css-source-graph.test.ts` | 0 | 20 passed |
| `npx vitest run tests/doc-drift.test.ts tests/roadmap-status.test.ts` | 0 | 15 passed |
| `npx vitest run tests/design-system.test.ts` | 0 | 83 passed |
| `npx vitest run tests/script-exit-pins.test.ts` | 0 | 3 passed |
| `npm run check:ui` | 0 | 3 rules, 0 findings |
| `npm run lint:ste` | 0 | OK |
| `npm run verify` (unmodified) | 1 | 439 files passed, 1 failed. Both failures are 5,000 ms timeouts in `tests/release-tooling.test.ts`. |
| Manual sequence, `npx vitest run --maxWorkers=2` | 0 | 440 files passed, 1 skipped; 6,716 tests passed, 1 skipped |
| Manual sequence, `npx tsc -b`, `lint:ratchet`, `lint:ste`, `npx vite build` | 0 | Typecheck clean, ratchet unchanged, build in 8.78 s |

The `release-tooling.test.ts` timeouts are not caused by this change. The
baseline run before any edit failed the same file under the same load. The
file passes in isolation in 8.3 s. The manual sequence lowers test contention
only, and it raises no timeout.

## Baselines

No baseline file changed. `tests/design-system-baseline.json` and
`tests/page-consistency-baseline.json` are untouched. The design-system keys
were already keyed by declaration, so a moved rule keeps its identity. The
relocation fixture proves this directly.

## Known limits

- The reader costs about 100 ms per load on the current sheet. Checks pay it
  once per file.
- CSS-1 landed after this stage on the committed checkpoint. See
  [css-1-extraction.md](css-1-extraction.md). CSS-2 and CSS-3 are not started.
- Empty imported files contribute no whitespace to the flattened text.

## Rollback

Revert the reader integration and delete `scripts/css-source-graph.mjs` and
`tests/css-source-graph.test.ts`. Application CSS never changed, so no
appearance can move. The 47 test files return to their own `readFileSync`.

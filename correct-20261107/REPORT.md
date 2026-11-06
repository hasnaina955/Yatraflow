# $correct — two repeated mistake classes, one local commit each

Date: 2026-11-07. Lane: GLM (implementation sub-agent for the `$correct` task).
Worktree `E:/worktrees/Yatraflow-T3/t3-665b7ec0`, branch `t3/safe-map-v2-recomposition`.

## Commits

| Commit | Class | Files (explicit-path stage, no `add -A`) |
| --- | --- | --- |
| `480f2716` fix(map): enforce one shared 44px target floor for Map V2 controls | A | `src/styles.css`, `scripts/uiAntipatterns.mjs`, `tests/ui-antipatterns.test.ts`, `tests/map-deck-targets.test.ts` |
| `a360a43a` feat(scripts): derive focused test lists from git with test:changed | B | `scripts/test-changed.mjs`, `tests/test-changed-selector.test.ts`, `package.json`, `AGENTS.md`, `CODING_STANDARDS.md`, `docs/agents/AGENTS-FULL.md`, `docs/AGENTS-VERIFICATION.md`, `CHANGELOG.md` |

Neither commit claims the whole batch is verified. Both are LOCAL; nothing pushed.

## Class A — undersized Map touch targets

**Evidence (class count: 2 historical + 1 live):**

- Historical, desktop: the deck-header fold button measured 32×32 (`styles.css:160`
  in the parent-HEAD batch; `terra-visual-pass/REPORT.md` records the 44px repair).
- Historical, phone: shelf add/dismiss/shortlist buttons measured 25–26px
  (`shelf-target-repair/REPORT.md`; `terra-visual-confirmation/REPORT.md` re-probed).
- Live: HY4's Crouton EOF append declared `.mv2-workspace .lrow-deck .ledger-shelf`
  twice, which failed `tests/design-system.test.ts` (duplicate top-level selector)
  and was recorded in `ticket06-ribbon-completion/REPORT.md`.

**Fix (smallest complete change, per Ponytail):**

- `styles.css` now carries one floor contract instead of per-incident overrides.
  The base `.mv2-icon-btn` rule owns the fold-button size; two deck-scoped shelf
  rules own the shelf sizes; the duplicate shelf declaration is merged (peer margin
  + Crouton wrap kept in one rule), which is what makes design-system green.
- `scripts/uiAntipatterns.mjs` gains rule **U4**: on the flattened CSS cascade
  (existing `css-source-graph.mjs` PostCSS walk), a px `width/height/min-width/
  min-height` below 44 on `.mv2-icon-btn` — or on `.poi-fold`/`.ledger-shelf`
  **inside `.mv2-workspace`** — fails `check:ui`. The scope guard exists because
  the review pass confirmed both classes also style legacy surfaces (legacy/06
  24px `.poi-fold`, legacy/07 unscoped `.ledger-shelf`); a bare-class rule would
  false-positive on shipped code. Diagnostics name the selector and line.
- 32px stop marks, tiles and discs keep their sizes: they are markers, not
  controls. No baseline updated; no global 40px policy touched.

**Proof (actual known-bad, before and after):**

- RED: the committed 32px rule was re-added at its exact line; `check:ui` exited 1
  naming `src/styles.css:160` and the line text; then the file was restored to
  the byte-identical consolidated state (0 findings again).
- RED (unit): the same 32px line, a 26px shelf chip and a 24px scoped poi-fold
  each fire in `tests/ui-antipatterns.test.ts`; the legacy-unscoped,
  non-Map-40px, 44px and `min-width: 0` shapes stay silent.
- GREEN: `check:ui` 4 rules / 0 findings; `tests/map-deck-targets.test.ts`
  rewritten to the shared-floor contract (base rule, both shelf rules, single
  declaration, deck scoping, real-cascade zero-findings) — no exact-old-44 pins.

## Class B — handwritten focused lists missed changed tests

**Evidence (class count: 2):**

- `tests/production-road-binding.test.ts` was omitted from the frozen 41/44
  focused reports after a builder move; the full gate went red.
- An earlier focused run (static STE prose, 720 lines) missed changed prose the
  full run (1881 lines) caught.

**Fix (smallest complete change):**

- `scripts/test-changed.mjs` + `npm run test:changed`. Selection = union of
  test files from branch-vs-base diff, staged, unstaged, untracked
  (`git ... -z`, `core.quotePath=false`, argument-array spawns, no shell) plus
  explicit `--extra` paths. Base: explicit `--base` (validated commit, must
  share a merge base with HEAD) or the merge base with `origin/test`.
- It runs vitest via `process.execPath` + `node_modules/vitest/vitest.mjs`
  (`npx` needs a shell on Windows, which the script refuses on principle),
  with `--maxWorkers=1`, and passes the child's exact exit code through
  (`process.exitCode` only — `script-exit-pins` allows no `process.exit`).
- **No empty green:** zero selected tests with source changes exits 1 with a
  named diagnostic; nothing changed at all also exits 1.

**Proof:**

- The real historical omission: `--base a367572d~1 --print` selects
  `tests/production-road-binding.test.ts` from git alone (pinned in
  `tests/test-changed-selector.test.ts`).
- Isolated scratch git repo: source-only change → exit 1 with the
  empty-green diagnostic; Unicode-named untracked test → selected and printed.
  Scratch removed after the proof.
- The live run selected 7 files (the 4 class-A/UI files plus the peer
  ribbon/sheet/timeline suites) and went 113/113 green; an earlier RED batch
  caught a deliberately re-added 32px probe before restore.

## Why these levels and not higher

- **Types can't prove CSS computed size.** `tsc` sees no CSS; a stylesheet can
  compile and still ship a 32px button. Only a CSS-cascade reader (U4) or a
  browser probe can see it; a browser probe is out of scope here (no browser
  acceptance claimed), so the graph-backed checker is the highest level that
  actually runs in `verify`/CI.
- **Types/lint can't see a missed test file.** Nothing in `tsc` or eslint knows
  a test exists but was not run. Only a git-derived selector closes that class;
  CI's full suite is the backstop, not a focused-run guarantee.
- **No framework was built.** U4 reuses the installed PostCSS/CSS-graph helper
  and the existing RULES table; the selector is one script over git plumbing.
  No custom CSS interpreter, no import graph, no new options beyond
  `--base`/`--extra`/`--print`.

## Reachability

`npm run check:ui` (which loads `uiAntipatterns.mjs`) runs in the existing
verify pipeline and CI; `npm run test:changed` is a package script beside
`test`. Neither duplicates the full suite: verify/CI keep running everything,
and the focused selector is additive. CI reads the same scripts from the repo,
so no workflow change was needed or made.

## Limits — what cannot be automatically enforced

- **Agent invocation choice:** nothing in the repo can force an agent to type
  `npm run test:changed` instead of hand-writing a list. The enforcement chain
  is: AGENTS.md rule §2.21 mandates it, `tests/test-changed-selector.test.ts`
  keeps the script honest, and the full gate catches a bad focused run after
  the fact. If an agent skips both the rule and the script, only review sees it.
- **`--base` choice:** a batch whose base is not the integration branch must
  pass `--base`; a wrong base under-selects. The script validates the ref
  exists, but cannot know the operator's intended batch boundary. AGENTS §2.21
  and the verification doc say when to pass it.
- **`--extra` correctness:** an explicit extra is trusted by path; the script
  cannot know a semantically necessary test the diff does not name.
- **U4 is a text-level cascade check,** not a browser: it reads computed
  declarations, not final layout (transforms, zoom, container clipping). It
  also cannot know that a NEW class is a Map control — the floor list is the
  contract, and extending it is a human/agent act. Browser-level target
  verification stays with HY4's browser pass on the frozen combo.
- **No UI acceptance is claimed.** No browser, no screenshots, no touch
  measurement. The visual proof that 44px renders correctly is HY4's browser
  run after the freeze.

## Exceptions

None. No human-approved deviations from the task constraints were needed.

## Ownership honoured

Only owned paths touched: `styles.css` (shared floor consolidation only),
checkers, tests, `package.json`, AGENTS/verification/coding-standards docs,
CHANGELOG. HY4's MapWorkspaceChrome/ribbon/MapTab/phone files untouched; peer
uncommitted UI work preserved; explicit-path staging only; no push, no PR, no
main, no SQL, no provider/backend/deploy/browser/server/installs; verify lock
acquired once with own nonce (purpose recorded) and released after the run.

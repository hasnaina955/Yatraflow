# Design-system guardrails

**Why this file exists.** The v0.53.0 design-system audit (#107) found 117 defects by *measuring the
shipped CSS by hand* — contrast ratios computed from resolved tokens, hue distances between categorical
colours, duplicate selectors, raw durations — and then that measurement was thrown away. Nothing enforced
it, so every one of those classes could silently return.

An audit is a **measurement**. A measurement that isn't a gate will always be needed again. These
guardrails are the audit's method, kept.

## The gates

They live in `tests/design-system.test.ts` and run as part of `npm test`, which is already inside
`npm run verify`. **No new dependency, no new config, no CI change** — that is deliberate. A gate that
needs new tooling is a gate that gets skipped.

| Gate | Audit class | What it enforces |
|---|---|---|
| Contrast contract | SYS-3 / SYS-6 | Every rule declaring both a text colour and an **opaque** background, resolved **per theme**, clears WCAG AA (4.5:1) |
| Duplicate selectors | SYS-5 | No top-level selector is declared twice — the earlier rule would be silently dead |
| Motion vocabulary | SYS-6 | No raw `ms`/`s` in `transition`/`animation` (AGENTS §2.10) |
| Focus indicator | map-tab review, 2026-09-22 | Exactly **one** focus token is declared, and it clears 3:1 against `--bg` and `--card` **per theme** (WCAG 1.4.11). The contrast gate structurally cannot see this — see below |
| Type floor | map-tab review, 2026-09-22 | No **new** `font-size` below 11px (ratcheted). The floor is a floor, not a target: 12px+ for anything carrying a number |

### How the contrast check resolves values

This is the part that took the care, and the part most likely to produce a *wrong* number if changed
carelessly:

- **Per theme.** `var()` chains are followed through the `:root` and `[data-theme='dark']` token tables
  separately, so a dark-theme failure cannot hide behind a light-theme pass. (The dark theme *lightens*
  `--teal-500/600` and `--danger-500`, which is why several audit findings failed in dark only.)
- **Composited.** A translucent foreground is flattened over its background before measuring.
- **Override-aware.** A base rule re-styled by `[data-theme='dark'] …` is not re-measured in dark; one
  re-styled by `:root:not([data-theme='dark']) …` is not re-measured in light. Without this the check
  reports failures that the cascade already fixes.
- **Opaque backgrounds only.** A translucent or gradient backdrop sits on a surface this file cannot see
  (a hero band, the page atmosphere), so its real contrast is unknowable from source alone. Those are
  skipped rather than guessed.

## The ratchet

The known set is frozen in `tests/design-system-baseline.json`. **Shrinking is free; growing is a
decision.** Two assertions enforce both directions:

- a **new** offender fails the build — the regression case, which is the whole point;
- an entry that **no longer reproduces** also fails, so the baseline cannot quietly rot into a permission
  list. Fixing something means deleting its line, and the failure message names the lines to delete.

| Key | Frozen at |
|---|---|
| `contrastLight` | 7 |
| `contrastDark` | 0 |
| `duplicateSelectors` | 27 |
| `rawDurations` | 29 |
| `offLadderSpacing` | 75 |
| `hueCollisions` | 1 |
| `subPixelType` | 65 |

### Evolving the system

These gates exist to make **regressions** impossible, not to make the design system permanent. When the
right value changes, the system is expected to move with it: the ratchet measures drift, and a deliberate
change is not drift. Three tiers, because they need different amounts of ceremony:

1. **The current value is wrong** — an undefined token, a sub-3:1 focus indicator, a 9px label carrying
   the number the screen is for. Evolve the token in place. Changelog line, no debate. `--ring` is the
   worked example: this test pinned it to a 35% tint measuring 1.50:1 against `--bg`, so the pin held the
   defect in place. The pin now asserts the outcome (3:1, per theme) and the token is solid.
2. **A taste upgrade that passes every existing gate.** Evolve it, changelog it, and record the intent in
   `DESIGN_TOKENS.md`, so the next audit does not re-litigate a decision already made.
3. **A taste upgrade that needs a threshold, a pinned assertion, or the baseline changed.** Same commit —
   but the diff must show the assertion/baseline change *and* the reason, plus a rendered before/after
   (`{light, dark} × {390, 1280}`). The suite stayed green through the `.reveal` collision and through
   four references to a token that did not exist, so **the gates are not the evidence for a change the
   gates cannot see.**

**Edit in place; never append around a token.** Two focus tokens that win on equal specificity is how a
control goes invisible to a keyboard — that is exactly what `--focus-ring` was: referenced by four rules,
defined by none, its amber fallback the only focus signal on three controls that had already removed
their outline. Note also that the append-to-the-end habit in `src/styles.css` (and the comments that
justify it) predates the current ratchet: entries used to be keyed by `styles.css:<line>`, and they no
longer are, so a pure insertion above the baseline is safe and a shadowing override buys nothing.

### Re-baselining

Only when you intend to accept a new state (a new gate's first seed, or tier 3 above):

```bash
UPDATE_DESIGN_SYSTEM_BASELINE=1 npx vitest run tests/design-system.test.ts
```

That rewrites every key, so **review the diff** — an accidental re-baseline can silently swallow a
regression you meant to fix.

## What the gates cannot see

Recorded so nobody mistakes green for complete:

- **Gradients and translucent surfaces.** The audit's hardest findings — `.route-snap`'s forced-dark
  gradient, the `.notif-badge` fill — only became visible when the surface was *composed*. Static source
  analysis structurally cannot do this. It is what the planned Playwright matrix is for.
- **The duplicate-selector scan is top-level only.** Rules inside `@media`/`@container` are out of
  scope for it; a few newer gates do read named media blocks (the 720px mobile recipes, `@container`),
  so "inside a media query" is not a blanket blind spot — but a duplicate introduced only there would
  still pass.
- **The baseline is not yet triaged.** What remains is **7 light-theme contrast entries and 0 dark**
  (the dark side was cleared in the #107 pass; the light rows are a mix of documented owner decisions —
  the amber/ok soft-fill family — and external-backdrop cases), plus 27 duplicate selectors, 29 raw
  durations, 1 hue collision, 75 off-ladder spacings and 65 declarations below the 11px type floor. Until
  each is classified, the baseline is a freeze, not an endorsement.
- **A token's own value, and a `box-shadow`.** These were the two blind spots that let a 35% focus tint
  measuring 1.50:1 pass a suite reporting "no known dark-theme violation left": the contrast gate reads
  only the rules that declare a `color` *and* an opaque `background`, and `--ring` is neither — it is a
  shadow, and a token is not a rule at all. The focus-indicator gate closes both, which is why it parses
  the shadow itself instead of looking for a pair.
- **The type floor counts declarations, not computed values.** A descendant override that lifts a size
  from 9.5px to 11px leaves the original declaration frozen below the floor, because the key is the
  declaration's own text. Deliberate — the declaration is the thing to fix, not to shadow — but it means
  the `subPixelType` list shrinks only when the declaration itself moves.

## Roadmap

1. ~~**hue-distance gate** — categorical palettes (day colours, stop kinds, expense categories, POI lanes)
   must stay ≥15° apart in hue; the audit found three collisions in one 8-member palette.~~ **Shipped**
   (`hueCollisions` is a ratcheted key; one baselined collision remains, `DAY_COLORS #F59E2D vs #B7791F`).
2. **Playwright matrix** — `{light, dark} × {390, 1280} × route`, with overlays **forced open** before
   snapshotting. This is the half of the audit static analysis cannot replace. Not started (no
   Playwright dependency in the repo).
3. **Primitive consolidation** — one `Select` (extend to the last native ones — 7 native `<select>`s
   remain in the three workspace tabs), variant-bound
   `Button`/`Chip` so a wrong foreground cannot be hand-typed, `Field` injecting `id` structurally,
   `@layer` to make a silently-dead duplicate impossible.
4. **Process** — a UI definition-of-done in AGENTS §2, a PR-template checklist, a pre-commit hook running
   stylelint + the design-system test on staged files, and generating `DESIGN_TOKENS.md` from the tokens so
   the docs cannot drift.

## Found while building the gates

- **`npm run lint` fails with 95 pre-existing errors.** This is the real reason `eslint.config.js` says it
  "deliberately does NOT gate the build" — wiring lint into `verify` is blocked until those clear.
- **Two duration token families coexist**: `--t-fast/med/slow` (180/300/440 ms) and
  `--motion-fast/med/slow` (120/180/240 ms). Unifying them is a design decision, not a mechanical fix.

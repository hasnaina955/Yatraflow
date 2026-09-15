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

The known set is frozen in `tests/design-system-baseline.json` and **may only shrink**:

| Key | Frozen at |
|---|---|
| `contrastLight` | 9 |
| `contrastDark` | 11 |
| `duplicateSelectors` | 32 |
| `rawDurations` | 30 |

Two assertions enforce that:

- a **new** offender fails the build — the regression case, which is the whole point;
- an entry that **no longer reproduces** also fails, so the baseline cannot quietly rot into a permission
  list. Fixing something means deleting its line.

### Re-baselining

Only when you intend to accept a new violation:

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
- **Rules inside `@media`** are not parsed yet.
- **The baseline is not yet triaged.** The 20 contrast entries are a mix of documented owner decisions (the
  amber/ok soft-fill family) and external-backdrop cases. Until each is classified, the baseline is a
  freeze, not an endorsement.

## Roadmap

1. **hue-distance gate** — categorical palettes (day colours, stop kinds, expense categories, POI lanes)
   must stay ≥15° apart in hue; the audit found three collisions in one 8-member palette.
2. **Playwright matrix** — `{light, dark} × {390, 1280} × route`, with overlays **forced open** before
   snapshotting. This is the half of the audit static analysis cannot replace.
3. **Primitive consolidation** — one `Select` (extend to the last native ones), variant-bound
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

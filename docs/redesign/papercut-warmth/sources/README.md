# Papercut layer: the doc set (28 Oct 2026)

Drop-in replacements and additions for the design docs, matching the redesign canvas
(Timeline Redesign → Tokens board). Nothing here is wired into the app yet; `src/styles.css`
is unchanged.

| File here | Goes to | What it is |
|---|---|---|
| `DESIGN.md` | `DESIGN.md` (root) | Full rewrite: front-matter tokens, cool paper colours, Sora + Plus Jakarta type ruling, spacing with 10/18, radius, elevation, icons, illustration, components, night-sky dark theme, do's and don'ts |
| `MOTION-TOKENS.md` | `docs/MOTION-TOKENS.md` | Full rewrite: 90/160/240/360/560, `--ease-paper` / `-glide` / `-resize` / `-exit` / `-settle`, the 48px settle exception, new patterns (cover settle, chart entrance, small pop, drawer, toast), migration table |
| `DESIGN_TOKENS.md` | `DESIGN_TOKENS.md` (root) | origin/main plus the "Papercut warmth layer" section before "Primitive palette" |
| `papercut-section.md` | — | That section on its own, for review |
| `papercut-tokens.css` | paste into `src/styles.css` `:root` and `[data-theme='dark']` when adopting | Every new token with light and night values |

## The code changes that must ride with the docs

1. `src/styles.css`: add the `--pw-*`, `--radius-*`, `--elev-*`, `--glow-*`, `--space-4a/7a`,
   `--space-11…17` tokens; swap the motion values and add the new curves (see the migration
   table in `MOTION-TOKENS.md`); alias `--ease-out`, `--ease-soft`, `--t-*`; move
   `--shadow-navy-rgb` to `20, 56, 66`; drop the grain background from UI grounds.
2. `tests/design-system.test.ts` line ~957: `LADDER` becomes
   `[2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 28, 32, 40, 48, 56, 64, 80]`, and the pinned
   comment at `src/styles.css` ~180 moves with it.
3. `tests/page-consistency.test.ts`: remove the R14 serif/hand-face exceptions once Explore and
   My trips stop using `--font-serif` and `--font-hand`.
4. `docs/DESIGN-SYSTEM-GUARDRAILS.md`: re-baseline `contrastLight` / `contrastDark` after the
   colour swap (the inks keep their lightness, so pairs should hold, but the gate decides).

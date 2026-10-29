# CSS-3 batch evidence

Each batch is one bounded migration with its own commit.
The rollback for every batch stays local to the moved modules and their imports.

## B0: ownership enforcement

Commit `2bfe51c5`.

The check is `scripts/css-ownership.mjs`.
The map is `docs/css-ownership.json`.
The tests are `tests/css-ownership.test.ts`.

The check reads `scripts/css-source-graph.mjs`, so a rule cannot pass one check and fail the other.
It fails on six things:

1. An owned class declared outside its owner module.
2. Component appearance set on a page configuration class.
3. An unregistered stylesheet.
4. A new file that defines tokens.
5. A rising `!important` count.
6. A relative `url()` that no longer resolves.

Every finding names the real file and line.

The check runs in `npm run verify` after the STE gate and before the tests.
It also runs alone as `npm run check:css`.

Twenty-one fixture tests prove it can fail.
They cover an imported cross-owner patch and a descendant repair into a control internal. They cover an !important rise, a dropped reduced-motion block and a broken asset target. They also cover the existing missing-import, cycle and remote-import refusals.
They also prove it accepts a responsive variation, a theme variation, and a page that sets a supported variable.

The token rule counts root selectors only.
A custom property on a component class is a configuration variable.
Pages may set those, so the rule does not see them.

Rollback: delete the check, the map, the test file, the `check:css` script and the `verify` step.

## B1: token definitions have one owner

The input is commit `2bfe51c5`.
The input graph fingerprint is `6ccb7bcd42b3fd650e24209e3db46ed2908269c564562e1eb0182f8491cd3226`.

Thirteen root token blocks sat in seven legacy files.
They held 432 custom property declarations.

**This first try was wrong, and the first version of this document recorded it as correct.**
The block count below is the corrected set: fourteen blocks, 520 declarations.
The `[data-theme='dark']` block in `legacy/01-foundations.css` holds the whole dark ramp, with 88 declarations.
The first predicate matched only :root and html. That ramp stayed behind. Every :root block moved to the top of the cascade.
In the old order the ramp lost to later `:root` blocks.
After the move it won, and 44 computed values changed in each dark state.

A theme block is a token definition. The predicate now matches :root, html and [data-theme=…]. The ramp moves with the rest. It keeps its original position, second.

| Source | Selector | Declarations |
|---|---|---|
| `legacy/01-foundations.css` | `:root` | 141 |
| `legacy/01-foundations.css` | `[data-theme='dark']` | 88 |
| `legacy/04-mobile-usability.css` | `:root` in `@media (max-width: 720px)` | 2 |
| `legacy/06-shell-and-consistency.css` | four `:root` blocks | 16 |
| `legacy/11-shared-page.css` | `:root` | 10 |
| `legacy/13-phone-polish-and-guided-create.css` | `:root`, `:root[data-theme='dark']` | 44 |
| `legacy/15-overview.css` | `:root`, `:root:where([data-theme='dark'])`, `:root, [data-theme='dark']` | 213 |
| `legacy/16-motion-and-cover-v2.css` | `:root:root` in `@media (prefers-reduced-motion: reduce)` | 6 |

All thirteen blocks moved into `src/styles/tokens.css`.
The entry imports it first.
The blocks keep their original relative order.
They also keep their media context, their specificity, and the comment that described each block.

### Why the order is the whole proof

These blocks all target `:root`, so they compete only with each other.
The cascade between them is their relative order.
Consolidating them in the same order cannot change which value wins.

`legacy/16` uses `:root:root`, at specificity 0,2,0.
It outranks the plain `:root` blocks at 0,1,0 whatever the order.
It stays last in the module, as it was last in the graph.

### Declaration identity

A signature covers every token declaration in cascade order: selector, conditional context, property, value and importance.
It ignores file paths and line numbers, so a move cannot hide behind a new path.

| Point | Signature | Blocks | Declarations |
|---|---|---|---|
| Before | `b8bbe93e83bc3b7e3d37863ee864e135c3a246257cb5bdf1edb2c6c5f973f67b` | 14 | 520 |
| After | `b8bbe93e83bc3b7e3d37863ee864e135c3a246257cb5bdf1edb2c6c5f973f67b` | 14 | 520 |

The two signatures are equal.

### Computed values, not just declarations

A declaration signature cannot prove precedence against rules outside the blocks it covers.
The first try passed the signature and still changed dark mode, because the dark ramp sat outside it.

So both builds were loaded in Chrome and every computed custom property was read from the root element.
`getComputedStyle` resolves the `var()` chain, so the semantic aliases are covered too.

| State | Tokens compared | Differences |
|---|---|---|
| light | 281 | 0 |
| dark | 281 | 0 |
| light, 390px | 281 | 0 |
| dark, 390px | 281 | 0 |
| light, reduced motion | 281 | 0 |
| dark, reduced motion | 281 | 0 |

The same comparison run against the first try reported 44 differences in each dark state.
That is how the defect was found.

Both `data-theme` states are compared because the app sets that attribute on the root element.
The reduced-motion states cover the `:root:root` block in the motion module.

### Completeness

The ownership map now leaves the token baseline empty.
The check fails if any legacy file still defines a root token.
It passes, so no block was left behind.

After the move, one file defines root tokens: `src/styles/tokens.css`, with all 432 declarations.

### Results

| Check | Result |
|---|---|
| `npm run check:css` | Exit 0. 21 files, 5,395 records, 3 owner modules. |
| `npx vitest run tests/css-ownership.test.ts tests/css-source-graph.test.ts tests/design-system.test.ts tests/segmented-tabs-filterbar.test.ts --maxWorkers=2` | 143 passed. |
| `npm run check:ui` | Exit 0. No findings. |
| `npm run build` | Exit 0. |
| Output graph fingerprint | `bbe63ec072ef1c7167e2b3edefb2dc2ce2aff3cf1c8f15f614101574c67c9de5` |

The record count rises by one, from 5,394 to 5,395.
The extra record is the block comment that moved with the first token block.

### Measurement limits

A text comparison of the built CSS against the source values does not work.
Lightning CSS lowercases hex colours, rewrites `rgba()` as hex, and rewrites `180ms` as `.18s`.
Those are minifier canonicalisations, not cascade changes.
The source signature is the instrument for declaration identity.
The build run proves only that the module compiles and resolves.

No browser check has run for B1.
Both themes and the reduced-motion path are proven at the declaration level only.

Rollback: move the fourteen blocks back to their source files. Restore the entry import. Restore the token baseline in the ownership map.

## B2 inventory: .btn is three things, not one

Fifty-seven rules name `.btn`. They split three ways.

**The shared recipe.** `legacy/01-foundations.css:334-346` holds the base appearance and its states. It declares display, gap, radius, border, type, padding and transition, then `:active`, `:disabled`, `a.btn` and `:focus-visible`. This is the component.

**Duplicated page-scale recipes.** `legacy/10-explore.css:23` and `legacy/11-shared-page.css:1037` declare the same seven properties. One is scoped to `:is(.ex-page, .trips-page)`. The other is scoped to `:is(.yf-page)`. Both exclude `.btn-sm` and modal descendants through `:where()`. The same recipe is written twice under two page scopes.

**Page placement.** The other rules place a button inside a page. Examples are `.hero .btn`, `.nav-right .btn`, `.bench-dock .btn`, `.gcf .btn`, `.mt-hero-secondary > .btn` and `.offline-recovery-actions .btn`. About twenty more do the same. These are page composition. They may stay.

Variants are small. `.btn-sm` has 4 rules, `.btn-primary` 2 and `.btn-saffron` 2.

Conditional contexts on `.btn`: reduced motion 8 rules, `max-width: 720px` 3, coarse pointer 2. The rest cover 560, 640, 440 and 350 pixels, plus one `min-width: 720px` case.

### What this means for the batch

A move of all 57 rules into a component module would drag page layout into the component. That breaks the boundary the check enforces. The batch moves only the recipe and its states. Page placement stays where it is. The check then stops a page from setting appearance on `.btn`.

One rule needs care. `legacy/04-mobile-usability.css:496` sets `transition` on a shared list: `.btn, .tab-btn, .board-fit, .board-pulse-link`. That list spans three families. It must split without changing which declarations each selector receives.


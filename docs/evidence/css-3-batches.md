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

## B2 checkpoint 1: the recipe and its scale

Commits `77af76d8`. Input `2e2a19d3`.

Nine rules moved from section 01 and 04 into `src/styles/components/button.css`, plus the variant block and the size scale.

The size scale had to move with the recipe. .btn-sm and .btn-lg compete with .btn at equal specificity. Section 01 declared them after it. A recipe-only move put the base after the scale, so .btn-sm lost its 13px type and 6px padding.

The first computed comparison found it: `.btn-sm` height moved 31px to 39px in every scope. The scale now sits after the base inside the module, which is its original relationship.

Two duplicates were consolidated inside the new owner. `.btn` appeared twice, as the base recipe and as a later transition. `.btn:focus-visible` appeared twice with identical declarations. The merged rule keeps the later transition value, so the effective value is unchanged. That removes a raw `.06s` duration, so its design-system baseline entry is deleted. The set only shrinks.

## B2 checkpoint 2: the duplicated scale becomes variables

Commit `2ca2fb13`.

`legacy/10-explore.css:23` and `legacy/11-shared-page.css:1037` were byte-identical apart from their scope. Both declared the control.

The base recipe now reads every value a page may select from a variable. Each fallback is the default scale, so a button outside a page scope is unchanged.

| Variable | Default | Catalog and yf-page |
|---|---|---|
| `--btn-min-height` | `auto` | `44px` |
| `--btn-padding` | `9px 17px` | `0 16px` |
| `--btn-radius` | `999px` | `12px` |
| `--btn-font-size` | `14px` | `15px` |
| `--btn-weight` | `600` | `700` |
| `--btn-tracking` | `normal` | `-.005em` |
| `--btn-transition` | the default six-property list | the five-property catalog list |
| `--btn-active-transform` | `scale(.97)` | `translateY(1px)` |

`min-height` falls back to `auto` and `letter-spacing` to `normal`, which are the initial values, so adding those declarations changes nothing.

Both page scopes keep their exact selectors, specificity and order. They now assign variables instead of redeclaring appearance. The `:active` transform and both reduced-motion rules became assignments too, so a page no longer declares component behaviour.

Page placement rules are untouched. `.hero .btn`, `.nav-right .btn`, `.bench-dock .btn` and the rest still own their own layout.

### Computed-style comparison

One page per environment holds all 120 elements. Each is measured at rest and focused, over 39 properties.

| Measure | Value |
|---|---|
| Scopes | 12, including both page recipes, the modal exclusion and the placement exceptions |
| Variants | 10: base, link, sm, primary, saffron, outline, ghost, icon-only, disabled, loading |
| Environments | light and dark at 1440, light and dark at 390, light with reduced motion |
| Comparisons | 1,200 claimed. The fixture dropped its page scope, so this count did not measure what it named. See the repair section. |
| Differences | 0, not a valid result |

The same comparison against the first try reported `.btn-sm` differences in every scope. That is how the scale defect was found.

### Enforcement

`.btn`, `.btn-sm`, `.btn-primary` and `.btn-saffron` are registered as button configuration classes. A page may set placement and a documented variable. A page may not set appearance.

Proven with a real exit code:

- `.hero .btn { border-radius: 0 }` reintroduced into `12-pages.css` fails with exit 1 and names `12-pages.css:518`.
- `.hero .btn { flex: 1 1 auto; margin-top: 8px; --btn-radius: 12px }` passes.

The 103 appearance declarations that already existed were grandfathered by exact file, selector and property key. Checkpoint 2 removed 17 of them. It added 3 inside a scope that now assigns variables. The baseline is 89.

Rollback: move the recipe, scale, variants and states back to sections 01 and 04. Restore the two page recipes as declarations. Remove the module and its import. Restore the appearance baseline.

## B3: input, textarea and field composition

Checkpoint 1 is `bab73488`. Checkpoint 2 is `1f5cc770`. The variable allowlist is `cdfe71a1`.

### What the inventory found

`.field` is a shared component, not page layout. `src/components/ui.tsx` renders it as the wrapper that stacks a label, a control and a hint, and it wires `aria-describedby` and `aria-invalid`. It is registered as a configuration class, so a page may place a field but may not restyle the control.

`.label` and `.hint-text` stayed where they are. Both are shared text utilities with many page modifiers: `.shr-*`, `.ovw-*`, `.auth-*`, `.gcf`. Neither belongs to the field component.

The search field and the select keep their own modules. No second recipe for either was introduced.

### Checkpoint 1

Nine rules moved into src/styles/components/input.css. They are field composition, the two controls, focus, disabled, textarea sizing and the invalid state. They also include the two focus-visible rules split out of the 49-selector list. The last is the phone sizing rule with its media context.

### Checkpoint 2

Five values became variables: `--input-padding`, `--input-border-color`, `--input-radius`, `--input-background` and `--input-color`. Seven page overrides became assignments.

One property deliberately stays a declaration. The sheet sets type on the element selector `input, select, textarea`, not on `.input`. A `font-size` declaration in the module would have to beat that rule.

The first try used `font-size: var(--input-font-size, revert)`. The computed comparison measured 13.3333px against the real 14.5px on every variant, because `revert` rolls back past the element rule. So `font-size`, `font-weight` and `appearance` are not routed through variables. A page that changes the size still declares it, and those keys stay in the recorded debt.

That defect was caught by the computed comparison, not by reading the CSS.

### Verification

| Measure | Value |
|---|---|
| Elements | 180: 15 scopes by 12 variants |
| Variants | text, email, number, search, date, disabled, read-only, invalid, empty, textarea, textarea-invalid, field with label and hint |
| Scopes | plain, both page recipes, auth-card, invite-entry, unit-input, day-slot-search, tpl-name, crew-invite-row, ct-day-start, gcf, modal, ts-form, form-row |
| Environments | light and dark at 1440, light and dark at 390, light with reduced motion |
| Comparisons | 1,800 claimed. The fixture wrote two `class` attributes, so every scoped row measured an unscoped control. See the repair section. |
| Differences | 0, not a valid result |

### Enforcement

A custom property on a configuration class is now checked against the owner's documented list. Before this, every `--` declaration was skipped, so `--btn-anything` was a free pass.

The rule found a real omission at once. --btn-active-transform is declared and used in utton.css from B2 checkpoint 2. It was missing from the map, so the two page scopes that assign it were failing.

Proven: `.hero .btn { --btn-anything: 1px }` fails with code `config-variable` and names `12-pages.css:518`. `.hero .btn { --btn-radius: 12px }` passes. The fixture is permanent.

### Two suite failures fixed with this batch

`tests/script-exit-pins.test.ts` pins every `process.exit` call site under `scripts/`. `css-ownership.mjs` is registered with its two sites.

`tests/page-header.test.ts` sliced a stylesheet section up to the Papercut marker. The token batch moved that section into `tokens.css`, which the graph imports first, so the marker sits before the section and the slice came back empty. The slice now ends at the next `=====` section banner, which is what the test always meant. The helper was also inside one `describe` block while a later test used it, so it moved to module scope.

### Limits

No browser paint check has run. The comparison reads computed values, not painted pixels.

`font-size` on `.input` remains recorded debt, for the reason above.

Rollback: move the nine rules back to sections 01 and 04. Restore the seven page overrides as declarations. Remove the module and its import. Restore the appearance baseline.

## Ownership debt audit

The B3 report said the recorded debt rose from 89 keys to 114. That was wrong.

54 of the 114 keys named declarations inside owner modules. The rule never reports on an owner module, so those keys could never match a finding. They came from the baseline generator, which walked every file instead of skipping the owners. They inflated the figure and would have stayed in the map.

Two fixes landed in `1c101083`. The generator skips owner modules and skips a documented variable. The check now fails on a registered key that matches nothing, so the figure cannot drift again.

The real figure is 60, down from 89.

The audit compares the current keys against the frozen pre-B3 commit `e2048a1e`. It reads each declaration out of that commit, so "unchanged" is proven rather than assumed.

| Measure | After B3 | After B4 |
|---|---|---|
| Keys at `e2048a1e` | 89 | 89 |
| Keys now | 60 | 65 |
| Added | 7 | 12 |
| Removed as stale | 36 | 36 |
| Added keys whose value changed | 0 | 0 |
| Added keys absent at the frozen commit | 0 | 0 |

### The seven keys B3 added

Five are typography declarations that stay declared by design, because the sheet sets type on the element selector `input, select, textarea`. Two are other properties on one input.

| File | Selector | Property | Value |
|---|---|---|---|
| `05-share-and-trip-ticket.css` | `.unit-input .input` | `font-size` | `16px` |
| `05-share-and-trip-ticket.css` | `.unit-input .input` | `font-weight` | `600` |
| `08-map-review.css` | `.day-slot-search .input` | `font-size` | `13px` |
| `13-phone-polish-and-guided-create.css` | `.gcf :is(.input, .loc-input, .namebox-in)` | `font-size` | `15px` |
| `13-phone-polish-and-guided-create.css` | `.gcf :is(.input, .loc-input, .namebox-input)` | `font-size` | `16px` |
| `13-phone-polish-and-guided-create.css` | `.gcf-fuel-grid .input` | `appearance` | `textfield` |
| `13-phone-polish-and-guided-create.css` | `.gcf-fuel-grid .input` | `border` | `0` |

### The five keys B4 added

The `.card` registration in B4 brought its page rules under the rule. All five are unchanged pre-existing declarations.

| File | Selector | Property | Value |
|---|---|---|---|
| `01-foundations.css` | `.bento .card, .bento .stat-tile` | `border-radius` | `var(--radius-lg)` |
| `01-foundations.css` | `.bento .card, .bento .stat-tile` | `box-shadow` | `var(--shadow-soft)` |
| `02-select-and-print.css` | `.bezel > .card, .bezel > .created-card` | `border-color` | `transparent` |
| `02-select-and-print.css` | `.bezel > .card, .bezel > .created-card` | `border-radius` | `calc(2rem - 7px)` |
| `02-select-and-print.css` | `.bezel > .card, .bezel > .created-card` | `box-shadow` | `inset 0 1px 0 var(--yf-glass-sheen)` |

No declaration changed value in either stage, so no batch introduced a violation and none was grandfathered.

## Painted comparison

Computed values cannot prove clipping, stacking, focus visibility or the final appearance. Five cases were captured before and after with fonts loaded. Each used an identical viewport, theme, content and state. Each carries visible keyboard focus where focus is the risk.

| Case | Risk it covers | Result |
|---|---|---|
| `button-focus-visible` | focus ring visibility on a filled control | identical |
| `button-phone-sm` | scale and tap target at 390px | identical |
| `input-invalid-focus` | invalid border plus focus ring stacking | identical |
| `field-dark-disabled` | disabled opacity and contrast in dark | identical |
| `input-clipping-phone` | text clipping and overflow at 320px | identical |

All five are pixel-identical. The captures are non-blank and carry real variance, so the comparison is not a pair of empty frames.

The instrument is `dev/_css3-paint.mjs`. It is a scratch tool and is not part of the gate.

## B4: the static card

Checkpoint 1 is `537d2a71`.

The first inventory said `.card` had 109 consumers. That number counted source occurrences, not rules. Seven rules name `.card`, and only three are the surface.

| Rule | Class | Outcome |
|---|---|---|
| `01 .card` | shared appearance | moved |
| `01 .card + .card` | shared sibling rhythm | moved |
| `01 .card.route-snap` | variant of the surface | moved |
| `01 .bento .card` | page placement plus appearance | stayed |
| `01 .explore-grid > .card + .card` | page placement | stayed |
| `02 .bezel > .card` | page placement plus appearance | stayed |
| `02 .card h3 + hr.divider` | nested content | stayed |

The three page rules carry higher specificity than the surface, so their position is unchanged.

A card in this product is static. There is no `.card:hover`, `.card:focus` or interactive modifier. The interactive cards are `.itin-card` and `.trip-card-hit`, which are separate families with their own hover and focus behaviour. The module header records that, so a later batch does not fold them in.

`.card-title` and `.card-head` stayed. Both are shared sub-components with page modifiers, including use inside `.itin-body`.

The module is imported before section 02. Every moved rule came from section 01, so its order relative to section 02 is unchanged.

### Verification

| Measure | Value |
|---|---|
| Elements | 30: 6 scopes by 5 variants |
| Variants | card, route-snap, stacked pair, nested content, overflow |
| Scopes | plain, bento, bezel, explore-grid, two-col, feature-strip |
| Environments | light and dark at 1440, light and dark at 390 |
| Properties | 22, including shadow, border, radius, padding, overflow and background image |
| Comparisons | 120 claimed, 120 valid. This tool had unique keys and no page scope to drop, and it was re-run after the repair with the same result. |
| Differences | 0 |

Three card cases joined the painted set. They are shadow and hairline border, the route-snap gradient in dark, and nested content with overflow at 390px. The route-snap case also covers its transparent border. All eight painted cases are pixel-identical.

Rollback: move the three rules back to section 01, remove the module and its import, and restore the appearance baseline.

### B4 checkpoint 2

Commit `0ec35172`.

Three variables were documented at first. `--card-surface` was withdrawn because no consumer sets it. A configuration hook with no consumer is not part of the API. Two remain: `--card-border-color` and `--card-radius`.

Both card page rules shared a selector list with a different component. Each was split rather than converted. A conversion would push a card variable onto .stat-tile and .created-card. Both have their own base rules at 02:119 and 08:426.

Spacing, grid placement and surrounding layout stayed page-owned. `.card + .card` and `.explore-grid > .card + .card` keep their margins, and `.bezel > .card` keeps `flex: 1`.

#### Shadow stays declared, and it is debt

It was tried as a variable and failed in both directions.

With --card-shadow, .card.route-snap inside .bezel lost the bezel inset. The variant declaration beat the base rule that reads the variable. The bezel rule used to win by order at equal specificity.

The variant then read the variable and picked up the bento shadow, where it used to lose.

So three rules keep a direct box-shadow: .bento .card, .bezel > .card and .card.route-snap. What they depend on is order and specificity between equal-specificity selectors. That precedence is existing behaviour. Nothing in the source shows it was chosen on purpose, and this document does not claim it was.

So three rules keep a direct box-shadow: .bento .card, .bezel > .card and .card.route-snap. They depend on order and specificity between equal-specificity selectors. That precedence is existing behaviour. Nothing in the source shows it was chosen on purpose, and this document does not claim it was.

The computed comparison caught both tries. Nothing else did.

| Measure | Value |
|---|---|
| Comparisons | 120 across 30 elements in four environments |
| Differences | 0 |
| Painted cases | 8, all pixel-identical |
| Appearance keys | 65 down to 62 |

Rollback: restore the direct border and border-radius in the base recipe. Merge the two split selector lists back. Remove the card variables from the map.

## B5: the page container

Checkpoint 1 is `a4385dff`. Checkpoint 2 is `f497c0ca`.

This is the first layout owner. The module is `src/styles/layouts/container.css`, and the naming pin now accepts `layouts/name.css` as an explicit alternative.

### Classification

Twenty-four rules name `.container`. Two are the shared recipe and twenty-two are page variants.

| Rule | Class | Outcome |
|---|---|---|
| `01 .container` | shared recipe | moved |
| `04 .container` in `@media (max-width: 640px)` | shared responsive step | moved |
| `.topnav .container.topnav-inner` | page placement | stayed |
| `.container.form-page` | page width | stayed, then converted |
| `.container:is(.ex-page, .trips-page)` | page width | stayed, then converted |
| `.container:is(.yf-page)` | page width | stayed, then converted |
| `.container.dmca-page` | page padding | stayed |
| `.container.form-page.gcf` | page layout | stayed |
| `.container.trip-starter` | page token | stayed |
| `.container.yf-workspace` | workspace width | stayed |

Every page rule carries a higher specificity than the recipe, so its position relative to it is unchanged.

### One custom property needed a decision

`.container.trip-starter` sets `--choice-tint`, which the container never reads. It is a page token consumed by `.trip-starter` descendants, assigned on the container because the container is the page root.

It is not container configuration. Adding it to the container's documented variables would make the container claim a setting it does not own. It is recorded in a new `configVariableDebt` ledger with that reason.

### Checkpoint 2

Three scopes declared the same `1240px`. The recipe reads `--container-max` and each scope assigns it.

Four declarations stay direct, because each is a different width or a deliberate override. They are 1400px for .yf-workspace, 1720px for [data-wide=true], 1180px for the .yf-workspace.yf-workspace override, and 1248px for .gcf.

The risk in this conversion is an element carrying two scopes. A direct declaration used to compete by order at equal specificity. A variable now always feeds the base recipe. Three combined-class cases were added to the comparison for that reason.

| Measure | Value |
|---|---|
| Variants | 14, including three combined-class cases |
| Environments | 1440, 980, 640, 390 in light; 390 in dark; reduced motion |
| Properties | 14, covering width, padding, margins and transition |
| Comparisons | 84 claimed. Every case reused `data-key="K"`, so fourteen cases collapsed into one row. See the repair section. |
| Differences | 0, not a valid result |
| Appearance keys | 74 |

No new painted case was added. The batch introduced no risk the existing eight do not already cover.

Rollback: restore max-width 1180px in the recipe. Restore the three direct 1240px declarations. Remove the variable from the map. Move the two rules back to sections 01 and 04.








## B6: the chip

Checkpoint 1 is `2ef6397b`.

Four rules moved into `src/styles/components/chip.css`: the recipe, `.chip-teal`, `.chip-outline` and `.chip-saffron`, with the section header.

Thirteen of the seventeen rules naming `.chip` stayed. They are page variants with distinct values.

Three shared selector lists also stayed: the coarse-pointer hit area, the focus ring and the transition. Each spans many controls, so they belong to the shared-control batch rather than to the chip. The module header says so.

### Checkpoint 2 records a negative result

There is no consolidation to make. Every property the page rules set carries a different value per scope.

| Property | Distinct values |
|---|---|
| `color` | 4 |
| `background` | 3 |
| `border-color` | 3 |
| `border-radius` | 2 |
| `cursor` | 2 |
| `font-size`, `font-weight`, `transition` and the rest | 1 each, on one scope only |

A variable per property would add configuration no second consumer asks for. That is the same hook the card batch withdrew. The surface differences stay declared, and they are recorded in the appearance ledger.

This entry exists so a later batch does not add chip variables for values that only look similar.

| Measure | Value |
|---|---|
| Elements | 49: 7 scopes by 7 variants |
| Variants | chip, teal, outline, saffron, on, disabled, focus |
| Environments | light and dark at 1440, light and dark at 390, reduced motion |
| Properties | 26 |
| Comparisons | 490 |
| Differences | 0 |
| Appearance keys | 74 to 101 |

### Debt trace

Against the frozen pre-B3 commit the audit reports 48 added keys. 44 are unchanged pre-existing declarations. 4 are the same declaration under a narrowed selector, from the card list split and the focus-list split. None changed value, and none was introduced.

Rollback: move the four rules back to section 02, remove the module and its import, and restore the appearance baseline.

## Repair: regressions the earlier comparisons could not see

Commit `6b83e32e`. Raised against `147b47b2` and `da9715f2`.

Three appearance regressions were present, and the comparison tools could not detect them. Passing unit tests did not close any of them.

### The tools were the reason the regressions survived

| Tool | Defect | Effect |
|---|---|---|
| Buttons | The wrapper carried two `class` attributes | Chrome kept the first and discarded the page scope, so every scoped row measured an unscoped control |
| Container | Every case reused `data-key="K"` | Fourteen cases collapsed into one row per environment |
| Container | Page classes sat on a wrapper | Production puts them on the `.container` element, so `.container.ex-page` never matched |
| Card | The stacked pair reused key `K2` across scopes | The second card was never compared |

Three appearance regressions were present. The comparison tools could not detect any of them. Passing unit tests did not close any of them.

### The regressions

**Ghost and large buttons lost their page scale.** The page recipe used to win at 0,2,0 over the 0,1,0 variant rules. After B2 the variants beat the base rule that reads the variables.

| Variant | Property | Accepted | After B2 |
|---|---|---|---|
| `.btn-ghost` | radius | 12px | 999px |
| `.btn-ghost` | padding | 0 16px | 8px 10px |
| `.btn-lg` | padding | 0 16px | 12px 24px |
| `.btn-lg` | font-size | 15px | 15.5px |

Both now read `--btn-padding`, `--btn-radius` and `--btn-font-size`, with their own values as fallbacks. No page-level repair was added.

**The dark primary colour rule beat the hero override.** `[data-theme='dark']` is an attribute selector, so that rule is 0,2,0, the same as `.hero .btn-primary`. It won only on order once the module loaded after section 04. It set exactly what `.btn-primary` already sets, so it was removed rather than reordered.

One shared harness now serves every tool. It assigns unique keys and fails on a duplicate or a missing key. It asserts that each scope selector matches an element. It checks that focus reaches every focusable element. Normalisation removes animated sub-pixel shadow drift and treats `none` as a zero shadow.

### Two ownership bypasses

**Seven button classes were unregistered.** A page repair on `.btn-ghost`, `.btn-outline` or `.btn-lg` passed with no finding. All eleven classes are registered now.

**Root tokens were allowed inside any owner.** The token rule skipped every owner module, so `:root { --rogue: red }` inside `button.css` passed. Only the registered token owner may define root tokens now.

### Verification against the frozen pre-B2 build

Frozen input is `8cc2dbc9`, built to `dev/_css3-frozen-b1.css`. The repair build is `dev/_css3-final.css`.

| Family | Elements | Environments | Comparisons | Differences |
|---|---|---|---|---|
| Buttons | 132 | 5 | 46,800 | 0 |
| Container | 24 | 6 | 2,016 | 0 |
| Card | 36 | 4 | 3,024 | 0 |
| Chip | 49 | 5 | 490 | 0 |

The button run also performed 990 focus checks. It reported 9 hidden elements, all `.bench-dock` at desktop width, where that dock is `display: none` by design.

Commands:

```
git checkout 8cc2dbc9 && npm run build
git checkout chore/css-3-ownership && npm run build
node dev/_css3-btn-compare2.mjs dev/_css3-frozen-b1.css dev/_css3-final.css
node dev/_css3-container-compare2.mjs dev/_css3-frozen-b1.css dev/_css3-final.css
node dev/_css3-card-compare2.mjs dev/_css3-frozen-b1.css dev/_css3-final.css
node dev/_css3-chip-compare.mjs dev/_css3-frozen-b1.css dev/_css3-final.css
node dev/_css3-paint.mjs dev/_css3-frozen-b1.css dev/_css3-final.css dev/_css3-paint-final
```

### Painted comparison

Ten cases, all pixel-identical. Two are new, because the existing eight did not cover the regressions:

| Case | Risk |
|---|---|
| `ghost-in-page-scope` | page-scoped ghost, outline and large keep their page padding and radius |
| `hero-primary-dark-ink` | hero primary keeps white ink in dark mode |

Motion is frozen before capture. Without that, the hero breathing glow lands at a different phase in each build. It then reads as a one-step colour change. The first two runs reported 17,174 and 14,082 differing pixels, with a maximum delta of 2 and 1.

### Known-bad fixtures added

| Fixture | Fails on |
|---|---|
| duplicate result keys | two elements collapsing into one row |
| dropped page scope | a fixture that silently loses its class |
| unregistered variant repair | a page restyling `.btn-ghost`, `.btn-outline` or `.btn-lg` |
| root token in a component owner | `:root` inside `button.css` |

### Gate status

Focused checks pass: 160 tests, `check:css` with 8 owner modules, `check:ui`, build.

`npm run verify` did not run. It is still blocked by inherited STE findings that predate this work. The manual sequence is not a substitute for it and this document does not claim that command passed.

### Remaining limits

The comparison reads computed values and painted pixels for the fixtures listed. It does not sweep the product.

`.btn-trail` keeps a direct `padding-right`, which beats the base rule at equal specificity inside a page scope. It is only used on the landing hero, which carries no page scope, so it is not exercised here and is not claimed safe.

The container owner now spans two files. That records where each rule must sit in the cascade, not a second owner.

## Harness correction and the adjacent-pair gap

Commit `789a160d`.

### The harness is a test dependency

`tests/css-compare-harness.test.ts` imports `dev/_css3-compare-lib.mjs`. While that file was untracked, the suite could not run from a clean checkout. It and the maintained tools are committed now.

### Validators have direct tests

Validation is split from page access. `validateRows` and `validateScopes` are pure, so each failure mode is tested without a browser:

| Case | Expected |
|---|---|
| two rows with one key | throws, naming the key |
| an expected element with no row | throws, naming it |
| an unexpected key | throws, naming it |
| a scope that matched nothing | throws, naming the selector |

Each was confirmed to throw by hand as well as in the test.

### The chip count was fiction

The chip tool reused one key for every variant, so its rows collapsed. Its earlier figure of 490 comparisons described rows that did not exist. Re-measured on the harness: **11,830 comparisons, 140 focus checks, 0 differences**.

### The sibling rule was never measured

The card tool rendered its two cards in separate wrappers. Cards in separate wrappers are not siblings. So the sibling rhythm selector never matched, in any batch.

The tool now renders a real adjacent pair inside one wrapper, with two unique keys. `assertAdjacentPairs` confirms the second card of each pair matches the sibling selector: **48 pairs** across 6 scopes and 4 environments.

The check was proven both ways. It throws when the cards sit in separate wrappers. It passes on a genuine pair.

### Focused results, frozen pre-B2 build

| Family | Elements | Environments | Comparisons | Other |
|---|---|---|---|---|
| Buttons | 132 | 5 | 46,800 | 990 focus checks |
| Container | 24 | 6 | 2,016 | — |
| Card | 30 | 4 | 3,024 | 48 adjacent pairs asserted |
| Chip | 49 | 5 | 11,830 | 140 focus checks |

All four report zero differences.

48 focused tests pass. `check:css` passes with 8 owner modules. No product styling changed in this commit.

`npm run verify` did not run. It is still blocked by inherited STE findings.

## B7: the avatar

Commit `e80111fe`.

Five rules moved into `src/styles/components/avatar.css`: `.avatar` and `.avatar.lg` from section 02, and `.avatar.tone-sea`, `.avatar.tone-marigold` and `.avatar.tone-bloom` from section 17. The tone classes are surface variants, so they belong with the recipe rather than in a page module.

Seventeen of the twenty-two rules naming `.avatar` stayed. They size or stack an avatar inside a page:

| Rule | Concern |
|---|---|
| `.member-stack .avatar` and `:first-child` | stack overlap and border |
| `.presence-peer .avatar` | stack border |
| `.balance-who .avatar` | page sizing |
| `.who-voted .avatar` and `:first-child` | page sizing and overlap |
| `.creator-hero .avatar` | page sizing |
| `.ex-byline .avatar`, `.ex-creator .avatar` | page sizing |
| `.yf-member .avatar`, `.yf-page .yf-member .avatar` | page sizing and border |
| `.ovw2 .ovw-avatars .avatar + .avatar` | stack overlap |
| `.member-stack .avatar`, `.yf-avatars .avatar` box-shadow | stack edge |

### The seed proof came first

A zero from an untrusted tool means nothing. The avatar tool planted two defects in the module. It rebuilt, then made the comparison fail as it needs to:

| Seed | Expected | Result |
|---|---|---|
| `tone-sea` fill changed to the base teal | detected | exit 1 |
| `.avatar.lg` 44px changed to 40px | detected | exit 1 |
| module restored | clean | exit 0 |

The module came back byte-identical, confirmed by an empty `git diff`. The tool is `dev/_css3-avatar-seed.mjs`, so the proof can be repeated.

### Verification

| Measure | Value |
|---|---|
| Elements | 91: 13 scopes by 7 variants |
| Variants | base, lg, three tones, an image avatar, an adjacent pair |
| Scopes | plain, member-stack, presence-peer, balance-who, who-voted, creator-hero, ex-byline, ex-creator, yf-member, yf-page yf-member, ovw-avatars, yf-avatars, yf-page yf-avatars |
| Environments | light and dark at 1440, light and dark at 390, reduced motion |
| Properties | 26 |
| Comparisons | 13,520 |
| Differences | 0 |

Eleven painted cases, all pixel-identical. The new one covers the circular clip and the three tone fills. It also covers the inks in dark mode and the overlapped member stack.

### A stale key was removed

The owner registration made container-phone.css an owner file, so its appearance key could never match a finding. The stale-key check fired. The key was deleted rather than left in the ledger.

Rollback: move the five rules back to sections 02 and 17. Remove the module and its import. Restore the appearance baseline.

## B8: the dialog

Checkpoint 1 is `5a52844f`. Checkpoint 2 is `faa33b47`.

### The inventory was misleading

Twenty-four rules name `.modal` or `.dialog`. Most of them are `:not(.modal *)` exclusions inside the button page recipes: they exclude modal descendants from a page's button skin. They do not style a dialog.

Nine rules are the surface. They are `.modal-overlay` and `.modal` with their `min-width: 640px` steps. They are also the `max-width: 720px` sheet step, and `.modal-full` with its head rule and two motion rules.

### The fixture mounts the real component

The fixture renders Modal from src/components/ui.tsx. The focus trap, the Escape handler and the scroll lock under test are the ones the product ships. So are the focus restoration and the motion. Lookalike markup would have proven nothing about any of them.

### Detection proven before the result

Seeds are stylesheet overrides in isolated pages. No source edit, no rebuild.

| Seed | What it plants | Healthy | Seeded |
|---|---|---|---|
| Stacking | overlay `z-index: 0`, `pointer-events: none` | on top | not on top, detected |
| Clipping | `overflow-y: hidden`, `max-height: 320px` | scrolls, last control reachable | cut off, detected |

### Two measurement defects found while proving that

**The fixture never imported the stylesheet.** Vite injected nothing, so every measurement read an unstyled element: overlay `position: static`, `z-index: auto`, no max-height. Both seeds "passed" for the wrong reason. Fixed by importing `../src/styles.css` in the fixture.

**The Tab check never pressed Tab.** It sampled `document.activeElement` eight times, so it always saw the same control. It proved nothing about the trap. It now presses Tab and fails if the walk does not reach every focusable control. The sequence is `Close → confirm → cancel → Close` and wraps, in all six environments.

### Coverage and behaviour

| Measure | Value |
|---|---|
| States | 18: six environments by three variant and body combinations |
| Environments | light and dark at 1440, light and dark at 390, reduced motion at both widths |
| Properties | 24, on overlay, dialog and head |
| Comparisons | 1,350 |
| Differences | 0 |
| Behaviour checks | 12 |

Each state asserts before measuring. The overlay, the dialog, `role="dialog"`, `aria-modal="true"` and at least two focusable controls must exist. The long-body case must render at least twenty paragraphs. A state that measured nothing fails rather than report zero.

Behaviour asserted in every environment:

- keyboard entry with Enter moves focus inside the dialog
- Tab reaches all three focusables and wraps
- Shift+Tab stays inside
- Escape calls `onClose` and the dialog detaches
- focus returns to the opener
- reopening during the close transition leaves exactly one dialog and one overlay, with `body { overflow: hidden }` still in force and focus inside

### Checkpoint 2

Three variables: `--dialog-max-width`, `--dialog-max-height`, `--dialog-max-height-dvh`. `.modal-full` selects 720px instead of restating it. The phone step selects the safe-area-subtracted heights instead of redeclaring the vh/dvh pair, so that pair is declared once.

Two comments in the moved rules claimed the repetition was needed, because the later block re-declared the base max-height. With a variable the base reads, that is no longer true. Both were rewritten to describe what the code does.

Twelve painted cases, all pixel-identical, including a new bottom-sheet case at 390px in dark mode.

### Pre-existing gaps, recorded and not fixed

These were present before this batch and are not caused by it. They are recorded rather than repaired, because the migration must not turn into a redesign.

- **The dialog does not use a portal.** `Modal` renders inline where it is called, so a caller inside a stacking context can trap it. The CSS cannot fix that; it is a component concern.
- **The initial-focus timer is 30ms.** A caller that opens and immediately moves focus can race it.
- **No `aria-describedby`.** The dialog names itself with `aria-labelledby` but does not describe its body.
- **The overlay has no explicit `overflow`.** A tall sheet on a short viewport relies on the sheet's own scroll rather than the overlay's.

### Gate

Focused checks pass: `check:css` with 10 owner modules, `check:ui`, typecheck, lint ratchet at baseline.

`npm run verify` did not run. Inherited STE findings still block it. This is not a claim that it passed.

Rollback: move the nine rules back to sections 02, 04 and 07. Restore the direct `max-width` and the two `max-height` pairs. Remove the module and its import. Restore the appearance baseline.

## B9: the toast

Checkpoint 1 is `b9bc29cb`. Checkpoint 2 is `9ea17e30`.

### The first batch with no page variants

Seven rules name `.toast` and nine are the surface. Every rule that names it belongs to the component. That is the first batch where this is true; every earlier family had page-scoped sizing or placement to leave behind.

### The fixture drives the real API

It calls `toast()`, `undoToast()` and renders `ToastZone` from `src/components/ui.tsx`. The live region, the role assignment and the one timer per toast are the product's. So are the hover and focus hold and the dismiss path.

A fixture bug had to be fixed before anything rendered. `toast()` calls a module-level hook that `ToastZone` publishes on mount. Firing it in the same effect pass ran before that hook existed, so every call was a silent no-op.

### Detection proven before the result

Seeds are stylesheet overrides in isolated pages.

| Seed | What it plants | Healthy | Seeded |
|---|---|---|---|
| Semantic fill | dark `.ok` and `.err` forced to the neutral fill | fills differ | fills equal, detected |
| Ink contrast | `.ok` ink set to its own fill colour | 7.38:1 | 1.00:1, detected |

| States | 20: five environments by four kinds |

### Verification

| Measure | Value |
|---|---|
| States | 20: five environments by four kinds |
| Kinds | `ok`, `err`, undo with an action, and three at once |
| Environments | light and dark at 1440, light and dark at 390, reduced motion |
| Properties | 27, on the zone, every pill and every action button |
| Comparisons | 1,680 |
| Differences | 0 |

Each state asserts before measuring that the zone exists with `role="status"` and `aria-live="polite"`. It also asserts the expected number of pills and actions rendered, and that no pill is mid-fade.

Ink contrast on the painted fill, both themes:

| Theme | `.ok` | `.err` |
|---|---|---|
| light | 7.38 | 5.94 |
| dark | 6.70 | 6.67 |

All clear 4.5.

### Checkpoint 2

`--toast-radius` is read by both `.toast` and `.toast-action`, which declared the same 999px pill twice.

The rest of the repetition stays, and is recorded so a later batch does not tidy it away:

| Declaration | Count | Where |
|---|---|---|
| `background: var(--teal-deep)` | 2 | `.toast.ok` and `[data-theme='dark'] .toast.ok` |
| `background: var(--danger)` | 2 | `.toast.err` and `[data-theme='dark'] .toast.err` |
| `color: #fff` | 2 | the light semantic pair |
| `color: #06251f` | 2 | the dark semantic pair |

The dark overrides repeat the semantic fills on purpose. Folding them back into the neutral rule would reinstate the defect the first seed proves detectable.

### Gate

`check:css` passes with 11 owner modules. Scoped STE passes on the changed lines.

`npm run verify` did not run. The default STE run still exits 1 against the inherited merge base `f68b3d9`, which predates this work.

Rollback: move the nine rules back to section 02, remove the module and its import, and restore the appearance baseline.

## B10: the page families

**Status: complete for the four families, with a recorded exception.** `.hero`, `.itin-card` and `.board*` are owned. `.trip-head-card` has no consumer, so it has no owner and stays listed as unreachable. Twenty board rules stay in legacy. Another family shares their selector list, and the map names exactly which classes were owned.

Checkpoint 1 is the `.hero` extraction. Checkpoint 2 merges its box rules.

Only `.hero` moved so far. The earlier section that called the other three unmeasurable was wrong. A fixture can reach them, and checkpoint 3 takes that path. This section records what the batch actually did, not what it concluded about the rest.

### The plan listed four families. Measurement reclassified three.

The batch table named `.itin-card`, `.trip-head-card`, `.hero` and `.board*`. A full cascade trace of each one gave a different shape for three of them.

| Family | Selector matches | Reachable | What it is |
|---|---|---|---|
| `.hero` | 15 | 15 | The Landing page's own surface. `Landing.tsx` is the only consumer. |
| `.itin-card` | 25 | 7 | A shared component's card, rendered by `PubCard`. 18 rules reach no element. |
| `.trip-head-card` | 13 | 0 | No source file renders it. |
| `.board*` | 150 (29 classes) | 150 | The Board tab's surface, spread over five legacy files. |

`dev/_css3-b10-trace.mjs` produced the trace. It reads the graph the gate reads and reports each rule with its conditional context and the ancestor scope that constrains it. File position alone does not make a page override. A bare `.itin-card` rule in a late file still applies everywhere, and an `.explore-grid.as-list` prefix never applies at all.

The trace output also answers what a count cannot. `.trip-head-card` has no consumer: no `.tsx`, `.ts` or `.html` file names it. `.trips-page` renders `.mt-card`, not `.itin-card`, so nine `.trips-page .itin-card` rules reach nothing. No file applies `.explore-grid.as-list`, so seven more rules reach nothing. No file renders `.trip-next-chevron`, so two more reach nothing.

A family with no consumer has no styling responsibility. Giving it an owner would record a false claim. These 18 rules stay where they are, and stay listed as remaining legacy.

### `.hero` moved to `pages/landing.css`

Thirteen rules carry the fifteen selector matches. They came from three files.

| Source | Rules | Content |
|---|---|---|
| `02-select-and-print.css` | 1 | the hero box: padding and centred text |
| `04-mobile-usability.css` | 11 | positioning, the CTA treatment, the glow and sheen animations |
| `12-pages.css` | 1 | `overflow-x: clip`, shared with `.plan-bench` |

The entry imports the module directly after `04-mobile-usability.css`. The eleven rules from that file then keep their exact cascade position. The other two gain no competitor: no other rule sets `padding` or `overflow-x` on `.hero`.

One rule was shared. `.hero, .plan-bench { overflow-x: clip }` names two families, and one responsibility cannot sit in two owners. The rule is now two rules, one in each owner, with the same declarations.

The three `.hero` box rules stay separate on purpose. Extraction is one checkpoint. Merging them is the next one. One commit that does both hides which change caused a difference.

### Detection proven before the result

The instrument is `dev/_css3-page-compare.mjs`. It drives the real app, enumerates the live DOM under each family root, and reads computed styles. It then swaps the stylesheet on the same DOM and reads again. No fixture markup is invented, so the ancestors are the ones the product renders.

| Proof | Setup | Result |
|---|---|---|
| Self-comparison | the same stylesheet on both sides | 0 differences |
| Seed: CTA fill | `.hero .btn-primary` background forced to `rgb(1, 2, 3)` | 12 differences, all six viewport and theme pairs |

The seed also caught the gradient it displaced. A tool that reported "no change" would have passed an extraction that broke the hero.

### Verification

| Measure | Value |
|---|---|
| Pages | the real Landing page, plus a real creator page for the card |
| Widths | 390, 768, 1440 |
| Themes | light and dark |
| Case runs | 36 |
| Element reads | 2,304 |
| Properties per element | 94 |
| Compared values | 108,288 |
| Differences | 0 |

The page root must render the family before any reading counts. The tool fails when a root matches no element, so an empty page cannot pass as a match. The Board case reported that it skipped, with its reason, rather than reporting a pass.

### Checkpoint 2

The three `.hero` box rules described disjoint properties: padding with centred text, relative positioning, and the horizontal clip. They were three rules only because three files each declared one. They are now one rule.

The proof is the build itself. The stylesheet emitted after checkpoint 1 and the one emitted after checkpoint 2 hash the same: `f775d8f56229527d`. A merge that changes no declaration byte cannot change a rendered pixel, so this checkpoint needs no per-element comparison.

The record count fell from 5406 to 5404, which is the two rule boundaries the merge removed. `.hero` no longer repeats as a top-level selector, so its entry left the duplicate-selector baseline in `tests/design-system-baseline.json`.

The rest of the module stays separate, and is recorded here so a later batch does not tidy it away.

| Declaration | Count | Why it stays |
|---|---|---|
| `box-shadow: 0 10px 26px …` | 2 | one glow per brand colour, with a different tint and spread |
| `border-color: rgba(255,255,255,…)` | 3 | `.28`, `.3` and the dark `.2` are three deliberate weights |
| `animation: glow-breathe-…` | 2 | one keyframe per brand colour |

The raw durations inside these animations predate the batch. They stay keyed in the `rawDurations` baseline, and this batch changes neither them nor their keys.

### `.itin-card` now has one owner over two files

The card that `PubCard` renders is one family. Its 25 rules sat in four files. They are now one owner over two ordered files.

| File | Position | Content |
|---|---|---|
| `itin-card.css` | after `05-share-and-trip-ticket` | the recipe, the hover lift, the footer divider, the phone step |
| `itin-card-legacy.css` | after `11-shared-page` | the 18 rules that reach no element |

The second file exists because the map needs an owner to answer for every rule that names its class. The 18 unreachable rules are not deleted here. Removal needs proof of its own, and this batch proves extraction, not reachability. The file records why each group is probably unreachable. A later removal starts from that evidence.

The batch audit is exact. There are 25 rules before and 25 after. No selector is missing, none is added, and no declaration changed. A first pass produced 24 with `position: relative` folded into the recipe. That is a consolidation inside an extraction checkpoint, so it went back to its own rule.

Verification ran on the real pages that render the card. Those are a real creator page and the Landing page, at three widths and two themes.

| Measure | Value |
|---|---|
| Compared values | 108,288 |
| Element reads | 2,304 |
| Differences | 0 |

One run reported a single difference, `creator-grid :: case missing after`. That was a coverage flake. At one viewport the Explore page happened to render no creator link. The tool now separates a case skipped on both sides from a case that ran before and not after. A skip can no longer read as a style difference.

### `.board*` now has one owner over two files

The Board is the largest family: 29 classes and 120 rules in five legacy files. It renders only inside the trip workspace, so it looked unreachable. It is not. `dev/overview-fixture.html?tab=board` mounts the real `TripWorkspace` with synthetic trip data, and the Board renders with 4 columns and 10 stops. The fixture took a one-line change: it now passes any `tab` value through instead of only `overview` and `settings`.

The move is split by what can be proven, not by what is convenient.

| Group | Rules | Outcome |
|---|---|---|
| Board-only, no media wrapper | 86 | moved to `board-02.css` and `board-04.css`, at their original positions |
| Board-only, inside `@media` | 14 | moved with the wrapper intact, into the same owner files |
| Shares a selector list with another family | 20 | stays in its legacy file, recorded below |

The third group is why this family cannot be moved whole. Twenty rules name `.board-*` on one line and another family on the next. Those families include `.btn`, `.topnav`, `.glass` and `.lucide`, and one stagger rule lists forty of them. A move would drag an unrelated family into a board owner and claim styling this batch does not own.

Nine classes still carry a rule in that shared group. The other twenty classes are owned outright, and the map names exactly those twenty. The map reports the responsibility it actually took.

The audit is exact. There are 120 rules before and 120 after. No rule is lost, none is added, no declaration changed, and every media context stayed.

Two tooling defects were caught by that audit before they could ship. Both would have changed rendering.

- The first extractor lifted a rule out of its `@media` block and dropped the condition. That turned a phone rule into a global one. The audit reported 14 rules missing their context.
- The second version wrote imports for three modules it never created, which broke the graph outright.

### The three families that did not move

`.board*` is the largest family and the one this batch cannot prove. Its 150 rules sit at five cascade positions across `01-foundations`, `02-select-and-print`, `04-mobile-usability`, `06-shell-and-consistency` and `16-motion-and-cover-v2`. Two of those files hold Board rules before and after other rules, so one module cannot keep both positions.

The reachability gap is the harder one. `/trips` sends a signed-out visitor to the Landing page, so the Board never renders in this environment. No trip data reaches the page without a session. The instrument reported its skip and named the cause. Moving 150 unmeasured rules is a guess, and this batch does not record guesses as results.

`.trip-head-card` and the unreachable half of `.itin-card` stay listed as remaining legacy. Removing them is a separate change with its own proof, and one that would lower the reduced-motion floor.

### Reduced motion

The hero's reduced-motion rule moved with the family. It still declares `animation: none` and `box-shadow: none` on both the button and its sheen. The glow and sheen block keeps its `prefers-reduced-motion: no-preference` guard. The graph reports 227 rules inside a reduced-motion query, one above the recorded floor of 226. The move split one shared block into two, so the count rose by one while every declaration stayed.

### Gate

`check:css` passes with 12 owner modules. The ownership map re-keys 21 appearance entries from the legacy file to the module. The total stays 128, so the debt is moved and not grown. `design-system` and `css-ownership` suites pass, 118 tests. Typecheck passes. The lint ratchet stays at its 134 and 27 baseline. `check:ui` reports no finding. Scoped STE passes on the changed lines.

The full suite caught one thing the targeted runs could not. `tests/css-source-graph.test.ts` pins the module path shape, and it did not accept `pages/`. The pattern now accepts `pages/name.css`, which is the same extension B5 made for `layouts/`. The fixture paths in `css-ownership` already used `pages/`, so the directory was anticipated and only the pin was behind.

`npm run verify` did not run. The default STE run still exits 1 against the inherited merge base `f68b3d9`, which predates this work. That failure is not part of this batch and this batch does not clear it.

Rollback: move the thirteen rules back to sections 02, 04 and 12. Restore the shared `.hero, .plan-bench` selector. Remove the module and its import. Re-key the appearance baseline to the legacy file.

## B11: the pill navigation

**Status: implemented and verified on a real-component fixture.**

### The family is three components under one scope

The plan named `.pill-nav`. The trace found 26 selector matches in five files. They do not style one component. They style three other components from inside a `.pill-nav` scope.

| Selector | Matches | What it reaches |
|---|---|---|
| `.pill-nav` | 1 | the rail: relative flex, 2px gap, `--pill-gap` |
| `.pill-nav > *` | 1 | stacking above the glider |
| `.pill-glider` | 2 | the sliding highlight, plus its dark tint |
| `.pill-nav .nav-link.active`, `.tab-btn.active`, `.clickable-chip.on-teal` | 6 | clears the active fill so the glider shows through |
| `[data-theme='dark'] .pill-nav …` | 3 | dark ink on the active item |
| `.clickable-chip.on-teal`, `.on-saffron` | 3 | teal and saffron ink, plus the saffron glider tint |
| `…:focus-visible` | 3 | the focus ring, in place of the cleared fill |
| `.clickable-chip.on-teal .tab-count` | 1 | the count pill background |
| `.pill-nav .pill-ink-row .tab-btn`, `.nav-link` | 3 | the workspace rail's ink row |
| `.yf-page .yf-tabbar .pill-glider` | 2 | the workspace glider tint and its reduced-motion reset |

The tokens inside those selectors — `.nav-link`, `.tab-btn`, `.clickable-chip` — belong to other families. An owner for `.pill-nav` claims rules that paint another component's ink, fill and focus ring. That is a contract question about the glider, not a file move.

### What a signed-out page can reach

The probe is `dev/_css3-probe-pill.mjs`. It counts the family on the two app routes that render the top navigation.

That probe is the wrong instrument for this family, and it is kept only to record why. The app signs a visitor out of the workspace. The chip states and the ink row never render on a route. A **fixture** reaches them, because `PillNav` and `SegmentedTabs` take props and children and need no session.

`dev/css3-pillnav-fixture.tsx` mounts the real `SegmentedTabs` tablist and the real `PillNav`, and it renders three shapes: the workspace rail with counts and the clipped ink copy, the top-nav shape with eight links, and the filter-pillbar shape with teal and saffron chips. The probe below measures the fixture, not a route.

### Why the owner spans four files

The family's rules sat at four cascade positions: `01-foundations`, `02-select-and-print`, `16-motion-and-cover-v2` and `17-overview-tiles-and-cover`. One file cannot hold all four without moving rules past the rules they answer to. So the owner is four ordered files, each imported where its rules already sat:

| File | Position | Content |
|---|---|---|
| `pill-nav.css` | after `01-foundations` | the rail, the glider, the cleared fills, the inks |
| `pill-nav-02.css` | after `02-select-and-print` | the focus ring restatement, the count badge |
| `pill-nav-16.css` | after `16-motion-and-cover-v2` | the workspace rail's glider tint and motion reset |
| `pill-nav-17.css` | after `17-overview-tiles-and-cover` | the ink copy's ink |

The container owner already used this pattern with two files. This family needed four, and the map records all four against one owner.

One rule keeps all three of its selectors. Two name `.pill-nav` and one names `.yf-page .yf-tabbar`. A split would change one rule into two with different specificity. The `.yf-tabbar` copy exists because the bare form loses the ink contest at (0,2,0).

### Detection proven before the result

| Proof | Setup | Result |
|---|---|---|
| Self-comparison | the same stylesheet both sides | 0 differences |
| Seed: glider paint and gap | `.pill-glider` radius and fill changed, `.pill-nav` gap 2px to 11px | 272 differences, including the ink row's knock-on geometry |

The seed did not only catch the two painted values. It caught the glider's left offset, the ink window's box and the ink row's width. A wider gap moves all three. A tool that read only colour would have passed.

### Verification

| Measure | Value |
|---|---|
| Fixture | the real `PillNav` and `SegmentedTabs`, three rail shapes |
| Passes | 12: three widths by two themes by two motion settings |
| Element reads | 480 |
| Properties per element | 56 |
| Compared values | 26,880 |
| Differences | 0 |

Behaviour, asserted at every pass and not inferred from the comparison:

| Check | Result |
|---|---|
| The glider covers the active item | delta `0,0,0,0` |
| The ink window equals the glider box | identical on all four edges |
| A switch lands on the new item | `board`, delta `0,0,0,0` |
| An interrupted switch lands correctly | `group`, delta `0,0,0,0` |
| A rapid reversal lands correctly | `timeline`, delta `0,0,0,0` |
| Arrow keys reach every tab | 7 of 7, and `:focus-visible` is true |
| The active tab keeps a visible focus ring | ring present, because the cleared fill removes the default |
| The overflowing rail publishes `data-overflow` | `start` at 390px, and it changes on scroll |
| Reduced motion collapses the glider and ink transitions | `1e-05s` |

The first version of this tool reported three failures on a healthy stylesheet. All three were the tool's, and the fixes are recorded because they are the same trap twice:

- `.pill-nav .tab-btn` also matches the decorative copies inside `.pill-ink-row`, which are spans with no key and no tab stop. It was measuring the copy.
- Reduced motion uses `1e-05s`, a deliberate near-zero transition, which a strict zero check rejects.

### Gate

`check:css` passes with 14 owner modules. The map registers one owner over four files. Scoped STE passes on the changed lines.

`npm run verify` did not run. The default STE run still exits 1 against the inherited merge base `f68b3d9`, which predates this work.

Rollback: move the 26 matches back to their four sections. Remove the four modules and their imports. Delete the owner entry.

## Remaining legacy responsibilities

These files are unowned on purpose. Each entry names what still lives there and why.

| Responsibility | Where | Why it stays |
|---|---|---|
| `.board*`, 150 rules over 29 classes | `01`, `02`, `04`, `06`, `16` | Five cascade positions, and no signed-out route renders the Board. |
| `.pill-nav` and `.pill-glider`, 26 matches | `01`, `02`, `16`, `17` | The states that define it need a workspace session. |
| `.trip-head-card`, 13 rules | `02`, `04`, `13` | No source file renders it. The family is unreachable. |
| Unreachable `.itin-card` overrides, 18 rules | `11` | `.trips-page` renders `.mt-card`. No file applies `.explore-grid.as-list`. |
| Page cards and grids, `.mt-card` and `.mt-grid` | `09` | Not yet a batch. |
| The trip workspace, `.yf-*` | `14`, `16` | Not yet a batch. |
| Explore page furniture, `.ex-*` | `10`, `11` | Not yet a batch. |
| Print, map and MapLibre surfaces | `02`, `03`, `08` | Not yet a batch. |

The styling exceptions stay recorded in the map, not in this table: 128 appearance keys and one variable exception. `check:css` fails on a stale key, so the figure cannot drift.



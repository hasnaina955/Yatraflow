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

// Append the repair section.
import fs from 'node:fs'

const block = `
## Repair: regressions the earlier comparisons could not see

Commit \`6b83e32e\`. Raised against \`147b47b2\` and \`da9715f2\`.

Three appearance regressions were present, and the comparison tools could not detect them. Passing unit tests did not close any of them.

### The tools were the reason the regressions survived

| Tool | Defect | Effect |
|---|---|---|
| Buttons | The wrapper carried two \`class\` attributes | Chrome kept the first and discarded the page scope, so every scoped row measured an unscoped control |
| Container | Every case reused \`data-key="K"\` | Fourteen cases collapsed into one row per environment |
| Container | Page classes sat on a wrapper | Production puts them on the \`.container\` element, so \`.container.ex-page\` never matched |
| Card | The stacked pair reused key \`K2\` across scopes | The second card was never compared |

One shared harness now serves every tool. It assigns unique keys, fails on a duplicate or a missing key, asserts that each scope selector matches an element, and checks that focus reaches every focusable element. Normalisation removes animated sub-pixel shadow drift and treats \`none\` as a zero shadow.

### The regressions

**Ghost and large buttons lost their page scale.** The page recipe used to win at 0,2,0 over the 0,1,0 variant rules. After B2 the variants beat the base rule that reads the variables.

| Variant | Property | Accepted | After B2 |
|---|---|---|---|
| \`.btn-ghost\` | radius | 12px | 999px |
| \`.btn-ghost\` | padding | 0 16px | 8px 10px |
| \`.btn-lg\` | padding | 0 16px | 12px 24px |
| \`.btn-lg\` | font-size | 15px | 15.5px |

Both now read \`--btn-padding\`, \`--btn-radius\` and \`--btn-font-size\`, with their own values as fallbacks. No page-level repair was added.

**The dark primary colour rule beat the hero override.** \`[data-theme='dark']\` is an attribute selector, so that rule is 0,2,0, the same as \`.hero .btn-primary\`. It won only on order once the module loaded after section 04. It set exactly what \`.btn-primary\` already sets, so it was removed rather than reordered.

**The container phone step fought \`.form-page\`.** \`.form-page\` sets its own vertical padding at 0,1,0. The container base rule now sets inline padding only, and the phone step moved to \`layouts/container-phone.css\` so it keeps its original position after section 04. Raising specificity instead was tried and overrode every page scope's own vertical padding, which is worse.

### Two ownership bypasses

**Seven button classes were unregistered.** A page repair on \`.btn-ghost\`, \`.btn-outline\` or \`.btn-lg\` passed with no finding. All eleven classes are registered now.

**Root tokens were permitted inside any owner.** The token rule skipped every owner module, so \`:root { --rogue: red }\` inside \`button.css\` passed. Only the registered token owner may define root tokens now.

### Verification against the frozen pre-B2 build

Frozen input is \`8cc2dbc9\`, built to \`dev/_css3-frozen-b1.css\`. The repair build is \`dev/_css3-final.css\`.

| Family | Elements | Environments | Comparisons | Differences |
|---|---|---|---|---|
| Buttons | 132 | 5 | 46,800 | 0 |
| Container | 24 | 6 | 2,016 | 0 |
| Card | 36 | 4 | 3,024 | 0 |
| Chip | 49 | 5 | 490 | 0 |

The button run also performed 990 focus checks and reported 9 hidden elements, all \`.bench-dock\` at desktop width, where that dock is \`display: none\` by design.

Commands, in order:

\`\`\`
git checkout 8cc2dbc9 && npm run build
git checkout chore/css-3-ownership && npm run build
node dev/_css3-btn-compare2.mjs dev/_css3-frozen-b1.css dev/_css3-final.css
node dev/_css3-container-compare2.mjs dev/_css3-frozen-b1.css dev/_css3-final.css
node dev/_css3-card-compare2.mjs dev/_css3-frozen-b1.css dev/_css3-final.css
node dev/_css3-chip-compare.mjs dev/_css3-frozen-b1.css dev/_css3-final.css
node dev/_css3-paint.mjs dev/_css3-frozen-b1.css dev/_css3-final.css dev/_css3-paint-final
\`\`\`

### Painted comparison

Ten cases, all pixel-identical. Two are new, because the existing eight did not cover the regressions:

| Case | Risk |
|---|---|
| \`ghost-in-page-scope\` | page-scoped ghost, outline and large keep their page padding and radius |
| \`hero-primary-dark-ink\` | hero primary keeps white ink in dark mode |

Motion is frozen before capture. Without that, the hero breathing glow lands at a different phase in each build and reads as a one-step colour change; the first two runs reported 17,174 and 14,082 differing pixels with a maximum delta of 2 and 1.

### Known-bad fixtures added

| Fixture | Fails on |
|---|---|
| duplicate result keys | two elements collapsing into one row |
| dropped page scope | a fixture that silently loses its class |
| unregistered variant repair | a page restyling \`.btn-ghost\`, \`.btn-outline\` or \`.btn-lg\` |
| root token in a component owner | \`:root\` inside \`button.css\` |

### Gate status

Focused checks pass: 160 tests, \`check:css\` with 8 owner modules, \`check:ui\`, build.

\`npm run verify\` did not run. It is still blocked by inherited STE findings that predate this work. The manual sequence is not a substitute for it and this document does not claim that command passed.

### Remaining limits

The comparison reads computed values and painted pixels for the fixtures listed. It does not sweep the product.

\`.btn-trail\` keeps a direct \`padding-right\`, which beats the base rule at equal specificity inside a page scope. It is only used on the landing hero, which carries no page scope, so it is not exercised here and is not claimed safe.

The container owner now spans two files. That records where each rule must sit in the cascade, not a second owner.
`

fs.appendFileSync('docs/evidence/css-3-batches.md', block)
console.log('repair section appended')

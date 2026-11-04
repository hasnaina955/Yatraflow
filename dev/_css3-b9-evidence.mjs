// Append the B9 evidence section.
import fs from 'node:fs'

const block = `
## B9: the toast

Checkpoint 1 is \`b9bc29cb\`. Checkpoint 2 is \`9ea17e30\`.

### The first batch with no page variants

Seven rules name \`.toast\` and nine are the surface. Every rule that names it belongs to the component. That is the first batch where this is true; every earlier family had page-scoped sizing or placement to leave behind.

### The fixture drives the real API

It calls \`toast()\`, \`undoToast()\` and renders \`ToastZone\` from \`src/components/ui.tsx\`, so the live region, the role assignment, the one timer per toast, the hover and focus hold and the dismiss path are the ones the product ships.

A fixture bug had to be fixed before anything rendered. \`toast()\` calls a module-level hook that \`ToastZone\` publishes on mount. Firing it in the same effect pass ran before that hook existed, so every call was a silent no-op and no toast appeared. The fixture now fires one tick later.

### Detection proven before the result

Seeds are stylesheet overrides in isolated pages.

| Seed | What it plants | Healthy | Seeded |
|---|---|---|---|
| Semantic fill | dark \`.ok\` and \`.err\` forced to the neutral fill | fills differ | fills equal, detected |
| Ink contrast | \`.ok\` ink set to its own fill colour | 7.38:1 | 1.00:1, detected |

The first seed reproduces the exact defect the source comment records: the neutral dark rule has the same specificity as the semantic pair and, on its own, made every toast one neutral pill.

### Verification

| Measure | Value |
|---|---|
| States | 20: five environments by four kinds |
| Kinds | \`ok\`, \`err\`, undo with an action, and three at once |
| Environments | light and dark at 1440, light and dark at 390, reduced motion |
| Properties | 27, on the zone, every pill and every action button |
| Comparisons | 1,680 |
| Differences | 0 |

Each state asserts before measuring that the zone exists with \`role="status"\` and \`aria-live="polite"\`, that the expected number of pills and actions rendered, and that no pill is mid-fade. A state that measured nothing fails rather than report zero.

Ink contrast on the painted fill, both themes:

| Theme | \`.ok\` | \`.err\` |
|---|---|---|
| light | 7.38 | 5.94 |
| dark | 6.70 | 6.67 |

All clear 4.5.

### Checkpoint 2

\`--toast-radius\` is read by both \`.toast\` and \`.toast-action\`, which declared the same 999px pill twice.

The rest of the repetition stays, and is recorded so a later batch does not tidy it away:

| Declaration | Count | Where |
|---|---|---|
| \`background: var(--teal-deep)\` | 2 | \`.toast.ok\` and \`[data-theme='dark'] .toast.ok\` |
| \`background: var(--danger)\` | 2 | \`.toast.err\` and \`[data-theme='dark'] .toast.err\` |
| \`color: #fff\` | 2 | the light semantic pair |
| \`color: #06251f\` | 2 | the dark semantic pair |

The dark overrides repeat the semantic fills on purpose. Folding them back into the neutral rule would reinstate the defect the first seed proves detectable.

### Gate

\`check:css\` passes with 11 owner modules. Scoped STE passes on the changed lines.

\`npm run verify\` did not run. The default STE run still exits 1 against the inherited merge base \`f68b3d9\`, which predates this work.

Rollback: move the nine rules back to section 02, remove the module and its import, and restore the appearance baseline.
`

fs.appendFileSync('docs/evidence/css-3-batches.md', block)
console.log('B9 evidence appended')

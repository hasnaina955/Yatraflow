// One-off: append the B6 evidence section.
import fs from 'node:fs'

const p = 'docs/evidence/css-3-batches.md'
const block = `
## B6: the chip

Checkpoint 1 is \`2ef6397b\`.

Four rules moved into \`src/styles/components/chip.css\`: the recipe, \`.chip-teal\`, \`.chip-outline\` and \`.chip-saffron\`, with the section header.

Thirteen of the seventeen rules naming \`.chip\` stayed. They are page variants with distinct values.

Three shared selector lists also stayed: the coarse-pointer hit area, the focus ring and the transition. Each spans many controls, so they belong to the shared-control batch rather than to the chip. The module header says so.

### Checkpoint 2 records a negative result

There is no consolidation to make. Every property the page rules set carries a different value per scope.

| Property | Distinct values |
|---|---|
| \`color\` | 4 |
| \`background\` | 3 |
| \`border-color\` | 3 |
| \`border-radius\` | 2 |
| \`cursor\` | 2 |
| \`font-size\`, \`font-weight\`, \`transition\` and the rest | 1 each, on one scope only |

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
`

fs.appendFileSync(p, block)
console.log('B6 evidence appended')

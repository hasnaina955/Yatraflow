// Append the harness-correction section and fix the chip figure.
import fs from 'node:fs'

const p = 'docs/evidence/css-3-batches.md'
let s = fs.readFileSync(p, 'utf8')

// The chip figure came from a collapsed fixture. Replace it with the measured one.
const oldChip = '| Comparisons | 490 |\n| Differences | 0 |\n| Appearance keys | 74 to 101 |'
const newChip =
  '| Comparisons | 490 claimed. The fixture reused one key for every variant, so the rows collapsed. Re-measured on the shared harness: 11,830. |\n| Differences | 0, confirmed on the re-measured run |\n| Appearance keys | 74 to 101 |'
let replaced = 0
if (s.includes(oldChip)) {
  s = s.replace(oldChip, newChip)
  replaced = 1
}

const block = `
## Harness correction and the adjacent-pair gap

Commit \`789a160d\`.

### The harness is a test dependency

\`tests/css-compare-harness.test.ts\` imports \`dev/_css3-compare-lib.mjs\`. While that file was untracked, the suite could not run from a clean checkout. It and the maintained tools are committed now.

### Validators have direct tests

Validation is split from page access. \`validateRows\` and \`validateScopes\` are pure, so each failure mode is tested without a browser:

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

The card tool rendered its two cards in separate wrappers. Two cards in separate wrappers are not siblings, so \`.card + .card\` never matched and the sibling rhythm was never compared, in any batch.

The tool now renders a real adjacent pair inside one wrapper, with two unique keys. \`assertAdjacentPairs\` confirms the second card of each pair matches the sibling selector: **48 pairs** across 6 scopes and 4 environments.

The check was proven both ways: it throws when the cards sit in separate wrappers, and passes on a genuine pair.

### Focused results, frozen pre-B2 build

| Family | Elements | Environments | Comparisons | Other |
|---|---|---|---|---|
| Buttons | 132 | 5 | 46,800 | 990 focus checks |
| Container | 24 | 6 | 2,016 | — |
| Card | 30 | 4 | 3,024 | 48 adjacent pairs asserted |
| Chip | 49 | 5 | 11,830 | 140 focus checks |

All four report zero differences.

48 focused tests pass. \`check:css\` passes with 8 owner modules. No product styling changed in this commit.

\`npm run verify\` did not run. It is still blocked by inherited STE findings.
`

fs.appendFileSync(p, block)
console.log(`chip figure replaced: ${replaced}; correction section appended`)

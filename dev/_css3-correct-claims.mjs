// Append the repair section and correct the earlier comparison claims.
import fs from 'node:fs'

const p = 'docs/evidence/css-3-batches.md'
let s = fs.readFileSync(p, 'utf8')

// The earlier sections claimed a comparison count that the broken fixtures
// could not produce. Mark each one rather than leaving a number that reads as
// evidence.
const corrections = [
  ['| Comparisons | 1,200 |\n| Differences | 0 |', '| Comparisons | 1,200 claimed. The fixture dropped its page scope, so this count did not measure what it named. See the repair section. |\n| Differences | 0, not a valid result |'],
  ['| Comparisons | 1,800 |\n| Differences | 0 |', '| Comparisons | 1,800 claimed. The fixture wrote two `class` attributes, so every scoped row measured an unscoped control. See the repair section. |\n| Differences | 0, not a valid result |'],
  ['| Comparisons | 120 |\n| Differences | 0 |', '| Comparisons | 120 claimed, 120 valid. This tool had unique keys and no page scope to drop, and it was re-run after the repair with the same result. |\n| Differences | 0 |'],
  ['| Comparisons | 84 |\n| Differences | 0 |', '| Comparisons | 84 claimed. Every case reused `data-key="K"`, so fourteen cases collapsed into one row. See the repair section. |\n| Differences | 0, not a valid result |'],
]
let applied = 0
for (const [from, to] of corrections) {
  if (s.includes(from)) {
    s = s.replace(from, to)
    applied++
  }
}
fs.writeFileSync(p, s)
console.log(`marked ${applied} of ${corrections.length} earlier comparison claims`)
